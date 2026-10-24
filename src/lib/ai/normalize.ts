import { adminDb, must } from "../db";
import { canonicalUrl, stripHtml } from "../text";
import type { NormalizedSource, SourceType } from "./types";

const meta = (html: string, prop: string): string | null => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i"))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i"));
  return m?.[1] ?? null;
};

/** Fetches a URL and turns it into a clean, stored source record. Respects timeouts and sets an honest user agent. */
export async function normalizeSource(rawUrl: string, sourceType: SourceType = "news_report"): Promise<NormalizedSource> {
  const url = canonicalUrl(rawUrl);
  const res = await fetch(url, { headers: { "user-agent": "NewsroomBot/0.1 (+research)", accept: "text/html,text/plain" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Could not fetch ${url} (HTTP ${res.status})`);
  const html = await res.text();
  const title = stripHtml(meta(html, "og:title") ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? url);
  const articleBody = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
  const published = meta(html, "article:published_time") ?? meta(html, "datePublished") ?? meta(html, "date");
  return {
    url, title, publisher: meta(html, "og:site_name") ?? new URL(url).hostname.replace(/^www\./, ""),
    publishedAt: published && !isNaN(Date.parse(published)) ? new Date(published).toISOString() : null,
    language: (html.match(/<html[^>]+lang=["']([a-zA-Z-]+)/i)?.[1] ?? "en").slice(0, 2).toLowerCase(),
    text: stripHtml(articleBody).slice(0, 40000), sourceType,
  };
}

export async function saveSource(s: NormalizedSource): Promise<NormalizedSource & { id: string }> {
  const row = must(await adminDb().from("sources").upsert({
    url: s.url, title: s.title, publisher: s.publisher, source_type: s.sourceType, published_at: s.publishedAt,
    language: s.language, content: s.text, fetched_at: new Date().toISOString(),
  }, { onConflict: "url" }).select("id").single(), "save source") as { id: string };
  return { ...s, id: row.id };
}
