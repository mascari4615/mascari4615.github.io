import type { FormationCandidate, FormationPolicy } from './types';

const compatible = (
  a: FormationCandidate,
  b: FormationCandidate,
  now: number,
  rangeOf: (waitedMs: number) => number
): boolean => {
  const gap = Math.abs(a.mmr - b.mmr);
  return gap <= rangeOf(now - a.since) && gap <= rangeOf(now - b.since);
};

const ordered = (candidates: readonly FormationCandidate[]): FormationCandidate[] =>
  [...candidates].sort((a, b) => a.since - b.since || a.id.localeCompare(b.id));

export const immediatePairFormation = (): FormationPolicy =>
  ({ candidates, focusId, now, rangeOf }) => {
    const focus = candidates.find((candidate) => candidate.id === focusId);
    if (!focus) return null;
    const other = ordered(candidates)
      .filter((candidate) => candidate.id !== focusId && compatible(candidate, focus, now, rangeOf))
      .sort((a, b) => a.since - b.since || Math.abs(a.mmr - focus.mmr) - Math.abs(b.mmr - focus.mmr))[0];
    return other ? [other, focus] : null;
  };

export const accumulatingFormation = (minSeats: number, maxSeats: number, windowMs: number): FormationPolicy =>
  ({ candidates, focusId, now, rangeOf }) => {
    const group: FormationCandidate[] = [];
    for (const candidate of ordered(candidates)) {
      if (group.length >= maxSeats) break;
      if (group.every((other) => compatible(other, candidate, now, rangeOf))) group.push(candidate);
    }
    if (!group.some((candidate) => candidate.id === focusId)) return null;
    if (group.length === maxSeats) return group;
    return group.length >= minSeats && now - group[0].since >= windowMs ? group : null;
  };
