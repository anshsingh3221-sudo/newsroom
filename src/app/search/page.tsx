import Link from "next/link";
import { publicDb, type Row } from "@/lib/db";
import { searchHistoricalStatements } from "@/lib/ai/statements";
import { Empty, StatementCard, VerdictBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

export default async function Search({ searchParams }: { searchParams: { q?: string; type?: string } }) {
  const q = (searchParams.q ?? "").trim(), type = searchParams.type;
  const db = publicDb();
  const want = (t: string) => !type || type === t;
  const ts = (t: string, cols: string, status?: { col: string; val: string }) => {
    let b = db.from(t).select(cols);
    if (status) b = b.eq(status.col, status.val);
    return q ? b.textSearch("tsv", q, { type: "websearch", config: "english" }).limit(8) : b.order("created_at", { ascending: false }).limit(8);
  };
  const like = `%${q}%`;
  const [articles, checks, people, topics, docs, statements] = await Promise.all([
    want("articles") ? ts("articles", "slug,title,summary", { col: "status", val: "approved" }) : null,
    want("fact-checks") ? ts("fact_checks", "slug,claim_text,verdict", { col: "status", val: "approved" }) : null,
    want("people") ? (q ? db.from("people").select("slug,name,bio").ilike("name", like).limit(8) : db.from("people").select("slug,name,bio").order("name").limit(20)) : null,
    want("topics") && q ? db.from("topics").select("slug,name").ilike("name", like).limit(8) : null,
    want("sources") && q ? db.from("sources").select("url,title,publisher").textSearch("tsv", q, { type: "websearch", config: "english" }).limit(8) : null,
    want("statements") && q ? searchHistoricalStatements({ query: q, limit: 6 }, db) : null,
  ]);
  const D = (r: any): Row[] => (r?.data ?? r ?? []) as Row[];
  const none = ![articles, checks, people, topics, docs].some((r) => D(r).length) && !D(statements).length;

  return (
    <div className="space-y-10">
      <h1 className="text-4xl">{q ? `Results for “${q}”` : "Browse"}</h1>
      {none && <Empty title="Nothing found">Try different keywords. Only published, editor-approved content and verified statements are searchable.</Empty>}
      {D(articles).length > 0 && <section><h2 className="section-title">News analysis</h2><ul className="mt-3 space-y-4">{D(articles).map((a) => <li key={a.slug}><Link className="text-xl hover:underline" href={`/news/${a.slug}`}>{a.title}</Link><p className="text-muted">{a.summary}</p></li>)}</ul></section>}
      {D(checks).length > 0 && <section><h2 className="section-title">Fact-checks</h2><ul className="mt-3 space-y-3">{D(checks).map((c) => <li key={c.slug}><VerdictBadge verdict={c.verdict} /> <Link className="hover:underline" href={`/fact-checks/${c.slug}`}>{c.claim_text}</Link></li>)}</ul></section>}
      {D(people).length > 0 && <section><h2 className="section-title">People</h2><ul className="mt-3 space-y-2">{D(people).map((p) => <li key={p.slug}><Link className="hover:underline" href={`/people/${p.slug}`}>{p.name}</Link></li>)}</ul></section>}
      {D(statements).length > 0 && <section><h2 className="section-title">Statements</h2><div className="mt-4 space-y-6">{D(statements).map((s) => <StatementCard key={s.id} s={s} />)}</div><Link className="ui mt-3 inline-block text-sm text-navy underline" href={`/statements?q=${encodeURIComponent(q)}`}>More in the statement archive</Link></section>}
      {D(topics).length > 0 && <section><h2 className="section-title">Topics</h2><ul className="mt-3 flex flex-wrap gap-2">{D(topics).map((t) => <li key={t.slug}><Link className="btn-quiet" href={`/topics/${t.slug}`}>{t.name}</Link></li>)}</ul></section>}
      {D(docs).length > 0 && <section><h2 className="section-title">Source documents</h2><ul className="ui mt-3 space-y-2 text-sm">{D(docs).map((d) => <li key={d.url}><a className="text-navy underline" href={d.url} target="_blank" rel="noopener noreferrer">{d.title}</a> · {d.publisher}</li>)}</ul></section>}
    </div>
  );
}
