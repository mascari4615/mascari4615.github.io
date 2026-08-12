/**
 * 경마 — 달리는 건 말, 고르는 건 나 (TASK-KL-242)
 *
 * 서른여덟 개 중 처음으로 **내가 판을 못 건드린다.** 말이 알아서 달리고, 사람이 하는 일은
 * 「어디에 걸까」뿐이다 — 그래서 수가 실력이 아니라 **읽기**다.
 *
 * 그냥 운으로 끝나지 않게 두 가지를 둔다:
 *  - 말마다 **성격이 다르다**(느리지만 꾸준한 말, 빠른데 들쭉날쭉한 말). 그 표는 다 보인다.
 *  - **배당이 성격을 따라간다** — 이길 것 같은 말은 적게 준다. 그러니 「이길 말」이 아니라
 *    **「사람들이 얕본 말」**을 찾는 게 이 놀이의 수다.
 *
 * 세 판. 걸 돈은 판마다 새로 준다(한 번 크게 잃어도 다음 판이 있다).
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

const HORSES = 5;
const TRACK = 24;
const ROUNDS = 3;
const PURSE = 100;
/** 한 걸음 나아가는 데 걸리는 시간 */
const STEP_MS = 260;

export interface Horse {
  /** 한 걸음에 나아가는 평균 */
  pace: number;
  /** 들쭉날쭉한 정도 */
  wild: number;
  at: number;
}

export interface DerbyState {
  horses: Horse[];
  /** 자리별 (말, 건 돈) — 아직 안 걸었으면 -1 */
  bet: Array<{ horse: number; amount: number } | null>;
  /** 자리별 딴 돈 */
  purse: number[];
  /** 달리기가 시작된 시각. 0 이면 아직 거는 중 */
  since: number;
  /** 이번 판 이긴 말 (아직이면 -1) */
  winner: number;
  round: number;
  /** 결과를 보여 주는 끝 시각 */
  showAt: number;
  over: boolean;
}

export type DerbyAction = { horse: number; amount: number };

/** 그 말이 이길 것 같은 정도 → 배당. 빠른 말일수록 적게 준다. */
export function odds(horses: Horse[], i: number): number {
  const total = horses.reduce((a, h) => a + h.pace, 0);
  const share = horses[i].pace / total;
  /* 배당 = 1/기대확률 을 조금 깎은 것(집 몫). 들쭉날쭉한 말은 조금 더 준다. */
  return Math.max(1.2, Math.round((0.86 / share + horses[i].wild * 1.5) * 10) / 10);
}

function makeHorses(ctx: GameCtx): Horse[] {
  return Array.from({ length: HORSES }, () => ({
    pace: 0.7 + ctx.rng() * 0.9,
    wild: Math.round(ctx.rng() * 10) / 10,
    at: 0
  }));
}

function newRound(ctx: GameCtx, round: number, purse: number[]): DerbyState {
  return {
    horses: makeHorses(ctx),
    bet: ctx.seats.map(() => null),
    purse,
    since: 0,
    winner: -1,
    round,
    showAt: 0,
    over: false
  };
}

export const derby: GameDef<DerbyState, DerbyAction> = {
  id: 'derby',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return newRound(ctx, 0, ctx.seats.map(() => 0));
  },

  canAct(s, seat) {
    return !s.over && s.since === 0 && s.bet[seat] === null;
  },

  reduce(s, a, seat, ctx) {
    if (s.over || s.since !== 0 || s.bet[seat] !== null) return s;
    const horse = a?.horse;
    const amount = a?.amount;
    if (!Number.isInteger(horse) || horse < 0 || horse >= HORSES) return s;
    if (typeof amount !== 'number' || !(amount > 0)) return s;
    const bet = s.bet.map((b, i) => (i === seat ? { horse, amount: Math.min(PURSE, Math.round(amount)) } : b));
    /* 다 걸면 출발한다. */
    return { ...s, bet, since: bet.every((b) => b !== null) ? ctx.now : 0 };
  },

  tick(s, ctx) {
    if (s.over) return s;

    if (s.showAt !== 0) {
      if (ctx.now < s.showAt) return s;
      if (s.round + 1 >= ROUNDS) return { ...s, over: true };
      return newRound(ctx, s.round + 1, s.purse);
    }

    if (s.since === 0 || s.winner !== -1) return s;

    /* 걸음 수는 **시각으로 정해진다** — 프레임에 맡기면 기기마다 다른 말이 이긴다. */
    const steps = Math.floor((ctx.now - s.since) / STEP_MS);
    const horses = s.horses.map((h, i) => {
      let at = 0;
      for (let k = 0; k < steps; k++) {
        /* 같은 씨앗·같은 걸음이면 같은 결과 — 판을 다시 그려도 경주가 안 바뀐다. */
        const r = Math.abs(Math.sin((i + 1) * 12.9898 + (k + 1) * 78.233 + s.round * 37.719)) % 1;
        at += Math.max(0.1, h.pace + (r - 0.5) * h.wild * 2);
      }
      return { ...h, at: Math.min(TRACK, at) };
    });

    const done = horses.findIndex((h) => h.at >= TRACK);
    if (done < 0) return { ...s, horses };

    /* 이긴 말이 나왔다 — 돈을 준다. */
    const purse = s.purse.map((v, i) => {
      const b = s.bet[i];
      if (!b) return v;
      return v + (b.horse === done ? Math.round(b.amount * odds(s.horses, b.horse)) : -b.amount);
    });
    return { ...s, horses, winner: done, purse, showAt: ctx.now + 3000 };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    const top = Math.max(...s.purse);
    const winners = ctx.seats.filter((_, i) => s.purse[i] === top);
    return {
      over: true,
      scores: s.purse.map((v) => Math.max(0, v)),
      note: { key: 'arcade.derby.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat): BotMove<DerbyAction> | null {
    if (s.over || s.since !== 0 || s.bet[seat] !== null) return null;
    /* 봇은 배당이 큰 말을 좋아한다 — 사람과 다른 쪽에 걸어야 판이 재밌다. */
    const pick = s.horses
      .map((_, i) => ({ i, o: odds(s.horses, i) }))
      .sort((a, b) => b.o - a.o)[Math.floor(Math.random() * 2)];
    const amount = 20 + Math.floor(Math.random() * 40);
    return { action: { horse: pick.i, amount }, delayMs: 800 + Math.random() * 800 };
  }
};
