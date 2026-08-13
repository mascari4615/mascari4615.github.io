/**
 * 윷놀이 — 지름길과 잡기 (TASK-KL-242)
 *
 * 주사위 게임인데 **던지는 것보다 고르는 것이 크다.** 나온 수는 어차피 하늘이 정하고, 판을
 * 가르는 건 「어느 말을 움직이나」다 — 지름길 모서리에 딱 세울지, 남을 잡으러 갈지.
 *
 * 판은 진짜 윷판 그대로다: 네모 스무 칸 + 모서리 둘에서 갈라지는 대각 지름길 둘. 지름길은
 * **딱 그 모서리에 멈췄을 때만** 열린다 — 지나가면서 타지는 못한다. 그게 윷놀이의 긴장 전부다.
 *
 * 말은 둘. 넷이면 한 판이 십 분을 넘고, 하나면 고를 것이 없어져 그냥 주사위가 된다.
 * 남을 잡으면 한 번 더 던진다 — 잡는 맛이 여기서 나온다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

/** 다 돌아 나간 말 */
export const OUT = 100;
/** 아직 안 들어온 말 */
export const HOME = -1;
const PIECES = 2;
/** 지름길이 갈라지는 모서리 */
const BRANCH = { 5: 20, 10: 25 } as const;

/**
 * 칸마다 다음 칸. 20~24 = 왼위 모서리에서 들어가는 대각(22 = 한가운데),
 * 25~28 = 왼아래 모서리에서 들어가는 더 짧은 대각(29 = 그 길로 지나는 한가운데).
 */
const NEXT: Record<number, number> = (() => {
  const n: Record<number, number> = {};
  for (let i = 0; i < 19; i++) n[i] = i + 1;
  n[19] = OUT;
  n[20] = 21; n[21] = 22; n[22] = 23; n[23] = 24; n[24] = 15;
  n[25] = 26; n[26] = 29; n[29] = 27; n[27] = 28; n[28] = OUT;
  return n;
})();

export interface YutState {
  /** 자리별 말 위치 */
  pos: number[][];
  turn: number;
  /** 던져서 나왔지만 아직 안 쓴 수 */
  pending: number[];
  /** 지금 던질 차례인가, 옮길 차례인가 */
  phase: 'throw' | 'move';
  /** 마지막에 나온 수 — 화면이 이름을 붙여 보여 준다 */
  rolled: number;
  /** 방금 잡혔나 (화면이 짚어 준다) */
  caught: boolean;
  won: number;
}

export type YutAction = { kind: 'throw' } | { kind: 'move'; piece: number };

/** 윷 네 짝을 던진다 — 넷 다 엎어지면 모(5), 아니면 젖혀진 수만큼. */
function roll(rng: () => number): number {
  let up = 0;
  for (let i = 0; i < 4; i++) if (rng() < 0.5) up++;
  return up === 0 ? 5 : up;
}

/** 말 하나를 n 칸 옮긴 자리. 지름길은 **출발 칸이 모서리일 때만** 탄다. */
function walk(from: number, n: number): number {
  let at = from;
  for (let step = 0; step < n; step++) {
    if (at === HOME) { at = 0; continue; }
    if (at >= OUT) return OUT;
    /* 첫 걸음에서만 갈림길을 본다 — 지나가면서 타지는 못한다. */
    const branch = step === 0 ? (BRANCH as Record<number, number>)[at] : undefined;
    at = branch !== undefined ? branch : NEXT[at] ?? OUT;
  }
  /* 한가운데에 딱 섰으면 더 짧은 쪽으로 빠진다. */
  return at === 22 ? 29 : at;
}

const done = (s: YutState, seat: number): boolean => s.pos[seat].every((p) => p >= OUT);

export const yut: GameDef<YutState, YutAction> = {
  id: 'yut',
  seats: [2, 4],
  rounds: 1,

  init(ctx) {
    return {
      pos: ctx.seats.map(() => new Array(PIECES).fill(HOME)),
      turn: 0,
      pending: [],
      phase: 'throw',
      rolled: 0,
      caught: false,
      won: -1
    };
  },

  canAct(s, seat) {
    return s.won === -1 && s.turn === seat;
  },

  reduce(s, a, seat, ctx) {
    if (s.won !== -1 || s.turn !== seat) return s;

    if (a?.kind === 'throw') {
      if (s.phase !== 'throw') return s;
      const v = roll(ctx.rng);
      const pending = [...s.pending, v];
      /* 윷(4)·모(5) 는 한 번 더 던진다. */
      return { ...s, pending, rolled: v, caught: false, phase: v >= 4 ? 'throw' : 'move' };
    }

    if (a?.kind !== 'move' || s.phase !== 'move' || !s.pending.length) return s;
    const piece = a.piece;
    if (!Number.isInteger(piece) || piece < 0 || piece >= PIECES) return s;
    const from = s.pos[seat][piece];
    if (from >= OUT) return s;

    const [use, ...rest] = s.pending;
    const to = walk(from, use);
    const pos = s.pos.map((row, i) => (i === seat ? row.map((p, k) => (k === piece ? to : p)) : row));

    /* 남의 말을 밟으면 집으로 보낸다 — 그리고 한 번 더 던진다. */
    let caught = false;
    if (to < OUT) {
      for (let i = 0; i < pos.length; i++) {
        if (i === seat) continue;
        pos[i] = pos[i].map((p) => {
          if (p !== to) return p;
          caught = true;
          return HOME;
        });
      }
    }

    const next: YutState = { ...s, pos, pending: rest, caught, rolled: 0 };
    if (done(next, seat)) { next.won = seat; return next; }
    if (caught) { next.phase = 'throw'; return next; }
    if (rest.length) { next.phase = 'move'; return next; }
    next.phase = 'throw';
    next.turn = (seat + 1) % s.pos.length;
    return next;
  },

  outcome(s, ctx): Outcome {
    if (s.won === -1) return { over: false };
    return {
      over: true,
      scores: ctx.seats.map((_, i) => s.pos[i].filter((p) => p >= OUT).length),
      note: { key: 'arcade.yut.win', params: { who: ctx.seats[s.won]?.name ?? '' } }
    };
  },

  bot(s, seat, ctx): BotMove<YutAction> | null {
    if (s.won !== -1 || s.turn !== seat) return null;
    if (s.phase === 'throw') return { action: { kind: 'throw' }, delayMs: 500 + ctx.rng() * 400 };
    const use = s.pending[0];
    if (use === undefined) return null;

    /* 잡을 수 있으면 잡는다. 아니면 제일 앞선 말을 민다 — 하나라도 빨리 빼는 게 낫다. */
    let best = -1;
    let bestScore = -Infinity;
    for (let p = 0; p < PIECES; p++) {
      const from = s.pos[seat][p];
      if (from >= OUT) continue;
      const to = walk(from, use);
      let score = to >= OUT ? 60 : to;
      for (let i = 0; i < s.pos.length; i++) {
        if (i !== seat && to < OUT && s.pos[i].includes(to)) score += 120;
      }
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best < 0) return null;
    return { action: { kind: 'move', piece: best }, delayMs: 500 + ctx.rng() * 500 };
  }
};
