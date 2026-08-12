/**
 * 오목 — 차례가 있는 보드 (TASK-KL-242)
 *
 * 반응 측정이 「동시·짧게·여럿」이라면 이쪽은 「차례·길게·둘」이다. 커널 하나가 이 둘을 다
 * 담으면 나머지 49개는 그 사이 어딘가다 — 그래서 첫 사이클의 게임 둘은 일부러 정반대로 골랐다.
 *
 * 9×9 · 5개. 정식 오목의 금수(삼삼 등)는 없다 — 규칙을 외워야 하는 게임은 오락실 첫 판에 안 맞는다.
 */
import type { GameDef, BotMove } from '../types';

export interface GomokuState {
  /** 0 = 빈 칸, 1 = 첫째 자리, 2 = 둘째 자리 */
  board: number[];
  turn: number;
  /** 이긴 자리 (없으면 -1), 판이 다 차면 -2 */
  won: number;
  /** 마지막에 둔 칸 (화면이 표시한다) */
  last: number;
}

export type GomokuAction = { cell: number };

export const N = 9;
const NEED = 5;
const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];

function at(b: number[], x: number, y: number): number {
  if (x < 0 || y < 0 || x >= N || y >= N) return -1;
  return b[y * N + x];
}

/** 이 칸에 두었을 때 다섯이 이어지나. */
function wins(b: number[], cell: number, who: number): boolean {
  const x = cell % N;
  const y = Math.floor(cell / N);
  for (const [dx, dy] of DIRS) {
    let n = 1;
    for (let k = 1; k < NEED; k++) { if (at(b, x + dx * k, y + dy * k) === who) n++; else break; }
    for (let k = 1; k < NEED; k++) { if (at(b, x - dx * k, y - dy * k) === who) n++; else break; }
    if (n >= NEED) return true;
  }
  return false;
}

/** 이 칸의 값어치 — 내 줄을 길게 만들수록, 남의 줄을 끊을수록 크다. */
function score(b: number[], cell: number, who: number): number {
  const x = cell % N;
  const y = Math.floor(cell / N);
  let total = 0;
  for (const target of [who, 3 - who]) {
    for (const [dx, dy] of DIRS) {
      let n = 0;
      let open = 0;
      for (const sgn of [1, -1]) {
        let k = 1;
        for (; k < NEED; k++) { if (at(b, x + dx * k * sgn, y + dy * k * sgn) === target) n++; else break; }
        if (at(b, x + dx * k * sgn, y + dy * k * sgn) === 0) open++;
      }
      /* 남의 줄을 막는 값은 내 줄을 잇는 값보다 살짝 낮게 — 그래야 먼저 이기러 간다. */
      const w = target === who ? 1 : 0.9;
      total += w * (Math.pow(10, n) + open * 2);
    }
  }
  /* 가운데가 길이 많다 */
  const mid = (N - 1) / 2;
  return total - (Math.abs(x - mid) + Math.abs(y - mid)) * 0.5;
}

export const gomoku: GameDef<GomokuState, GomokuAction> = {
  id: 'gomoku',
  seats: [2, 2],
  rounds: 1,

  init() {
    return { board: new Array(N * N).fill(0), turn: 0, won: -1, last: -1 };
  },

  canAct(s, seat) {
    return s.won === -1 && s.turn === seat;
  },

  reduce(s, a, seat) {
    if (s.won !== -1 || s.turn !== seat) return s;
    if (a.cell < 0 || a.cell >= N * N || s.board[a.cell] !== 0) return s;
    const who = seat + 1;
    const board = s.board.slice();
    board[a.cell] = who;
    const won = wins(board, a.cell, who) ? seat : board.every((v) => v !== 0) ? -2 : -1;
    return { board, turn: 1 - seat, won, last: a.cell };
  },

  outcome(s, ctx) {
    if (s.won === -1) return { over: false };
    if (s.won === -2) return { over: true, scores: [0, 0], note: { key: 'arcade.gomoku.full' } };
    return {
      over: true,
      scores: s.won === 0 ? [1, 0] : [0, 1],
      note: { key: 'arcade.gomoku.win', params: { who: ctx.seats[s.won]?.name ?? '' } }
    };
  },

  bot(s, seat): BotMove<GomokuAction> | null {
    if (s.won !== -1 || s.turn !== seat) return null;
    const who = seat + 1;
    let best = -1;
    let bestScore = -Infinity;
    for (let c = 0; c < N * N; c++) {
      if (s.board[c] !== 0) continue;
      const v = score(s.board, c, who);
      if (v > bestScore) { bestScore = v; best = c; }
    }
    if (best < 0) return null;
    /* 생각하는 척 — 즉답하면 사람이 아니라 벽에 두는 느낌이 든다. */
    return { action: { cell: best }, delayMs: 600 + Math.random() * 700 };
  }
};
