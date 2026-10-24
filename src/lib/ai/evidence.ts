import { env } from "../env";
import { normalizeSource, saveSource } from "./normalize";
import type { NormalizedSource } from "./types";

async function searchUrls(query: string, n: number): Promise<string[]> {
  const e = env();
  if (e.SEARCH_PROVIDER === "brave") {
    if (!e.BRAVE_API_KEY) throw new Error("SEARCH_PROVIDER=brave needs BRAVE_API_KEY");
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${n}`,
      { headers: { "x-subscription-token": e.BRAVE_API_KEY, accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Brave search failed (${res.status})`);
    return ((await res.json()).web?.results ?? []).map((r: any) => r.url);
  }
  const q = query.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).slice(0, 10).join(" ");
  const res = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=${n}&format=json&sort=hybridrel`,
    { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`GDELT search failed (${res.status})`);
  const text = await res.text();
  try { return (JSON.parse(text).articles ?? []).map((a: any) => a.url); } catch { return []; }
}

/** Finds and stores real web sources relevant to a claim. Failures on single pages are skipped, never faked. */
export async function retrieveEvidence(claim: string, limit = 5): Promise<(NormalizedSource & { id: string })[]> {
  const urls = await searchUrls(claim, limit + 3);
  const out: (NormalizedSource & { id: string })[] = [];
  for (const url of urls) {
    if (out.length >= limit) break;
    try { out.push(await saveSource(await normalizeSource(url))); } catch { /* skip unreachable pages */ }
  }
  return out;
}
