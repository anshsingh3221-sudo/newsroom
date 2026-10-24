import { z } from "zod";
import { generateJSON } from "../llm";
import { quoteInText } from "../text";
import { ClaimZ, type Claim, type NormalizedSource } from "./types";

const OutZ = z.object({ claims: z.array(ClaimZ) });

/** Extracts specific, checkable claims. Any quote the model returns is verified to exist verbatim in the source, otherwise dropped. */
export async function extractClaims(sources: NormalizedSource[]): Promise<Claim[]> {
  const docs = sources.map((s, i) => `### SOURCE ${i}: ${s.title} (${s.publisher})\n${s.text.slice(0, 9000)}`).join("\n\n");
  const out = await generateJSON({
    system: `You extract specific claims from news sources for a fact-checking desk.
Rules:
- Only extract claims actually made in the text. Never invent or paraphrase a quotation: "quote" must be copied character-for-character from the source, or null.
- "speaker" is the named person or organization who made the claim, or null if the claim is the reporter's own.
- "checkworthy" is true only for specific factual assertions (numbers, events, promises, attributions), not opinions.
- "sourceIndex" is the SOURCE number the claim comes from.
Return JSON: {"claims":[{"claim":string,"speaker":string|null,"quote":string|null,"sourceIndex":number,"topic":string|null,"checkworthy":boolean}]}`,
    user: docs,
  }, OutZ);

  return out.claims
    .filter((c) => c.sourceIndex < sources.length)
    .map((c) => (c.quote && !quoteInText(c.quote, sources[c.sourceIndex].text) ? { ...c, quote: null } : c));
}
