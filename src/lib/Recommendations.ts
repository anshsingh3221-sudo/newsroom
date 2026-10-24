/**
 * Save as: src/lib/recommendations.ts
 * Used by ForYou.tsx and RelatedArticles.tsx (server components).
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
};

const COLUMNS = "id,slug,title,summary,cluster_id,topic_slug,published_at";
const DAY = 24 * 60 * 60 * 1000;

// Stopgap while topic_slug is empty: guess a topic from the text.
const TOPIC_WORDS: Record<string, string[]> = {
  business: ["gold", "price", "market", "stock", "economy", "bank", "trade", "tax", "rupee", "inflation", "company"],
  law: ["court", "judge", "supreme", "verdict", "bail", "law", "petition", "tribunal", "justice"],
  politics: ["election", "minister", "party", "government", "parliament", "vote", "policy", "bill"],
  world: ["war", "treaty", "united nations", "border", "summit", "sanction", "ceasefire"],
  science: ["research", "study", "space", "isro", "nasa", "climate", "scientist", "vaccine"],
  sports: ["cricket", "match", "tournament", "league", "olympic", "cup", "player"],
  tech: ["ai", "software", "app", "chip", "internet", "cyber", "startup", "data"],
};

export function topicOf(a: Pick<ArticleRow, "title" | "summary" | "topic_slug">): string | null {
  if (a.topic_slug) return a.topic_slug;
  const text = ` ${(a.title ?? "").toLowerCase()} ${(a.summary ?? "").toLowerCase()} `;
  let best: string | null = null;
  let bestHits = 0;
  for (const [topic, words] of Object.entries(TOPIC_WORDS)) {
    let hits = 0;
    for (const w of words) if (text.includes(` ${w}`)) hits++;
    if (hits > bestHits) {
      best = topic;
      bestHits = hits;
    }
  }
  return best;
}

const ts = (a: ArticleRow) => (a.published_at ? new Date(a.published_at).getTime() : 0);

// Same story can appear several times (same cluster_id): keep the newest.
function dedupeByCluster(rows: ArticleRow[]): ArticleRow[] {
  const seen = new Set<string>();
  const out: ArticleRow[] = [];
  for (const a of [...rows].sort((x, y) => ts(y) - ts(x))) {
    const key = a.cluster_id ?? a.id;
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
  return (data ?? []) as ArticleRow[];
}

/** Article ids this visitor has opened. Fails safe to an empty list. */
async function seenIds(visitorId?: string): Promise<string[]> {
  if (!visitorId) return [];
  try {
    const { data } = await publicDb()
      .from(EVENTS_TABLE)
      .select(COL_ARTICLE)
      .eq(COL_VISITOR, visitorId)
      .limit(200);
    return (data ?? []).map((r: Record<string, unknown>) => String(r[COL_ARTICLE]));
  } catch {
    return [];
  }
}

/** "For you" list: newest stories, boosted by topics the visitor has read, minus what they opened. */
export async function getForYou(visitorId: string | undefined, limit = 6): Promise<ArticleRow[]> {
  const all = dedupeByCluster(await fetchApproved());
  const seen = new Set(await seenIds(visitorId));

  const topicCount = new Map<string, number>();
  for (const a of all) {
    if (!seen.has(a.id)) continue;
    const t = topicOf(a);
    if (t) topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
  }

  const now = Date.now();
  return all
    .filter((a) => !seen.has(a.id))
    .map((a) => {
      const t = topicOf(a);
      const affinity = t ? topicCount.get(t) ?? 0 : 0;
      const fresh = Math.exp(-(now - ts(a)) / (3 * DAY));
      return { a, score: affinity * 1.5 + fresh };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );

/** Related stories: same topic and shared title words, never the same story (cluster). */
export async function getRelated(slug: string, limit = 4): Promise<ArticleRow[]> {
  const all = await fetchApproved();
  const current = all.find((a) => a.slug === slug);
  if (!current) return [];

  const curTopic = topicOf(current);
  const curWords = words(`${current.title} ${current.summary ?? ""}`);
  const curCluster = current.cluster_id ?? current.id;
  const now = Date.now();

  const candidates = dedupeByCluster(
    all.filter((a) => a.id !== current.id && (a.cluster_id ?? a.id) !== curCluster),
  );

  return candidates
    .map((a) => {
      const sameTopic = curTopic && topicOf(a) === curTopic ? 1 : 0;
      let overlap = 0;
      for (const w of words(`${a.title} ${a.summary ?? ""}`)) if (curWords.has(w)) overlap++;
      const fresh = Math.exp(-(now - ts(a)) / (7 * DAY));
      return { a, score: sameTopic * 2 + Math.min(overlap, 5) * 0.4 + fresh };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}