/**
 * 뒤집기 — 사이에 낀 돌이 전부 내 것이 된다 (TASK-KL-242)
 *
 * 오목·사목과 같은 「차례·보드」지만 **둘 수 있는 자리가 판마다 바뀐다** — 아무 데나 못 둔다.
 * 그래서 `canAct` 만으로는 부족하고, 「둘 데가 없으면 차례가 넘어간다」는 규칙이 필요하다.
 * 양쪽 다 둘 데가 없으면 끝. 커널은 이걸 모른다 — 게임이 제 차례를 갖기 때문에 그냥 된다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

export const N = 8;
const DIRS: Array<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]
];

export interface ReversiState {
  /** 0 = 빈 칸, 1·2 = 자리 번호+1 */
  board: number[];
  turn: number;
  last: number;
  /** 양쪽 다 못 두면 true */
  done: boolean;
}

export type ReversiAction = { cell: number };

const at = (b: number[], x: number, y: number): number =>
  x < 0 || y < 0 || x >= N || y >= N ? -1 : b[y * N + x];

/** 이 칸에 두면 뒤집히는 돌들. 없으면 못 두는 자리다. */
export function flips(b: number[], cell: number, who: number): number[] {
  if (cell < 0 || cell >= N * N || b[cell] !== 0) return [];
  const x = cell % N;
  const y = Math.floor(cell / N);
  const foe = 3 - who;
  const out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const line: number[] = [];
    for (let k = 1; k < N; k++) {
      const v = at(b, x + dx * k, y + dy * k);
      if (v === foe) line.push((y + dy * k) * N + (x + dx * k));
      else {
        if (v === who && line.length) out.push(...line);
        break;
      }
    }
  }
  return out;
}

const legal = (b: number[], who: number): number[] =>
  b.map((_, i) => i).filter((i) => flips(b, i, who).length > 0);

/** 모서리는 뒤집히지 않는다 — 이 놀이에서 제일 값진 자리다. */
const WEIGHT = (() => {
  const w = new Array(N * N).fill(1);
  for (const c of [0, N - 1, (N - 1) * N, N * N - 1]) w[c] = 30;
  for (let i = 0; i < N; i++) {
    if (w[i] === 1) w[i] = 4;
    if (w[(N - 1) * N + i] === 1) w[(N - 1) * N + i] = 4;
    if (w[i * N] === 1) w[i * N] = 4;
    if (w[i * N + N - 1] === 1) w[i * N + N - 1] = 4;
  }
  /* 모서리 옆은 오히려 독이다 — 거기 두면 상대가 모서리를 가져간다. */
  for (const c of [1, N, N + 1, N - 2, 2 * N - 1, 2 * N - 2,
                   (N - 2) * N, (N - 2) * N + 1, (N - 1) * N + 1,
                   (N - 1) * N - 1, (N - 1) * N - 2, N * N - 2]) w[c] = -6;
  return w;
})();

export const reversi: GameDef<ReversiState, ReversiAction> = {
  id: 'reversi',
  seats: [2, 2],
  rounds: 1,

  init() {
    const board = new Array(N * N).fill(0);
    const m = N / 2;
    board[(m - 1) * N + (m - 1)] = 2;
    board[(m - 1) * N + m] = 1;
    board[m * N + (m - 1)] = 1;
    board[m * N + m] = 2;
    return { board, turn: 0, last: -1, done: false };
  },

  canAct(s, seat) {
    return !s.done && s.turn === seat;
  },

  reduce(s, a, seat) {
    if (s.done || s.turn !== seat) return s;
    const who = seat + 1;
    const got = flips(s.board, a?.cell, who);
    if (!got.length) return s;

    const board = s.board.slice();
    board[a.cell] = who;
    for (const c of got) board[c] = who;

    /* 다음 사람이 둘 데가 없으면 차례가 도로 넘어온다. 둘 다 없으면 끝. */
    const other = 1 - seat;
    let turn = other;
    let done = false;
    if (!legal(board, other + 1).length) {
      if (legal(board, who).length) turn = seat;
      else done = true;
    }
    return { board, turn, last: a.cell, done };
  },

  outcome(s, ctx): Outcome {
    if (!s.done) return { over: false };
    const mine = s.board.filter((v) => v === 1).length;
    const yours = s.board.filter((v) => v === 2).length;
    if (mine === yours) {
      return { over: true, scores: [0, 0], note: { key: 'arcade.reversi.draw', params: { n: String(mine) } } };
    }
    const win = mine > yours ? 0 : 1;
    return {
      over: true,
      scores: win === 0 ? [1, 0] : [0, 1],
      note: {
        key: 'arcade.reversi.win',
        params: { who: ctx.seats[win]?.name ?? '', a: String(Math.max(mine, yours)), b: String(Math.min(mine, yours)) }
      }
    };
  },

  bot(s, seat): BotMove<ReversiAction> | null {
    if (s.done || s.turn !== seat) return null;
    const who = seat + 1;
    const moves = legal(s.board, who);
    if (!moves.length) return null;
    /* 많이 뒤집는 수보다 **좋은 자리**를 고른다 — 초반에 많이 먹으면 나중에 다 뺏긴다. */
    let best = moves[0];
    let bestV = -Infinity;
    for (const c of moves) {
      const v = WEIGHT[c] * 3 + flips(s.board, c, who).length;
      if (v > bestV) { bestV = v; best = c; }
    }
    return { action: { cell: best }, delayMs: 600 + Math.random() * 700 };
  }
};
