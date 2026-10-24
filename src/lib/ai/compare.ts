import { z } from "zod";
import { generateJSON } from "../llm";
import { quoteInText } from "../text";
import { RelationZ } from "./types";
import type { Row } from "../db";

export const ComparisonZ = z.object({
  relation: RelationZ,
  claimA: z.string(), claimB: z.string(),
  summary: z.string(),
  contextDifferences: z.array(z.string()),
  evidence: z.array(z.object({ which: z.enum(["A", "B"]), quote: z.string(), note: z.string() })),
  uncertainty: z.string(),
  confidence: z.number().min(0).max(1),
});
export type Comparison = z.infer<typeof ComparisonZ>;

const fmt = (label: string, s: Row) =>
  `${label} (${s.people?.name ?? "speaker"}, ${s.made_on ?? "date unknown"}, ${s.source_type}):\n"${s.text}"\nContext: ${s.context ?? "none recorded"}\nSource: ${s.source_url}`;

/** Compares an earlier and a later statement. Output stays a DRAFT for editors; evidence quotes are verified against the statement text. */
export async function compareStatements(a: Row, b: Row): Promise<Comparison> {
  const out = await generateJSON({
    system: `You compare two statements by the same public figure for an editorial review desk.
Rules:
- Similar wording or topic is NOT agreement, and different wording is NOT contradiction. Compare the actual claims.
- A changed position is not evidence of lying, and you must never infer motives or private beliefs.
- Choose "apparent_contradiction" only if the claims cannot both hold in the same circumstances. If documented circumstances differ, use "contradiction_explained_by_circumstances". Use "cannot_establish" when the excerpts are too thin.
- "evidence" quotes must be copied exactly from statement A or B.
Relation values: consistent | wording_change | policy_change | apparent_contradiction | contradiction_explained_by_circumstances | cannot_establish.
Return JSON: {"relation":string,"claimA":string,"claimB":string,"summary":string,"contextDifferences":string[],"evidence":[{"which":"A"|"B","quote":string,"note":string}],"uncertainty":string,"confidence":number 0-1}`,
    user: `${fmt("STATEMENT A (earlier)", a)}\n\n${fmt("STATEMENT B (later)", b)}`,
  }, ComparisonZ);
  const evidence = out.evidence.filter((e) => quoteInText(e.quote, e.which === "A" ? a.text : b.text));
  return { ...out, evidence };
}
