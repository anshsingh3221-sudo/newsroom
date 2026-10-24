import { notFound } from "next/navigation";
import Link from "next/link";
import { publicDb, type Row } from "@/lib/db";
import { fmtDate } from "@/lib/verdicts";
import { CiteIds, Cited } from "@/components/ui";
import { ArticleImages } from "@/components/ArticleImages";
import { TrackView } from "@/components/TrackView";
import { RelatedArticles } from "@/components/RelatedArticles";

export const dynamic = "force-dynamic";
type Src = { id: string; url: string; title: string; publisher: string; publishedAt?: string };

// Defined outside the page so it isn't re-created on every render
const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-10 border-b border-rule pb-1 text-2xl">{children}</h2>
);

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const { data } = await publicDb().from("articles").select("title,summary").eq("slug", params.slug).eq("status", "approved").maybeSingle();
  return { title: data?.title ?? "Analysis", description: data?.summary };
}

export default async function Article({ params }: { params: { slug: string } }) {
  const db = publicDb();
  const { data: a } = await db.from("articles").select("*").eq("slug", params.slug).eq("status", "approved").maybeSingle();
  if (!a) notFound();
  const b = a.body as Row;
  const sources: Src[] = b.sources ?? [];

  const [corr, checks] = await Promise.all([
    db.from("corrections").select("note,created_at").eq("article_id", a.id).order("created_at"),
    a.topic_slug
      ? db.from("fact_checks").select("slug,claim_text").eq("status", "approved").eq("topic_slug", a.topic_slug).limit(4)
      : Promise.resolve({ data: [] as Row[] }),
  ]);

  const P = ({ t }: { t: string }) => <p className="mt-3"><Cited text={t} sources={sources} /></p>;

  return (
    <article className="prose-col mx-auto">
      <TrackView articleId={a.id} />

      <h1 className="text-4xl sm:text-5xl">{a.title}</h1>
      <p className="mt-4 text-xl text-muted">{a.summary}</p>
      <ArticleImages images={b.images} />
      <p className="ui mt-4 text-sm text-muted">Published {fmtDate(a.published_at)} · Updated {fmtDate(a.updated_at)}{a.ai_generated && " · AI-assisted draft, reviewed and approved by an editor"}</p>

      <H>What happened</H><P t={b.whatHappened} />
      <H>Why it matters</H><P t={b.whyItMatters} />
      <H>Background</H><P t={b.background} />

      {b.timeline?.length > 0 && (<><H>Timeline</H>
        <ol className="ui mt-3 space-y-3 border-l border-rule pl-4 text-base">
          {b.timeline.map((t: Row, i: number) => <li key={i}><span className="font-semibold">{t.date}</span> <span className="font-serif"><Cited text={t.event} sources={sources} /> <CiteIds ids={t.sourceIds} sources={sources} /></span></li>)}
        </ol></>)}

      {b.keyPeople?.length > 0 && (<><H>Key people and organizations</H>
        <ul className="mt-3 list-disc pl-5">{b.keyPeople.map((p: Row, i: number) => <li key={i}><strong>{p.name}</strong>: {p.role}</li>)}</ul></>)}

      <H>Evidence supporting the main claims</H>
      {b.supporting?.length ? <ul className="mt-3 list-disc space-y-2 pl-5">{b.supporting.map((p: Row, i: number) => <li key={i}>{p.point} <CiteIds ids={p.sourceIds} sources={sources} /></li>)}</ul> : <p className="mt-3 text-muted">No supporting evidence was identified.</p>}

      <H>Evidence contradicting or qualifying them</H>
      {b.contradicting?.length ? <ul className="mt-3 list-disc space-y-2 pl-5">{b.contradicting.map((p: Row, i: number) => <li key={i}>{p.point} <CiteIds ids={p.sourceIds} sources={sources} /></li>)}</ul> : <p className="mt-3 text-muted">No contradicting evidence was identified in the sources reviewed.</p>}

      <H>What remains uncertain</H>
      {b.uncertain?.length ? <ul className="mt-3 list-disc space-y-2 pl-5">{b.uncertain.map((p: Row, i: number) => <li key={i}>{p.point}</li>)}</ul> : <p className="mt-3 text-muted">Nothing further noted.</p>}

      <H>Conclusion</H><P t={b.conclusion} />

      <H>Sources</H>
      <ol className="ui mt-3 space-y-2 text-sm">
        {sources.map((s) => <li key={s.id}>{s.id.slice(1)}. <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-navy underline">{s.title}</a> · {s.publisher}{s.publishedAt ? ` · ${fmtDate(s.publishedAt)}` : ""}</li>)}
      </ol>

      <H>Corrections</H>
      {corr.data?.length ? <ul className="ui mt-3 space-y-2 text-sm">{corr.data.map((c: Row, i: number) => <li key={i}><strong>{fmtDate(c.created_at)}:</strong> {c.note}</li>)}</ul>
        : <p className="ui mt-3 text-sm text-muted">No corrections have been made to this article. To report an error, see our <Link href="/corrections" className="underline">corrections policy</Link>.</p>}

      <RelatedArticles slug={a.slug} />

      {checks.data?.length ? (
        <ul className="ui mt-3 space-y-1 text-sm">
          {checks.data.map((r: Row) => <li key={r.slug}>Fact-check: <Link className="underline" href={`/fact-checks/${r.slug}`}>{r.claim_text}</Link></li>)}
        </ul>
      ) : null}
    </article>
  );
}