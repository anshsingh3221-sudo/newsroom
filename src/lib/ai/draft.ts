import { z } from "zod";
import { generateJSON } from "../llm";
import { validateCitations, stripInvalidCitations } from "./citations";
import type { Timeline } from "./timeline";
import type { Claim, NormalizedSource } from "./types";

const cited = z.object({ point: z.string(), sourceIds: z.array(z.string()) });
export const DraftZ = z.object({
  title: z.string(), summary: z.string(),
  whatHappened: z.string(), whyItMatters: z.string(), background: z.string(),
  keyPeople: z.array(z.object({ name: z.string(), role: z.string() })),
  supporting: z.array(cited), contradicting: z.array(cited),
  uncertain: z.array(z.object({ point: z.string(), sourceIds: z.array(z.string()).optional() })),
  conclusion: z.string(),
});
export type Draft = z.infer<typeof DraftZ> & { timeline: Timeline["events"] };

export async function generateAnalysisDraft(input: {
  sources: NormalizedSource[]; claims: Claim[]; timeline: Timeline; statementNotes: string[];
}): Promise<{ draft: Draft; problems: string[] }> {
  const ids = input.sources.map((_, i) => `S${i + 1}`);
  const docs = input.sources.map((s, i) => `### S${i + 1}: ${s.title} (${s.publisher}, ${s.publishedAt ?? "date unknown"}) ${s.url}\n${s.text.slice(0, 5000)}`).join("\n\n");
  const user = `SOURCES:\n${docs}\n\nEXTRACTED CLAIMS:\n${input.claims.filter((c) => c.checkworthy).map((c) => `- ${c.speaker ?? "reporter"}: ${c.claim}`).join("\n")}\n\nTIMELINE (from sources):\n${JSON.stringify(input.timeline.events)}\n\nHISTORICAL STATEMENT NOTES (unreviewed AI comparisons; present as pending editorial review, never as established fact):\n${input.statementNotes.join("\n") || "none"}`;
  const system = `You write a neutral, evidence-based news analysis draft for editors to review.
Rules: use ONLY the sources provided. Cite with markers like [S1] inside text. Every supporting/contradicting point needs sourceIds.
Separate facts from interpretation. Do not infer motives. Do not call anyone a liar. State what remains uncertain. Never invent quotations.
Return JSON: {"title","summary","whatHappened","whyItMatters","background","keyPeople":[{"name","role"}],"supporting":[{"point","sourceIds"}],"contradicting":[{"point","sourceIds"}],"uncertain":[{"point","sourceIds"?}],"conclusion"}`;

  let out = await generateJSON({ system, user }, DraftZ);
  let draft: Draft = { ...out, timeline: input.timeline.events };
  let check = validateCitations(draft, ids);
  if (!check.valid) {
    out = await generateJSON({ system, user: `${user}\n\nYour earlier draft had citation problems, fix them:\n${check.problems.join("\n")}` }, DraftZ);
    draft = { ...out, timeline: input.timeline.events };
    check = validateCitations(draft, ids);
  }
  if (!check.valid) draft = stripInvalidCitations(draft, ids);
  return { draft, problems: check.problems };
}
