export interface RankedOutcome {
  placements: string[][];
}

export function normalizeOutcome(value: unknown, roster: readonly string[]): RankedOutcome | null;
export function outcomeFromScores(ids: readonly string[], scores: readonly number[], higherWins?: boolean): RankedOutcome | null;
export function flattenOutcome(outcome: RankedOutcome): string[];
export function outcomeKey(outcome: RankedOutcome): string;
