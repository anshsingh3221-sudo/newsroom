import { notFound } from "next/navigation";
import Link from "next/link";
import { publicDb, type Row } from "@/lib/db";
import { Empty, StatementCard, VerdictBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Topic({ params }: { params: { slug: string } }) {
  const db = publicDb();
  const { data: t } = await db.from("topics").select("*").eq("slug", params.slug).maybeSingle();
  if (!t) notFound();
  const [a, f, s] = await Promise.all([
    db.from("articles").select("slug,title,summary").eq("status", "approved").eq("topic_slug", t.slug).limit(10),
    db.from("fact_checks").select("slug,claim_text,verdict").eq("status", "approved").eq("topic_slug", t.slug).limit(10),
    db.from("statements").select("*, people(name,slug)").eq("topic_slug", t.slug).order("made_on", { ascending: false }).limit(8),
  ]);
  const people = [...new Map((s.data ?? []).map((x: Row) => [x.people.slug, x.people.name])).entries()];
  return (
    <div className="space-y-12">
      <h1 className="text-4xl">{t.name}</h1>
      <section><h2 className="section-title">Analysis</h2>{a.data?.length ? <ul className="mt-3 space-y-4">{a.data.map((x: Row) => <li key={x.slug}><Link className="text-xl hover:underline" href={`/news/${x.slug}`}>{x.title}</Link><p className="text-muted">{x.summary}</p></li>)}</ul> : <div className="mt-3"><Empty title="No analysis on this topic yet" /></div>}</section>
      <section><h2 className="section-title">Fact-checks</h2>{f.data?.length ? <ul className="mt-3 space-y-3">{f.data.map((x: Row) => <li key={x.slug}><VerdictBadge verdict={x.verdict} /> <Link className="hover:underline" href={`/fact-checks/${x.slug}`}>{x.claim_text}</Link></li>)}</ul> : <p className="mt-3 text-muted">None yet.</p>}</section>
      <section><h2 className="section-title">People in this topic</h2>{people.length ? <ul className="mt-3 flex flex-wrap gap-2">{people.map(([slug, name]) => <li key={slug}><Link className="btn-quiet" href={`/people/${slug}`}>{name as string}</Link></li>)}</ul> : <p className="mt-3 text-muted">None yet.</p>}</section>
      <section><h2 className="section-title">Statements</h2><div className="mt-4 space-y-8">{s.data?.length ? s.data.map((x: Row) => <StatementCard key={x.id} s={x} />) : <p className="text-muted">None yet.</p>}</div></section>
    </div>
  );
}
