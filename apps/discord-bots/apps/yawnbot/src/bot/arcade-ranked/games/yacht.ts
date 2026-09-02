import { flattenOutcome, rankedCapability, rankedSeatCounts, type RankedOutcome } from '@karmo/arcade';
import { accumulatingFormation } from '../formation';
import type { RankedGameRules, RatingContext, RatingState, StoredRating } from '../types';

const START = 1500;
const FLOOR = 100;
const MMR_K = 24;
const CAPABILITY = rankedCapability('yacht');
if (!CAPABILITY) throw new Error('missing_ranked_capability:yacht');

const formMs = Number.parseInt(process.env.ARCADE_YACHT_FORM_MS ?? '', 10);
export const YACHT_FORM_MS = Number.isFinite(formMs) && formMs >= 0 ? formMs : 8 * 1000;

const BEGINNER_POINTS: Record<number, readonly number[]> = {
  2: [30, 0],
  3: [40, 10, 0],
  4: [50, 20, 5, 0]
};
const UPPER_POINTS: Record<number, readonly number[]> = {
  2: [30, -30],
  3: [45, 0, -45],
  4: [60, 20, -20, -60]
};

const numberOf = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const initial = (): RatingState => ({ publicRating: START, matchRating: START, games: 0, wins: 0 });

const hydrate = (stored: StoredRating | null): RatingState => {
  if (!stored) return initial();
  const legacyRating = numberOf(stored.rating, START);
  return {
    publicRating: numberOf(stored.leagueUnits, legacyRating * 12) / 12,
    matchRating: numberOf(stored.mmr, START),
    games: numberOf(stored.games, 0),
    wins: numberOf(stored.wins, 0)
  };
};

const serialize = (state: RatingState): StoredRating => ({
  leagueUnits: Math.max(FLOOR * 12, state.publicRating * 12),
  mmr: state.matchRating,
  games: state.games,
  wins: state.wins
});

const placementDeltas = (points: readonly number[], outcome: RankedOutcome): Record<string, number> => {
  const deltas: Record<string, number> = {};
  let occupied = 0;
  for (const group of outcome.placements) {
    let total = 0;
    for (let place = occupied; place < occupied + group.length; place += 1) total += points[place];
    for (const id of group) deltas[id] = total / group.length;
    occupied += group.length;
  }
  return deltas;
};

const pairwiseMmrDeltas = (
  before: ReadonlyMap<string, RatingState>,
  outcome: RankedOutcome
): Record<string, number> => {
  const rank = new Map<string, number>();
  outcome.placements.forEach((group, place) => group.forEach((id) => rank.set(id, place)));
  const ids = flattenOutcome(outcome);
  const deltas = Object.fromEntries(ids.map((id) => [id, 0])) as Record<string, number>;
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      const a = ids[left];
      const b = ids[right];
      const aRating = before.get(a)?.matchRating ?? START;
      const bRating = before.get(b)?.matchRating ?? START;
      const expectedA = 1 / (1 + 10 ** ((bRating - aRating) / 400));
      const scoreA = rank.get(a) === rank.get(b) ? 0.5 : (rank.get(a) ?? 0) < (rank.get(b) ?? 0) ? 1 : 0;
      const delta = MMR_K * (scoreA - expectedA) / (ids.length - 1);
      deltas[a] += delta;
      deltas[b] -= delta;
    }
  }
  return deltas;
};

const calculate = ({ outcome, before, factor }: RatingContext): ReadonlyMap<string, RatingState> => {
  const ids = flattenOutcome(outcome);
  const leader = before.get(ids[0]) ?? initial();
  const table = leader.publicRating >= 1600 ? UPPER_POINTS[ids.length] : BEGINNER_POINTS[ids.length];
  if (!table) throw new Error(`unsupported_seats:${ids.length}`);
  const publicDeltas = placementDeltas(table, outcome);
  const matchDeltas = pairwiseMmrDeltas(before, outcome);
  const uniqueWinner = outcome.placements[0]?.length === 1 ? outcome.placements[0][0] : null;
  return new Map(ids.map((id) => {
    const state = before.get(id) ?? initial();
    return [id, {
      publicRating: state.publicRating + factor * publicDeltas[id],
      matchRating: state.matchRating + factor * matchDeltas[id],
      games: state.games + 1,
      wins: state.wins + (id === uniqueWinner ? 1 : 0)
    }];
  }));
};

export const yachtRules: RankedGameRules = {
  gameId: 'yacht',
  supportedSeats: new Set(rankedSeatCounts('yacht')),
  formation: accumulatingFormation(CAPABILITY.minSeats, CAPABILITY.maxSeats, YACHT_FORM_MS),
  initial,
  hydrate,
  serialize,
  calculate
};
