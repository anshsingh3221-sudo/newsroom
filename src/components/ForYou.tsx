/**
 * "For you" section. Server component: put it on the homepage.
 * Save as: src/components/ForYou.tsx
 * Use:     <ForYou />   or   <ForYou limit={8} title="Recommended" />
 */
import { cookies } from "next/headers";
import { ARTICLE_PATH, getForYou, type ArticleRow } from "@/lib/Recommendations";

export async function ForYou({
  limit = 6,
  title = "For you",
}: {
  limit?: number;
  title?: string;
}) {
  let items: ArticleRow[] = [];
  try {
    const jar = await cookies();
    items = await getForYou(jar.get("nr_vid")?.value, limit);
  } catch {
    return null; // never break the page because recommendations failed
  }
  if (items.length === 0) return null;

  return (
    <section className="my-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="mt-3 border-t border-rule">
        {items.map((a) => (
          <li key={a.id} className="border-b border-rule py-3">
            <a href={`${ARTICLE_PATH}${a.slug}`} className="font-medium hover:underline">
              {a.title}
            </a>
            {a.summary && <p className="ui mt-1 line-clamp-2 text-sm text-muted">{a.summary}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ForYou;