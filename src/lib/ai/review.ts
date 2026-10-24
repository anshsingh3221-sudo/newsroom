export interface ReviewPacket { checklist: { item: string; done: boolean }[]; warnings: string[] }

/** Builds the checklist an editor sees alongside an AI draft. Nothing is published until a human approves it. */
export function prepareEditorialReview(input: {
  citationProblems: string[]; unresolvedSpeakers: string[]; comparisonsProposed: number; droppedQuotes: number;
}): ReviewPacket {
  const warnings: string[] = [];
  if (input.citationProblems.length) warnings.push(`Citation problems were found and auto-removed: ${input.citationProblems.slice(0, 5).join("; ")}`);
  if (input.unresolvedSpeakers.length) warnings.push(`Speakers not found in the people database (no historical comparison run): ${input.unresolvedSpeakers.join(", ")}`);
  if (input.droppedQuotes) warnings.push(`${input.droppedQuotes} model-supplied quote(s) could not be found in the source text and were dropped.`);
  return {
    warnings,
    checklist: [
      { item: "Open each cited source and confirm it supports the sentence that cites it", done: false },
      { item: "Confirm every quotation matches the original source", done: false },
      { item: "Check dates and attributions", done: false },
      { item: `Review ${input.comparisonsProposed} proposed statement comparison(s) in the review queue`, done: false },
      { item: "Check that facts and interpretation are clearly separated and wording is neutral", done: false },
      { item: "Declare any conflicts of interest", done: false },
    ],
  };
}
