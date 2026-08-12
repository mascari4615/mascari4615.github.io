/**
 * 초월 틱택토 — 내가 둔 칸이 상대의 판을 정한다 (TASK-KL-242)
 *
 * 삼목은 몇 판만 두면 무승부만 남는다. 그런데 작은 판 아홉을 큰 판에 얹고 **「내가 둔 칸의
 * 자리」가 상대가 둘 작은 판이 된다**는 규칙 하나를 더하면, 같은 재료가 갑자기 깊어진다.
 * 51개를 채울 때 새 소재를 찾는 것보다 이런 규칙 하나를 얹는 쪽이 값싸고 자주 낫다.
 *
 * 보낸 판이 이미 끝났으면 아무 데나 둔다 — 안 그러면 판이 잠긴다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

const LINES: Array<[number, number, number]> = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

export interface UltimateState {
  /** 81칸. 0 = 빈 칸, 1·2 = 자리 번호+1 */
  cells: number[];
  /** 작은 판 아홉의 임자. 0 = 진행 중, 1·2 = 이긴 자리, 3 = 비김 */
  boards: number[];
  turn: number;
  /** 이번에 둘 수 있는 작은 판. -1 이면 아무 데나 */
  next: number;
  /** 큰 판 승자 (-1 진행, -2 비김) */
  won: number;
  last: number;
}

export type UltimateAction = { cell: number };

/** 아홉 칸에서 이겼나 — 이겼으면 임자, 다 찼으면 3, 아직이면 0. */
function judge(nine: number[]): number {
  for (const [a, b, c] of LINES) {
    if (nine[a] && nine[a] === nine[b] && nine[b] === nine[c]) return nine[a];
  }
  return nine.every((v) => v !== 0) ? 3 : 0;
}

const smallOf = (cell: number): number => Math.floor(cell / 9);
const spotOf = (cell: number): number => cell % 9;

export function playable(s: UltimateState, cell: number): boolean {
  if (s.won !== -1) return false;
  if (cell < 0 || cell >= 81 || s.cells[cell] !== 0) return false;
  const sm = smallOf(cell);
  if (s.boards[sm] !== 0) return false;
  return s.next === -1 || s.next === sm;
}

export const ultimate: GameDef<UltimateState, UltimateAction> = {
  id: 'ultimate',
  seats: [2, 2],
  rounds: 1,

  init() {
    return {
      cells: new Array(81).fill(0),
      boards: new Array(9).fill(0),
      turn: 0,
      next: -1,
      won: -1,
      last: -1
    };
  },

  canAct(s, seat) {
    return s.won === -1 && s.turn === seat;
  },

  reduce(s, a, seat) {
    if (s.turn !== seat) return s;
    const cell = a?.cell;
    if (typeof cell !== 'number' || !playable(s, cell)) return s;

    const who = seat + 1;
    const cells = s.cells.slice();
    cells[cell] = who;

    const sm = smallOf(cell);
    const boards = s.boards.slice();
    boards[sm] = judge(cells.slice(sm * 9, sm * 9 + 9));

    /* 큰 판은 「작은 판의 임자」로 따진다. 비긴 작은 판(3)은 어느 쪽 줄도 못 만든다. */
    const big = boards.map((v) => (v === 3 ? 0 : v));
    let won = -1;
    for (const [x, y, z] of LINES) {
      if (big[x] && big[x] === big[y] && big[y] === big[z]) won = big[x] - 1;
    }
    if (won === -1 && boards.every((v) => v !== 0)) won = -2;

    /* 보낸 판이 이미 끝났으면 아무 데나 — 안 그러면 둘 곳이 없어 판이 잠긴다. */
    const sent = spotOf(cell);
    const next = boards[sent] === 0 ? sent : -1;
    return { cells, boards, turn: 1 - seat, next, won, last: cell };
  },

  outcome(s, ctx): Outcome {
    if (s.won === -1) return { over: false };
    if (s.won === -2) return { over: true, scores: [0, 0], note: { key: 'arcade.ultimate.draw' } };
    return {
      over: true,
      scores: s.won === 0 ? [1, 0] : [0, 1],
      note: { key: 'arcade.ultimate.win', params: { who: ctx.seats[s.won]?.name ?? '' } }
    };
  },

  bot(s, seat): BotMove<UltimateAction> | null {
    if (s.won !== -1 || s.turn !== seat) return null;
    const me = seat + 1;
    const foe = 2 - seat;
    const moves: number[] = [];
    for (let c = 0; c < 81; c++) if (playable(s, c)) moves.push(c);
    if (!moves.length) return null;

    /** 작은 판을 이 수로 가져가나 / 막나. */
    const value = (cell: number): number => {
      const sm = smallOf(cell);
      const nine = s.cells.slice(sm * 9, sm * 9 + 9);
      let v = 0;
      nine[spotOf(cell)] = me;
      if (judge(nine) === me) v += 40;
      const block = s.cells.slice(sm * 9, sm * 9 + 9);
      block[spotOf(cell)] = foe;
      if (judge(block) === foe) v += 25;
      /* 가운데 작은 판과 가운데 칸이 줄을 제일 많이 만든다. */
      if (sm === 4) v += 4;
      if (spotOf(cell) === 4) v += 3;
      /* **아무 데나 두게 보내는 수는 손해다** — 상대에게 판 전체를 내주는 것과 같다. */
      const sent = spotOf(cell);
      if (s.boards[sent] !== 0) v -= 12;
      return v;
    };

    let best = moves[0];
    let bestV = -Infinity;
    for (const c of moves) {
      const v = value(c) + Math.random();
      if (v > bestV) { bestV = v; best = c; }
    }
    return { action: { cell: best }, delayMs: 600 + Math.random() * 800 };
  }
};
