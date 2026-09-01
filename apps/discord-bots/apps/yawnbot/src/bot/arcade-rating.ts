/** 등급전 점수 공개 경계. 계산과 저장 구현은 arcade-ranked 아래에 둠 */
export {
  applyResult,
  mmrOf,
  ratingOf,
  recordOf,
  UnsupportedRankedGameError,
  UnsupportedSeatCountError,
  type Applied
} from './arcade-ranked/rating-engine';
export { pairFactor, resetPairHistory as resetPairs } from './arcade-ranked/pair-history';
export { resetRatingStore as resetRatings } from './arcade-ranked/rating-store';

export type RoomName = 'beginner' | 'upper';

export const roomOf = (rating: number): RoomName => rating >= 1600 ? 'upper' : 'beginner';
