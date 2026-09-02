import { flattenOutcome } from '@karmo/arcade';
import { immediatePairFormation } from '../formation';
import type { RankedGameRules, RatingContext, RatingState, StoredRating } from '../types';

const START = 1500;
const FLOOR = 100;

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

/* K 경계. 화면의 임시(settling) 표시도 서버가 내려 주는 이 값을 읽음 (2026-09-02 감사 B6) */
const SETTLE_GAMES = 20;
/* 한 수 제한. 작혼 실측(수당 5 + 예비 20)에 견줘 예비가 없어 한 단 60 */
const MOVE_LIMIT_SEC = 60;

const kOf = (state: RatingState): number => {
  if (state.games < SETTLE_GAMES) return 40;
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
  supportedSeats: new Set([2]),
  settleGames: SETTLE_GAMES,
  moveLimitSec: MOVE_LIMIT_SEC,
  formation: immediatePairFormation(),
  initial,
  hydrate,
  serialize,
  calculate
};
