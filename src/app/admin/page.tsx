import { adminDb, type Row } from "@/lib/db";
import { currentStaff } from "@/lib/auth";
import { llmConfigured } from "@/lib/env";
import { ActionForm } from "@/components/ActionForm";
import { SourceTypeZ } from "@/lib/ai/types";
import { VERDICTS } from "@/lib/verdicts";
import { VerdictBadge } from "@/components/ui";
import { autopilotAction, addAffiliationAction, addCorrectionAction, addPersonAction, factCheckDraftAction, ingestFeedsAction, ingestStatementsAction, loginAction, logoutAction, researchAction, reviewAction } from "./actions";
import Link from "next/link";
import { AutoRunner } from "./AutoRunner";
import { addImagesToPublishedAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editorial desk", robots: { index: false } };

const In = ({ n, l, ...p }: { n: string; l: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div><label className="label" htmlFor={n}>{l}</label><input id={n} name={n} className="field" {...p} /></div>);

function ReviewButtons({ table, id, withVerdict, verdict }: { table: string; id: string; withVerdict?: boolean; verdict?: string }) {
  return (
    <form action={reviewAction} className="ui mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={id} />
      {withVerdict && <div><label className="label">Verdict</label><select name="verdict" defaultValue={verdict} className="field">{Object.entries(VERDICTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>}
      <div className="grow"><label className="label">Reviewer note (shown publicly for comparisons)</label><input name="note" className="field" /></div>
      <button name="decision" value="approve" className="btn">Approve and publish</button>
      <button name="decision" value="reject" className="btn-quiet">Reject</button>
    </form>
  );
}

export default async function Admin() {
  const staff = await currentStaff();
  if (!staff) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="text-3xl">Editorial desk</h1>
        <p className="ui mb-4 mt-2 text-sm text-muted">Staff only. Sign in with the email and password of a Supabase Auth user listed in the staff table.</p>
        <ActionForm action={loginAction} label="Sign in"><In n="email" l="Email" type="email" required /><In n="password" l="Password" type="password" required /></ActionForm>
      </div>
    );
  }
  const db = adminDb();
  const [clusters, articles, checks, rels, jobs, people] = await Promise.all([
    db.from("trending_clusters").select("*").limit(10),
    db.from("articles").select("id,slug,title,summary,body,status").in("status", ["draft", "pending_review"]).order("created_at", { ascending: false }),
    db.from("fact_checks").select("*").in("status", ["draft", "pending_review"]).order("created_at", { ascending: false }),
    db.from("statement_relationships").select("*").eq("review_status", "pending_review").order("created_at", { ascending: false }),
    db.from("jobs").select("name,status,started_at,error").order("started_at", { ascending: false }).limit(5),
    db.from("people").select("slug,name").order("name"),
  ]);
  const sIds = (rels.data ?? []).flatMap((r: Row) => [r.statement_a, r.statement_b]);
  const stm = sIds.length ? (await db.from("statements").select("id,text,made_on,source_url,people(name)").in("id", sIds)).data ?? [] : [];
  const S = (id: string) => stm.find((s: Row) => s.id === id) as Row | undefined;

  return (
    <div className="space-y-12">
      <div className="ui flex items-center justify-between"><h1 className="font-serif text-4xl">Editorial desk</h1>
        <form action={logoutAction}><span className="mr-3 text-sm text-muted">{staff.email} ({staff.role})</span><button className="btn-quiet">Sign out</button></form></div>
      {!llmConfigured() && <p className="ui border border-burgundy p-3 text-sm text-burgundy">No LLM API key is configured. Set one in .env.local to enable research, fact-check drafts and statement extraction.</p>}

         <section>
     <h2 className="section-title">Autopilot</h2>
     <p className="ui my-3 text-sm text-muted">Fetches news, researches the top trending story, runs automatic checks, and publishes only if every check passes. Otherwise it stays in the review queue.</p>
     <ActionForm action={autopilotAction} label="Run autopilot now" />
     <AutoRunner />
          <h3 className="mt-6 text-xl">Images for published articles</h3>
     <p className="ui my-3 text-sm text-muted">Adds people photos and an AI illustration to already-published articles that have none. Does 5 at a time.</p>
     <ActionForm action={addImagesToPublishedAction} label="Add images to published articles" />
   </section>
      <section className="grid gap-10 lg:grid-cols-2">
        <div><h2 className="section-title">1. Fetch news</h2><p className="ui my-3 text-sm text-muted">Reads the RSS feeds in src/config/feeds.ts and groups reports of the same event.</p>
          <ActionForm action={ingestFeedsAction} label="Fetch news now" /></div>
        <div><h2 className="section-title">2. Research a story</h2>
          <p className="ui my-3 text-sm text-muted">Runs the Political Memory Engine on a trending story and creates a draft for review.</p>
          <ActionForm action={researchAction} label="Run research">
            <div><label className="label" htmlFor="clusterId">Story</label>
              <select id="clusterId" name="clusterId" className="field" required>{(clusters.data ?? []).map((c: Row) => <option key={c.id} value={c.id}>{c.title} ({c.publishers} publishers)</option>)}</select></div>
          </ActionForm></div>
      </section>

      <section className="grid gap-10 lg:grid-cols-2">
        <div><h2 className="section-title">Add a person</h2>
          <ActionForm action={addPersonAction} label="Add person"><In n="name" l="Full name" required /><In n="country" l="Country code (e.g. IN)" /><In n="bio" l="Short biography (sourced)" /><In n="bioSource" l="Biography source URL" type="url" /></ActionForm></div>
        <div><h2 className="section-title">Record an affiliation</h2><p className="ui my-3 text-sm text-muted">Adds a dated record. Earlier affiliations are never overwritten.</p>
          <ActionForm action={addAffiliationAction} label="Save affiliation">
            <div><label className="label" htmlFor="personSlug">Person</label><select id="personSlug" name="personSlug" className="field">{(people.data ?? []).map((p: Row) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></div>
            <In n="organization" l="Party or organization" required /><In n="role" l="Role" />
            <div className="grid grid-cols-2 gap-3"><In n="start" l="Start date" type="date" /><In n="end" l="End date" type="date" /></div>
            <In n="sourceUrl" l="Source URL" type="url" required /></ActionForm></div>
      </section>

      <section className="grid gap-10 lg:grid-cols-2">
        <div><h2 className="section-title">Add statements from a source</h2><p className="ui my-3 text-sm text-muted">Fetches the page, extracts direct quotes by this person, and saves only quotes found verbatim in the page.</p>
          <ActionForm action={ingestStatementsAction} label="Extract and save">
            <div><label className="label" htmlFor="sp">Person</label><select id="sp" name="personSlug" className="field">{(people.data ?? []).map((p: Row) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></div>
            <In n="url" l="Page URL (speech, interview, transcript, post…)" type="url" required />
            <div><label className="label" htmlFor="sourceType">Source type</label><select id="sourceType" name="sourceType" className="field">{SourceTypeZ.options.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select></div>
            <In n="madeOn" l="Date the statement was made (if different from page date)" type="date" /></ActionForm></div>
        <div><h2 className="section-title">Draft a fact-check</h2><p className="ui my-3 text-sm text-muted">Searches for sources, evaluates the claim, and saves a draft verdict for review.</p>
          <ActionForm action={factCheckDraftAction} label="Create draft"><In n="claim" l="Claim (as made)" required /><In n="claimant" l="Claimant" /><In n="claimDate" l="Claim date" type="date" /><In n="context" l="Context" /></ActionForm></div>
      </section>

      <section><h2 className="section-title">Review queue</h2>
        <h3 className="mt-6 text-xl">Statement comparisons ({rels.data?.length ?? 0})</h3>
        {(rels.data ?? []).map((r: Row) => (
          <div key={r.id} className="mt-4 border border-rule bg-white p-4">
            <p className="ui text-sm font-semibold">{String(r.relation).replaceAll("_", " ")} · AI confidence {r.ai_confidence ?? "n/a"}</p>
            <p className="mt-1">{r.summary}</p>
            <p className="mt-2 text-sm text-muted">Earlier ({S(r.statement_a)?.made_on}): “{S(r.statement_a)?.text}”</p>
            <p className="text-sm text-muted">Later ({S(r.statement_b)?.made_on}): “{S(r.statement_b)?.text}”</p>
            <p className="ui mt-1 text-xs">Uncertainty: {r.uncertainty}</p>
            <ReviewButtons table="statement_relationships" id={r.id} />
          </div>))}
        <h3 className="mt-8 text-xl">Fact-check drafts ({checks.data?.length ?? 0})</h3>
        {(checks.data ?? []).map((c: Row) => (
          <div key={c.id} className="mt-4 border border-rule bg-white p-4"><VerdictBadge verdict={c.verdict} /> <span className="ui text-xs text-muted">AI draft</span>
            <p className="mt-1 font-semibold">{c.claim_text}</p><p className="mt-1 whitespace-pre-line text-sm">{c.explanation}</p>
            <p className="ui mt-1 text-xs text-muted">{c.evidence?.supporting?.length ?? 0} supporting · {c.evidence?.contradicting?.length ?? 0} contradicting excerpts, all verified against source text.</p>
            <ReviewButtons table="fact_checks" id={c.id} withVerdict verdict={c.verdict} /></div>))}
        <h3 className="mt-8 text-xl">Article drafts ({articles.data?.length ?? 0})</h3>
        {(articles.data ?? []).map((a: Row) => (
          <div key={a.id} className="mt-4 border border-rule bg-white p-4"><p className="font-semibold">{a.title}</p><p className="text-sm text-muted">{a.summary}</p>
            {a.body?.review?.warnings?.map((w: string, i: number) => <p key={i} className="ui mt-1 text-xs text-burgundy">⚠ {w}</p>)}
            <ul className="ui mt-2 list-disc pl-5 text-xs text-muted">{a.body?.review?.checklist?.map((c: Row, i: number) => <li key={i}>{c.item}</li>)}</ul>
            <p className="ui mt-2 text-xs">Sources: {a.body?.sources?.map((s: Row) => <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className="mr-2 text-navy underline">{s.id}</a>)}</p>
            <ReviewButtons table="articles" id={a.id} /></div>))}
      </section>

      <section><h2 className="section-title">Add a correction</h2>
        <form action={addCorrectionAction} className="ui mt-3 grid max-w-xl gap-3">
          <div><label className="label">Kind</label><select name="kind" className="field"><option value="article">Article</option><option value="fact_check">Fact-check</option></select></div>
          <In n="id" l="Record ID (uuid)" required /><In n="note" l="Correction note (public)" required /><button className="btn w-fit">Publish correction</button></form></section>

      <section><h2 className="section-title">Recent jobs</h2>
        <ul className="ui mt-3 text-sm">{(jobs.data ?? []).map((j: Row, i: number) => <li key={i}>{j.name} · {j.status} · {new Date(j.started_at).toLocaleString("en-IN")}{j.error ? ` · ${j.error}` : ""}</li>)}</ul>
        <p className="ui mt-6 text-sm"><Link href="/" className="underline">Back to site</Link></p></section>
    </div>
  );
}
