/**
 * Save as: src/app/statements/page.tsx  (replace the whole file)
 */
import { Suspense } from "react";
import { headers } from "next/headers";
import { publicDb, type Row } from "@/lib/db";
import { embeddingsConfigured } from "@/lib/embeddings";
import { searchHistoricalStatements } from "@/lib/ai/statements";
import { Empty, StatementCard } from "@/components/ui";
import { allowRequest } from "@/lib/ai/lookup";
import { summarizeStatements } from "@/lib/ai/statementSummary";
import { findWebStatements } from "@/lib/ai/webStatements";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Statement archive" };

type SP = Record<string, string | undefined>;
type Db = ReturnType<typeof publicDb>;
type SummaryResult = Awaited<ReturnType<typeof summarizeStatements>>;

const STOP = new Set(["on", "about", "by", "said", "says", "say", "statement", "statements", "of", "the", "a", "an", "in", "and", "for", "to", "from", "what", "did", "does", "has", "have", "is", "was"]);
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const tokens = (s: string) => norm(s).split(" ").filter(Boolean);

/** Finds people named in the search text and returns what is left over as keywords. */
async function matchPeople(db: Db, q: string): Promise<{ ids: string[]; rest: string }> {
  const { data } = await db.from("people").select("id,name").limit(2000);
  const people = (data ?? []) as Row[];
  const qNorm = ` ${norm(q)} `;
  const qTokens = tokens(q);

  const full = people.filter((p) => {
    const n = norm(String(p.name ?? ""));
    return n.length >= 3 && qNorm.includes(` ${n} `);
  });
  const chosen = (full.length
    ? full
    : people.filter((p) => tokens(String(p.name ?? "")).some((t) => t.length >= 4 && qTokens.includes(t)))
  ).slice(0, 50);

  const used = new Set(chosen.flatMap((p) => tokens(String(p.name ?? ""))));
  const rest = qTokens.filter((t) => !used.has(t) && !STOP.has(t)).join(" ");
  return { ids: chosen.map((p) => String(p.id)), rest };
}

export default async function Statements({ searchParams }: { searchParams: Promise<SP> | SP }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 300);
  const db = publicDb();

  // The search runs with the public (row-level-security) client: only verified statements are visible.
  const search = (opts: { query?: string; personIds?: string[] }) =>
    searchHistoricalStatements({ ...opts, limit: 40 }, db);

  let rows: Awaited<ReturnType<typeof search>> = [];
  if (!q) {
    rows = await search({});
  } else {
    const m = await matchPeople(db, q);
    if (m.ids.length) rows = await search({ personIds: m.ids, query: m.rest || undefined });
    if (!rows.length && m.ids.length && m.rest) rows = await search({ personIds: m.ids });
    if (!rows.length) rows = await search({ query: q });
  }
  const semantic = embeddingsConfigured();

  return (
    <div>
      <h1 className="text-4xl">Statement archive</h1>
      <p className="ui mt-2 max-w-prose text-sm text-muted">
        Search a person, a party or a topic. Archive entries are direct quotations checked against the original source text.{" "}
        {semantic ? "Search combines keywords with semantic similarity." : "Keyword search is active."}
      </p>

      <form className="ui mt-6 flex flex-col gap-3 sm:flex-row" role="search">
        <label className="sr-only" htmlFor="q">Search</label>
        <input id="q" name="q" defaultValue={q} maxLength={300} autoFocus placeholder="e.g. “Ashutosh Ranka on development in Assam”" className="field flex-1 !py-3 text-lg" />
        <button className="btn !px-8 !py-3">Search</button>
      </form>

      {q && (
        <section className="mt-10" aria-labelledby="web-title">
          <h2 id="web-title" className="section-title">Found across the web</h2>
          <Suspense fallback={<p className="ui mt-4 text-sm text-muted" role="status">Searching the web and checking each quotation against its source page…</p>}>
            <WebQuotes q={q} />
          </Suspense>
        </section>
      )}

      <section className="mt-14">
        <h2 className="section-title">{q ? "From our verified archive" : "Latest statements"}</h2>
        <div className="mt-6 space-y-8">
          {rows.map((s) => <StatementCard key={s.id} s={s} />)}
          {!rows.length && (
            <Empty title={q ? "No archived statements match" : "No statements found"}>
              {q
                ? "Our archive only holds verified quotations. See the AI summary below for what is publicly reported."
                : "No verified statements yet. Staff can add statements from a source URL in the admin area."}
            </Empty>
          )}
        </div>
      </section>

      {q && (
        <section className="mt-14" aria-labelledby="ai-title">
          <Suspense fallback={<p className="ui text-sm text-muted" role="status">Searching the web for reported statements…</p>}>
            <AiSummary q={q} />
          </Suspense>
        </section>
      )}
    </div>
  );
}

async function WebQuotes({ q }: { q: string }) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowRequest(`webquotes:${ip}`)) {
    return <p className="ui mt-4 rounded border border-rule p-3 text-sm text-muted" role="alert">You are searching too fast. Please wait a minute and try again.</p>;
  }

  let res: Awaited<ReturnType<typeof findWebStatements>>;
  try {
    res = await findWebStatements(q);
  } catch (e) {
    console.error("web statements failed", e);
    return <p className="ui mt-4 rounded border border-rule p-3 text-sm text-muted" role="alert">The web search is unavailable right now.</p>;
  }

  if (!res.ok) {
    return (
      <div className="mt-4">
        <p className="ui rounded border border-rule p-3 text-sm text-muted">Live web search is not available right now, so no web results are shown.</p>
        {process.env.NODE_ENV !== "production" && (
          <p className="ui mt-2 text-xs text-muted">Developer note: live search was not used ({res.reason})</p>
        )}
      </div>
    );
  }

  if (!res.statements.length) {
    return (
      <p className="ui mt-4 rounded border border-rule p-3 text-sm text-muted">
        We checked {res.pagesChecked} web pages and found no direct quotations we could confirm word for word.
      </p>
    );
  }

  return (
    <div>
      <p className="ui mt-2 max-w-prose text-sm text-muted">
        Each quotation below was found on a public web page and checked word for word against that page. These are not in our archive and have not been reviewed by an editor.
      </p>
      <div className="mt-6 space-y-8">
        {res.statements.map((s, i) => (
          <blockquote key={i} className="border-l-2 border-rule pl-4">
            <p className="ui text-sm font-semibold">{s.speaker}</p>
            <p className="mt-1 text-xl">“{s.quote}”</p>
            {s.context && <p className="ui mt-2 text-sm text-muted">Context: {s.context}</p>}
            <p className="ui mt-2 text-sm">
              <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-navy underline">{s.sourceTitle}</a>
              {s.publishedAt ? <span className="text-muted"> · {s.publishedAt}</span> : null}
            </p>
          </blockquote>
        ))}
      </div>
    </div>
  );
}

async function AiSummary({ q }: { q: string }) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowRequest(`statements:${ip}`)) {
    return <p className="ui rounded border border-rule p-3 text-sm text-muted" role="alert">You are searching too fast. Please wait a minute and try again.</p>;
  }

  let result: SummaryResult;
  try {
    result = await summarizeStatements(q);
  } catch (e) {
    console.error("statement summary failed", e);
    return <p className="ui rounded border border-rule p-3 text-sm text-muted" role="alert">The AI summary is unavailable right now. Archive results are shown above.</p>;
  }

  if (!result.ok) {
    return (
      <div>
        <p className="ui rounded border border-rule p-3 text-sm text-muted">
          The AI summary needs a live web search, which is not available right now, so we are not showing one. Archive results are shown above.
        </p>
        {process.env.NODE_ENV !== "production" && (
          <p className="ui mt-2 text-xs text-muted">Developer note: live search was not used ({result.reason})</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="ui text-xs font-semibold uppercase tracking-wide text-muted">AI summary of reported statements · paraphrased, not verified quotations</p>
      <h2 id="ai-title" className="mt-2 text-3xl">{result.headline}</h2>
      <p className="mt-3 max-w-prose text-xl">{result.summary}</p>

      {result.points.length > 0 && (<>
        <h3 className="section-title mt-8">What has been reported</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5">{result.points.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></>)}

      {result.uncertain.length > 0 && (<>
        <h3 className="section-title mt-8">What is uncertain</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5">{result.uncertain.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></>)}

      {result.sources.length > 0 && (<>
        <h3 className="section-title mt-8">Sources</h3>
        <ol className="ui mt-3 list-decimal space-y-1 pl-5 text-sm">
          {result.sources.map((s: { url: string; title?: string }) => (
            <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-navy underline">{s.title ?? s.url}</a></li>
          ))}
        </ol></>)}

      <p className="ui mt-6 text-sm text-muted">
        Written by an AI model from a live web search and not reviewed by an editor. It paraphrases what outlets report and can contain mistakes, so check the sources. Only entries in the archive above are verified quotations.
      </p>
    </div>
  );
}