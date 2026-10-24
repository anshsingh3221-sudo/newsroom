import { XMLParser } from "fast-xml-parser";
import { FEEDS } from "@/config/feeds";
import { adminDb, must } from "../db";
import { canonicalUrl, jaccard, stripHtml, tokens } from "../text";

export interface FeedItem { title: string; url: string; publisher: string; publishedAt: string | null; summary: string }

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const arr = <T,>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const txt = (x: any): string => (typeof x === "string" ? x : x?.["#text"] ?? "");

export function parseFeed(xml: string, publisher: string): FeedItem[] {
  const doc = parser.parse(xml);
  const rssItems = arr(doc?.rss?.channel?.item);
  if (rssItems.length) {
    return rssItems.map((i: any) => ({
      title: stripHtml(txt(i.title)), url: canonicalUrl(txt(i.link)), publisher,
      publishedAt: i.pubDate ? new Date(i.pubDate).toISOString() : null,
      summary: stripHtml(txt(i.description)).slice(0, 500),
    })).filter((i) => i.title && i.url);
  }
  return arr(doc?.feed?.entry).map((e: any) => {
    const link = arr(e.link).find((l: any) => l["@_rel"] !== "self") ?? arr(e.link)[0];
    const when = txt(e.published) || txt(e.updated);
    return { title: stripHtml(txt(e.title)), url: canonicalUrl(link?.["@_href"] ?? ""), publisher,
      publishedAt: when ? new Date(when).toISOString() : null, summary: stripHtml(txt(e.summary)).slice(0, 500) };
  }).filter((i) => i.title && i.url);
}

/** Pure function: given new items and existing clusters, decide which cluster each item belongs to. */
export function assignClusters(
  items: { key: string; title: string }[],
  clusters: { id: string; title: string }[],
  threshold = 0.45,
): { assignments: Map<string, string>; newClusters: { tempId: string; title: string }[] } {
  const pool = clusters.map((c) => ({ id: c.id, tok: tokens(c.title) }));
  const assignments = new Map<string, string>();
  const newClusters: { tempId: string; title: string }[] = [];
  for (const item of items) {
    const tok = tokens(item.title);
    let best: { id: string; score: number } | null = null;
    for (const c of pool) {
      const score = jaccard(tok, c.tok);
      if (score >= threshold && (!best || score > best.score)) best = { id: c.id, score };
    }
    if (best) { assignments.set(item.key, best.id); continue; }
    const tempId = `new-${newClusters.length}`;
    newClusters.push({ tempId, title: item.title });
    pool.push({ id: tempId, tok });
    assignments.set(item.key, tempId);
  }
  return { assignments, newClusters };
}

export async function discoverNews(): Promise<{ fetched: number; inserted: number; errors: string[] }> {
  const db = adminDb();
  const errors: string[] = [];
  const all: FeedItem[] = [];
  await Promise.all(FEEDS.map(async (f) => {
    try {
      const res = await fetch(f.url, { headers: { "user-agent": "NewsroomBot/0.1 (+research)" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      all.push(...parseFeed(await res.text(), f.publisher));
    } catch (err) { errors.push(`${f.publisher}: ${err instanceof Error ? err.message : err}`); }
  }));

     if (!all.length) return { fetched: 0, inserted: 0, errors };
   const urls = [...new Set(all.map((i) => i.url))];
   const existing = new Set<string>();
   for (let i = 0; i < urls.length; i += 50) {
     const chunk = urls.slice(i, i + 50);
     const found = must(await db.from("news_items").select("url").in("url", chunk), "existing items") as { url: string }[];
     found.forEach((r) => existing.add(r.url));
   }
  const fresh = [...new Map(all.filter((i) => !existing.has(i.url)).map((i) => [i.url, i])).values()];
  if (!fresh.length) return { fetched: all.length, inserted: 0, errors };

  const since = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const recent = must(await db.from("news_clusters").select("id,title").gte("first_seen", since), "clusters") as { id: string; title: string }[];
  const { assignments, newClusters } = assignClusters(fresh.map((i) => ({ key: i.url, title: i.title })), recent);

  const idMap = new Map<string, string>();
  for (const c of newClusters) {
    const row = must(await db.from("news_clusters").insert({ title: c.title }).select("id").single(), "insert cluster") as { id: string };
    idMap.set(c.tempId, row.id);
  }
  const rows = fresh.map((i) => {
    const cid = assignments.get(i.url)!;
    return { title: i.title, url: i.url, publisher: i.publisher, published_at: i.publishedAt, summary: i.summary, cluster_id: idMap.get(cid) ?? cid };
  });
  must(await db.from("news_items").upsert(rows, { onConflict: "url", ignoreDuplicates: true }), "insert items");
  return { fetched: all.length, inserted: rows.length, errors };
}
