/**
 * 줄다리기 — 누르는 만큼 끌려온다 (TASK-KL-242)
 *
 * 마흔 개 중 제일 단순한 놀이. 수도 없고 판도 없다 — **누가 더 많이 누르나**뿐이다.
 * 그래서 여기서만 「어떻게 이길까」가 아니라 「얼마나 버틸까」가 문제가 된다.
 *
 * 다만 그냥 연타면 손가락 빠른 사람이 늘 이긴다. 그래서 **박자**를 넣었다:
 * 너무 빨리 누르면 힘이 덜 실린다(헛심). 사람 손이 낼 수 있는 가장 좋은 간격이 있고,
 * 그 간격을 찾는 것이 이 놀이의 유일한 수다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

/** 줄이 이만큼 끌려가면 끝 */
export const GOAL = 20;
const LIMIT_MS = 45000;
/** 이보다 빨리 누르면 헛심 */
const BEST_MS = 170;

export interface TugState {
  /** 줄 위치. 양수면 자리0 쪽 */
  rope: number;
  /** 자리별 마지막으로 누른 시각 */
  lastAt: number[];
  /** 자리별 헛심 낸 횟수 — 화면이 「너무 빠르다」를 알려 준다 */
  waste: number[];
  endsAt: number;
  over: boolean;
}

export type TugAction = { kind: 'pull' };

export const tug: GameDef<TugState, TugAction> = {
  id: 'tug',
  seats: [2, 2],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return {
      rope: 0,
      lastAt: ctx.seats.map(() => 0),
      waste: ctx.seats.map(() => 0),
      endsAt: ctx.now + LIMIT_MS,
      over: false
    };
  },

  canAct(s) {
    return !s.over;
  },

  reduce(s, a, seat, ctx) {
    if (s.over || a?.kind !== 'pull') return s;
    const gap = ctx.now - (s.lastAt[seat] || 0);
    const lastAt = s.lastAt.map((v, i) => (i === seat ? ctx.now : v));

    /* 너무 빠르면 헛심 — 연타 속도만으로 이기지 못하게. */
    if (gap < BEST_MS) {
      return { ...s, lastAt, waste: s.waste.map((v, i) => (i === seat ? v + 1 : v)) };
    }

    /* 박자가 좋을수록 세게 당겨진다. 아주 느리면 힘이 다시 준다(쉬는 동안 끌려간다). */
    const power = gap < BEST_MS * 2.2 ? 1 : 0.55;
    const dir = seat === 0 ? 1 : -1;
    const rope = s.rope + dir * power;
    return { ...s, rope, lastAt, over: Math.abs(rope) >= GOAL };
  },

  tick(s, ctx) {
    if (s.over) return s;
    if (ctx.now >= s.endsAt) return { ...s, over: true };
    return s;
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    if (Math.abs(s.rope) < 0.5) {
      return { over: true, scores: [0, 0], note: { key: 'arcade.tug.draw' } };
    }
    const win = s.rope > 0 ? 0 : 1;
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === win ? 1 : 0)),
      note: { key: 'arcade.tug.win', params: { who: ctx.seats[win]?.name ?? '' } }
    };
  },

  bot(s, seat): BotMove<TugAction> | null {
    if (s.over) return null;
    /* 봇은 박자를 거의 지킨다 — 다만 사람보다 살짝 늦다(사람이 이길 자리가 있어야 한다). */
    return { action: { kind: 'pull' }, delayMs: BEST_MS + 20 + Math.random() * 90 };
  }
};
