import type { RankedOutcome } from '@karmo/arcade';

export interface RatingState {
  publicRating: number;
  matchRating: number;
  games: number;
  wins: number;
}

export type StoredRating = Record<string, unknown>;

export interface RatingContext {
  outcome: RankedOutcome;
  before: ReadonlyMap<string, RatingState>;
  factor: number;
}

export interface FormationCandidate {
  id: string;
  mmr: number;
  since: number;
}

export interface FormationContext {
  candidates: readonly FormationCandidate[];
  focusId: string;
  now: number;
  rangeOf(waitedMs: number): number;
}

export type FormationPolicy = (context: FormationContext) => FormationCandidate[] | null;

export interface RankedGameRules {
  gameId: string;
  supportedSeats: ReadonlySet<number>;
  formation: FormationPolicy;
  initial(): RatingState;
  hydrate(stored: StoredRating | null): RatingState;
  serialize(state: RatingState): StoredRating;
  calculate(context: RatingContext): ReadonlyMap<string, RatingState>;
}
