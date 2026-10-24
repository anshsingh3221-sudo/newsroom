export interface CitedDraft {
  whatHappened: string; whyItMatters: string; background: string; conclusion: string;
  timeline: { date: string; event: string; sourceIds: string[] }[];
  supporting: { point: string; sourceIds: string[] }[];
  contradicting: { point: string; sourceIds: string[] }[];
  uncertain: { point: string; sourceIds?: string[] }[];
}

const MARK = /\[(S\d+)\]/g;

/** Checks that every citation points to a real provided source and that evidence items cite at least one. Returns problems found. */
export function validateCitations(d: CitedDraft, validIds: string[]): { valid: boolean; problems: string[] } {
  const ok = new Set(validIds);
  const problems: string[] = [];
  const checkText = (label: string, t: string) => {
    for (const m of t.matchAll(MARK)) if (!ok.has(m[1])) problems.push(`${label}: unknown citation ${m[1]}`);
  };
  checkText("whatHappened", d.whatHappened); checkText("whyItMatters", d.whyItMatters);
  checkText("background", d.background); checkText("conclusion", d.conclusion);
  const checkItems = (label: string, items: { point?: string; event?: string; sourceIds?: string[] }[], requireCite: boolean) =>
    items.forEach((it, i) => {
      const ids = it.sourceIds ?? [];
      if (requireCite && !ids.length) problems.push(`${label}[${i}]: no source cited`);
      for (const id of ids) if (!ok.has(id)) problems.push(`${label}[${i}]: unknown citation ${id}`);
    });
  checkItems("timeline", d.timeline, true);
  checkItems("supporting", d.supporting, true);
  checkItems("contradicting", d.contradicting, true);
  checkItems("uncertain", d.uncertain, false);
  if (!/\[S\d+\]/.test(d.whatHappened)) problems.push("whatHappened: no citation markers");
  return { valid: problems.length === 0, problems };
}

/** Last-resort cleanup: removes citation markers and items that point at sources which do not exist. */
export function stripInvalidCitations<T extends CitedDraft>(d: T, validIds: string[]): T {
  const ok = new Set(validIds);
  const clean = (t: string) => t.replace(MARK, (m, id) => (ok.has(id) ? m : ""));
  const keep = <I extends { sourceIds?: string[] }>(items: I[]) =>
    items.map((i) => ({ ...i, sourceIds: (i.sourceIds ?? []).filter((id) => ok.has(id)) }));
  return {
    ...d, whatHappened: clean(d.whatHappened), whyItMatters: clean(d.whyItMatters), background: clean(d.background), conclusion: clean(d.conclusion),
    timeline: keep(d.timeline).filter((i) => i.sourceIds.length), supporting: keep(d.supporting).filter((i) => i.sourceIds.length),
    contradicting: keep(d.contradicting).filter((i) => i.sourceIds.length), uncertain: keep(d.uncertain),
  };
}
