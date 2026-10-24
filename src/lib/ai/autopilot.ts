import { adminDb, must, type Row } from "@/lib/db";
import { discoverNews } from "@/lib/ai/discover";
import { researchCluster } from "@/lib/ai/memory-engine";
import { buildImages, type ArticleImage } from "@/lib/ai/images";

const LABEL = "AI-generated and automatically checked. Not reviewed by a human editor. ";
const DRAFT = ["draft", "pending_review"];
const GENERIC = /\b(officials|ministers|authorities|critics|experts|insiders|sources)\b/i;
const CITE = /\[(S\d+(?:\s*,\s*S\d+)*)\]/g;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Pure function: returns the reasons a draft must NOT be auto-published. Empty list = passes. */
export function checkDraft(a: { summary: string | null; body: Row | null }, minPublishers = 2): string[] {
  const reasons: string[] = [];
  const summary = a.summary ?? "";
  const sources: Row[] = a.body?.sources ?? [];
  const warnings: string[] = a.body?.review?.warnings ?? [];
  const ids = new Set(sources.map((s) => String(s.id)));

  const hosts = new Set<string>();
  for (const s of sources) { try { hosts.add(new URL(s.url).hostname.replace(/^www\./, "")); } catch { /* ignore bad url */ } }
  if (hosts.size < minPublishers) reasons.push(`only ${hosts.size} distinct source site(s), need ${minPublishers}`);

  for (const w of warnings) {
    if (/could not be found in the source text/i.test(w)) reasons.push("a quote failed verification and was dropped");
    else if (!/speakers not found/i.test(w)) reasons.push(`unrecognised warning: ${w.slice(0, 80)}`);
  }

  const sentences = summary.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  if (!sentences.length) reasons.push("empty summary");
  for (const s of sentences) {
    const cited = [...s.matchAll(CITE)].flatMap((m) => m[1].split(",").map((x) => x.trim()));
    if (!cited.length) reasons.push(`sentence has no citation: "${s.slice(0, 60)}"`);
    for (const c of cited) if (!ids.has(c)) reasons.push(`cites ${c}, which is not in the source list`);
    const g = s.match(GENERIC);
    if (g) reasons.push(`unnamed attribution "${g[0]}": name who said it`);
  }
  return [...new Set(reasons)];
}

export async function runAutopilot(): Promise<{ message: string }> {
  const db = adminDb();
  const live = process.env.AUTO_PUBLISH === "true";
  const cap = Number(process.env.AUTO_PUBLISH_MAX_PER_DAY ?? 3);
  const minPub = Number(process.env.AUTO_MIN_PUBLISHERS ?? 2);
  const log = async (clusterId: string, outcome: string, reasons: string[], articleId?: string) =>
    must(await db.from("auto_runs").insert({ cluster_id: clusterId, outcome, reasons, article_id: articleId ?? null }), "log run");

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const { count } = await db.from("auto_runs").select("id", { count: "exact", head: true }).eq("outcome", "published").gte("created_at", dayStart.toISOString());
  if (live && (count ?? 0) >= cap) return { message: `Daily limit reached (${cap} auto-published). Nothing run.` };

  let fetched = "";
  try { const f = await discoverNews(); fetched = `Fetched ${f.fetched}, ${f.inserted} new. `; } catch (e) { fetched = `Fetch failed (${msg(e)}). `; }

  const prior = (must(await db.from("auto_runs").select("cluster_id,outcome"), "past runs") as Row[]);
  const errs = new Map<string, number>(); const finished = new Set<string>();
  for (const p of prior) { if (p.outcome === "error") errs.set(p.cluster_id, (errs.get(p.cluster_id) ?? 0) + 1); else finished.add(p.cluster_id); }
  const clusters = must(await db.from("trending_clusters").select("id,title,publishers").order("publishers", { ascending: false }).limit(20), "clusters") as Row[];
  const pick = clusters.find((c) => c.publishers >= minPub && !finished.has(c.id) && (errs.get(c.id) ?? 0) < 2);
  if (!pick) return { message: `${fetched}No new story with ${minPub}+ publishers to research.` };

  const before = new Set(((await db.from("articles").select("id").in("status", DRAFT)).data ?? []).map((x: Row) => x.id));
  try { await researchCluster(pick.id); } catch (e) { await log(pick.id, "error", [msg(e).slice(0, 300)]); return { message: `${fetched}Research failed for "${pick.title}": ${msg(e)}` }; }

  const fresh = (must(await db.from("articles").select("id,title,summary,body").in("status", DRAFT).order("created_at", { ascending: false }), "drafts") as Row[]).filter((x) => !before.has(x.id));
  if (!fresh.length) { await log(pick.id, "no_draft", ["research produced no draft"]); return { message: `${fetched}Research made no draft for "${pick.title}".` }; }

    const results = fresh.map((a) => ({ a, reasons: checkDraft(a as unknown as { summary: string | null; body: Row | null }, minPub) }));
  const winner = results.find((r) => !r.reasons.length);
    if (live && winner) {
    const now = new Date().toISOString();
    let images: ArticleImage[] = [];
    if (process.env.AUTO_IMAGES !== "false") {
      try { images = await buildImages(winner.a); } catch { /* images are optional */ }
    }
    must(await db.from("articles").update({ status: "approved", published_at: now, summary: LABEL + (winner.a.summary ?? ""),
      body: { ...winner.a.body, images, auto_published: { at: now } } }).eq("id", winner.a.id), "auto publish");
    for (const r of results) if (r.a.id !== winner.a.id) must(await db.from("articles").update({ status: "rejected" }).eq("id", r.a.id), "reject duplicate");
    await log(pick.id, "published", [], winner.a.id);
    return { message: `${fetched}Published "${winner.a.title}". It carries an AI-generated label.` };
  }
  const why = live ? results.flatMap((r) => r.reasons) : ["AUTO_PUBLISH is off (dry run)", ...results.flatMap((r) => r.reasons)];
  await log(pick.id, "held", why.slice(0, 20), results[0].a.id);
  return { message: `${fetched}Held "${pick.title}" for your review. Reasons: ${why.slice(0, 4).join(" | ") || "none"}` };
}