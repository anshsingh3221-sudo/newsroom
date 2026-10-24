import { notFound } from "next/navigation";
import Link from "next/link";
import { publicDb, type Row } from "@/lib/db";
import { RELATION_LABEL, type Relation } from "@/lib/ai/types";
import { fmtDate } from "@/lib/verdicts";
import { Empty, StatementCard, VerdictBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Person({ params }: { params: { slug: string } }) {
  const db = publicDb();
  const { data: p } = await db.from("people").select("*").eq("slug", params.slug).maybeSingle();
  if (!p) notFound();
  const [aff, stmts, checks, news] = await Promise.all([
    db.from("affiliations").select("role,start_date,end_date,source_url,organizations(name,kind)").eq("person_id", p.id).order("start_date"),
    db.from("statements").select("*, people(name,slug)").eq("person_id", p.id).order("made_on", { ascending: false }).limit(15),
    db.from("fact_checks").select("slug,claim_text,verdict").eq("claimant_person_id", p.id).eq("status", "approved").limit(10),
    db.from("articles").select("slug,title,published_at").eq("status", "approved").ilike("title", `%${p.name}%`).limit(8),
  ]);
  const ids = (stmts.data ?? []).map((s: Row) => s.id);
  const rels = ids.length ? (await db.from("statement_relationships").select("id,relation,summary").eq("review_status", "approved").in("statement_b", ids)).data ?? [] : [];
  const timeline = [
    ...(aff.data ?? []).map((a: Row) => ({ date: a.start_date, text: `${a.role ?? "Member"}, ${a.organizations?.name}${a.end_date ? ` (until ${a.end_date})` : ""}`, url: a.source_url })),
    ...(stmts.data ?? []).filter((s: Row) => s.made_on).map((s: Row) => ({ date: s.made_on, text: `Statement: “${s.text.slice(0, 90)}${s.text.length > 90 ? "…" : ""}”`, url: s.source_url })),
  ].filter((t) => t.date).sort((x, y) => String(x.date).localeCompare(String(y.date)));

  return (
    <div className="space-y-12">
      <header className="prose-col"><h1 className="text-4xl">{p.name}</h1>
        {p.bio ? <p className="mt-3">{p.bio}</p> : <p className="mt-3 text-muted">No verified biography has been added yet.</p>}
        {p.bio_source_url && <a href={p.bio_source_url} target="_blank" rel="noopener noreferrer" className="ui text-sm text-navy underline">Biography source</a>}</header>

      <section><h2 className="section-title">Affiliations over time</h2>
        {aff.data?.length ? <ul className="ui mt-3 divide-y divide-rule text-sm">{aff.data.map((a: Row, i: number) => <li key={i} className="py-2">{a.start_date ?? "?"} to {a.end_date ?? "present"}: <strong>{a.organizations?.name}</strong>{a.role ? `, ${a.role}` : ""} · <a href={a.source_url} className="text-navy underline" target="_blank" rel="noopener noreferrer">source</a></li>)}</ul>
          : <div className="mt-3"><Empty title="No dated affiliations recorded" /></div>}</section>

      <section><h2 className="section-title">Statements</h2>
        <div className="mt-4 space-y-8">{stmts.data?.length ? stmts.data.map((s: Row) => <StatementCard key={s.id} s={s} />) : <Empty title="No archived statements yet" />}</div>
        <Link href={`/statements?person=${encodeURIComponent(p.name)}`} className="ui mt-4 inline-block text-sm text-navy underline">Search all statements</Link></section>

      <section><h2 className="section-title">Documented changes in position</h2>
        {rels.length ? <ul className="mt-3 space-y-3">{rels.map((r: Row) => <li key={r.id}><span className="ui text-xs font-semibold text-navy">{RELATION_LABEL[r.relation as Relation].outcome}</span><br /><Link href={`/comparisons/${r.id}`} className="hover:underline">{r.summary}</Link></li>)}</ul>
          : <p className="mt-3 text-muted">No editor-approved comparisons yet.</p>}</section>

      <section className="grid gap-10 md:grid-cols-2">
        <div><h2 className="section-title">Fact-checks</h2>{checks.data?.length ? <ul className="mt-3 space-y-3">{checks.data.map((c: Row) => <li key={c.slug}><VerdictBadge verdict={c.verdict} /> <Link className="hover:underline" href={`/fact-checks/${c.slug}`}>{c.claim_text}</Link></li>)}</ul> : <p className="mt-3 text-muted">None yet.</p>}</div>
        <div><h2 className="section-title">News coverage</h2>{news.data?.length ? <ul className="mt-3 space-y-3">{news.data.map((n: Row) => <li key={n.slug}><Link className="hover:underline" href={`/news/${n.slug}`}>{n.title}</Link></li>)}</ul> : <p className="mt-3 text-muted">None yet.</p>}</div>
      </section>

      {timeline.length > 0 && <section><h2 className="section-title">Public-record timeline</h2>
        <ol className="ui mt-3 space-y-2 border-l border-rule pl-4 text-sm">{timeline.map((t, i) => <li key={i}><span className="font-semibold">{fmtDate(String(t.date))}</span> {t.text} · <a href={t.url} className="text-navy underline" target="_blank" rel="noopener noreferrer">source</a></li>)}</ol></section>}
    </div>
  );
}
