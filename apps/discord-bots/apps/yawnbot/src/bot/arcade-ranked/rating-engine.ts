import { flattenOutcome, type RankedOutcome } from '@karmo/arcade';
import { notePair, pairFactor } from './pair-history';
import { rulesFor } from './registry';
import { readStoredRating, writeStoredRatings } from './rating-store';
import type { RatingState } from './types';

export interface RatingRecord {
  rating: number;
  mmr: number;
  games: number;
  wins: number;
}

export interface Applied {
  id: string;
  before: number;
  after: number;
  delta: number;
  mmrBefore?: number;
  mmrAfter?: number;
  mmrDelta?: number;
}

export class UnsupportedRankedGameError extends Error {}
export class UnsupportedSeatCountError extends Error {}

const rulesOrThrow = (game: string) => {
  const rules = rulesFor(game);
  if (!rules) throw new UnsupportedRankedGameError(`unsupported_ranked_game:${game}`);
  return rules;
};

const stateOf = (game: string, id: string): RatingState => {
  const rules = rulesOrThrow(game);
  return rules.hydrate(readStoredRating(game, id));
};

export const recordOf = (game: string, id: string): RatingRecord => {
  const state = stateOf(game, id);
  return { rating: state.publicRating, mmr: state.matchRating, games: state.games, wins: state.wins };
};

export const ratingOf = (game: string, id: string): number => recordOf(game, id).rating;
export const mmrOf = (game: string, id: string): number => recordOf(game, id).mmr;

export const applyResult = (game: string, outcome: RankedOutcome): Applied[] => {
  const rules = rulesOrThrow(game);
  const ids = flattenOutcome(outcome);
  if (!rules.supportedSeats.has(ids.length)) throw new UnsupportedSeatCountError(`unsupported_seats:${ids.length}`);
  const before = new Map(ids.map((id) => [id, rules.hydrate(readStoredRating(game, id))]));
  const factor = pairFactor(game, ids);
  const calculated = rules.calculate({ outcome, before, factor });
  const stored = new Map(ids.map((id) => [id, rules.serialize(calculated.get(id) as RatingState)]));
  writeStoredRatings(game, stored);
  notePair(game, ids);
  return ids.map((id) => {
    const prior = before.get(id) as RatingState;
    const after = rules.hydrate(stored.get(id) as Record<string, unknown>);
    return {
      id,
      before: prior.publicRating,
      after: after.publicRating,
      delta: after.publicRating - prior.publicRating,
      mmrBefore: prior.matchRating,
      mmrAfter: after.matchRating,
      mmrDelta: after.matchRating - prior.matchRating
    };
  });
};
