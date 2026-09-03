/**
 * 사목. 떨어뜨려 넷을 잇는다 (TASK-KL-242)
 *
 * 오목과 같은 차례, 보드 갈래지만 **수를 두는 곳이 칸이 아니라 줄**이다. 중력이 자리를 정한다.
 * 커널이 이걸 그대로 받는지 보려고 넣었다. 게임마다 한 수의 모양이 다르다는 것을 증명하는 자리.
 */
import type { GameDef, BotMove } from '../types';
import { LINE_DIRS } from '../grid';

/** 봇 단계 1~5. 시작 화면의 상대 고르기 (`setups.ts`). 안 고르면 3 */
export const levelOf = (opts: { ai?: number | boolean }): number => {
  const v = Number(opts.ai);
  return v >= 1 && v <= 5 ? Math.round(v) : 3;
};

const FOUR_DEPTH = [0, 0, 2, 4, 6, 8];
/** 판 값. 넷 창마다 내 돌만 있으면 +, 남 돌만 있으면 -. 셋이면 크게, 가운데 열 웃돈 */
function fourEval(b: number[], me: number): number {
  const foe = 3 - me;
  let v = 0;
  const score = (cells: number[]): number => {
    let mine = 0;
    let his = 0;
    for (const c of cells) {
      if (b[c] === me) mine += 1;
      else if (b[c] === foe) his += 1;
    }
    if (mine && his) return 0;
    if (mine === 3) return 40;
    if (mine === 2) return 6;
    if (his === 3) return -44;
    if (his === 2) return -6;
    return 0;
  };
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (x + 3 < W) v += score([y * W + x, y * W + x + 1, y * W + x + 2, y * W + x + 3]);
      if (y + 3 < H) v += score([y * W + x, (y + 1) * W + x, (y + 2) * W + x, (y + 3) * W + x]);
      if (x + 3 < W && y + 3 < H) v += score([y * W + x, (y + 1) * W + x + 1, (y + 2) * W + x + 2, (y + 3) * W + x + 3]);
      if (x >= 3 && y + 3 < H) v += score([y * W + x, (y + 1) * W + x - 1, (y + 2) * W + x - 2, (y + 3) * W + x - 3]);
    }
  }
  const mid = Math.floor(W / 2);
  for (let y = 0; y < H; y += 1) {
    if (b[y * W + mid] === me) v += 3;
    else if (b[y * W + mid] === foe) v -= 3;
  }
  return v;
}

function fourSearch(b: number[], me: number, toMove: number, depth: number, alpha: number, beta: number): number {
  const cols: number[] = [];
  const mid = (W - 1) / 2;
  for (let c = 0; c < W; c += 1) if (drop(b, c) >= 0) cols.push(c);
  cols.sort((a, c) => Math.abs(a - mid) - Math.abs(c - mid));
  if (!cols.length) return 0;
  for (const c of cols) {
    const cell = drop(b, c);
    if (wins(after(b, cell, toMove), cell, toMove)) return toMove === me ? 100000 + depth : -100000 - depth;
  }
  if (depth <= 0) return fourEval(b, me);
  const mine = toMove === me;
  let best = mine ? -Infinity : Infinity;
  for (const c of cols) {
    const v = fourSearch(after(b, drop(b, c), toMove), me, 3 - toMove, depth - 1, alpha, beta);
    if (mine) { best = Math.max(best, v); alpha = Math.max(alpha, best); } else { best = Math.min(best, v); beta = Math.min(beta, best); }
    if (beta <= alpha) break;
  }
  return best;
}

export const W = 7;
export const H = 6;
const NEED = 4;

export interface FourState {
  /** 0 = 빈 칸, 1, 2 = 자리 번호+1. `y=0` 이 맨 위 */
  board: number[];
  turn: number;
  /** 이긴 자리 (없으면 -1), 판이 다 차면 -2 */
  won: number;
  last: number;
}

export type FourAction = { col: number };

const at = (b: number[], x: number, y: number): number =>
  x < 0 || y < 0 || x >= W || y >= H ? -1 : b[y * W + x];

/** 이 줄에 떨어뜨리면 어디에 앉나. 꽉 찼으면 -1. */
function drop(b: number[], col: number): number {
  if (col < 0 || col >= W) return -1;
  for (let y = H - 1; y >= 0; y--) if (b[y * W + col] === 0) return y * W + col;
  return -1;
}

/** 이 줄에 둘 수 있나. 화면이 만석을 제 손으로 재지 않게 규칙이 내준다 */
export const canDrop = (s: FourState, col: number): boolean => drop(s.board, col) >= 0;

function wins(b: number[], cell: number, who: number): boolean {
  const x = cell % W;
  const y = Math.floor(cell / W);
  for (const [dx, dy] of LINE_DIRS) {
    let n = 1;
    for (let k = 1; k < NEED; k++) { if (at(b, x + dx * k, y + dy * k) === who) n++; else break; }
    for (let k = 1; k < NEED; k++) { if (at(b, x - dx * k, y - dy * k) === who) n++; else break; }
    if (n >= NEED) return true;
  }
  return false;
}

/** 한 수 놓아 본 판. 봇이 앞을 읽을 때 쓴다. */
function after(b: number[], cell: number, who: number): number[] {
  const nb = b.slice();
  nb[cell] = who;
  return nb;
}

export const four: GameDef<FourState, FourAction> = {
  id: 'four',
  seats: [2, 2],
  rounds: 1,

  init(ctx) {
    /* 사목은 선공 필승(Allis 1988). 선공을 자리 0 에 박아 두면 늘 같은 쪽이 유리. 씨앗으로 고름 */
    return { board: new Array(W * H).fill(0), turn: ctx.rng() < 0.5 ? 0 : 1, won: -1, last: -1 };
  },

  canAct(s, seat) {
    return s.won === -1 && s.turn === seat;
  },

  reduce(s, a, seat) {
    if (s.won !== -1 || s.turn !== seat) return s;
    const cell = drop(s.board, a.col);
    if (cell < 0) return s;
    const who = seat + 1;
    const board = after(s.board, cell, who);
    const won = wins(board, cell, who) ? seat : board.every((v) => v !== 0) ? -2 : -1;
    return { board, turn: 1 - seat, won, last: cell };
  },

  outcome(s, ctx) {
    if (s.won === -1) return { over: false };
    if (s.won === -2) return { over: true, scores: [0, 0], note: { key: 'arcade.four.full' } };
    return {
      over: true,
      scores: s.won === 0 ? [1, 0] : [0, 1],
      note: { key: 'arcade.four.win', params: { who: ctx.seats[s.won]?.name ?? '' } }
    };
  },

  bot(s, seat, ctx): BotMove<FourAction> | null {
    if (s.won !== -1 || s.turn !== seat) return null;
    const me = seat + 1;
    const foe = 2 - seat;
    const legal: number[] = [];
    for (let c = 0; c < W; c++) if (drop(s.board, c) >= 0) legal.push(c);
    if (!legal.length) return null;
    const level = levelOf(ctx.opts);

    const move = (col: number): BotMove<FourAction> => ({
      action: { col },
      delayMs: 600 + ctx.rng() * 700
    });

    /* 1단계. 이기는 수만 놓치지 않고 나머지는 아무 데나 */
    if (level === 1) {
      for (const c of legal) if (wins(after(s.board, drop(s.board, c), me), drop(s.board, c), me)) return move(c);
      return move(legal[Math.floor(ctx.rng() * legal.length)]);
    }

    /* ① 이길 수 있으면 이긴다 ② 못 이기면 상대의 넷을 막는다. 이 둘만 해도 사람이 진다. */
    for (const c of legal) if (wins(after(s.board, drop(s.board, c), me), drop(s.board, c), me)) return move(c);
    for (const c of legal) if (wins(after(s.board, drop(s.board, c), foe), drop(s.board, c), foe)) return move(c);

    /* ③ 3단계부터 알파베타. 깊이 4 가 사람과 반반, 8 이면 명인 (레퍼런스 2026-09-03) */
    const depth = FOUR_DEPTH[level] ?? 0;
    if (depth > 0) {
      let best = legal[0];
      let bestV = -Infinity;
      const mid = (W - 1) / 2;
      const order = legal.slice().sort((a, c) => Math.abs(a - mid) - Math.abs(c - mid));
      for (const c of order) {
        const v = fourSearch(after(s.board, drop(s.board, c), me), me, foe, depth - 1, -Infinity, Infinity);
        if (v > bestV) { bestV = v; best = c; }
      }
      return move(best);
    }

    /* 2단계. 가운데로. 상대에게 바로 넷을 내주는 자리는 뺀다 */
    const safe = legal.filter((c) => {
      const mine = drop(s.board, c);
      const above = mine - W;
      if (above < 0) return true;
      return !wins(after(after(s.board, mine, me), above, foe), above, foe);
    });
    const pool = safe.length ? safe : legal;
    const mid = (W - 1) / 2;
    const best = pool.reduce((a, c) => (Math.abs(c - mid) < Math.abs(a - mid) ? c : a), pool[0]);
    return move(best);
  }

};
