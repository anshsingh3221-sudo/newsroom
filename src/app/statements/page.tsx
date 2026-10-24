import { publicDb, type Row } from "@/lib/db";
import { embeddingsConfigured } from "@/lib/embeddings";
import { searchHistoricalStatements } from "@/lib/ai/statements";
import { SourceTypeZ } from "@/lib/ai/types";
import { Empty, StatementCard } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statement archive" };

export default async function Statements({ searchParams: sp }: { searchParams: Record<string, string | undefined> }) {
  const db = publicDb();
  let personIds: string[] | undefined;
  if (sp.person) personIds = ((await db.from("people").select("id").ilike("name", `%${sp.person}%`)).data ?? []).map((p: Row) => p.id);
  if (sp.org) {
    const orgs = (await db.from("organizations").select("id").ilike("name", `%${sp.org}%`)).data ?? [];
    const aff = (await db.from("affiliations").select("person_id").in("organization_id", orgs.map((o: Row) => o.id))).data ?? [];
    const ids = aff.map((a: Row) => a.person_id);
    personIds = personIds ? personIds.filter((i) => ids.includes(i)) : ids;
  }
  const noMatch = personIds !== undefined && personIds.length === 0;
  const sourceType = SourceTypeZ.safeParse(sp.type).success ? (sp.type as any) : undefined;
  // The search RPC runs with the public (row-level-security) client: only verified statements are visible.
  const rows = noMatch ? [] : await searchHistoricalStatements({ query: sp.q, personIds, from: sp.from, to: sp.to, sourceType, topic: sp.topic, country: sp.country, limit: 40 }, db);
  const semantic = embeddingsConfigured();

  return (
    <div>
      <h1 className="text-4xl">Statement archive</h1>
      <p className="ui mt-2 max-w-prose text-sm text-muted">Every entry is a direct quotation checked against the original source text. {semantic ? "Search combines keywords with semantic similarity." : "Semantic search turns on when an embedding provider is configured; keyword search is active."}</p>
      <form className="ui mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-4" role="search">
        <div className="lg:col-span-2"><label className="label" htmlFor="q">Keywords</label><input id="q" name="q" defaultValue={sp.q} className="field" /></div>
        <div><label className="label" htmlFor="person">Person</label><input id="person" name="person" defaultValue={sp.person} className="field" /></div>
        <div><label className="label" htmlFor="org">Party or organization</label><input id="org" name="org" defaultValue={sp.org} className="field" /></div>
        <div><label className="label" htmlFor="topic">Topic slug</label><input id="topic" name="topic" defaultValue={sp.topic} className="field" /></div>
        <div><label className="label" htmlFor="country">Country code</label><input id="country" name="country" defaultValue={sp.country} className="field" /></div>
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={sp.from} className="field" /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={sp.to} className="field" /></div>
        <div><label className="label" htmlFor="type">Source type</label>
          <select id="type" name="type" defaultValue={sp.type ?? ""} className="field"><option value="">Any</option>
            {SourceTypeZ.options.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select></div>
        <div className="flex items-end"><button className="btn">Search archive</button></div>
      </form>
      <div className="mt-10 space-y-8">
        {rows.map((s) => <StatementCard key={s.id} s={s} />)}
        {!rows.length && <Empty title="No statements found">No verified statements match these filters. Staff can add statements from a source URL in the admin area.</Empty>}
      </div>
    </div>
  );
}
