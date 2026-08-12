/**
 * 스피드 — 차례가 없다. 먼저 내는 사람이 임자다 (TASK-KL-242)
 *
 * 커널의 네 번째 모서리: **실시간 + 숨은 패**를 동시에 쓴다. 반응 측정은 실시간이지만 감출 게
 * 없었고, 숫자 야구는 감추지만 시간이 안 흘렀다. 카드 놀이는 둘 다다 — 그래서 이걸 넣었다.
 *
 * 규칙(간추림): 각자 제 더미에서 다섯 장을 들고, 가운데 두 자리 중 **한 끗 위아래**면 아무 때나
 * 낸다. 내면 제 더미에서 한 장 채운다. 양쪽 다 낼 게 없으면 가운데를 새로 깐다.
 * 손과 더미가 먼저 비는 쪽이 이긴다.
 *
 * 막힘 판정을 시간으로 하지 않는다 — 「몇 초 안에 아무도 안 내면」으로 하면 느린 사람이 손해다.
 * **낼 수 있는 수가 정말 0일 때만** 새로 깐다(계산으로 안다).
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';
import { shuffle } from '../rng';

/** 손에 드는 수. 다섯이면 화면에 한 줄로 들어가고 고를 거리도 생긴다. */
const HAND = 5;
/** 끗 수 (1~13). 1과 13은 서로 이웃이다 — 그래야 판이 안 막힌다. */
const RANKS = 13;

export interface SpeedState {
  /** 자리별 남은 더미 (숫자만 — 무늬는 안 쓴다) */
  decks: number[][];
  /** 자리별 손패 */
  hands: number[][];
  /** 가운데 두 자리 */
  center: [number, number];
  /** 이긴 자리 (아직이면 -1) */
  won: number;
  /** 마지막으로 낸 사람 (화면이 반짝일 자리). 없으면 -1 */
  last: number;
}

export type SpeedAction = { card: number; pile: number };

/** 한 끗 차이인가 — 1과 13도 이웃으로 본다. */
export function near(a: number, b: number): boolean {
  const d = Math.abs(a - b);
  return d === 1 || d === RANKS - 1;
}

const canPlayAny = (hand: number[], center: [number, number]): boolean =>
  hand.some((c) => center.some((p) => near(c, p)));

export const speed: GameDef<SpeedState, SpeedAction> = {
  id: 'speed',
  seats: [2, 2],
  rounds: 1,
  realtime: true,

  init(ctx: GameCtx) {
    /* 한 벌을 반씩 나눈다. 같은 끗이 네 장씩 있어야 막히는 판이 적다. */
    const deck: number[] = [];
    for (let r = 1; r <= RANKS; r++) for (let k = 0; k < 4; k++) deck.push(r);
    const mixed = shuffle(ctx.rng, deck);
    const half = Math.floor(mixed.length / 2);
    const piles = [mixed.slice(0, half), mixed.slice(half)];
    const hands = piles.map((p) => p.splice(0, HAND));
    return {
      decks: piles,
      hands,
      center: [piles[0].pop() ?? 1, piles[1].pop() ?? 7] as [number, number],
      won: -1,
      last: -1
    };
  },

  /** 남의 손패는 남의 것이다. 몇 장인지만 남긴다(0 으로 채워 길이를 보존). */
  redact(s, seat) {
    return {
      ...s,
      hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => 0))),
      decks: s.decks.map((d, i) => (i === seat ? d : d.map(() => 0)))
    };
  },

  reduce(s, a, seat) {
    if (s.won !== -1) return s;
    const hand = s.hands[seat];
    if (!hand) return s;
    const idx = typeof a?.card === 'number' ? a.card : -1;
    const pile = typeof a?.pile === 'number' ? a.pile : -1;
    if (idx < 0 || idx >= hand.length || pile < 0 || pile > 1) return s;
    if (!near(hand[idx], s.center[pile])) return s;

    const center: [number, number] = [...s.center] as [number, number];
    center[pile] = hand[idx];

    const decks = s.decks.map((d) => d.slice());
    const hands = s.hands.map((h) => h.slice());
    hands[seat].splice(idx, 1);
    const drawn = decks[seat].pop();
    if (drawn !== undefined) hands[seat].push(drawn);

    const won = hands[seat].length === 0 && decks[seat].length === 0 ? seat : -1;
    return { decks, hands, center, won, last: seat };
  },

  /** 양쪽 다 낼 게 없으면 가운데를 새로 깐다 — 시간이 아니라 **셈**으로 안다. */
  tick(s) {
    if (s.won !== -1) return s;
    if (s.hands.some((h, i) => canPlayAny(h, s.center) && s.decks[i] !== undefined)) return s;
    if (s.hands.some((h) => canPlayAny(h, s.center))) return s;

    const decks = s.decks.map((d) => d.slice());
    const a = decks[0].pop();
    const b = decks[1].pop();
    if (a === undefined || b === undefined) {
      /* 깔 카드도 없다 — 손이 적은 쪽이 이긴다. */
      const left = s.hands.map((h, i) => h.length + s.decks[i].length);
      return { ...s, won: left[0] <= left[1] ? 0 : 1 };
    }
    return { ...s, decks, center: [a, b] as [number, number] };
  },

  outcome(s, ctx): Outcome {
    if (s.won === -1) return { over: false };
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === s.won ? 1 : 0)),
      note: { key: 'arcade.speed.win', params: { who: ctx.seats[s.won]?.name ?? '' } }
    };
  },

  bot(s, seat): BotMove<SpeedAction> | null {
    if (s.won !== -1) return null;
    const hand = s.hands[seat] ?? [];
    for (let i = 0; i < hand.length; i++) {
      for (let p = 0; p < 2; p++) {
        if (near(hand[i], s.center[p])) {
          /* 사람이 손을 뻗을 틈은 준다 — 즉시 내면 사람은 한 장도 못 낸다. */
          return { action: { card: i, pile: p }, delayMs: 700 + Math.random() * 900 };
        }
      }
    }
    return null;
  }
};
