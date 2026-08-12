/**
 * 만칼라 — 씨를 한 알씩 뿌리며 돈다 (TASK-KL-242)
 *
 * 규칙이 세 줄인데 깊이는 바둑 쪽에 가까운 고전. **마지막 한 알이 어디에 떨어지느냐**가
 * 모든 것을 정한다 — 내 창고면 한 번 더, 내 빈 구덩이면 맞은편 것까지 다 가져온다.
 *
 * 그래서 이 놀이의 수는 「어디를 집을까」가 아니라 **「마지막 알이 어디서 멎을까」**다.
 * 화면이 그 자리를 미리 보여 주면 셈이 눈으로 되고, 안 보여 주면 손가락으로 세게 된다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

/** 한 쪽 구덩이 수 */
export const PITS = 6;
/** 구덩이마다 처음 담긴 씨 */
const SEEDS = 4;
/** 자리0 창고 = 6, 자리1 창고 = 13 */
export const STORE = [PITS, PITS * 2 + 1];

export interface MancalaState {
  /** 14칸: 0~5 자리0 구덩이, 6 자리0 창고, 7~12 자리1 구덩이, 13 자리1 창고 */
  board: number[];
  turn: number;
  /** 마지막으로 씨를 놓은 칸 */
  last: number;
  over: boolean;
}

export type MancalaAction = { pit: number };

/** 그 자리가 쓸 수 있는 구덩이인가. */
export const ownsPit = (seat: number, i: number): boolean =>
  seat === 0 ? i >= 0 && i < PITS : i > PITS && i < PITS * 2 + 1;

/** 씨를 뿌린 결과. 화면도 봇도 같은 함수를 봐야 「멎는 자리」가 어긋나지 않는다. */
export function sow(board: number[], seat: number, pit: number): { board: number[]; last: number; again: boolean } {
  const b = board.slice();
  let n = b[pit];
  b[pit] = 0;
  let i = pit;
  while (n > 0) {
    i = (i + 1) % 14;
    /* 남의 창고는 건너뛴다. */
    if (i === STORE[1 - seat]) continue;
    b[i]++;
    n--;
  }

  /* 마지막 알이 내 빈 구덩이에 떨어지면 맞은편 것까지 가져온다. */
  if (ownsPit(seat, i) && b[i] === 1) {
    const across = PITS * 2 - i;
    if (b[across] > 0) {
      b[STORE[seat]] += b[across] + 1;
      b[across] = 0;
      b[i] = 0;
    }
  }
  return { board: b, last: i, again: i === STORE[seat] };
}

const sideEmpty = (b: number[], seat: number): boolean =>
  b.filter((_, i) => ownsPit(seat, i)).every((v) => v === 0);

export const mancala: GameDef<MancalaState, MancalaAction> = {
  id: 'mancala',
  seats: [2, 2],
  rounds: 1,

  init() {
    const board = new Array(14).fill(SEEDS);
    board[STORE[0]] = 0;
    board[STORE[1]] = 0;
    return { board, turn: 0, last: -1, over: false };
  },

  canAct(s, seat) {
    return !s.over && s.turn === seat;
  },

  reduce(s, a, seat) {
    if (s.over || s.turn !== seat) return s;
    const pit = a?.pit;
    if (!Number.isInteger(pit) || !ownsPit(seat, pit)) return s;
    if (s.board[pit] === 0) return s;

    const r = sow(s.board, seat, pit);
    let board = r.board;

    /* 한쪽이 비면 나머지는 그쪽 임자가 다 가져가고 끝난다(원래 규칙). */
    const done = sideEmpty(board, 0) || sideEmpty(board, 1);
    if (done) {
      board = board.slice();
      for (let i = 0; i < 14; i++) {
        if (i === STORE[0] || i === STORE[1]) continue;
        board[ownsPit(0, i) ? STORE[0] : STORE[1]] += board[i];
        board[i] = 0;
      }
    }

    /* 마지막 알이 내 창고에 떨어졌으면 한 번 더. */
    return { board, turn: r.again && !done ? seat : 1 - seat, last: r.last, over: done };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    const a = s.board[STORE[0]];
    const b = s.board[STORE[1]];
    if (a === b) return { over: true, scores: [0, 0], note: { key: 'arcade.man.draw', params: { n: String(a) } } };
    const win = a > b ? 0 : 1;
    return {
      over: true,
      scores: win === 0 ? [1, 0] : [0, 1],
      note: {
        key: 'arcade.man.win',
        params: { who: ctx.seats[win]?.name ?? '', a: String(Math.max(a, b)), b: String(Math.min(a, b)) }
      }
    };
  },

  bot(s, seat): BotMove<MancalaAction> | null {
    if (s.over || s.turn !== seat) return null;
    const pits = s.board.map((v, i) => ({ v, i })).filter(({ v, i }) => ownsPit(seat, i) && v > 0);
    if (!pits.length) return null;

    /* 한 번 더 두게 되는 수를 제일 좋아하고, 그다음은 창고에 많이 담기는 수. */
    const value = ({ i }: { i: number }): number => {
      const r = sow(s.board, seat, i);
      const gain = r.board[STORE[seat]] - s.board[STORE[seat]];
      return (r.again ? 20 : 0) + gain * 2 + Math.random();
    };
    const best = pits.reduce((x, y) => (value(y) > value(x) ? y : x), pits[0]);
    return { action: { pit: best.i }, delayMs: 600 + Math.random() * 600 };
  }
};
