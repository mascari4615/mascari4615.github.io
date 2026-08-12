/**
 * 돌 가져가기 — 마지막 하나를 남기지 마라 (TASK-KL-242)
 *
 * 이 놀이에는 **완벽한 수가 있다**(님-합). 그래서 봇을 제대로 만들면 사람이 한 판도 못 이긴다 —
 * 여기서 처음으로 「봇이 얼마나 잘해야 하는가」가 규칙만큼 중요한 문제가 된다.
 *
 * 골라 둔 답: **봇은 정답을 알지만 다섯 번 중 한 번쯤 흘린다.** 아예 못하게 만들면 이기는 맛이
 * 없고, 늘 정확하면 이길 방법이 없다. 「가끔 실수하는 고수」가 제일 오래 재밌다.
 *
 * 마지막 돌을 **가져가는 쪽이 진다**(미제르 규칙). 그래야 마지막 순간에 셈이 뒤집혀 더 재밌다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

export interface NimState {
  /** 줄마다 남은 돌 수 */
  rows: number[];
  turn: number;
  /** 진 자리 (아직이면 -1) */
  lost: number;
}

export type NimAction = { row: number; take: number };

/** 님-합 — 이 값이 0 이면 지금 두는 쪽이 불리하다. */
const nimSum = (rows: number[]): number => rows.reduce((a, b) => a ^ b, 0);

const total = (rows: number[]): number => rows.reduce((a, b) => a + b, 0);
/** 두 개 이상 남은 줄의 수 — 미제르 규칙은 끝판에서 셈이 뒤집힌다. */
const bigRows = (rows: number[]): number => rows.filter((n) => n > 1).length;

export const nim: GameDef<NimState, NimAction> = {
  id: 'nim',
  seats: [2, 2],
  rounds: 1,

  init(ctx) {
    /* 줄 수와 길이를 씨앗으로 흔든다 — 매번 같은 판이면 외운 사람이 늘 이긴다. */
    const rows = [1, 3, 5, 7].map((n) => Math.max(1, n + Math.floor(ctx.rng() * 3) - 1));
    return { rows, turn: 0, lost: -1 };
  },

  canAct(s, seat) {
    return s.lost === -1 && s.turn === seat;
  },

  reduce(s, a, seat) {
    if (s.lost !== -1 || s.turn !== seat) return s;
    const row = a?.row;
    const take = a?.take;
    if (typeof row !== 'number' || typeof take !== 'number') return s;
    if (row < 0 || row >= s.rows.length) return s;
    if (take < 1 || take > s.rows[row]) return s;

    const rows = s.rows.map((n, i) => (i === row ? n - take : n));
    /* 마지막 하나를 가져간 쪽이 진다. */
    const lost = total(rows) === 0 ? seat : -1;
    return { rows, turn: 1 - seat, lost };
  },

  outcome(s, ctx): Outcome {
    if (s.lost === -1) return { over: false };
    const win = 1 - s.lost;
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === win ? 1 : 0)),
      note: { key: 'arcade.nim.win', params: { who: ctx.seats[win]?.name ?? '' } }
    };
  },

  bot(s, seat): BotMove<NimAction> | null {
    if (s.lost !== -1 || s.turn !== seat) return null;
    const rows = s.rows;
    const any = rows.map((n, i) => ({ n, i })).filter((r) => r.n > 0);
    if (!any.length) return null;

    const slip = Math.random() < 0.2;
    const random = (): NimAction => {
      const r = any[Math.floor(Math.random() * any.length)];
      return { row: r.i, take: 1 + Math.floor(Math.random() * r.n) };
    };
    if (slip) return { action: random(), delayMs: 600 + Math.random() * 600 };

    /* 끝판(두 개 이상 남은 줄이 없다) — 미제르에서는 **홀수 개의 줄을 남기는** 쪽이 이긴다. */
    if (bigRows(rows) === 0) {
      /* 남는 줄이 홀수가 되게 하나 가져간다 — 미제르에서는 그쪽이 이긴다. */
      const r = any[0];
      return { action: { row: r.i, take: 1 }, delayMs: 600 + Math.random() * 500 };
    }

    /* 보통 판 — 님-합을 0 으로 만드는 수를 찾는다. 없으면 아무거나(이미 진 자리다). */
    const target = nimSum(rows);
    if (target !== 0) {
      for (const { n, i } of any) {
        const want = n ^ target;
        if (want < n) return { action: { row: i, take: n - want }, delayMs: 700 + Math.random() * 500 };
      }
    }
    return { action: random(), delayMs: 700 + Math.random() * 500 };
  }
};
