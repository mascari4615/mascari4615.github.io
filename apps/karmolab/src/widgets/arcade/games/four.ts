/**
 * 사목 — 떨어뜨려 넷을 잇는다 (TASK-KL-242)
 *
 * 오목과 같은 「차례·보드」 갈래지만 **수를 두는 곳이 칸이 아니라 줄**이다. 중력이 자리를 정한다.
 * 커널이 이걸 그대로 받는지 보려고 넣었다 — 게임마다 「한 수」의 모양이 다르다는 것을 증명하는 자리.
 */
import type { GameDef, BotMove } from '../types';

export const W = 7;
export const H = 6;
const NEED = 4;
const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];

export interface FourState {
  /** 0 = 빈 칸, 1·2 = 자리 번호+1. `y=0` 이 맨 위 */
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

function wins(b: number[], cell: number, who: number): boolean {
  const x = cell % W;
  const y = Math.floor(cell / W);
  for (const [dx, dy] of DIRS) {
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

  init() {
    return { board: new Array(W * H).fill(0), turn: 0, won: -1, last: -1 };
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

  bot(s, seat): BotMove<FourAction> | null {
    if (s.won !== -1 || s.turn !== seat) return null;
    const me = seat + 1;
    const foe = 2 - seat;
    const legal: number[] = [];
    for (let c = 0; c < W; c++) if (drop(s.board, c) >= 0) legal.push(c);
    if (!legal.length) return null;

    const move = (col: number): BotMove<FourAction> => ({
      action: { col },
      delayMs: 600 + Math.random() * 700
    });

    /* ① 이길 수 있으면 이긴다 ② 못 이기면 상대의 넷을 막는다 — 이 둘만 해도 사람이 진다. */
    for (const c of legal) if (wins(after(s.board, drop(s.board, c), me), drop(s.board, c), me)) return move(c);
    for (const c of legal) if (wins(after(s.board, drop(s.board, c), foe), drop(s.board, c), foe)) return move(c);

    /* ③ 아니면 가운데로 — 가운데 줄이 이을 수 있는 방향이 제일 많다.
     *    단 **상대에게 바로 넷을 내주는 자리는 뺀다**(내가 놓으면 그 위가 상대 자리가 된다). */
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
