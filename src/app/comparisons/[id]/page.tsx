import { notFound } from "next/navigation";
import Link from "next/link";
import { publicDb, type Row } from "@/lib/db";
import { RELATION_LABEL, type Relation } from "@/lib/ai/types";
import { fmtDate } from "@/lib/verdicts";

export const dynamic = "force-dynamic";

export default async function Comparison({ params }: { params: { id: string } }) {
  const db = publicDb();
  const { data: r } = await db.from("statement_relationships").select("*").eq("id", params.id).eq("review_status", "approved").maybeSingle();
  if (!r) notFound();
  const { data: stmts } = await db.from("statements").select("*, people(id,name,slug)").in("id", [r.statement_a, r.statement_b]);
  const a = stmts?.find((s: Row) => s.id === r.statement_a) as Row, b = stmts?.find((s: Row) => s.id === r.statement_b) as Row;
  if (!a || !b) notFound();
  const { data: aff } = await db.from("affiliations").select("role,start_date,end_date,source_url,organizations(name)").eq("person_id", a.people.id).order("start_date");
  const at = (d?: string | null) => (aff ?? []).filter((x: Row) => d && (!x.start_date || x.start_date <= d) && (!x.end_date || x.end_date >= d));
  const label = RELATION_LABEL[r.relation as Relation];

  const Side = ({ title, s }: { title: string; s: Row }) => (
    <section className="border border-rule bg-white p-5">
      <h2 className="ui text-sm font-semibold text-muted">{title} · {fmtDate(s.made_on)}</h2>
      <blockquote className="mt-3 text-lg">“{s.text}”</blockquote>
      {s.context && <p className="ui mt-3 text-sm text-muted">Context: {s.context}</p>}
      <p className="ui mt-2 text-sm">Source type: {String(s.source_type).replace("_", " ")} · <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-navy underline">Original source</a></p>
      <p className="ui mt-2 text-xs text-muted">Affiliation then: {at(s.made_on).map((x: Row) => `${x.organizations?.name}${x.role ? ` (${x.role})` : ""}`).join(", ") || "none recorded"}</p>
    </section>
  );

  return (
    <article>
      <p className="ui text-sm"><Link href={`/people/${a.people.slug}`} className="text-navy underline">{a.people.name}</Link></p>
      <h1 className="mt-1 text-4xl">{label.outcome}</h1>
      <p className="ui mt-1 text-sm text-muted">{label.detail} Detailed classification: {String(r.relation).replaceAll("_", " ")}.</p>
      <div className="mt-8 grid gap-6 md:grid-cols-2"><Side title="Earlier statement" s={a} /><Side title="Later statement" s={b} /></div>

      <section className="prose-col mt-10">
        <h2 className="text-2xl">Comparison of the claims</h2>
        <p className="mt-2"><strong>Earlier:</strong> {r.claim_a}</p><p className="mt-1"><strong>Later:</strong> {r.claim_b}</p>
        <p className="mt-3">{r.summary}</p>
        {(r.context_differences as string[])?.length > 0 && <><h3 className="mt-6 text-xl">Differences in context</h3><ul className="mt-2 list-disc pl-5">{(r.context_differences as string[]).map((c, i) => <li key={i}>{c}</li>)}</ul></>}
        {(r.evidence as Row[])?.length > 0 && <><h3 className="mt-6 text-xl">Evidence</h3><ul className="mt-2 space-y-2">{(r.evidence as Row[]).map((e, i) => <li key={i}><span className="ui text-xs font-semibold">Statement {e.which}:</span> “{e.quote}” {e.note}</li>)}</ul></>}
        {(r.related_documents as Row[])?.length > 0 && <><h3 className="mt-6 text-xl">Related records</h3><ul className="mt-2 list-disc pl-5">{(r.related_documents as Row[]).map((d, i) => <li key={i}><a className="text-navy underline" href={d.url}>{d.title}</a></li>)}</ul></>}
        <h3 className="mt-6 text-xl">What remains uncertain</h3><p className="mt-2">{r.uncertainty || "Nothing further noted."}</p>
        <h3 className="mt-6 text-xl">Reviewer assessment</h3>
        <p className="mt-2">{r.reviewer_conclusion || "Approved by an editor without further comment."}</p>
        <p className="ui mt-1 text-xs text-muted">A change of position is not, by itself, evidence of dishonesty. Reviewed {fmtDate(r.reviewed_at)}.</p>
      </section>
    </article>
  );
}
