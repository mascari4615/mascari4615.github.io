/**
 * 기억 순서 — 한 칸씩 길어진다 (TASK-KL-242)
 *
 * 짝 맞추기가 「어디에 뭐가 있었나」였다면 이건 **「어떤 차례였나」**다. 자리는 넷뿐이라 볼 것은
 * 없고, 순서만 남는다 — 그래서 판이 길어질수록 화면은 그대로인데 사람만 힘들어진다.
 *
 * 여럿이 하는 법: **모두 같은 순서를 본다.** 틀리면 그 사람만 빠지고 나머지는 계속 간다 —
 * 마지막까지 남은 사람이 이긴다. 남의 실수를 보면서 내 차례를 기다리는 것도 재미다.
 *
 * 순서는 씨앗에서 나온다. 그때그때 뽑으면 창마다 다른 것을 보게 된다.
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

export const PADS = 4;
const MAX_LEN = 20;
/** 한 칸 보여 주는 시간 (판이 길어질수록 짧아진다) */
const SHOW_MS = 620;
const SHOW_MIN = 300;

export interface SimonState {
  /** 전체 순서 — 앞에서부터 `len` 개만 쓴다 */
  seq: number[];
  /** 이번 판의 길이 */
  len: number;
  /** 보여 주기가 시작된 시각 */
  since: number;
  /** 자리별로 지금까지 누른 수 */
  typed: number[];
  /** 자리별로 살아 있나 */
  alive: boolean[];
  over: boolean;
}

export type SimonAction = { pad: number };

/** 한 칸 보여 주는 시간 — 길수록 빠르다. */
export const showMs = (len: number): number => Math.max(SHOW_MIN, SHOW_MS - len * 18);

/** 지금 몇 번째 칸을 보여 주는 중인가. 다 보여 줬으면 -1. */
export function showing(s: SimonState, now: number): number {
  const step = showMs(s.len);
  const i = Math.floor((now - s.since) / step);
  return i < s.len ? i : -1;
}

export const simon: GameDef<SimonState, SimonAction> = {
  id: 'simon',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx: GameCtx) {
    return {
      seq: Array.from({ length: MAX_LEN }, () => Math.floor(ctx.rng() * PADS)),
      len: 1,
      since: ctx.now,
      typed: ctx.seats.map(() => 0),
      alive: ctx.seats.map(() => true),
      over: false
    };
  },

  canAct(s, seat) {
    return !s.over && s.alive[seat];
  },

  reduce(s, a, seat, ctx) {
    if (s.over || !s.alive[seat]) return s;
    /* 보여 주는 중에는 못 누른다 — 중간에 눌러 맞히면 기억할 이유가 없다. */
    if (showing(s, ctx.now) >= 0) return s;
    const pad = a?.pad;
    if (!Number.isInteger(pad) || pad < 0 || pad >= PADS) return s;

    const at = s.typed[seat];
    if (at >= s.len) return s;

    /* 틀리면 그 사람만 빠진다 — 나머지 판은 그대로 간다. */
    if (s.seq[at] !== pad) {
      const alive = s.alive.map((v, i) => (i === seat ? false : v));
      return { ...s, alive, over: alive.every((v) => !v) };
    }

    const typed = s.typed.map((v, i) => (i === seat ? v + 1 : v));
    /* 살아 있는 사람이 모두 다 쳤으면 한 칸 늘려 다시 보여 준다. */
    const doneAll = s.alive.every((ok, i) => !ok || typed[i] >= s.len);
    if (!doneAll) return { ...s, typed };

    if (s.len >= MAX_LEN) return { ...s, typed, over: true };
    return {
      ...s,
      typed: s.typed.map(() => 0),
      len: s.len + 1,
      since: ctx.now + 600
    };
  },

  tick(s) {
    return s;
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    /* 몇 칸까지 갔나 = 점수. 마지막까지 살아남은 사람이 이긴다. */
    const scores = ctx.seats.map((_, i) => (s.alive[i] ? s.len : Math.max(0, s.len - 1)));
    const alive = ctx.seats.filter((_, i) => s.alive[i]);
    return {
      over: true,
      scores,
      note: alive.length
        ? { key: 'arcade.simon.win', params: { who: alive.map((w) => w.name).join(', '), n: String(s.len) } }
        : { key: 'arcade.simon.out', params: { n: String(s.len) } }
    };
  },

  bot(s, seat, ctx): BotMove<SimonAction> | null {
    if (s.over || !s.alive[seat]) return null;
    if (showing(s, ctx.now) >= 0) return null;
    const at = s.typed[seat];
    if (at >= s.len) return null;
    /* 길어질수록 더 자주 틀린다 — 사람과 비슷하게. */
    const forget = Math.min(0.45, 0.02 + s.len * 0.035);
    const pad = Math.random() < forget ? Math.floor(Math.random() * PADS) : s.seq[at];
    return { action: { pad }, delayMs: 320 + Math.random() * 280 };
  }
};
