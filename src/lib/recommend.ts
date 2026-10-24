/**
 * Recommendation engine ("For you" feed + "Related articles").
 *
 * Pure functions only: no database, no network. Give it the user's past events
 * and a list of candidate articles, and it returns the articles in the order
 * they should be shown. Save as: src/lib/recommend.ts
 *
 * How it works (the same ideas Instagram/Twitter use, at a small scale):
 *  1. Every action a user takes (view, read, like, share, save, skip) is a
 *     signal. Stronger actions count more; "skip" counts against a topic.
 *  2. Old signals fade (half-life), so the profile follows what the user
 *     cares about NOW, not what they read a year ago.
 *  3. Each candidate gets a score = interest match + freshness + popularity.
 *  4. A diversity step stops one topic from filling the whole feed.
 *  5. A small exploration share shows topics the user hasn't tried, which
 *     avoids a "filter bubble" and helps discover new interests.
 *  6. New users with no history simply get fresh + popular articles.
 */

export type EventType = "view" | "read" | "like" | "save" | "share" | "skip";

export type Article = {
  id: string;
  topics: string[]; // e.g. ["politics", "economy"]. Use your tags/categories.
  publishedAt: string | Date;
  popularity?: number; // total views/likes/shares so far (optional)
};

export type UserEvent = {
  articleId: string;
  type: EventType;
  at: string | Date;
  dwellSeconds?: number; // how long they stayed (used for "read")
};

export type RecommendOptions = {
  limit?: number; // how many articles to return (default 20)
  now?: Date;
  rng?: () => number; // injectable for tests; default Math.random
  explorationRate?: number; // share of slots for new topics (default 0.15)
  profileHalfLifeDays?: number; // how fast old interests fade (default 14)
  articleHalfLifeHours?: number; // how fast news gets stale (default 48)
  diversityPenalty?: number; // per repeat of the same topic (default 0.2)
};

// How strongly each action says "I like this topic".
const EVENT_WEIGHT: Record<EventType, number> = {
  view: 1,
  read: 3,
  like: 4,
  save: 5,
  share: 6,
  skip: -2,
};

// Final score = these weights times each part (all parts are 0..1 or -1..1).
const W_INTEREST = 0.55;
const W_FRESH = 0.25;
const W_POPULAR = 0.2;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const toMs = (d: string | Date) => (d instanceof Date ? d : new Date(d)).getTime();
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Exponential decay: returns 1 now, 0.5 after one half-life, 0.25 after two... */
function decay(ageMs: number, halfLifeMs: number): number {
  return Math.pow(0.5, Math.max(0, ageMs) / halfLifeMs);
}

/**
 * Step 1+2: turn the user's history into a topic -> interest map (-1..1).
 */
export function buildProfile(
  events: UserEvent[],
  articlesById: Map<string, Article>,
  opts: Pick<RecommendOptions, "now" | "profileHalfLifeDays"> = {},
): Map<string, number> {
  const now = (opts.now ?? new Date()).getTime();
  const halfLife = (opts.profileHalfLifeDays ?? 14) * DAY;
  const raw = new Map<string, number>();

  for (const ev of events) {
    const article = articlesById.get(ev.articleId);
    if (!article || article.topics.length === 0) continue;

    let weight = EVENT_WEIGHT[ev.type];
    if (ev.type === "read" && ev.dwellSeconds !== undefined) {
      // Reading for 1 minute = normal; a few seconds counts less; long counts more.
      weight *= clamp(ev.dwellSeconds / 60, 0.3, 2);
    }
    weight *= decay(now - toMs(ev.at), halfLife);

    // Split the weight across the article's topics so multi-tag articles
    // don't count extra.
    const share = weight / article.topics.length;
    for (const t of article.topics) raw.set(t, (raw.get(t) ?? 0) + share);
  }

  // Scale so the strongest interest is 1 (and dislikes stay proportional).
  let maxAbs = 0;
  for (const v of raw.values()) maxAbs = Math.max(maxAbs, Math.abs(v));
  if (maxAbs === 0) return new Map();
  const profile = new Map<string, number>();
  for (const [t, v] of raw) profile.set(t, clamp(v / maxAbs, -1, 1));
  return profile;
}

/** How well an article's topics match the profile (-1..1). */
function interestScore(article: Article, profile: Map<string, number>): number {
  if (article.topics.length === 0 || profile.size === 0) return 0;
  let sum = 0;
  for (const t of article.topics) sum += profile.get(t) ?? 0;
  return sum / article.topics.length;
}

/**
 * The main feed. Returns up to `limit` articles, best first.
 */
export function recommend(
  events: UserEvent[],
  candidates: Article[],
  options: RecommendOptions = {},
): Article[] {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 20;
  const rng = options.rng ?? Math.random;
  const explorationRate = options.explorationRate ?? 0.15;
  const articleHalfLife = (options.articleHalfLifeHours ?? 48) * HOUR;
  const diversityPenalty = options.diversityPenalty ?? 0.2;

  const byId = new Map(candidates.map((a) => [a.id, a]));
  const profile = buildProfile(events, byId, options);

  // Don't show things the user already opened.
  const seen = new Set(
    events.filter((e) => e.type === "view" || e.type === "read").map((e) => e.articleId),
  );
  const pool = candidates.filter((a) => !seen.has(a.id));
  if (pool.length === 0) return [];

  const maxPop = Math.max(1, ...pool.map((a) => a.popularity ?? 0));

  // Step 3: score every candidate.
  const scored = pool.map((article) => {
    const interest = interestScore(article, profile);
    const fresh = decay(now.getTime() - toMs(article.publishedAt), articleHalfLife);
    const popular = Math.log1p(article.popularity ?? 0) / Math.log1p(maxPop);
    const score = W_INTEREST * interest + W_FRESH * fresh + W_POPULAR * popular;
    return { article, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // Step 5: reserve a few slots for topics the user has never engaged with.
  const exploreSlots = profile.size === 0 ? 0 : Math.round(limit * explorationRate);
  const mainSlots = limit - exploreSlots;

  // Step 4: pick the main slots greedily, penalising repeated topics.
  const picked: Article[] = [];
  const topicCount = new Map<string, number>();
  const remaining = [...scored];

  while (picked.length < mainSlots && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const { article, score } = remaining[i];
      const repeats = article.topics.reduce((m, t) => Math.max(m, topicCount.get(t) ?? 0), 0);
      const adjusted = score - diversityPenalty * repeats * 0.5;
      if (adjusted > bestScore) {
        bestScore = adjusted;
        bestIdx = i;
      }
    }
    const [chosen] = remaining.splice(bestIdx, 1);
    picked.push(chosen.article);
    for (const t of chosen.article.topics) topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
  }

  // Exploration: random fresh-ish articles from topics the user has no history with.
  if (exploreSlots > 0) {
    const unexplored = remaining
      .filter(({ article }) => article.topics.every((t) => !profile.has(t)))
      .map((x) => x.article);
    for (let i = 0; i < exploreSlots && unexplored.length > 0; i++) {
      const idx = Math.floor(rng() * unexplored.length);
      picked.push(unexplored.splice(idx, 1)[0]);
    }
    // Not enough unexplored topics? Fill with the next best ones.
    for (const { article } of remaining) {
      if (picked.length >= limit) break;
      if (!picked.includes(article)) picked.push(article);
    }
  }

  return picked.slice(0, limit);
}

/**
 * "More like this": articles related to the one being read, ranked by shared
 * topics (Jaccard similarity) and freshness. No user history needed.
 */
export function relatedTo(
  article: Article,
  candidates: Article[],
  { limit = 5, now = new Date() }: { limit?: number; now?: Date } = {},
): Article[] {
  const mine = new Set(article.topics);
  return candidates
    .filter((c) => c.id !== article.id)
    .map((c) => {
      const theirs = new Set(c.topics);
      let shared = 0;
      for (const t of mine) if (theirs.has(t)) shared++;
      const union = mine.size + theirs.size - shared;
      const similarity = union === 0 ? 0 : shared / union;
      const fresh = decay(now.getTime() - toMs(c.publishedAt), 7 * DAY);
      return { c, score: 0.8 * similarity + 0.2 * fresh, similarity };
    })
    .filter((x) => x.similarity > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}