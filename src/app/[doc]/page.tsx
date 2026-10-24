import { notFound } from "next/navigation";
import { VERDICT_DEFINITIONS } from "@/lib/ai/evaluate";
import { VerdictBadge } from "@/components/ui";

type Section = { h: string; p: string[] };
const DOCS: Record<string, { title: string; sections: Section[] }> = {
  methodology: {
    title: "Methodology",
    sections: [
      { h: "How claims are selected", p: ["We prioritise specific, checkable claims (figures, events, promises, attributions) that are widely repeated or affect public decisions. Opinions and predictions are not rated."] },
      { h: "How sources are evaluated", p: ["Primary sources (official records, transcripts, recordings, original documents) outrank secondary reports. Every cited source is linked. Statements are only added to the archive when the quotation is found verbatim in the fetched source text."] },
      { h: "How verdicts are assigned", p: ["An editor reads the evidence and assigns one of six verdicts. Definitions are below. When evidence is thin we use “Unverified” rather than guess."] },
      { h: "How AI is used", p: ["AI helps with discovery, grouping coverage, extracting claims, finding earlier statements, and drafting. It never publishes. Quotes returned by a model are checked against source text by code, and citations are checked against the source list. Semantic similarity is used only to find candidates, never to decide that statements contradict each other."] },
      { h: "What human review means", p: ["A named editor checks every cited source, quotation, date and verdict, may change or reject the draft, and approves it before it becomes public."] },
      { h: "Comparing statements", p: ["We distinguish a change of wording, a change of policy position, an apparent contradiction, a contradiction explained by changed circumstances, and cases the record cannot settle. A changed position is not treated as dishonesty. We do not speculate about motives or private beliefs."] },
      { h: "Trending stories", p: ["Ranked by how many independent publishers covered the same story in the last 48 hours, then by number of reports. No hidden signals."] },
    ],
  },
  "editorial-policy": {
    title: "Editorial policy",
    sections: [
      { h: "Independence and neutrality", p: ["We apply the same standards to every party, government and public figure. Facts and interpretation are kept separate."] },
      { h: "Conflicts of interest", p: ["Editors disclose personal, financial or political ties to a subject and do not review stories where they have a conflict."] },
      { h: "Sources and permissions", p: ["We ingest only feeds that permit syndication and store headlines, links and summaries. We link to originals."] },
    ],
  },
  corrections: {
    title: "Corrections",
    sections: [
      { h: "Reporting an error", p: ["Email the editors with the page address, what is wrong and a source showing the correct information."] },
      { h: "How we correct", p: ["Verified errors are fixed promptly. Each correction is dated and shown at the bottom of the page. Substantive changes to a verdict are explained in the correction note."] },
    ],
  },
  privacy: { title: "Privacy", sections: [{ h: "What we collect", p: ["If you subscribe, we store your email address to send newsletters. Staff accounts are handled by Supabase Auth. We do not sell personal data. Replace this text with your own policy and contact details before launch."] }] },
  terms: { title: "Terms of use", sections: [{ h: "Using this site", p: ["Content is provided for information. Quotations belong to their original speakers and publishers. Replace this text with terms reviewed by a lawyer before launch."] }] },
};

export function generateMetadata({ params }: { params: { doc: string } }) { return { title: DOCS[params.doc]?.title ?? "Not found" }; }

export default function Doc({ params }: { params: { doc: string } }) {
  const d = DOCS[params.doc];
  if (!d) notFound();
  return (
    <article className="prose-col mx-auto">
      <h1 className="text-4xl">{d.title}</h1>
      {d.sections.map((s) => <section key={s.h}><h2 className="mt-8 text-2xl">{s.h}</h2>{s.p.map((t, i) => <p key={i} className="mt-2">{t}</p>)}</section>)}
      {params.doc === "methodology" && (
        <section id="verdicts"><h2 className="mt-8 text-2xl">Verdict definitions</h2>
          <dl className="mt-3 space-y-3">{Object.entries(VERDICT_DEFINITIONS).map(([k, v]) => <div key={k}><dt><VerdictBadge verdict={k} /></dt><dd>{v}</dd></div>)}</dl></section>)}
    </article>
  );
}
