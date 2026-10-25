/**
 * Save as: src/lib/ai/newsEvidence.ts  (new file)
 * Pulls REAL, dated headlines about a claim from trusted outlets (Indian Express, The Hindu,
 * Times of India, NDTV, Hindustan Times, Reuters, AP, BBC, PIB and others) using Google News RSS.
 * No API key and no search quota are needed. The model must base fact-checks on these items.
 */

export type NewsItem = {
  id: string;        // N1, N2, ... used by the model to cite evidence
  title: string;     // headline, without the trailing " - Publisher"
  publisher: string; // e.g. "The Hindu"
  domain: string;    // e.g. "thehindu.com"
  url: string;
  date: string | null; // YYYY-MM-DD
  official: boolean; // government / regulator source
};

// Four sites per query keeps each Google News query short and reliable.
const GROUPS: string[][] = [
  ["indianexpress.com", "newindianexpress.com", "thehindu.com", "timesofindia.indiatimes.com"],
  ["hindustantimes.com", "ndtv.com", "indiatoday.in", "theprint.in"],
  ["livemint.com", "business-standard.com", "economictimes.indiatimes.com", "deccanherald.com"],
  ["scroll.in", "telegraphindia.com", "thewire.in", "firstpost.com"],
  ["pib.gov.in", "eci.gov.in", "rbi.org.in", "mea.gov.in"],
  ["reuters.com", "apnews.com", "bbc.com", "aljazeera.com"],
];

const MAX_ITEMS = 18;
const MAX_PER_PUBLISHER = 3;
const TIMEOUT_MS = 8000;

const isOfficial = (domain: string) =>
  domain.endsWith(".gov.in") || domain.endsWith(".nic.in") || domain === "rbi.org.in";

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const tag = (xml: string, name: string): string => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

const feedUrl = (q: string, domains: string[]) => {
  const sites = domains.map((d) => `site:${d}`).join(" OR ");
  const query = domains.length ? `${q} (${sites})` : q;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
};

async function fetchText(url: string): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; TheRecordBot/1.0)" } });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

type Raw = Omit<NewsItem, "id">;

function parseItems(xml: string): Raw[] {
  const out: Raw[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const item = m[1];
    const src = item.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i);
    const publisher = src ? decode(src[2]) : "";
    let domain = "";
    try {
      domain = src ? new URL(decode(src[1])).hostname.replace(/^www\./, "") : "";
    } catch {
      domain = "";
    }
    let title = tag(item, "title");
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3)).trim();
    const url = tag(item, "link");
    const when = new Date(tag(item, "pubDate"));
    const date = Number.isNaN(when.getTime()) ? null : when.toISOString().slice(0, 10);
    if (!title || !url || !publisher) continue;
    out.push({ title, publisher, domain: domain || publisher.toLowerCase(), url, date, official: isOfficial(domain) });
  }
  return out;
}

export async function fetchNewsEvidence(rawInput: string): Promise<NewsItem[]> {
  const q = rawInput.replace(/["“”]/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  if (!q) return [];

  const results = await Promise.allSettled(GROUPS.map((g) => fetchText(feedUrl(q, g)).then(parseItems)));
  let raw = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // Too little from the trusted list: widen to any source, still dated and attributed.
  if (raw.length < 3) raw = raw.concat(parseItems(await fetchText(feedUrl(q, []))));

  const seen = new Set<string>();
  const perPublisher = new Map<string, number>();
  const unique = raw
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .filter((r) => {
      const key = r.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      const n = perPublisher.get(r.domain) ?? 0;
      if (n >= MAX_PER_PUBLISHER) return false;
      perPublisher.set(r.domain, n + 1);
      return true;
    })
    .slice(0, MAX_ITEMS);

  return unique.map((r, i) => ({ id: `N${i + 1}`, ...r }));
}