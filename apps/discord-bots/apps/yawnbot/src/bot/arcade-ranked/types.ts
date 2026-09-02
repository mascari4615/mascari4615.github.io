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
  /** 이만큼 두기 전에는 점수가 자리를 찾는 중. 화면의 임시 표시가 이 값을 읽음. 없으면 안 보여 줌 */
  settleGames?: number;
  /** 등급전 한 수 제한(초). 화면이 판을 열 때 씌움. 없으면 제한 없음 */
  moveLimitSec?: number;
}
