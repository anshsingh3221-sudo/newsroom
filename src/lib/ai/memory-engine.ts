import { adminDb, must, type Row } from "../db";
import { embedText, toPgVector } from "../embeddings";
import { slugify } from "../text";
import { extractClaims } from "./claims";
import { compareStatements } from "./compare";
import { generateAnalysisDraft } from "./draft";
import { normalizeSource, saveSource } from "./normalize";
import { prepareEditorialReview } from "./review";
import { searchHistoricalStatements } from "./statements";
import { buildTimeline } from "./timeline";
import type { NormalizedSource } from "./types";

const MAX_COMPARISONS_PER_CLAIM = 2;   // keeps free-tier LLM quotas safe

export interface ResearchReport {
  articleSlug: string | null; sources: number; claims: number; relationshipsProposed: number;
  unresolvedSpeakers: string[]; warnings: string[];
}

async function findPerson(name: string): Promise<Row | null> {
  const db = adminDb();
  const exact = await db.from("people").select("*").ilike("name", name).limit(1);
  if (exact.data?.length) return exact.data[0];
  const last = name.trim().split(/\s+/).slice(-1)[0];
  if (last.length < 4) return null;
  const fuzzy = await db.from("people").select("*").ilike("name", `%${last}%`).limit(2);
  return fuzzy.data?.length === 1 ? fuzzy.data[0] : null;   // only accept an unambiguous match
}

/**
 * Political Memory Engine. For one news cluster: gather sources, extract claims, identify speakers, search the archive for
 * earlier statements, compare them, and send everything to editors as drafts. Nothing is published automatically.
 */
export async function researchCluster(clusterId: string): Promise<ResearchReport> {
  const db = adminDb();
  const items = must(await db.from("news_items").select("url, title").eq("cluster_id", clusterId).limit(5), "cluster items") as Row[];
  if (!items.length) throw new Error("Cluster has no items");

  const sources: (NormalizedSource & { id: string })[] = [];
  for (const it of items) {
    try { sources.push(await saveSource(await normalizeSource(it.url))); } catch { /* skip unreachable */ }
  }
  if (!sources.length) throw new Error("None of the cluster's source pages could be fetched");

  const claims = await extractClaims(sources);
  const unresolved = new Set<string>();
  const notes: string[] = [];
  let proposed = 0, droppedQuotes = 0;

  for (const claim of claims.filter((c) => c.checkworthy && c.speaker)) {
    if (!claim.quote) { droppedQuotes++; continue; }
    const person = await findPerson(claim.speaker!);
    if (!person) { unresolved.add(claim.speaker!); continue; }
    const src = sources[claim.sourceIndex];
    const madeOn = src.publishedAt?.slice(0, 10) ?? null;
    if (!madeOn) continue;

    const emb = await embedText(claim.quote).catch(() => null);
    const cur = must(await db.from("statements").upsert({
      person_id: person.id, text: claim.quote.trim(), made_on: madeOn, published_on: madeOn, source_id: src.id, source_url: src.url,
      source_type: "news_report", language: src.language, context: claim.claim, topic_slug: claim.topic ? slugify(claim.topic).slice(0, 40) : null,
      verified: true, embedding: emb ? toPgVector(emb) : null,
    }, { onConflict: "person_id,source_url,text" }).select("*, people(name, slug)").single(), "save current statement") as Row;

    const day = new Date(madeOn); day.setDate(day.getDate() - 1);
    const history = (await searchHistoricalStatements({
      query: claim.claim, personIds: [person.id], to: day.toISOString().slice(0, 10), minQuality: 2, limit: 8,
    }, db)).filter((h) => h.source_url !== src.url && h.made_on).slice(0, MAX_COMPARISONS_PER_CLAIM);

    for (const past of history) {
      try {
        const cmp = await compareStatements(past, cur);
        const { data } = await db.from("statement_relationships").upsert({
          statement_a: past.id, statement_b: cur.id, relation: cmp.relation, summary: cmp.summary, claim_a: cmp.claimA, claim_b: cmp.claimB,
          context_differences: cmp.contextDifferences, evidence: cmp.evidence, uncertainty: cmp.uncertainty,
          ai_confidence: cmp.confidence, review_status: "pending_review",
        }, { onConflict: "statement_a,statement_b", ignoreDuplicates: true }).select("id");
        if (data?.length) { proposed++; notes.push(`${person.name}: ${cmp.relation} between ${past.made_on} and ${madeOn} (${cmp.summary})`); }
      } catch (err) { notes.push(`Comparison failed: ${err instanceof Error ? err.message : err}`); }
    }
  }

  const timeline = await buildTimeline(sources);
  const { draft, problems } = await generateAnalysisDraft({ sources, claims, timeline, statementNotes: notes });
  const review = prepareEditorialReview({ citationProblems: problems, unresolvedSpeakers: [...unresolved], comparisonsProposed: proposed, droppedQuotes });
  const slug = `${slugify(draft.title)}-${Math.random().toString(36).slice(2, 7)}`;
  const body = {
    ...draft,
    sources: sources.map((s, i) => ({ id: `S${i + 1}`, url: s.url, title: s.title, publisher: s.publisher, publishedAt: s.publishedAt })),
    review,
  };
  must(await db.from("articles").insert({
    slug, title: draft.title, summary: draft.summary, body, cluster_id: clusterId, status: "pending_review", ai_generated: true,
  }), "save article draft");

  return { articleSlug: slug, sources: sources.length, claims: claims.length, relationshipsProposed: proposed, unresolvedSpeakers: [...unresolved], warnings: review.warnings };
}
