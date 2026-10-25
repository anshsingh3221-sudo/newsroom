import { z } from "zod";
import { adminDb, must, type Row } from "../db";
import { embedText, toPgVector } from "../embeddings";
import { generateJSON } from "../llm";
import { quoteInText } from "../text";
import { normalizeSource, saveSource } from "./normalize";
import type { SourceType } from "./types";

export const SOURCE_QUALITY: Record<string, number> = {
  official_record: 5, transcript: 5, speech: 4, interview: 4, social_post: 3, news_report: 2, other: 1,
};

export interface StatementQuery {
  query?: string; personIds?: string[]; from?: string; to?: string; sourceType?: SourceType;
  topic?: string; country?: string; minQuality?: number; limit?: number;
}

/** Hybrid keyword + semantic search. Semantic similarity is only used to find candidates, never to infer contradiction. */
export async function searchHistoricalStatements(q: StatementQuery, db = adminDb()): Promise<Row[]> {
  const emb = q.query ? await embedText(q.query).catch(() => null) : null;
  const ranked = must(await db.rpc("search_statements", {
    q: q.query ?? null, q_embedding: emb ? toPgVector(emb) : null, p_persons: q.personIds ?? null,
    d_from: q.from ?? null, d_to: q.to ?? null, p_type: q.sourceType ?? null,
    p_topic: q.topic ?? null, p_country: q.country ?? null, k: q.limit ?? 30,
  }), "search_statements") as { id: string; score: number }[];
  if (!ranked.length) return [];
  const rows = must(await db.from("statements").select("*, people(name, slug)").in("id", ranked.map((r) => r.id)), "load statements") as Row[];
  const byId = new Map<string, Row>(rows.map((r) => [r.id as string, r]));
  return ranked
    .map((r) => ({ row: byId.get(r.id), score: r.score }))
    .filter((x): x is { row: Row; score: number } => !!x.row)
    .map((x): Row => ({ ...x.row, score: x.score }))
    .filter((r: Row) => (SOURCE_QUALITY[String(r.source_type)] ?? 0) >= (q.minQuality ?? 1));
}

const QuotesZ = z.object({ statements: z.array(z.object({ quote: z.string(), context: z.string().nullable(), topic: z.string().nullable() })) });

/** Pulls verbatim statements by one named person from a real page. Every quote is verified against the fetched text before saving. */
export async function ingestStatementsFromUrl(opts: {
  url: string; personId: string; personName: string; sourceType: SourceType; madeOn?: string | null; country?: string | null;
}): Promise<{ saved: number; rejected: number; sourceId: string }> {
  const db = adminDb();
  const src = await saveSource(await normalizeSource(opts.url, opts.sourceType));
  const out = await generateJSON({
    system: `You extract direct quotations from a document for a public statements archive.
Only return words that ${opts.personName} is reported to have said or written, copied character-for-character from the document.
Never paraphrase, summarise or invent. If there are none, return an empty list.
Return JSON: {"statements":[{"quote":string,"context":string|null,"topic":string|null}]}. "context" is one neutral sentence on what was being discussed, taken from the document.`,
    user: `Document: ${src.title}\n\n${src.text.slice(0, 20000)}`,
  }, QuotesZ);

  let saved = 0, rejected = 0;
  for (const s of out.statements) {
    if (!quoteInText(s.quote, src.text)) { rejected++; continue; }
    const emb = await embedText(s.quote).catch(() => null);
    const { error } = await db.from("statements").upsert({
      person_id: opts.personId, text: s.quote.trim(), is_excerpt: true, made_on: opts.madeOn ?? src.publishedAt?.slice(0, 10) ?? null,
      published_on: src.publishedAt?.slice(0, 10) ?? null, source_id: src.id, source_url: src.url, source_type: opts.sourceType,
      language: src.language, context: s.context, topic_slug: s.topic ? s.topic.toLowerCase().replace(/\s+/g, "-").slice(0, 40) : null,
      country: opts.country ?? null, verified: true, embedding: emb ? toPgVector(emb) : null,
    }, { onConflict: "person_id,source_url,text", ignoreDuplicates: true });
    if (error) rejected++; else saved++;
  }
  return { saved, rejected, sourceId: src.id };
}