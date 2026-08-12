/**
 * 낚시 — 기다렸다가, 당긴다 (TASK-KL-242)
 *
 * 다트가 「흔들리는 겨눔을 멈추는」 놀이였다면 이건 **기다리는 놀이**다. 아무 일도 안 일어나는
 * 동안 손가락을 참는 것이 수고, 입질이 오면 짧은 창 안에 당겨야 한다.
 *
 * 그래서 이 게임에서만 **아무것도 안 하는 것이 옳은 때가 있다.** 앞의 서른은 늘 뭔가 할 수
 * 있었다(못 두면 그건 막힌 것이었다). 여기서는 「지금은 가만히 있는 게 맞다」가 규칙이다.
 *
 * 씨앗으로 정해진 시각에 입질이 온다 — 난수로 그때그때 뽑으면 창마다 다른 때에 물어
 * 여럿이 할 때 「내가 본 것」과 「맞은 것」이 갈린다(다트에서 배운 자리).
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

/** 몇 마리까지 잡나 */
const CASTS = 5;
/** 입질이 온 뒤 이 안에 당겨야 한다 */
const WINDOW_MS = 900;

export interface Fish {
  /** 이름 번호 (화면이 말 묶음에서 꺼낸다) */
  kind: number;
  /** 크기 = 점수 */
  size: number;
}

export interface FishState {
  /** 자리별로 잡은 것 */
  caught: Fish[][];
  /** 자리별 남은 기회 */
  left: number[];
  /** 자리별: 지금 드리운 줄이 물리는 시각 (0 = 안 드리움) */
  biteAt: number[];
  /** 자리별: 이번에 걸릴 물고기 */
  next: Fish[];
  /** 자리별 마지막 결과 — 1 잡음, -1 놓침, 0 없음 */
  last: number[];
  over: boolean;
}

export type FishAction = { kind: 'cast' } | { kind: 'pull' };

/** 물고기 종류 수 — 화면이 넣어 준다. */
let KINDS = 5;
export function useFishKinds(n: number): void {
  KINDS = Math.max(1, n);
}

function rollFish(rng: () => number): Fish {
  const kind = Math.floor(rng() * KINDS);
  /* 작은 것이 흔하고 큰 것이 드물다 — 세제곱으로 눌러 준다. */
  const r = rng();
  return { kind, size: Math.max(1, Math.round(r * r * r * 40) + 1) };
}

export const fishing: GameDef<FishState, FishAction> = {
  id: 'fishing',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx: GameCtx) {
    return {
      caught: ctx.seats.map(() => []),
      left: ctx.seats.map(() => CASTS),
      biteAt: ctx.seats.map(() => 0),
      next: ctx.seats.map(() => rollFish(ctx.rng)),
      last: ctx.seats.map(() => 0),
      over: false
    };
  },

  canAct(s, seat) {
    return !s.over && (s.left[seat] ?? 0) > 0;
  },

  reduce(s, a, seat, ctx) {
    if (s.over || (s.left[seat] ?? 0) <= 0) return s;

    if (a?.kind === 'cast') {
      if (s.biteAt[seat] !== 0) return s;
      /* 1.2초에서 4.5초 사이에 문다. 언제인지는 **미리 정해 둔다** — 그래야 모두가 같은 때를 본다. */
      const wait = 1200 + ctx.rng() * 3300;
      return {
        ...s,
        biteAt: s.biteAt.map((v, i) => (i === seat ? ctx.now + wait : v)),
        last: s.last.map((v, i) => (i === seat ? 0 : v))
      };
    }

    if (a?.kind !== 'pull') return s;
    const bite = s.biteAt[seat];
    if (bite === 0) return s;

    const ok = ctx.now >= bite && ctx.now <= bite + WINDOW_MS;
    const caught = ok
      ? s.caught.map((c, i) => (i === seat ? [...c, s.next[seat]] : c))
      : s.caught;
    const left = s.left.map((v, i) => (i === seat ? v - 1 : v));
    const over = left.every((n) => n <= 0);
    return {
      ...s,
      caught,
      left,
      over,
      biteAt: s.biteAt.map((v, i) => (i === seat ? 0 : v)),
      next: s.next.map((f, i) => (i === seat ? rollFish(ctx.rng) : f)),
      last: s.last.map((v, i) => (i === seat ? (ok ? 1 : -1) : v))
    };
  },

  /** 창을 놓치면 물고기가 달아난다 — 안 당기고 버티는 것도 실패다. */
  tick(s, ctx) {
    if (s.over) return s;
    let changed = false;
    const biteAt = s.biteAt.slice();
    const left = s.left.slice();
    const last = s.last.slice();
    const next = s.next.slice();
    s.biteAt.forEach((b, i) => {
      if (b === 0 || ctx.now <= b + WINDOW_MS) return;
      changed = true;
      biteAt[i] = 0;
      left[i] = Math.max(0, left[i] - 1);
      last[i] = -1;
      next[i] = rollFish(ctx.rng);
    });
    if (!changed) return s;
    return { ...s, biteAt, left, last, next, over: left.every((n) => n <= 0) };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    const scores = s.caught.map((c) => c.reduce((a, f) => a + f.size, 0));
    const top = Math.max(...scores);
    const winners = ctx.seats.filter((_, i) => scores[i] === top);
    return {
      over: true,
      scores,
      note: { key: 'arcade.fish.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat, ctx): BotMove<FishAction> | null {
    if (s.over || (s.left[seat] ?? 0) <= 0) return null;
    if (s.biteAt[seat] === 0) return { action: { kind: 'cast' }, delayMs: 600 + Math.random() * 600 };
    /* 입질까지 기다렸다가 당긴다. 사람처럼 조금 늦고, 가끔 너무 이르다. */
    const wait = Math.max(0, s.biteAt[seat] - ctx.now);
    const early = Math.random() < 0.18;
    return {
      action: { kind: 'pull' },
      delayMs: early ? Math.max(0, wait - 500 - Math.random() * 600) : wait + 150 + Math.random() * 500
    };
  }
};
