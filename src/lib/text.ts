const STOP = new Set("a an the of in on at to for and or but is are was were be been with by from as that this it its after before over into out up down new says said say amid about".split(" "));

export function tokens(title: string): Set<string> {
  return new Set(title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
}
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Normalises whitespace and typographic quotes so quote verification is not defeated by formatting. */
export function normForMatch(s: string): string {
  return s.replace(/[\u2018\u2019\u201B]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ").trim().toLowerCase();
}
/** True only if the quote appears verbatim (modulo whitespace/quote style) in the source text. */
export function quoteInText(quote: string, text: string): boolean {
  const q = normForMatch(quote).replace(/^["']|["']$/g, "");
  return q.length >= 12 && normForMatch(text).includes(q);
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").slice(0, 80);
}
export function stripHtml(html: string): string {
  return html.replace(/<(script|style|noscript|svg|header|footer|nav|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch { return raw; }
}
