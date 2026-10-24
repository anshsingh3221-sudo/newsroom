import { notFound } from "next/navigation";
import { publicDb, type Row } from "@/lib/db";
import { fmtDate } from "@/lib/verdicts";
import { VerdictBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

function Evidence({ items, empty }: { items: Row[]; empty: string }) {
  if (!items?.length) return <p className="text-muted">{empty}</p>;
  return <ul className="space-y-4">{items.map((e, i) => (
    <li key={i}><p>{e.text}</p>{e.excerpt && <blockquote className="mt-1 border-l-2 border-rule pl-3 text-muted">“{e.excerpt}”</blockquote>}
      {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="ui text-sm text-navy underline">Source</a>}</li>))}</ul>;
}

export default async function FactCheck({ params }: { params: { slug: string } }) {
  const db = publicDb();
  const { data: f } = await db.from("fact_checks").select("*").eq("slug", params.slug).eq("status", "approved").maybeSingle();
  if (!f) notFound();
  const { data: corr } = await db.from("corrections").select("note,created_at").eq("fact_check_id", f.id).order("created_at");
  return (
    <article className="prose-col mx-auto">
      <VerdictBadge verdict={f.verdict} />
      <h1 className="mt-2 text-4xl">{f.claim_text}</h1>
      <p className="ui mt-3 text-sm text-muted">{f.claimant ? `Claimed by ${f.claimant} · ` : ""}Claim date: {fmtDate(f.claim_date)} · Published {fmtDate(f.published_at)}{f.ai_generated && " · AI-assisted, approved by an editor"}</p>
      {f.context && <><h2 className="mt-8 text-2xl">Context</h2><p className="mt-2">{f.context}</p></>}
      <h2 className="mt-8 text-2xl">Verdict explained</h2>
      <p className="mt-2 whitespace-pre-line">{f.explanation}</p>
      <h2 className="mt-8 text-2xl">Evidence supporting the claim</h2><div className="mt-2"><Evidence items={f.evidence?.supporting} empty="No supporting evidence found." /></div>
      <h2 className="mt-8 text-2xl">Evidence contradicting the claim</h2><div className="mt-2"><Evidence items={f.evidence?.contradicting} empty="No contradicting evidence found." /></div>
      <h2 className="mt-8 text-2xl">Review and corrections</h2>
      <p className="ui mt-2 text-sm text-muted">{f.reviewed_at ? `Approved by an editor on ${fmtDate(f.reviewed_at)}.` : "Editorial review pending."}</p>
      {corr?.length ? <ul className="ui mt-2 text-sm">{corr.map((c: Row, i: number) => <li key={i}><strong>{fmtDate(c.created_at)}:</strong> {c.note}</li>)}</ul> : <p className="ui mt-1 text-sm text-muted">No corrections.</p>}
    </article>
  );
}
