/**
 * Related stories under an article. Server component.
 * Save as: src/components/RelatedArticles.tsx  (replace the whole file)
 * Use:     <RelatedArticles slug={a.slug} />
 */
import Link from "next/link";
import { ARTICLE_PATH, categoryLabel, getRelated } from "@/lib/Recommendations";

export async function RelatedArticles({ slug, limit = 4 }: { slug: string; limit?: number }) {
  let items: Awaited<ReturnType<typeof getRelated>> = [];
  try {
    items = await getRelated(slug, limit);
  } catch {
    return null;
  }
  if (items.length === 0) return null;

  return (
    <section className="my-8">
      <h2 className="text-lg font-semibold">Related stories</h2>
      <ul className="mt-3 border-t border-rule">
        {items.map((a) => (
          <li key={a.id} className="border-b border-rule py-3">
            {a.category && (
              <span className="ui text-xs font-semibold uppercase tracking-wide text-navy">
                {categoryLabel(a.category)}
              </span>
            )}
            <Link href={`${ARTICLE_PATH}${a.slug}`} className="mt-0.5 block font-medium hover:underline">
              {a.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default RelatedArticles;