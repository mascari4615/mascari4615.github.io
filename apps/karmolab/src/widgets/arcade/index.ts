/**
 * 오락실 입구 (TASK-KL-242, SSOT 정리 = TASK-KL-264)
 *
 * 게임 목록은 여기 없다. **정본은 `catalog.ts` 한 곳**이고 이 파일은 그 그림자다.
 * 전에는 여기, 화면 명부, 명패 세 곳에 같은 이름을 적었고, 세 곳은 언젠가 갈라진다.
 */
import type { GameDef } from './types';
import { CATALOG } from './catalog';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const GAMES: Array<GameDef<any, any>> = CATALOG.map((e) => e.def);

export const gameById = (id: string): GameDef<any, any> | undefined => GAMES.find((g) => g.id === id);

export { CATALOG } from './catalog';
export { META, KINDS, iconOf, kindOf } from './meta';
export { PARTY, partySize } from './seating';
export { Match } from './kernel';
export { seedFrom, mulberry32 } from './rng';
export type { GameDef, GameCtx, GameOpts, Seat, Outcome, BotMove, Note } from './types';
export type { MatchView, SeatSpec } from './kernel';
