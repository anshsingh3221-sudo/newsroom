/**
 * Save as: src/app/page.tsx  (replace the whole file)
 */
import Link from "next/link";
import { publicDb, type Row } from "@/lib/db";
import { fmtDate } from "@/lib/verdicts";
import { Empty, SectionTitle, VerdictBadge } from "@/components/ui";
import { Subscribe } from "@/components/Subscribe";
import { RELATION_LABEL, type Relation } from "@/lib/ai/types";
import { ForYou } from "@/components/ForYou";
import { getUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = publicDb();
  const [user, articles, checks, trending, comparisons, topics] = await Promise.all([
    getUser(),
    db.from("articles").select("slug,title,summary,published_at,topic_slug").eq("status", "approved").order("published_at", { ascending: false }).limit(7),
    db.from("fact_checks").select("slug,claim_text,verdict,claimant,published_at").eq("status", "approved").order("published_at", { ascending: false }).limit(5),
    db.from("trending_clusters").select("*").limit(8),
    db.from("statement_relationships").select("id,relation,summary,statement_b").eq("review_status", "approved").order("reviewed_at", { ascending: false }).limit(3),
    db.from("topics").select("slug,name").order("name").limit(20),
  ]);
  const [featured, ...latest] = (articles.data ?? []) as Row[];

  return (
    <div className="space-y-14">
      {topics.data?.length ? (
        <nav aria-label="Topics" className="ui flex flex-wrap gap-2">
          {topics.data.map((t: Row) => <Link key={t.slug} href={`/topics/${t.slug}`} className="btn-quiet">{t.name}</Link>)}
        </nav>
      ) : null}

      <section className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <div>
          {featured ? (
            <article>
              <p className="ui text-sm text-muted">Featured analysis · {fmtDate(featured.published_at)}</p>
              <h1 className="mt-2 text-4xl sm:text-5xl"><Link href={`/news/${featured.slug}`} className="hover:underline">{featured.title}</Link></h1>
              <p className="mt-4 max-w-prose text-xl text-muted">{featured.summary}</p>
            </article>
          ) : (
            <Empty title="No published analysis yet">
              Sign in at <Link href="/admin" className="underline">/admin</Link>, ingest news, run research on a story, then approve the draft to publish it here.
            </Empty>
          )}
        </div>
        <aside aria-labelledby="trending">
          <h2 id="trending" className="section-title">Trending</h2>
          <p className="ui mt-2 text-xs text-muted">Ranked by how many independent publishers covered the story in the last 48 hours, then by number of reports.</p>
          {trending.data?.length ? (
            <ol className="mt-3 divide-y divide-rule">
              {trending.data.map((t: Row, i: number) => (
                <li key={t.id} className="flex gap-3 py-3">
                  <span className="ui w-5 text-sm text-muted">{i + 1}</span>
                  <div><p className="leading-snug">{t.title}</p><p className="ui text-xs text-muted">{t.publishers} publishers · {t.items} reports</p></div>
                </li>
              ))}
            </ol>
          ) : <div className="mt-3"><Empty title="Nothing trending yet">Run “Fetch news” in the admin area to ingest feeds.</Empty></div>}
        </aside>
      </section>

      {/* "For you": between the headline and Latest analysis, only for logged-in users. */}
      {user && (
        <section aria-label="For you">
          <ForYou />
        </section>
      )}

      <section>
        <SectionTitle href="/search?type=articles">Latest analysis</SectionTitle>
        {latest.length ? (
          <div className="grid gap-8 md:grid-cols-2">
            {latest.map((a) => (
              <article key={a.slug}><h3 className="text-xl"><Link href={`/news/${a.slug}`} className="hover:underline">{a.title}</Link></h3><p className="mt-1 text-muted">{a.summary}</p><p className="ui mt-1 text-xs text-muted">{fmtDate(a.published_at)}</p></article>
            ))}
          </div>
        ) : <Empty title="No further analysis yet" />}
      </section>

      <section className="grid gap-12 lg:grid-cols-2">
        <div>
          <SectionTitle href="/fact-checks">Latest fact-checks</SectionTitle>
          {checks.data?.length ? (
            <ul className="space-y-5">
              {checks.data.map((c: Row) => (
                <li key={c.slug}><VerdictBadge verdict={c.verdict} /><p className="mt-1"><Link href={`/fact-checks/${c.slug}`} className="hover:underline">{c.claim_text}</Link></p>{c.claimant && <p className="ui text-xs text-muted">Claim by {c.claimant}</p>}</li>
              ))}
            </ul>
          ) : <Empty title="No fact-checks published yet">Approved fact-checks appear here.</Empty>}
        </div>
        <div>
          <SectionTitle href="/statements">Statement comparisons</SectionTitle>
          {comparisons.data?.length ? (
            <ul className="space-y-5">
              {comparisons.data.map((c: Row) => (
                <li key={c.id}><p className="ui text-xs font-semibold text-navy">{RELATION_LABEL[c.relation as Relation].outcome}</p><Link href={`/comparisons/${c.id}`} className="hover:underline">{c.summary}</Link></li>
              ))}
            </ul>
          ) : <Empty title="No reviewed comparisons yet">Comparisons appear after an editor approves them.</Empty>}
        </div>
      </section>

      <section className="border-t border-rule pt-8">
        <h2 className="text-2xl">Get new analysis by email</h2>
        <p className="ui mb-4 mt-1 max-w-prose text-sm text-muted">We send new published analyses and fact-checks. We do not share your address.</p>
        <Subscribe />
      </section>
    </div>
  );
}