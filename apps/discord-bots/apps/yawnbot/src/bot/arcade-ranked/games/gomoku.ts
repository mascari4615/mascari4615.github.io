import { flattenOutcome, rankedCapability, rankedSeatCounts } from '@karmo/arcade';
import { immediatePairFormation } from '../formation';
import type { RankedGameRules, RatingContext, RatingState, StoredRating } from '../types';

const START = 1500;
const FLOOR = 100;
const CAPABILITY = rankedCapability('gomoku');
if (!CAPABILITY) throw new Error('missing_ranked_capability:gomoku');

const numberOf = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const initial = (): RatingState => ({ publicRating: START, matchRating: START, games: 0, wins: 0 });

const hydrate = (stored: StoredRating | null): RatingState => {
  if (!stored) return initial();
  const rating = numberOf(stored.rating, START);
  return {
    publicRating: rating,
    matchRating: rating,
    games: numberOf(stored.games, 0),
    wins: numberOf(stored.wins, 0)
  };
};

const serialize = (state: RatingState): StoredRating => ({
  rating: Math.max(FLOOR, Math.round(state.publicRating)),
  games: state.games,
  wins: state.wins
});

const kOf = (state: RatingState): number => {
  if (state.games < CAPABILITY.settlingGames) return 40;
  if (state.publicRating >= 2200) return 24;
  return 32;
};

const calculate = ({ outcome, before, factor }: RatingContext): ReadonlyMap<string, RatingState> => {
  const ids = flattenOutcome(outcome);
  if (ids.length !== 2) throw new Error(`unsupported_seats:${ids.length}`);
  const [a, b] = ids;
  const left = before.get(a) ?? initial();
  const right = before.get(b) ?? initial();
  const draw = outcome.placements[0]?.length === 2;
  const expectedA = 1 / (1 + 10 ** ((right.publicRating - left.publicRating) / 400));
  const scoreA = draw ? 0.5 : 1;
  return new Map([
    [a, {
      publicRating: left.publicRating + factor * kOf(left) * (scoreA - expectedA),
      matchRating: left.matchRating,
      games: left.games + 1,
      wins: left.wins + (draw ? 0 : 1)
    }],
    [b, {
      publicRating: right.publicRating + factor * kOf(right) * (1 - scoreA - (1 - expectedA)),
      matchRating: right.matchRating,
      games: right.games + 1,
      wins: right.wins
    }]
  ]);
};

export const gomokuRules: RankedGameRules = {
  gameId: 'gomoku',
  supportedSeats: new Set(rankedSeatCounts('gomoku')),
  formation: immediatePairFormation(),
  initial,
  hydrate,
  serialize,
  calculate
};
