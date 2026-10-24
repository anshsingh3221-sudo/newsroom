import { z } from "zod";
import { generateJSON } from "../llm";
import type { NormalizedSource } from "./types";

export const TimelineZ = z.object({
  events: z.array(z.object({ date: z.string(), event: z.string(), sourceIds: z.array(z.string()) })),
});
export type Timeline = z.infer<typeof TimelineZ>;

/** Builds a dated timeline strictly from the provided sources. Source IDs look like "S1". */
export async function buildTimeline(sources: NormalizedSource[]): Promise<Timeline> {
  const docs = sources.map((s, i) => `### S${i + 1}: ${s.title} (${s.publisher}, ${s.publishedAt ?? "date unknown"})\n${s.text.slice(0, 6000)}`).join("\n\n");
  return generateJSON({
    system: `Build a chronological timeline of events relevant to the story, using ONLY facts stated in the sources.
Each event needs a date (YYYY-MM-DD, or YYYY-MM / YYYY if that is all the source gives) and the source ids (like "S1") that state it. Skip events without a stated date.
Return JSON: {"events":[{"date":string,"event":string,"sourceIds":string[]}]} sorted oldest first.`,
    user: docs,
  }, TimelineZ);
}
