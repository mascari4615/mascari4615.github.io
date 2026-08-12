/**
 * 두더지 잡기 — 나오는 대로 두드린다 (TASK-KL-242)
 *
 * 반응 측정이 「고르는」 놀이였다면 이건 **때리는** 놀이다. 고를 것이 없고, 나온 자리를
 * 나오는 동안 누르면 된다 — 그래서 판이 시끄럽고 여럿이 붙으면 서로 먼저 치려고 싸운다.
 *
 * 언제 어디서 나올지는 **씨앗으로 미리 정해 둔다.** 그때그때 뽑으면 창마다 다른 곳에서
 * 튀어나와 「내가 친 것」과 「맞은 것」이 갈린다(다트·낚시에서 배운 자리).
 *
 * 가끔 **때리면 안 되는 것**이 섞인다. 안 그러면 아무 데나 마구 두드리는 게 최선이 된다.
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

export const HOLES = 9;
const LIMIT_MS = 30000;
/** 하나가 나와 있는 시간 */
const UP_MS = 900;
/** 다음 것이 나오기까지 (판이 갈수록 짧아진다) */
const GAP_MS = 700;

export interface Mole {
  /** 어느 구멍 */
  hole: number;
  /** 나오는 시각 */
  at: number;
  /** 때리면 안 되는 것 */
  bad: boolean;
}

export interface WhackState {
  moles: Mole[];
  /** 이미 처리된 두더지 번호 → 때린 자리 (-1 = 놓침) */
  hit: number[];
  score: number[];
  endsAt: number;
  since: number;
  over: boolean;
}

export type WhackAction = { hole: number };

function makeMoles(ctx: GameCtx, n: number): Mole[] {
  const out: Mole[] = [];
  let t = 600;
  for (let i = 0; i < n; i++) {
    out.push({
      hole: Math.floor(ctx.rng() * HOLES),
      at: t,
      /* 다섯에 하나쯤은 때리면 안 되는 것 */
      bad: ctx.rng() < 0.2
    });
    t += Math.max(280, GAP_MS - i * 12) + ctx.rng() * 200;
  }
  return out;
}

/** 지금 나와 있는 두더지 번호들. 화면·봇·규칙이 같은 함수를 본다. */
export function upNow(s: WhackState, now: number): number[] {
  const t = now - s.since;
  return s.moles
    .map((m, i) => ({ m, i }))
    .filter(({ m, i }) => s.hit[i] === undefined && t >= m.at && t <= m.at + UP_MS)
    .map(({ i }) => i);
}

export const whack: GameDef<WhackState, WhackAction> = {
  id: 'whack',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return {
      moles: makeMoles(ctx, 26),
      hit: [],
      score: ctx.seats.map(() => 0),
      endsAt: ctx.now + LIMIT_MS,
      since: ctx.now,
      over: false
    };
  },

  canAct(s) {
    return !s.over;
  },

  reduce(s, a, seat, ctx) {
    if (s.over) return s;
    const hole = a?.hole;
    if (!Number.isInteger(hole) || hole < 0 || hole >= HOLES) return s;

    const up = upNow(s, ctx.now).filter((i) => s.moles[i].hole === hole);
    if (!up.length) return s;
    const i = up[0];

    const hit = s.hit.slice();
    hit[i] = seat;
    /* 때리면 안 되는 것을 치면 깎인다 — 마구 두드리는 게 최선이 되면 안 된다. */
    const gain = s.moles[i].bad ? -2 : 1;
    const score = s.score.map((v, k) => (k === seat ? v + gain : v));
    return { ...s, hit, score };
  },

  tick(s, ctx) {
    if (s.over) return s;
    const t = ctx.now - s.since;
    /* 지나간 것은 「놓침」으로 닫는다 — 안 닫으면 늦게 눌러도 맞는다. */
    let hit = s.hit;
    s.moles.forEach((m, i) => {
      if (hit[i] === undefined && t > m.at + UP_MS) {
        if (hit === s.hit) hit = s.hit.slice();
        hit[i] = -1;
      }
    });
    const done = ctx.now >= s.endsAt || hit.length >= s.moles.length;
    if (hit === s.hit && !done) return s;
    return { ...s, hit, over: done && hit.filter((v) => v !== undefined).length >= s.moles.length };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    const top = Math.max(...s.score);
    const winners = ctx.seats.filter((_, i) => s.score[i] === top);
    return {
      over: true,
      scores: s.score.map((v) => Math.max(0, v)),
      note: { key: 'arcade.whack.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat, ctx): BotMove<WhackAction> | null {
    if (s.over) return null;
    const up = upNow(s, ctx.now);
    /* 나와 있는 게 없으면 다음 것을 기다린다 — 아무 데나 치지 않는다(사람과 같은 조건). */
    if (!up.length) return null;
    const pick = up[0];
    /* 때리면 안 되는 것도 가끔 친다. 늘 알아보면 사람이 못 이긴다. */
    if (s.moles[pick].bad && Math.random() < 0.75) return null;
    return { action: { hole: s.moles[pick].hole }, delayMs: 220 + Math.random() * 380 };
  }
};
