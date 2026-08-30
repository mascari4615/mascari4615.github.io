/**
 * 스도쿠 경주. 같은 문제, 먼저 채우기 (TASK-KL-242)
 *
 * 한붓그리기에서 쓴 수법을 그대로 쓴다: **답부터 만들고 거기서 지운다.** 아무렇게나 숫자를
 * 뿌리고 풀리나?를 검사하면 느리고 가끔 못 만든다.
 *
 * 6×6(2×3 상자)으로 줄였다. 9×9는 한 판이 십 분을 넘어 오락실에 안 맞고, 4×4는 삼십 초면
 * 끝나 겨룰 것이 없다. 6×6이 한 판 삼 분에 가장 가깝다.
 *
 * 틀린 숫자는 **넣을 수는 있되 표시된다**. 못 넣게 막으면 그건 스도쿠가 아니라 힌트 놀이다.
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

export const N = 6;
export const BOX_W = 3;
export const BOX_H = 2;
const HOLES = 18;
const LIMIT_MS = 300000;

export interface SudokuState {
  /** 정답 판. **`redact` 가 지운다** */
  answer: number[];
  /** 처음 주어진 숫자 (0 = 빈 칸) */
  given: number[];
  /** 자리별로 채운 것 */
  filled: number[][];
  /** 자리별 맞게 채운 칸 수 */
  right: number[];
  won: number;
  endsAt: number;
  over: boolean;
}

export type SudokuAction = { cell: number; value: number };

const rowOf = (c: number): number => Math.floor(c / N);
const colOf = (c: number): number => c % N;
const boxOf = (c: number): number => Math.floor(rowOf(c) / BOX_H) * BOX_H + Math.floor(colOf(c) / BOX_W);

/** 답 하나를 만든다. 되짚기(백트래킹). 6×6 은 금방 찾는다. */
function solve(board: number[], rng: () => number): boolean {
  const at = board.indexOf(0);
  if (at < 0) return true;
  const nums = [1, 2, 3, 4, 5, 6].sort(() => rng() - 0.5);
  for (const v of nums) {
    let ok = true;
    for (let i = 0; i < N * N; i++) {
      if (board[i] !== v) continue;
      if (rowOf(i) === rowOf(at) || colOf(i) === colOf(at) || boxOf(i) === boxOf(at)) { ok = false; break; }
    }
    if (!ok) continue;
    board[at] = v;
    if (solve(board, rng)) return true;
    board[at] = 0;
  }
  return false;
}

export const sudoku: GameDef<SudokuState, SudokuAction> = {
  id: 'sudoku',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx: GameCtx) {
    const answer = new Array(N * N).fill(0);
    solve(answer, ctx.rng);
    /* 답에서 구멍을 뚫는다. 모두 같은 문제를 받는다(경주니까). */
    const given = answer.slice();
    const order = given.map((_, i) => i).sort(() => ctx.rng() - 0.5);
    for (let k = 0; k < HOLES; k++) given[order[k]] = 0;
    return {
      answer,
      given,
      filled: ctx.seats.map(() => given.slice()),
      right: ctx.seats.map(() => 0),
      won: -1,
      endsAt: ctx.now + LIMIT_MS,
      over: false
    };
  },

  /** 정답 판은 아무에게도 안 보낸다. */
  redact(s) {
    return { ...s, answer: s.answer.map(() => 0) };
  },

  canAct(s, seat) {
    return !s.over && s.won === -1 && !!s.filled[seat];
  },

  reduce(s, a, seat) {
    if (s.over || s.won !== -1) return s;
    const cell = a?.cell;
    const value = a?.value;
    if (!Number.isInteger(cell) || cell < 0 || cell >= N * N) return s;
    if (!Number.isInteger(value) || value < 0 || value > N) return s;
    /* 처음 주어진 숫자는 못 바꾼다. */
    if (s.given[cell] !== 0) return s;

    const mine = s.filled[seat];
    if (!mine) return s;
    const filled = s.filled.map((f, i) => (i === seat ? f.map((v, k) => (k === cell ? value : v)) : f));
    const right = s.right.map((v, i) =>
      i === seat ? filled[i].filter((x, k) => x !== 0 && x === s.answer[k]).length : v
    );
    const done = right[seat] === N * N;
    return { ...s, filled, right, won: done ? seat : -1, over: done };
  },

  tick(s, ctx) {
    if (s.over || ctx.now < s.endsAt) return s;
    return { ...s, over: true };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    if (s.won >= 0) {
      return {
        over: true,
        scores: ctx.seats.map((_, i) => (i === s.won ? 1 : 0)),
        note: { key: 'arcade.sudoku.win', params: { who: ctx.seats[s.won]?.name ?? '' } }
      };
    }
    const top = Math.max(...s.right);
    const winners = ctx.seats.filter((_, i) => s.right[i] === top);
    return {
      over: true,
      scores: s.right,
      note: { key: 'arcade.sudoku.timeup', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat, ctx): BotMove<SudokuAction> | null {
    if (s.over || s.won !== -1) return null;
    const mine = s.filled[seat] ?? [];
    const empty = mine.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
    if (!empty.length) return null;
    /* 봇은 정답을 안 본다. 그 칸에 들어갈 수 있는 수가 하나뿐일 때만 확신하고,
       아니면 그중 아무거나 넣는다(사람처럼 틀리기도 한다). */
    const cell = empty[Math.floor(ctx.rng() * empty.length)];
    const used = new Set<number>();
    for (let i = 0; i < N * N; i++) {
      if (mine[i] === 0) continue;
      if (rowOf(i) === rowOf(cell) || colOf(i) === colOf(cell) || boxOf(i) === boxOf(cell)) used.add(mine[i]);
    }
    const can = [1, 2, 3, 4, 5, 6].filter((v) => !used.has(v));
    if (!can.length) return null;
    return {
      action: { cell, value: can[Math.floor(ctx.rng() * can.length)] },
      delayMs: 700 + ctx.rng() * 900
    };
  }
};
