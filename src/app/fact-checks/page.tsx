/**
 * Save as: src/app/fact-checks/page.tsx  (replace the whole file)
 */
import Link from "next/link";
import { headers } from "next/headers";
import { publicDb, type Row } from "@/lib/db";
import { fmtDate } from "@/lib/verdicts";
import { VERDICT_DEFINITIONS } from "@/lib/ai/evaluate";
import { Empty, VerdictBadge } from "@/components/ui";
import { allowRequest, lookup, type Lookup } from "@/lib/ai/lookup";
import { categoryLabel, categoryOf } from "@/lib/Recommendations";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Fact-check center" };

type SP = Record<string, string | undefined>;

export default async function FactChecks({ searchParams }: { searchParams: Promise<SP> | SP }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 500);

  const db = publicDb();
  let answer: Lookup | null = null;
  let error = "";
  let checks: Row[] = [];
  let articles: Row[] = [];

  if (q) {
    // Reviewed content already on the site that matches the text.
    const [c, a] = await Promise.all([
      db.from("fact_checks").select("slug,claim_text,verdict,claimant,claim_date,published_at").eq("status", "approved")
        .textSearch("tsv", q, { type: "websearch", config: "english" }).order("published_at", { ascending: false }).limit(5),
      db.from("articles").select("slug,title,summary,published_at").eq("status", "approved")
        .textSearch("tsv", q, { type: "websearch", config: "english" }).order("published_at", { ascending: false }).limit(5),
    ]);
    checks = (c.data ?? []) as Row[];
    articles = (a.data ?? []) as Row[];

    // AI answer, with a small per-visitor limit to protect the API quota.
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!allowRequest(ip)) {
      error = "You are searching too fast. Please wait a minute and try again.";
    } else {
      try {
        answer = await lookup(q);
      } catch (e) {
        console.error("lookup failed", e);
        error = "The AI summary is unavailable right now. Matching reviewed content is shown below.";
      }
    }
  } else {
    const { data } = await db.from("fact_checks").select("slug,claim_text,verdict,claimant,claim_date,published_at")
      .eq("status", "approved").order("published_at", { ascending: false }).limit(8);
    checks = (data ?? []) as Row[];
  }

  const category = answer ? categoryOf({ title: answer.headline, summary: answer.summary, topic_slug: null }) : null;

  return (
    <div>
      <h1 className="text-4xl">Fact-check center</h1>
      <p className="ui mt-2 max-w-prose text-muted">Type a claim, a name, a headline or just an idea. We will pull together what is known about it.</p>

      <form className="ui mt-6 flex flex-col gap-3 sm:flex-row" role="search">
        <label className="sr-only" htmlFor="q">Search</label>
        <input id="q" name="q" defaultValue={q} maxLength={500} autoFocus placeholder="e.g. “Petrol prices doubled in India this year”" className="field flex-1 !py-3 text-lg" />
        <button className="btn !px-8 !py-3">Search</button>
      </form>

      {error && <p className="ui mt-6 rounded border border-rule p-3 text-sm text-muted" role="alert">{error}</p>}

      {answer && (
        <section className="mt-8" aria-labelledby="answer-title">
          <p className="ui text-xs font-semibold uppercase tracking-wide text-muted">AI-generated summary · not reviewed by an editor</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {answer.verdict && <VerdictBadge verdict={answer.verdict} />}
            {!answer.verdict && (
              <span className="ui rounded border border-rule px-2 py-0.5 text-xs font-semibold">
                {answer.type === "opinion" ? "Opinion · not a factual claim" : "Topic overview"}
              </span>
            )}
            {category && (
              <span className="ui text-xs font-semibold uppercase tracking-wide text-navy">{categoryLabel(category)}</span>
            )}
          </div>
          <h2 id="answer-title" className="mt-2 text-3xl">{answer.headline}</h2>
          <p className="mt-3 max-w-prose text-xl">{answer.summary}</p>

          {answer.keyFacts.length > 0 && (<>
            <h3 className="section-title mt-8">Key facts</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5">{answer.keyFacts.map((f, i) => <li key={i}>{f}</li>)}</ul></>)}

          {answer.background && (<>
            <h3 className="section-title mt-8">Background</h3>
            <p className="mt-3 max-w-prose">{answer.background}</p></>)}

          {answer.uncertain.length > 0 && (<>
            <h3 className="section-title mt-8">What is uncertain</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5">{answer.uncertain.map((f, i) => <li key={i}>{f}</li>)}</ul></>)}

          {answer.sources.length > 0 && (<>
            <h3 className="section-title mt-8">Sources</h3>
            <ol className="ui mt-3 list-decimal space-y-1 pl-5 text-sm">
              {answer.sources.map((s) => (
                <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-navy underline">{s.title}</a></li>
              ))}
            </ol></>)}

          <p className="ui mt-6 text-sm text-muted">
            Confidence: {answer.confidence}. {answer.grounded
              ? "This summary was written by an AI model from a live web search. It can still contain mistakes, so check the sources."
              : "This answer comes from an AI model without a web search or cited sources, and can be wrong or out of date. Check important facts against primary sources."}
          </p>
          {!answer.grounded && answer.searchNote && process.env.NODE_ENV !== "production" && (
            <p className="ui mt-2 text-xs text-muted">Developer note: live search was not used ({answer.searchNote})</p>
          )}
        </section>
      )}

      {(checks.length > 0 || articles.length > 0 || !q) && (
        <section className="mt-12">
          <h2 className="section-title">{q ? "Reviewed by our editors" : "Latest fact-checks"}</h2>
          {checks.length > 0 && (
            <ul className="mt-3 divide-y divide-rule">
              {checks.map((c) => (
                <li key={c.slug} className="py-4">
                  <VerdictBadge verdict={c.verdict} />
                  <h3 className="mt-1 text-xl"><Link href={`/fact-checks/${c.slug}`} className="hover:underline">{c.claim_text}</Link></h3>
                  <p className="ui text-xs text-muted">{c.claimant ? `Claim by ${c.claimant} · ` : ""}{fmtDate(c.claim_date ?? c.published_at)}</p>
                </li>
              ))}
            </ul>
          )}
          {articles.length > 0 && (
            <ul className="mt-4 divide-y divide-rule">
              {articles.map((a) => (
                <li key={a.slug} className="py-4">
                  <p className="ui text-xs font-semibold uppercase tracking-wide text-navy">Analysis</p>
                  <h3 className="text-xl"><Link href={`/news/${a.slug}`} className="hover:underline">{a.title}</Link></h3>
                  {a.summary && <p className="mt-1 text-muted">{a.summary}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {q && !checks.length && !articles.length && (
        <div className="mt-12"><Empty title="Nothing reviewed yet">No editor-approved fact-checks or analysis match this search.</Empty></div>
      )}

      <section id="definitions" className="mt-14">
        <h2 className="section-title">What our verdicts mean</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {Object.entries(VERDICT_DEFINITIONS).map(([k, d]) => <div key={k}><dt><VerdictBadge verdict={k} /></dt><dd className="mt-1">{d}</dd></div>)}
        </dl>
      </section>
    </div>
  );
}