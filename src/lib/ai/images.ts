import { adminDb, type Row } from "@/lib/db";

export type ArticleImage = {
  kind: "portrait" | "place" | "illustration" | "source" | "cover";
  url: string; alt: string; caption: string; credit?: string; sourceUrl?: string;
};

// Wikimedia requires a real contact in the User-Agent. Set WIKI_CONTACT in .env.local.
const UA = { "User-Agent": `Newsroom3/1.0 (news site; contact: ${process.env.WIKI_CONTACT || "unset"})` };
const OK_LICENSE = /^(CC BY|CC0|Public domain|PD|GODL|OGL)/i;
const BAD_LICENSE = /\b(NC|ND)\b/i;
const FILLER = new Set(["president", "prime", "minister", "chief", "mr", "mrs", "ms", "dr", "pm", "shri", "sri", "smt", "justice", "senator", "governor", "the", "and", "of"]);

type Subject = { as_written: string; wikipedia_title: string; type: "person" | "place" };

async function findSubjects(a: Row): Promise<Subject[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];
  const model = process.env.LLM_MODEL || "gemini-3.5-flash-lite";
  const text = `${a.title ?? ""}. ${a.summary ?? ""}`.replace(/\[S\d+(?:\s*,\s*S\d+)*\]/g, "").trim();
  const prompt = `From the news text below, pick up to 2 real, publicly known people who are central to the story (officials, politicians or other public figures; never suspects, victims or private individuals) and up to 1 place where the story happens or main institution (a country, state, city or major institution). For each give: "as_written" (the exact words in the text that name it), "wikipedia_title" (the exact title of its English Wikipedia article) and "type" ("person" or "place"). If you are not sure of the exact Wikipedia title, leave that item out. Return only a JSON array, or [] if nothing fits.\n\nText: ${text}`;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
  });
  if (!r.ok) { console.log("[images] subject lookup failed:", model, r.status); return []; }
  const j: Row = await r.json();
  const raw = (j.candidates?.[0]?.content?.parts ?? []).map((p: Row) => p.text ?? "").join("").replace(/```json|```/g, "").trim();
  let list: Row[] = [];
  try { const p = JSON.parse(raw || "[]"); list = Array.isArray(p) ? p : []; } catch { return []; }
  const lower = text.toLowerCase();
  return list
    .filter((x) => typeof x?.as_written === "string" && typeof x?.wikipedia_title === "string" && (x.type === "person" || x.type === "place") && lower.includes(x.as_written.toLowerCase()))
    .slice(0, 3) as Subject[];
}

function sameSubject(asWritten: string, wiki: string): boolean {
  const words = asWritten.toLowerCase().split(/[^a-z\u00C0-\u024F]+/).filter((t) => t.length >= 3 && !FILLER.has(t));
  const title = wiki.toLowerCase();
  return words.length > 0 && words.some((t) => title.includes(t));
}

async function wikiImage(wiki: string, kind: "portrait" | "place"): Promise<ArticleImage | null> {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wiki.replace(/\s+/g, "_"))}`, { headers: UA });
  if (!r.ok) { console.log("[images] Wikipedia page not found:", wiki, r.status); return null; }
  const s: Row = await r.json();
  if (s.type !== "standard") { console.log("[images] not a normal Wikipedia page:", wiki, s.type); return null; }
  const name = String(s.title);
  const src: string | undefined = s.originalimage?.source;
  const m = src?.match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
  if (!m) { console.log("[images] no free Commons photo for", name); return null; }
  const file = decodeURIComponent(m[1].split("?")[0]);
  const q = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent("File:" + file)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json`;
  const jr = await fetch(q, { headers: UA });
  if (!jr.ok) { console.log("[images] Commons request failed:", jr.status); return null; }
  const j: Row = await jr.json();
  const ii: Row | undefined = (Object.values(j.query?.pages ?? {})[0] as Row | undefined)?.imageinfo?.[0];
  const md: Row = ii?.extmetadata ?? {};
  const lic = String(md.LicenseShortName?.value ?? "");
  console.log("[images] commons:", file, "| found:", !!ii, "| licence:", lic || "(none)");
  if (!ii || !OK_LICENSE.test(lic) || BAD_LICENSE.test(lic)) return null;
  const artist = String(md.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim();
  return {
    kind, url: ii.thumburl ?? ii.url, alt: kind === "portrait" ? `Photo of ${name}` : `Photo: ${name}`,
    caption: kind === "portrait" ? `${name}. File photo, not from the event described.` : `${name}. File photo.`,
    credit: `${artist || "Unknown author"}, Wikimedia Commons, ${lic}`, sourceUrl: ii.descriptionurl,
  };
}

/** Preview image of the original news reports (like a link preview). Credited and linked, not copied. */
async function sourceImages(a: Row): Promise<ArticleImage[]> {
  const sources: Row[] = a.body?.sources ?? [];
  const out: ArticleImage[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    if (out.length >= 2) break;
    let host = "";
    try { host = new URL(String(s.url)).hostname.replace(/^www\./, ""); } catch { continue; }
    if (seen.has(host)) continue;
    seen.add(host);
    if (host.includes("google.com")) { console.log("[images] skipping Google redirect link"); continue; }
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 7000);
      const r = await fetch(String(s.url), { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; Newsroom3 link preview)", Accept: "text/html" } });
      clearTimeout(timer);
      if (!r.ok) { console.log("[images] source page not readable:", host, r.status); continue; }
      const html = (await r.text()).slice(0, 300000);
      const m = html.match(/<meta[^>]+(?:property|name)=["']og:image(?::url)?["'][^>]*content=["']([^"']+)["']/i)
        ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i);
      if (!m) { console.log("[images] no preview image on", host); continue; }
      const url = new URL(m[1].replace(/&amp;/g, "&"), String(s.url)).toString();
      console.log("[images] source image from", host);
      out.push({ kind: "source", url, alt: `Image from ${host}`, caption: "Image via the original report:", credit: host, sourceUrl: String(s.url) });
    } catch (e) { console.log("[images] source image error:", host, String(e)); }
  }
  return out;
}

/** Always works: a coloured headline card. No photo, no licence, no cost. */
function coverCard(title: string): ArticleImage {
  const palettes = [["#14213d", "#8c1c3a"], ["#0b3c5d", "#1d2d44"], ["#3a0ca3", "#14213d"], ["#1b4332", "#081c15"], ["#7f1d1d", "#1f2937"], ["#264653", "#2a9d8f"]];
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [c1, c2] = palettes[h % palettes.length];
  const t = title.length > 110 ? title.slice(0, 107).trimEnd() + "…" : title;
  const lines: string[] = [];
  let cur = "";
  for (const w of t.split(/\s+/)) {
    if (cur && (cur + " " + w).length > 30) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const text = lines.slice(0, 5).map((l, i) => `<text x="70" y="${250 + i * 70}" font-family="Georgia,serif" font-size="56" font-weight="700" fill="#ffffff">${esc(l)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><rect x="70" y="90" width="120" height="8" fill="#ffffff" opacity="0.8"/><text x="70" y="150" font-family="Arial,sans-serif" font-size="28" letter-spacing="6" fill="#ffffff" opacity="0.85">THE RECORD</text>${text}</svg>`;
  return { kind: "cover", url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, alt: `Cover graphic: ${title}`, caption: "Cover graphic, not a photograph.", credit: "" };
}

/** Optional. Needs a paid Gemini plan, so it is off unless AI_IMAGES=true. */
async function illustration(title: string, articleId: string): Promise<ArticleImage | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.IMAGE_MODEL || "gemini-3.1-flash-image";
  const prompt = `Editorial illustration for a news article titled: "${title}". Symbolic and abstract, flat vector style, muted navy, burgundy and cream palette, wide 16:9 composition. Do NOT show any real person, face, crowd, flag, logo or text.`;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
  });
  if (!r.ok) { console.log("[images] Gemini image request failed:", model, r.status); return null; }
  const j: Row = await r.json();
  const part = (j.candidates?.[0]?.content?.parts ?? []).find((p: Row) => p.inlineData?.data);
  if (!part) return null;
  const mime: string = part.inlineData.mimeType || "image/png";
  const path = `${articleId}/illustration-${Date.now()}.${mime.includes("jpeg") ? "jpg" : "png"}`;
  const db = adminDb();
  const up = await db.storage.from("article-images").upload(path, Buffer.from(part.inlineData.data, "base64"), { contentType: mime, upsert: true });
  if (up.error) { console.log("[images] Storage upload failed:", up.error.message); return null; }
  return {
    kind: "illustration", url: db.storage.from("article-images").getPublicUrl(path).data.publicUrl,
    alt: `AI-generated illustration for: ${title}`,
    caption: "AI-generated illustration. Not a photograph and not a depiction of real events.",
    credit: "Generated with Google Gemini",
  };
}

/** Best effort: any failure just means fewer images, never a failed publish. */
export async function buildImages(a: Row): Promise<ArticleImage[]> {
  const out: ArticleImage[] = [];
  try {
    const subjects = await findSubjects(a);
    console.log("[images]", a.title, "|", subjects.map((s) => `${s.as_written} -> ${s.wikipedia_title}`).join("; ") || "no subjects");
    let people = 0, places = 0;
    for (const s of subjects) {
      if (!sameSubject(s.as_written, s.wikipedia_title)) { console.log("[images] name check failed:", s.as_written, "vs", s.wikipedia_title); continue; }
      if ((s.type === "person" && people >= 2) || (s.type === "place" && places >= 1)) continue;
      try {
        const img = await wikiImage(s.wikipedia_title, s.type === "person" ? "portrait" : "place");
        if (img) { out.push(img); if (s.type === "person") people++; else places++; }
      } catch (e) { console.log("[images] photo error:", String(e)); }
    }
  } catch (e) { console.log("[images] subject error:", String(e)); }
  try { out.push(...(await sourceImages(a))); } catch (e) { console.log("[images] source error:", String(e)); }
  if (process.env.AI_IMAGES === "true") {
    try { const i = await illustration(String(a.title), String(a.id)); if (i) out.unshift(i); } catch (e) { console.log("[images] illustration error:", String(e)); }
  }
  if (!out.some((i) => i.kind !== "portrait")) out.push(coverCard(String(a.title)));
  return out;
}