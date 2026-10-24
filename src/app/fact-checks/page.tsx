import Link from "next/link";
import { publicDb, type Row } from "@/lib/db";
import { VERDICTS, fmtDate } from "@/lib/verdicts";
import { VERDICT_DEFINITIONS } from "@/lib/ai/evaluate";
import { Empty, VerdictBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fact-check center" };

export default async function FactChecks({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { q, verdict, topic, country, from, subject } = searchParams;
  let query = publicDb().from("fact_checks").select("slug,claim_text,verdict,claimant,claim_date,topic_slug,country,published_at").eq("status", "approved");
  if (q) query = query.textSearch("tsv", q, { type: "websearch", config: "english" });
  if (verdict) query = query.eq("verdict", verdict);
  if (topic) query = query.eq("topic_slug", topic);
  if (country) query = query.eq("country", country);
  if (from) query = query.gte("claim_date", from);
  if (subject) query = query.ilike("claimant", `%${subject}%`);
  const { data } = await query.order("published_at", { ascending: false }).limit(50);

  return (
    <div>
      <h1 className="text-4xl">Fact-check center</h1>
      <form className="ui mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6" role="search">
        <div className="lg:col-span-2"><label className="label" htmlFor="q">Search claims</label><input id="q" name="q" defaultValue={q} className="field" /></div>
        <div><label className="label" htmlFor="verdict">Verdict</label>
          <select id="verdict" name="verdict" defaultValue={verdict ?? ""} className="field"><option value="">Any</option>{Object.entries(VERDICTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        <div><label className="label" htmlFor="subject">Subject (claimant)</label><input id="subject" name="subject" defaultValue={subject} className="field" /></div>
        <div><label className="label" htmlFor="topic">Topic slug</label><input id="topic" name="topic" defaultValue={topic} className="field" /></div>
        <div><label className="label" htmlFor="country">Country code</label><input id="country" name="country" defaultValue={country} placeholder="IN" className="field" /></div>
        <div><label className="label" htmlFor="from">Claim date from</label><input id="from" name="from" type="date" defaultValue={from} className="field" /></div>
        <div className="flex items-end"><button className="btn">Apply filters</button></div>
      </form>

      <ul className="mt-8 divide-y divide-rule">
        {(data as Row[] | null)?.map((c) => (
          <li key={c.slug} className="py-4">
            <VerdictBadge verdict={c.verdict} />
            <h2 className="mt-1 text-xl"><Link href={`/fact-checks/${c.slug}`} className="hover:underline">{c.claim_text}</Link></h2>
            <p className="ui text-xs text-muted">{c.claimant ? `Claim by ${c.claimant} · ` : ""}{fmtDate(c.claim_date ?? c.published_at)}</p>
          </li>
        ))}
      </ul>
      {!data?.length && <div className="mt-8"><Empty title="No fact-checks match">Try fewer filters, or check back after editors approve new fact-checks.</Empty></div>}

      <section id="definitions" className="mt-14">
        <h2 className="section-title">What our verdicts mean</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {Object.entries(VERDICT_DEFINITIONS).map(([k, d]) => <div key={k}><dt><VerdictBadge verdict={k} /></dt><dd className="mt-1">{d}</dd></div>)}
        </dl>
      </section>
    </div>
  );
}
