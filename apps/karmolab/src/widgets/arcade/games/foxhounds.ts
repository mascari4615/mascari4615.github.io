/**
 * 여우와 사냥개 — 힘이 다른 둘이 붙는다 (TASK-KL-242)
 *
 * 지금까지의 보드 게임은 전부 **양쪽이 같은 것**을 가졌다(같은 말, 같은 수). 이건 다르다:
 * 한쪽은 개 넷, 한쪽은 여우 하나. **이길 조건도 다르다** — 개는 가두면 이기고, 여우는 빠져나가면 이긴다.
 *
 * 그래서 처음으로 **자리에 따라 규칙이 다른** 판이 된다. 커널에는 새로울 게 없다(`canAct` 와
 * `reduce` 가 이미 자리를 받는다). 다만 화면이 「내가 여우인가 개인가」로 말을 바꿔야 한다.
 *
 * 개는 앞으로만, 여우는 아무 대각선으로. 8×8 어두운 칸만 쓴다(체커와 같은 판).
 */
import type { GameDef, BotMove, Outcome } from '../types';

export const N = 8;

export interface FoxState {
  /** 여우 자리 */
  fox: number;
  /** 개 넷 */
  hounds: number[];
  /** 0 = 여우 차례, 1 = 개 차례 */
  turn: number;
  /** 이긴 자리 (아직이면 -1) */
  won: number;
  /** 아무 일 없이 흐른 수 */
  idle: number;
}

export type FoxAction = { from: number; to: number };

const xy = (c: number): [number, number] => [c % N, Math.floor(c / N)];
const idx = (x: number, y: number): number => (x < 0 || y < 0 || x >= N || y >= N ? -1 : y * N + x);

/** 그 말이 갈 수 있는 곳. 여우(0)는 네 방향, 개(1)는 여우 쪽(위)으로만. */
export function moves(s: FoxState, from: number, seat: number): number[] {
  const [x, y] = xy(from);
  const dirs: Array<[number, number]> =
    seat === 0 ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, -1], [-1, -1]];
  const taken = new Set([s.fox, ...s.hounds]);
  return dirs
    .map(([dx, dy]) => idx(x + dx, y + dy))
    .filter((c) => c >= 0 && !taken.has(c));
}

export const foxhounds: GameDef<FoxState, FoxAction> = {
  id: 'foxhounds',
  seats: [2, 2],
  rounds: 1,

  init() {
    /* 개는 아래 끝 줄의 어두운 칸 넷, 여우는 위 끝 가운데. */
    const hounds = [1, 3, 5, 7].map((x) => idx(x, N - 1));
    return { fox: idx(4, 0), hounds, turn: 0, won: -1, idle: 0 };
  },

  canAct(s, seat) {
    return s.won === -1 && s.turn === seat;
  },

  reduce(s, a, seat) {
    if (s.won !== -1 || s.turn !== seat) return s;
    const { from, to } = a ?? {};
    if (!Number.isInteger(from) || !Number.isInteger(to)) return s;

    /* 여우 차례면 여우만, 개 차례면 개만 움직인다. */
    if (seat === 0 && from !== s.fox) return s;
    if (seat === 1 && !s.hounds.includes(from)) return s;
    if (!moves(s, from, seat).includes(to)) return s;

    const fox = seat === 0 ? to : s.fox;
    const hounds = seat === 1 ? s.hounds.map((h) => (h === from ? to : h)) : s.hounds;
    const next = { ...s, fox, hounds, turn: 1 - seat, idle: s.idle + 1 };

    /* 여우가 맨 아래 줄에 닿으면 빠져나간 것 — 여우 승. */
    if (Math.floor(fox / N) === N - 1) return { ...next, won: 0 };
    /* 여우가 갈 곳이 없으면 갇힌 것 — 개 승. */
    if (next.turn === 0 && moves(next, fox, 0).length === 0) return { ...next, won: 1 };
    /* 개도 갈 곳이 없으면(드물다) 여우 승. */
    if (next.turn === 1 && next.hounds.every((h) => moves(next, h, 1).length === 0)) {
      return { ...next, won: 0 };
    }
    /* 오래 끌면 개가 못 가둔 것으로 본다 — 여우가 도망만 다녀도 끝은 난다. */
    if (next.idle >= 120) return { ...next, won: 0 };
    return next;
  },

  outcome(s, ctx): Outcome {
    if (s.won === -1) return { over: false };
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === s.won ? 1 : 0)),
      note: {
        key: s.won === 0 ? 'arcade.fox.foxWin' : 'arcade.fox.houndWin',
        params: { who: ctx.seats[s.won]?.name ?? '' }
      }
    };
  },

  bot(s, seat): BotMove<FoxAction> | null {
    if (s.won !== -1 || s.turn !== seat) return null;

    if (seat === 0) {
      const can = moves(s, s.fox, 0);
      if (!can.length) return null;
      /* 여우는 아래로 파고든다. 막히면 옆으로. */
      const best = can.reduce((a, b) => (Math.floor(b / N) > Math.floor(a / N) ? b : a), can[0]);
      return { action: { from: s.fox, to: best }, delayMs: 600 + Math.random() * 600 };
    }

    /* 개는 줄을 흐트러뜨리지 않으면서 앞으로 — 한 마리만 튀어나가면 여우가 그 옆으로 샌다. */
    const all: Array<{ from: number; to: number; v: number }> = [];
    for (const h of s.hounds) {
      for (const to of moves(s, h, 1)) {
        const [, hy] = xy(h);
        const [, ty] = xy(to);
        const spread = s.hounds.map((x) => Math.floor(x / N)).reduce((a, b) => Math.max(a, b), 0)
          - s.hounds.map((x) => Math.floor(x / N)).reduce((a, b) => Math.min(a, b), N);
        void hy;
        /* 여우에 가까워지되 줄이 벌어지는 수는 덜 좋아한다. */
        const near = -Math.abs(Math.floor(s.fox / N) - ty);
        all.push({ from: h, to, v: near * 2 - spread + Math.random() });
      }
    }
    if (!all.length) return null;
    const best = all.reduce((a, b) => (b.v > a.v ? b : a), all[0]);
    return { action: { from: best.from, to: best.to }, delayMs: 600 + Math.random() * 600 };
  }
};
