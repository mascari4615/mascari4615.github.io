/**
 * 오락실 명부 (TASK-KL-242)
 *
 * 게임을 늘리는 곳은 **여기 한 줄**이다. 커널도 화면도 게임 이름을 모른다 —
 * 51개가 되어도 커널은 그대로다.
 */
import type { GameDef } from './types';
import { reflex } from './games/reflex';
import { gomoku } from './games/gomoku';
import { four } from './games/four';
import { memory } from './games/memory';
import { hitblow } from './games/hitblow';
import { reversi } from './games/reversi';
import { dots } from './games/dots';
import { speed } from './games/speed';
import { slide } from './games/slide';
import { ultimate } from './games/ultimate';
import { yacht } from './games/yacht';
import { checkers } from './games/checkers';
import { blackjack } from './games/blackjack';
import { president } from './games/president';
import { dominoes } from './games/dominoes';
import { curling } from './games/curling';
import { bowling } from './games/bowling';
import { pool } from './games/pool';
import { darts } from './games/darts';
import { airhockey } from './games/airhockey';
import { highlow } from './games/highlow';
import { nim } from './games/nim';
import { hanabi } from './games/hanabi';
import { wordchain } from './games/wordchain';
import { lineup } from './games/lineup';
import { minesweeper } from './games/minesweeper';
import { liars } from './games/liars';
import { twenty } from './games/twenty';
import { snake } from './games/snake';
import { onestroke } from './games/onestroke';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const GAMES: Array<GameDef<any, any>> = [reflex, gomoku, four, memory, hitblow, reversi, dots, speed, slide, ultimate, yacht, checkers, blackjack, president, dominoes, curling, bowling, pool, darts, airhockey, highlow, nim, hanabi, wordchain, lineup, minesweeper, liars, twenty, snake, onestroke];

export const gameById = (id: string): GameDef<any, any> | undefined => GAMES.find((g) => g.id === id);

export { META, KINDS, iconOf, kindOf } from './meta';
export { Match } from './kernel';
export { seedFrom, mulberry32 } from './rng';
export type { GameDef, GameCtx, Seat, Outcome, BotMove, Note } from './types';
export type { MatchView, SeatSpec } from './kernel';
