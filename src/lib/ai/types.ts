import { z } from "zod";

export const SourceTypeZ = z.enum(["speech", "interview", "transcript", "social_post", "official_record", "news_report", "other"]);
export type SourceType = z.infer<typeof SourceTypeZ>;

export interface NormalizedSource {
  id?: string;
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  language: string;
  text: string;
  sourceType: SourceType;
}

export const ClaimZ = z.object({
  claim: z.string().min(5),
  speaker: z.string().nullable(),
  quote: z.string().nullable(),          // must be verbatim from the source, verified in code
  sourceIndex: z.number().int().min(0),
  topic: z.string().nullable(),
  checkworthy: z.boolean(),
});
export type Claim = z.infer<typeof ClaimZ>;

export const RelationZ = z.enum(["consistent", "wording_change", "policy_change", "apparent_contradiction", "contradiction_explained_by_circumstances", "cannot_establish"]);
export type Relation = z.infer<typeof RelationZ>;

export const VerdictZ = z.enum(["true", "false", "partly_true", "misleading", "out_of_context", "unverified"]);
export type Verdict = z.infer<typeof VerdictZ>;

/** What we show readers for each stored relation. */
export const RELATION_LABEL: Record<Relation, { outcome: "Consistent" | "Position changed" | "Contradictory" | "Inconclusive"; detail: string }> = {
  consistent: { outcome: "Consistent", detail: "The later statement agrees with the earlier one." },
  wording_change: { outcome: "Consistent", detail: "The wording differs but the position is the same." },
  policy_change: { outcome: "Position changed", detail: "The stated policy position differs." },
  apparent_contradiction: { outcome: "Contradictory", detail: "The statements appear to conflict. Context may explain this." },
  contradiction_explained_by_circumstances: { outcome: "Position changed", detail: "The statements differ, and changed circumstances are documented." },
  cannot_establish: { outcome: "Inconclusive", detail: "The available record does not settle the question." },
};
