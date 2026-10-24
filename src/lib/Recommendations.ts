/**
 * Save as: src/lib/recommendations.ts  (replace the whole file)
 * Categories + category-based recommendations for ForYou.tsx and RelatedArticles.tsx.
 */
import { publicDb } from "@/lib/db";

// Article URLs look like /news/<slug>. Keep the trailing slash.
export const ARTICLE_PATH = "/news/";

// Column names of the events table (0002_events.sql). Change here if yours differ.
const EVENTS_TABLE = "events";
const COL_VISITOR = "visitor_id";
const COL_ARTICLE = "article_id";

export type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  cluster_id: string | null;
  topic_slug: string | null;
  published_at: string | null;
  category?: string | null; // added at runtime, not a database column
};

const COLUMNS = "id,slug,title,summary,cluster_id,topic_slug,published_at";
const DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Categories. Add or edit keywords freely; matching is whole-word.    */
/* ------------------------------------------------------------------ */
export const CATEGORIES: Record<string, { label: string; words: string[] }> = {
  politics: {
    label: "Politics",
    words: [
      "election", "minister", "chief minister", "prime minister", "party", "government", "parliament",
      "lok sabha", "rajya sabha", "assembly", "vote", "voter", "poll", "bjp", "congress", "aap",
      "opposition", "cabinet", "policy", "bill", "mp", "mla", "campaign", "manifesto", "senate",
      "president", "democrat", "republican", "coalition", "legislature",
    ],
  },
  sports: {
    label: "Sports",
    words: [
      "cricket", "ipl", "football", "fifa", "olympic", "olympics", "tennis", "hockey", "kabaddi",
      "badminton", "match", "tournament", "league", "cup", "medal", "wicket", "goal", "stadium",
      "coach", "athlete", "champion", "championship", "t20", "test series", "grand slam", "f1",
    ],
  },
  entertainment: {
    label: "Entertainment",
    words: [
      "film", "movie", "bollywood", "hollywood", "actor", "actress", "box office", "ott", "web series",
      "album", "song", "singer", "concert", "celebrity", "director", "trailer", "netflix", "award",
      "oscar", "festival", "music", "show", "streaming", "television", "tv",
    ],
  },
  business: {
    label: "Business",
    words: [
      "gold", "price", "market", "stock", "sensex", "nifty", "economy", "economic", "bank", "trade",
      "tax", "rupee", "inflation", "company", "profit", "revenue", "investor", "gdp", "tariff",
      "shares", "ipo", "rbi", "budget", "startup", "merger",
    ],
  },
  law: {
    label: "Law & Courts",
    words: [
      "court", "judge", "supreme court", "high court", "verdict", "bail", "law", "petition", "tribunal",
      "justice", "lawsuit", "ruling", "sentenced", "convicted", "arrested", "police", "investigation",
      "cbi", "ed", "fir", "trial", "legal",
    ],
  },
  world: {
    label: "World",
    words: [
      "war", "treaty", "united nations", "border", "summit", "sanction", "sanctions", "ceasefire",
      "embassy", "diplomat", "nato", "china", "russia", "ukraine", "gaza", "israel", "pakistan",
      "foreign", "international", "refugee", "militant",
    ],
  },
  tech: {
    label: "Technology",
    words: [
      "ai", "artificial intelligence", "software", "app", "chip", "internet", "cyber", "hack", "data",
      "smartphone", "robot", "algorithm", "tech", "google", "openai", "apple", "microsoft", "online",
      "social media", "privacy",
    ],
  },
  science: {
    label: "Science & Health",
    words: [
      "research", "study", "space", "isro", "nasa", "climate", "scientist", "vaccine", "disease",
      "hospital", "health", "doctor", "virus", "cancer", "medicine", "drug", "satellite", "moon",
      "mars", "pollution", "weather", "earthquake", "flood", "cyclone",
    ],
  },
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MATCHERS = Object.entries(CATEGORIES).map(([key, c]) => ({
  key,
  regexes: c.words.map((w) => new RegExp(`\\b${escape(w)}s?\\b`, "i")),
}));

export function categoryLabel(key: string | null | undefined): string {
  return key && CATEGORIES[key] ? CATEGORIES[key].label : "";
}

/** Category key for an article, or null when nothing matches. Title hits count double. */
export function categoryOf(a: Pick<ArticleRow, "title" | "summary" | "topic_slug">): string | null {
  if (a.topic_slug && CATEGORIES[a.topic_slug]) return a.topic_slug;
  const title = a.title ?? "";
  const summary = a.summary ?? "";
  let best: string | null = null;
  let bestScore = 0;
  for (const m of MATCHERS) {
    let score = 0;
    for (const r of m.regexes) {
      if (r.test(title)) score += 2;
      if (r.test(summary)) score += 1;
    }
    if (score > bestScore) {
      best = m.key;
      bestScore = score;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Data helpers                                                        */
/* ------------------------------------------------------------------ */
const ts = (a: ArticleRow) => (a.published_at ? new Date(a.published_at).getTime() : 0);
const clusterOf = (a: ArticleRow) => a.cluster_id ?? a.id;

// The same story can appear several times (same cluster_id): keep the newest.
function dedupeByCluster(rows: ArticleRow[]): ArticleRow[] {
  const seen = new Set<string>();
  const out: ArticleRow[] = [];
  for (const a of [...rows].sort((x, y) => ts(y) - ts(x))) {
    const key = clusterOf(a);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

async function fetchApproved(): Promise<ArticleRow[]> {
  const { data } = await publicDb()
    .from("articles")
    .select(COLUMNS)
    .eq("status", "approved")
    .order("published_at", { ascending: false })
    .limit(100);
  return ((data ?? []) as ArticleRow[]).map((a) => ({ ...a, category: categoryOf(a) }));
}

/** Article ids this visitor has opened. Fails safe to an empty list. */
async function seenIds(visitorId?: string): Promise<string[]> {
  if (!visitorId) return [];
  try {
    const { data } = await publicDb()
      .from(EVENTS_TABLE)
      .select(COL_ARTICLE)
      .eq(COL_VISITOR, visitorId)
      .limit(300);
    return (data ?? []).map((r: Record<string, unknown>) => String(r[COL_ARTICLE]));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* "For you": more of the categories the visitor reads most            */
/* ------------------------------------------------------------------ */
export type Feed = { items: ArticleRow[]; topCategory: string | null };

export async function getForYouFeed(visitorId: string | undefined, limit = 6): Promise<Feed> {
  const everything = await fetchApproved();
  const seen = new Set(await seenIds(visitorId));

  // Count views per category. Uses the full list so older versions of a story still count.
  const counts = new Map<string, number>();
  const seenClusters = new Set<string>();
  let totalViews = 0;
  for (const a of everything) {
    if (!seen.has(a.id)) continue;
    seenClusters.add(clusterOf(a));
    if (a.category) {
      counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
      totalViews++;
    }
  }

  let topCategory: string | null = null;
  let topCount = 0;
  for (const [cat, n] of counts) {
    if (n > topCount) {
      topCategory = cat;
      topCount = n;
    }
  }

  // Hide stories already opened (and other versions of the same story).
  const pool = dedupeByCluster(everything).filter((a) => !seen.has(a.id) && !seenClusters.has(clusterOf(a)));

  const now = Date.now();
  const scored = pool.map((a) => {
    const share = a.category && totalViews > 0 ? (counts.get(a.category) ?? 0) / totalViews : 0;
    const fresh = Math.exp(-(now - ts(a)) / (3 * DAY));
    return { a, base: share * 3 + fresh };
  });

  // Pick greedily with a small penalty for repeating a category, so one topic doesn't fill every slot.
  const picked: ArticleRow[] = [];
  const perCategory = new Map<string, number>();
  while (picked.length < limit && scored.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    scored.forEach((s, i) => {
      const repeats = s.a.category ? perCategory.get(s.a.category) ?? 0 : 0;
      const score = s.base - repeats * 0.1;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    });
    const [chosen] = scored.splice(bestIdx, 1);
    picked.push(chosen.a);
    if (chosen.a.category) perCategory.set(chosen.a.category, (perCategory.get(chosen.a.category) ?? 0) + 1);
  }

  return { items: picked, topCategory };
}

export async function getForYou(visitorId: string | undefined, limit = 6): Promise<ArticleRow[]> {
  return (await getForYouFeed(visitorId, limit)).items;
}

/* ------------------------------------------------------------------ */
/* Related stories: same category and shared words, never the same story */
/* ------------------------------------------------------------------ */
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );

export async function getRelated(slug: string, limit = 4): Promise<ArticleRow[]> {
  const all = await fetchApproved();
  const current = all.find((a) => a.slug === slug);
  if (!current) return [];

  const curWords = words(`${current.title} ${current.summary ?? ""}`);
  const curCluster = clusterOf(current);

  const candidates = dedupeByCluster(all.filter((a) => a.id !== current.id && clusterOf(a) !== curCluster));
  const now = Date.now();

  return candidates
    .map((a) => {
      const sameCategory = current.category && a.category === current.category ? 1 : 0;
      let overlap = 0;
      for (const w of words(`${a.title} ${a.summary ?? ""}`)) if (curWords.has(w)) overlap++;
      const fresh = Math.exp(-(now - ts(a)) / (7 * DAY));
      return { a, score: sameCategory * 2 + Math.min(overlap, 5) * 0.4 + fresh };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}