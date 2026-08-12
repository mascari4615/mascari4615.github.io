/**
 * 따내기 바둑 — 먼저 다섯 점을 잡는다 (TASK-KL-242)
 *
 * 바둑을 오락실에 넣는 법. 집 세기는 처음 온 사람에게 설명하기 어렵고, 끝내는 시점도 애매하다
 * (「둘 데가 없다」가 아니라 「더 둘 이유가 없다」라서 사람이 합의해야 끝난다).
 *
 * 그래서 **잡기만 남긴다.** 활로가 막히면 잡히고, 다섯 점을 먼저 잡으면 이긴다.
 * 규칙이 두 줄이 되고 끝이 눈에 보이는데, **활로·이음·자충** 같은 바둑의 알맹이는 그대로다.
 *
 * 패(같은 모양 되풀이)는 「방금 잡힌 자리에 바로 못 둔다」로 막는다 — 원래 규칙 그대로다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

export const N = 9;
const TARGET = 5;

export interface GoState {
  /** 0 빈 칸, 1·2 자리 번호+1 */
  board: number[];
  turn: number;
  /** 자리별 잡은 수 */
  caught: number[];
  /** 패 — 여기 바로 못 둔다 (없으면 -1) */
  ko: number;
  last: number;
  /** 서로 이어서 거른 횟수 */
  passes: number;
  won: number;
}

export type GoAction = { cell: number } | { kind: 'pass' };

const nbrs = (c: number): number[] => {
  const x = c % N;
  const y = Math.floor(c / N);
  const out: number[] = [];
  if (x > 0) out.push(c - 1);
  if (x < N - 1) out.push(c + 1);
  if (y > 0) out.push(c - N);
  if (y < N - 1) out.push(c + N);
  return out;
};

/** 그 돌이 속한 덩어리와 활로 수. 바둑의 전부가 이 함수에 있다. */
export function group(board: number[], c: number): { stones: number[]; liberties: number } {
  const who = board[c];
  const seen = new Set<number>([c]);
  const stack = [c];
  const libs = new Set<number>();
  while (stack.length) {
    const at = stack.pop() as number;
    for (const n of nbrs(at)) {
      if (board[n] === 0) libs.add(n);
      else if (board[n] === who && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return { stones: [...seen], liberties: libs.size };
}

/** 그 자리에 두면 어떻게 되나. 못 두는 수면 `null`. */
export function tryPlay(s: GoState, cell: number, seat: number): { board: number[]; taken: number[]; ko: number } | null {
  if (cell < 0 || cell >= N * N || s.board[cell] !== 0 || cell === s.ko) return null;
  const who = seat + 1;
  const board = s.board.slice();
  board[cell] = who;

  /* 먼저 상대 덩어리를 따낸다. */
  const taken: number[] = [];
  for (const n of nbrs(cell)) {
    if (board[n] && board[n] !== who) {
      const g = group(board, n);
      if (g.liberties === 0) {
        for (const st of g.stones) {
          board[st] = 0;
          taken.push(st);
        }
      }
    }
  }

  /* 따낸 게 없는데 내 덩어리가 숨을 못 쉬면 그건 자살수 — 못 둔다. */
  if (!taken.length && group(board, cell).liberties === 0) return null;

  /* 한 점만 따냈고 내 돌도 한 점이면 패 — 그 자리에 바로 되받아 못 둔다. */
  const ko = taken.length === 1 && group(board, cell).stones.length === 1 ? taken[0] : -1;
  return { board, taken, ko };
}

export const capturego: GameDef<GoState, GoAction> = {
  id: 'capturego',
  seats: [2, 2],
  rounds: 1,

  init() {
    return {
      board: new Array(N * N).fill(0),
      turn: 0,
      caught: [0, 0],
      ko: -1,
      last: -1,
      passes: 0,
      won: -1
    };
  },

  canAct(s, seat) {
    return s.won === -1 && s.turn === seat;
  },

  reduce(s, a, seat) {
    if (s.won !== -1 || s.turn !== seat) return s;

    if ((a as { kind?: string })?.kind === 'pass') {
      const passes = s.passes + 1;
      /* 둘 다 거르면 그때까지 많이 잡은 쪽이 이긴다. */
      if (passes >= 2) {
        const win = s.caught[0] === s.caught[1] ? -2 : s.caught[0] > s.caught[1] ? 0 : 1;
        return { ...s, passes, won: win };
      }
      return { ...s, passes, turn: 1 - seat, ko: -1 };
    }

    const cell = (a as { cell?: number })?.cell;
    if (!Number.isInteger(cell)) return s;
    const r = tryPlay(s, cell as number, seat);
    if (!r) return s;

    const caught = s.caught.map((v, i) => (i === seat ? v + r.taken.length : v));
    const won = caught[seat] >= TARGET ? seat : -1;
    return { board: r.board, turn: 1 - seat, caught, ko: r.ko, last: cell as number, passes: 0, won };
  },

  outcome(s, ctx): Outcome {
    if (s.won === -1) return { over: false };
    if (s.won === -2) {
      return { over: true, scores: [0, 0], note: { key: 'arcade.go.draw', params: { n: String(s.caught[0]) } } };
    }
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === s.won ? 1 : 0)),
      note: { key: 'arcade.go.win', params: { who: ctx.seats[s.won]?.name ?? '', n: String(s.caught[s.won]) } }
    };
  },

  bot(s, seat): BotMove<GoAction> | null {
    if (s.won !== -1 || s.turn !== seat) return null;
    const me = seat + 1;
    const foe = 2 - seat;

    let best = -1;
    let bestV = -Infinity;
    for (let c = 0; c < N * N; c++) {
      const r = tryPlay(s, c, seat);
      if (!r) continue;
      let v = r.taken.length * 30;
      /* 내 돌이 잡히기 직전이면 살린다. */
      for (const n of nbrs(c)) {
        if (s.board[n] === me && group(s.board, n).liberties === 1) v += 20;
        if (s.board[n] === foe && group(s.board, n).liberties === 1) v += 15;
        if (s.board[n] === foe) v += 2;
      }
      /* 가장자리보다 가운데가 낫다. */
      const x = c % N;
      const y = Math.floor(c / N);
      v += Math.min(x, N - 1 - x, y, N - 1 - y);
      v += Math.random();
      if (v > bestV) { bestV = v; best = c; }
    }
    if (best < 0) return { action: { kind: 'pass' }, delayMs: 600 };
    return { action: { cell: best }, delayMs: 600 + Math.random() * 700 };
  }
};
