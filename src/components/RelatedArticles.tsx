/**
 * "More like this" list for the bottom of an article page. Server component.
 * Save as: src/components/RelatedArticles.tsx
 * Use:     <RelatedArticles slug={article.slug} />
 */
import { ARTICLE_PATH, getRelated, type ArticleRow } from "@/lib/Recommendations";

export async function RelatedArticles({ slug, limit = 4 }: { slug: string; limit?: number }) {
  let items: ArticleRow[] = [];
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
            <a href={`${ARTICLE_PATH}${a.slug}`} className="font-medium hover:underline">
              {a.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default RelatedArticles;