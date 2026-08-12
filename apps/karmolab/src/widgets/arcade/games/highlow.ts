/**
 * 하이로우 — 다음 장이 위냐 아래냐 (TASK-KL-242)
 *
 * 규칙이 한 줄인 놀이. 그런데 **그만둘 때를 고르는 것**이 진짜 수다 — 이어 맞힐수록 점수가
 * 배로 커지고, 한 번 틀리면 그 판에 쌓은 것이 다 날아간다. 「한 장만 더」가 이 놀이 전부다.
 *
 * 각자 제 더미로 친다(남과 안 부딪힌다). 세 판씩 하고 합이 큰 쪽이 이긴다.
 * 여럿이 해도 차례를 기다릴 뿐이라 셋넷이 붙어도 지루하지 않다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

const ROUNDS_PER_SEAT = 3;

export interface HighLowState {
  /** 지금 보이는 카드 (1~13) */
  card: number;
  /** 방금 뒤집힌 카드 — 맞았는지 보여 주고 다음으로 넘어간다 */
  shown: number;
  /** 이번 판에 쌓은 점수 */
  pot: number;
  /** 자리별 챙긴 점수 */
  banked: number[];
  /** 자리별 남은 판 수 */
  left: number[];
  turn: number;
  /** 방금 결과 — 0 없음, 1 맞음, -1 틀림 */
  last: number;
}

export type HighLowAction = { kind: 'high' } | { kind: 'low' } | { kind: 'bank' };

const draw = (rng: () => number): number => Math.floor(rng() * 13) + 1;

export const highlow: GameDef<HighLowState, HighLowAction> = {
  id: 'highlow',
  seats: [1, 4],
  rounds: 1,

  init(ctx) {
    return {
      card: draw(ctx.rng),
      shown: 0,
      pot: 0,
      banked: ctx.seats.map(() => 0),
      left: ctx.seats.map(() => ROUNDS_PER_SEAT),
      turn: 0,
      last: 0
    };
  },

  canAct(s, seat) {
    return s.turn === seat && (s.left[seat] ?? 0) > 0;
  },

  reduce(s, a, seat, ctx) {
    if (s.turn !== seat || (s.left[seat] ?? 0) <= 0) return s;
    const seats = ctx.seats.length;
    const nextSeat = (): number => {
      for (let k = 1; k <= seats; k++) {
        const i = (seat + k) % seats;
        if ((s.left[i] ?? 0) > 0) return i;
      }
      return seat;
    };

    if (a?.kind === 'bank') {
      /* 챙기고 다음 판으로. 쌓은 게 없으면 챙길 것도 없다. */
      if (s.pot === 0) return s;
      const banked = s.banked.map((v, i) => (i === seat ? v + s.pot : v));
      const left = s.left.map((v, i) => (i === seat ? v - 1 : v));
      return { ...s, banked, left, pot: 0, shown: 0, last: 0, card: draw(ctx.rng), turn: left[seat] > 0 ? nextSeat() : nextSeat() };
    }

    if (a?.kind !== 'high' && a?.kind !== 'low') return s;

    const next = draw(ctx.rng);
    /* 같은 수는 맞은 것으로 친다 — 안 그러면 「아무것도 아닌 실패」가 생겨 억울하다. */
    const ok = next === s.card || (a.kind === 'high' ? next > s.card : next < s.card);

    if (ok) {
      /* 맞힐수록 배로 — 「한 장만 더」가 이 놀이의 심장이다. */
      return { ...s, card: next, shown: next, pot: s.pot === 0 ? 1 : s.pot * 2, last: 1 };
    }

    /* 틀리면 쌓은 것이 다 날아가고 그 판은 끝. */
    const left = s.left.map((v, i) => (i === seat ? v - 1 : v));
    return { ...s, card: draw(ctx.rng), shown: next, pot: 0, left, last: -1, turn: nextSeat() };
  },

  outcome(s, ctx): Outcome {
    if (s.left.some((n) => n > 0)) return { over: false };
    const top = Math.max(...s.banked);
    const winners = ctx.seats.filter((_, i) => s.banked[i] === top);
    return {
      over: true,
      scores: s.banked,
      note:
        winners.length === ctx.seats.length
          ? { key: 'arcade.highlow.draw', params: { n: String(top) } }
          : { key: 'arcade.highlow.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat): BotMove<HighLowAction> | null {
    if (s.turn !== seat || (s.left[seat] ?? 0) <= 0) return null;
    /* 쌓인 게 커지면 챙긴다 — 사람도 대개 그렇게 한다. */
    if (s.pot >= 8) return { action: { kind: 'bank' }, delayMs: 700 + Math.random() * 500 };
    /* 7 보다 낮으면 위, 높으면 아래. 반반이면 아무거나. */
    const kind = s.card < 7 ? 'high' : s.card > 7 ? 'low' : Math.random() < 0.5 ? 'high' : 'low';
    return { action: { kind }, delayMs: 600 + Math.random() * 600 };
  }
};
