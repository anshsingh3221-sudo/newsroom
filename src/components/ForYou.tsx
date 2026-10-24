/**
 * "For you" section. Server component: put it on the homepage.
 * Save as: src/components/ForYou.tsx  (replace the whole file)
 * Use:     <ForYou />   or   <ForYou limit={8} title="Recommended" />
 */
import Link from "next/link";
import { cookies } from "next/headers";
import { ARTICLE_PATH, categoryLabel, getForYouFeed, type Feed } from "@/lib/Recommendations";

export async function ForYou({
  limit = 6,
  title = "For you",
}: {
  limit?: number;
  title?: string;
}) {
  let feed: Feed;
  try {
    const jar = await cookies();
    feed = await getForYouFeed(jar.get("nr_vid")?.value, limit);
  } catch {
    return null; // never break the page because recommendations failed
  }
  if (feed.items.length === 0) return null;

  return (
    <section>
      <h2 className="text-2xl">{title}</h2>
      {feed.topCategory && (
        <p className="ui mt-1 text-sm text-muted">
          More {categoryLabel(feed.topCategory)} stories, based on what you’ve been reading
        </p>
      )}
      <ul className="mt-3 border-t border-rule">
        {feed.items.map((a) => (
          <li key={a.id} className="border-b border-rule py-3">
            {a.category && (
              <span className="ui text-xs font-semibold uppercase tracking-wide text-navy">
                {categoryLabel(a.category)}
              </span>
            )}
            <Link href={`${ARTICLE_PATH}${a.slug}`} className="mt-0.5 block font-medium hover:underline">
              {a.title}
            </Link>
            {a.summary && <p className="mt-1 text-sm text-muted">{a.summary}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ForYou;