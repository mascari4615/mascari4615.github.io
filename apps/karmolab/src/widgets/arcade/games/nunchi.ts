/**
 * 눈치 게임 — 겹치면 둘 다 죽는다 (TASK-KL-242)
 *
 * 한 줄 서기가 「남이 어떻게 답했을지」였다면 이건 **「남이 지금 무엇을 할지」**다.
 * 규칙은 하나: 아무 때나 다음 수를 외치되, **둘이 같은 순간에 같은 수를 외치면 둘 다 나간다.**
 *
 * 그래서 처음으로 「기다리는 것」과 「지르는 것」이 둘 다 위험한 판이 된다 — 늦으면 남이
 * 먼저 가져가고, 이르면 겹친다. 마지막에 남은 사람이 이기고, **끝까지 안 외친 사람도 진다**
 * (안 그러면 아무도 안 외치는 게 최선이 된다).
 */
import type { GameDef, BotMove, Outcome } from '../types';

/** 몇까지 세나 */
const COUNT = 8;
/** 이 시간 안에 외친 것은 「같은 순간」으로 본다 */
const SAME_MS = 260;
const LIMIT_MS = 25000;

export interface NunchiState {
  /** 다음에 외칠 수 */
  next: number;
  /** 자리별로 살아 있나 */
  alive: boolean[];
  /** 이번 수를 외친 사람들과 그 시각 */
  pending: Array<{ seat: number; at: number }>;
  /** 무슨 일이 있었나 — 화면이 한 줄로 */
  log: Array<{ n: number; seats: number[]; clash: boolean }>;
  endsAt: number;
  over: boolean;
}

export type NunchiAction = { kind: 'call' };

const aliveCount = (s: NunchiState): number => s.alive.filter(Boolean).length;

export const nunchi: GameDef<NunchiState, NunchiAction> = {
  id: 'nunchi',
  seats: [2, 6],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return {
      next: 1,
      alive: ctx.seats.map(() => true),
      pending: [],
      log: [],
      endsAt: ctx.now + LIMIT_MS,
      over: false
    };
  },

  canAct(s, seat) {
    return !s.over && s.alive[seat] && !s.pending.some((p) => p.seat === seat);
  },

  reduce(s, a, seat, ctx) {
    if (s.over || !s.alive[seat] || a?.kind !== 'call') return s;
    if (s.pending.some((p) => p.seat === seat)) return s;
    /* 외친 것은 바로 처리하지 않는다 — 「같은 순간」인지 보려면 잠깐 기다려야 한다. */
    return { ...s, pending: [...s.pending, { seat, at: ctx.now }] };
  },

  tick(s, ctx) {
    if (s.over) return s;

    if (ctx.now >= s.endsAt) {
      /* 시간이 다 됐다 — 아직 살아 있고 한 번도 안 외친 사람은 진다. */
      return { ...s, over: true };
    }

    if (!s.pending.length) return s;
    const first = s.pending[0];
    /* 첫 외침으로부터 잠깐 기다렸다가 판정한다. */
    if (ctx.now < first.at + SAME_MS) return s;

    const together = s.pending.filter((p) => p.at <= first.at + SAME_MS).map((p) => p.seat);
    const rest = s.pending.filter((p) => p.at > first.at + SAME_MS);

    if (together.length > 1) {
      /* 겹쳤다 — 그 사람들 다 나간다. */
      const alive = s.alive.map((v, i) => (together.includes(i) ? false : v));
      const log = [...s.log.slice(-6), { n: s.next, seats: together, clash: true }];
      const left = alive.filter(Boolean).length;
      return { ...s, alive, pending: rest, log, over: left <= 1 || s.next >= COUNT };
    }

    /* 혼자 외쳤다 — 그 사람이 그 수를 가져가고 다음 수로 넘어간다. */
    const log = [...s.log.slice(-6), { n: s.next, seats: together, clash: false }];
    const next = s.next + 1;
    return { ...s, next, pending: rest, log, over: next > COUNT || aliveCount(s) <= 1 };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    const alive = ctx.seats.filter((_, i) => s.alive[i]);
    /* 마지막까지 남은 사람들이 이긴다. 다 나갔으면 아무도 못 가져간다. */
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (s.alive[i] ? 1 : 0)),
      note: alive.length
        ? { key: 'arcade.nunchi.win', params: { who: alive.map((w) => w.name).join(', ') } }
        : { key: 'arcade.nunchi.none' }
    };
  },

  bot(s, seat): BotMove<NunchiAction> | null {
    if (s.over || !s.alive[seat]) return null;
    if (s.pending.some((p) => p.seat === seat)) return null;
    /* 봇마다 성격이 다르다 — 다 같은 때에 외치면 늘 겹쳐 판이 안 굴러간다.
       자리 번호로 기다리는 버릇을 갈라 두고, 거기에 흔들림을 얹는다. */
    const habit = 260 + seat * 190;
    return { action: { kind: 'call' }, delayMs: habit + Math.random() * 900 };
  }
};
