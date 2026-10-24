import { z } from "zod";
import { generateJSON } from "../llm";
import { quoteInText } from "../text";
import { VerdictZ, type NormalizedSource } from "./types";

const EvidenceItemZ = z.object({ point: z.string(), sourceId: z.string(), excerpt: z.string() });
export const EvaluationZ = z.object({
  verdict: VerdictZ, explanation: z.string(),
  supporting: z.array(EvidenceItemZ), contradicting: z.array(EvidenceItemZ), uncertainty: z.string(),
});
export type Evaluation = z.infer<typeof EvaluationZ>;

export const VERDICT_DEFINITIONS: Record<string, string> = {
  true: "The claim is accurate and nothing significant is missing.",
  partly_true: "The claim contains accurate elements but is incomplete or contains inaccuracies.",
  misleading: "The claim uses accurate facts in a way that leads to a false impression.",
  out_of_context: "The claim is accurate as quoted but its meaning changes when the surrounding context is restored.",
  false: "The claim is contradicted by the available evidence.",
  unverified: "The available evidence cannot confirm or refute the claim.",
};

/** Evaluates a claim against real sources. The result is a DRAFT verdict that needs editor approval. Excerpts are verified verbatim. */
export async function evaluateClaim(claim: string, sources: (NormalizedSource & { id: string })[]): Promise<Evaluation> {
  if (!sources.length) {
    return { verdict: "unverified", explanation: "No sources could be retrieved for this claim.", supporting: [], contradicting: [], uncertainty: "No evidence was found automatically." };
  }
  const docs = sources.map((s, i) => `### S${i + 1}: ${s.title} (${s.publisher}, ${s.publishedAt ?? "date unknown"})\n${s.text.slice(0, 6000)}`).join("\n\n");
  const out = await generateJSON({
    system: `You are a fact-check analyst. Evaluate the claim using ONLY the provided sources.
Verdicts: true | false | partly_true | misleading | out_of_context | unverified. Definitions: ${JSON.stringify(VERDICT_DEFINITIONS)}
If sources do not settle it, choose "unverified". Prefer "unverified" over guessing.
Each evidence item needs a sourceId ("S1"...) and an "excerpt" copied exactly from that source.
Return JSON: {"verdict":string,"explanation":string,"supporting":[{"point":string,"sourceId":string,"excerpt":string}],"contradicting":[...same...],"uncertainty":string}`,
    user: `CLAIM: ${claim}\n\n${docs}`,
  }, EvaluationZ);
  const ok = (e: z.infer<typeof EvidenceItemZ>) => {
    const idx = Number(e.sourceId.replace(/\D/g, "")) - 1;
    return idx >= 0 && idx < sources.length && quoteInText(e.excerpt, sources[idx].text);
  };
  return { ...out, supporting: out.supporting.filter(ok), contradicting: out.contradicting.filter(ok) };
}
