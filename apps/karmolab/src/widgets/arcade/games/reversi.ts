/**
 * 뒤집기. 사이에 낀 돌이 전부 내 것이 된다 (TASK-KL-242)
 *
 * 오목, 사목과 같은 차례, 보드지만 **둘 수 있는 자리가 판마다 바뀐다**. 아무 데나 못 둔다.
 * 그래서 `canAct` 만으로는 부족하고, 둘 데가 없으면 차례가 넘어간다는 규칙이 필요하다.
 * 양쪽 다 둘 데가 없으면 끝. 커널은 이걸 모른다. 게임이 제 차례를 갖기 때문에 그냥 된다.
 */
import type { GameDef, BotMove, Outcome } from '../types';
import { DIRS8, duel } from '../grid';

/** 봇 단계 1~5. 시작 화면의 상대 고르기 (`setups.ts`). 안 고르면 3 */
export const levelOf = (opts: { ai?: number | boolean }): number => {
  const v = Number(opts.ai);
  return v >= 1 && v <= 5 ? Math.round(v) : 3;
};

/* 깊이 6 은 한 수 330ms (실측). 5 로 낮추고 끝판(빈 칸 10 아래)은 끝까지 읽음 */
const REV_DEPTH = [0, 0, 0, 2, 4, 5];
function revApply(b: number[], cell: number, who: number): number[] {
  const nb = b.slice();
  nb[cell] = who;
  for (const c of flips(b, cell, who)) nb[c] = who;
  return nb;
}
/** 판 값. 자리 가중 합에 둘 수 있는 자리 수(기동력)를 더함. 끝판(빈 칸 12 아래)은 돌 수 */
function revEval(b: number[], me: number): number {
  const foe = 3 - me;
  let empty = 0;
  let w = 0;
  let mine = 0;
  let his = 0;
  for (let i = 0; i < b.length; i += 1) {
    if (b[i] === 0) empty += 1;
    else if (b[i] === me) { w += WEIGHT[i]; mine += 1; } else { w -= WEIGHT[i]; his += 1; }
  }
  if (empty <= 12) return (mine - his) * 10 + w;
  return w + (legal(b, me).length - legal(b, foe).length) * 3;
}
function revSearch(b: number[], me: number, toMove: number, depth: number, alpha: number, beta: number): number {
  const moves = legal(b, toMove);
  const foe = 3 - toMove;
  if (!moves.length) {
    if (!legal(b, foe).length) {
      let d = 0;
      for (const v of b) d += v === me ? 1 : v === 0 ? 0 : -1;
      return d * 1000;
    }
    return revSearch(b, me, foe, depth - 1, alpha, beta);
  }
  if (depth <= 0) return revEval(b, me);
  const mine = toMove === me;
  let best = mine ? -Infinity : Infinity;
  for (const c of moves) {
    const v = revSearch(revApply(b, c, toMove), me, foe, depth - 1, alpha, beta);
    if (mine) { best = Math.max(best, v); alpha = Math.max(alpha, best); } else { best = Math.min(best, v); beta = Math.min(beta, best); }
    if (beta <= alpha) break;
  }
  return best;
}

export const N = 8;

export interface ReversiState {
  /** 0 = 빈 칸, 1, 2 = 자리 번호+1 */
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
  for (const [dx, dy] of DIRS8) {
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

/** 모서리는 뒤집히지 않는다. 이 놀이에서 제일 값진 자리다. */
const WEIGHT = (() => {
  const w = new Array(N * N).fill(1);
  for (const c of [0, N - 1, (N - 1) * N, N * N - 1]) w[c] = 30;
  for (let i = 0; i < N; i++) {
    if (w[i] === 1) w[i] = 4;
    if (w[(N - 1) * N + i] === 1) w[(N - 1) * N + i] = 4;
    if (w[i * N] === 1) w[i * N] = 4;
    if (w[i * N + N - 1] === 1) w[i * N + N - 1] = 4;
  }
  /* 모서리 옆은 오히려 독이다. 거기 두면 상대가 모서리를 가져간다. */
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
      scores: duel(win),
      note: {
        key: 'arcade.reversi.win',
        params: { who: ctx.seats[win]?.name ?? '', a: String(Math.max(mine, yours)), b: String(Math.min(mine, yours)) }
      }
    };
  },

  bot(s, seat, ctx): BotMove<ReversiAction> | null {
    if (s.done || s.turn !== seat) return null;
    const who = seat + 1;
    const moves = legal(s.board, who);
    if (!moves.length) return null;
    const level = levelOf(ctx.opts);
    const delay = 600 + ctx.rng() * 700;
    /* 1단계. 아무 데나 */
    if (level === 1) return { action: { cell: moves[Math.floor(ctx.rng() * moves.length)] }, delayMs: delay };
    /* 3단계부터 앞을 읽는다. 자리 가중과 기동력 (레퍼런스 2026-09-03: 남들 코너 가중 + 탐색) */
    let depth = REV_DEPTH[level] ?? 0;
    const empty = s.board.filter((v) => v === 0).length;
    if (level >= 4 && empty <= (level === 5 ? 11 : 8)) depth = empty;
    if (depth > 0) {
      let best = moves[0];
      let bestV = -Infinity;
      for (const c of moves) {
        const v = revSearch(revApply(s.board, c, who), who, 3 - who, depth - 1, -Infinity, Infinity);
        if (v > bestV) { bestV = v; best = c; }
      }
      return { action: { cell: best }, delayMs: delay };
    }
    /* 2단계. 많이 뒤집는 수보다 **좋은 자리**를 고른다. 초반에 많이 먹으면 나중에 다 뺏긴다. */
    let best = moves[0];
    let bestV = -Infinity;
    for (const c of moves) {
      const v = WEIGHT[c] * 3 + flips(s.board, c, who).length;
      if (v > bestV) { bestV = v; best = c; }
    }
    return { action: { cell: best }, delayMs: delay };
  }

};
