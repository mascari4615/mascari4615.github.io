/**
 * 화투 짝맞추기. 같은 달끼리 가져온다 (TASK-KL-242)
 *
 * 클럽하우스 51 의 화투 자리. 고스톱까지 가면 규칙이 스무 줄인데, 그 뿌리인
 * **같은 달 두 장을 가져오는 것**만 남기면 세 줄이면 끝나고 재미는 거의 그대로다.
 *
 * 한 수의 모양이 또 새롭다: **내 패 한 장 + 바닥 한 장**을 함께 고른다(둘 중 하나만으로는
 * 수가 성립하지 않는다). 그래서 화면이 고른 뒤 고르기를 받아야 한다.
 *
 * 낼 수 있는 짝이 없으면 그냥 버린다. 버리는 것도 수라서 못 낸다고 막히지 않는다.
 */
import type { GameDef, BotMove, Outcome } from '../types';
import { shuffle } from '../rng';

/** 열두 달 × 넉 장 = 48장. 달과 **끗수**를 쓴다(그림은 화면이 붙인다) */
const MONTHS = 12;
const PER = 4;
/**
 * 손패 장수. 레퍼런스(코이코이)는 두 사람에 여덟 장, 바닥 여덟 장
 * 우리는 넷까지 앉으므로 자리 수로 나눔. 마흔여덟 장이 한계
 */
const handSize = (seats: number): number => (seats <= 2 ? 8 : seats === 3 ? 7 : 6);
const FLOOR = 8;

/**
 * 카드 끗수. 레퍼런스: 광 다섯 장 20점, 열끗 아홉 장 10점, 띠 열 장 5점, 피 스물넉 장 1점
 * 우리는 한 달에 넉 장이라 **자리로** 정한다. 0 번째가 그 달의 으뜸, 3 번째가 피
 * 광이 있는 달은 정해져 있다(1월 솔, 3월 벚, 8월 억새, 11월 오동, 12월 버들)
 */
const LIGHT_MONTHS = [0, 2, 7, 10, 11];
export function pointOf(card: number): number {
  const month = card >> 2;
  const slot = card & 3;
  if (slot === 0) return LIGHT_MONTHS.includes(month) ? 20 : 10;
  if (slot === 1) return 5;
  return 1;
}
/** 같은 달인가. 카드 번호에서 달만 뗀다 */
export const monthOf = (card: number): number => card >> 2;

/**
 * 족보(야쿠). 레퍼런스 코이코이의 기본 족보를 끗수 위에 얹는다 (감사 D3, 2026-09-03)
 * - 광: 석 장 5, 넉 장 8, 다섯 장 15 (비광 구분 없음. 한 달에 넉 장인 우리 패라 비광이 없음)
 * - 열끗(동물): 다섯 장 1, 한 장 늘 때마다 1
 * - 띠: 다섯 장 1, 한 장 늘 때마다 1
 * - 피: 열 장 1, 한 장 늘 때마다 1
 * 새 족보가 생기거나 커질 때 멈추기/코이코이 선택
 */
export function yakuOf(taken: readonly number[]): Array<{ key: string; n: number; pts: number }> {
  let lights = 0;
  let animals = 0;
  let ribbons = 0;
  let plains = 0;
  for (const c of taken) {
    const slot = c & 3;
    if (slot === 0) {
      if (LIGHT_MONTHS.includes(c >> 2)) lights += 1;
      else animals += 1;
    } else if (slot === 1) ribbons += 1;
    else plains += 1;
  }
  const out: Array<{ key: string; n: number; pts: number }> = [];
  if (lights >= 3) out.push({ key: 'lights', n: lights, pts: lights >= 5 ? 15 : lights === 4 ? 8 : 5 });
  if (animals >= 5) out.push({ key: 'animals', n: animals, pts: 1 + (animals - 5) });
  if (ribbons >= 5) out.push({ key: 'ribbons', n: ribbons, pts: 1 + (ribbons - 5) });
  if (plains >= 10) out.push({ key: 'plains', n: plains, pts: 1 + (plains - 10) });
  return out;
}

export const yakuPoints = (taken: readonly number[]): number => yakuOf(taken).reduce((sum, yaku) => sum + yaku.pts, 0);

export interface HanafudaState {
  /** 자리별 손패 (달 번호). 남의 것은 `redact` 가 지운다 */
  hands: number[][];
  /** 바닥에 깔린 것 */
  floor: number[];
  deck: number[];
  /** 자리별로 가져간 것 */
  taken: number[][];
  /** 마지막으로 코이코이 결정을 마친 족보 점수 */
  claimed: number[];
  /** 자리별 코이코이 선언 횟수 */
  koi: number[];
  /** 새 족보를 만든 사람이 멈출지 계속할지 고르는 중 */
  pending: { seat: number; pts: number } | null;
  turn: number;
  over: boolean;
}

/** 옛 복기에는 kind 없는 play가 남아 있으므로 play의 kind는 선택 값이다. */
export type HanafudaAction =
  | { kind?: 'play'; hand: number; floor: number }
  | { kind: 'koi'; continue: boolean };

export const hanafuda: GameDef<HanafudaState, HanafudaAction> = {
  id: 'hanafuda',
  seats: [2, 4],
  rounds: 1,

  init(ctx) {
    /* 카드 번호는 달 * 4 + 자리. 자리가 끗수를 정한다 */
    const deck: number[] = [];
    for (let m = 0; m < MONTHS; m++) for (let k = 0; k < PER; k++) deck.push(m * PER + k);
    const mixed = shuffle(ctx.rng, deck);
    const n = handSize(ctx.seats.length);
    const hands = ctx.seats.map(() => mixed.splice(0, n));
    const floor = mixed.splice(0, FLOOR);
    return {
      hands,
      floor,
      deck: mixed,
      taken: ctx.seats.map(() => []),
      claimed: ctx.seats.map(() => 0),
      koi: ctx.seats.map(() => 0),
      pending: null,
      turn: 0,
      over: false
    };
  },

  redact(s, seat) {
    return {
      ...s,
      hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => -1))),
      deck: s.deck.map(() => -1)
    };
  },

  canAct(s, seat) {
    if (s.over) return false;
    if (s.pending) return s.pending.seat === seat;
    return s.turn === seat && (s.hands[seat]?.length ?? 0) > 0;
  },

  reduce(s, a, seat, ctx) {
    if (s.over) return s;
    if (s.pending) {
      if (s.pending.seat !== seat || a?.kind !== 'koi') return s;
      if (!a.continue) return { ...s, pending: null, over: true };
      const claimed = s.claimed.map((n, i) => (i === seat ? s.pending?.pts ?? n : n));
      const koi = s.koi.map((n, i) => (i === seat ? n + 1 : n));
      return { ...s, claimed, koi, pending: null };
    }
    if (a?.kind === 'koi' || s.turn !== seat) return s;
    const hand = s.hands[seat];
    if (!hand?.length) return s;
    const hi = a?.hand;
    if (!Number.isInteger(hi) || hi < 0 || hi >= hand.length) return s;

    const card = hand[hi];
    const fi = a.floor;
    const matching = fi >= 0 && fi < s.floor.length && monthOf(s.floor[fi]) === monthOf(card);
    /* 짝이 있는데 굳이 버리는 것은 막지 않는다. 손에 남길지 버릴지는 그 사람 판단이다. */
    if (fi >= 0 && !matching) return s;

    const hands = s.hands.map((h, i) => (i === seat ? h.filter((_, k) => k !== hi) : h));
    let floor = s.floor.slice();
    const taken = s.taken.map((t) => t.slice());

    if (matching) {
      taken[seat].push(card, floor[fi]);
      floor.splice(fi, 1);
    } else {
      floor.push(card);
    }

    /* 낸 뒤 더미에서 한 장 뒤집는다. 그것도 짝이 맞으면 같이 가져간다(원래 놀이 그대로). */
    const deck = s.deck.slice();
    const flip = deck.shift();
    if (flip !== undefined) {
      const k = floor.findIndex((c) => monthOf(c) === monthOf(flip));
      if (k >= 0) {
        taken[seat].push(flip, floor[k]);
        floor = floor.filter((_, j) => j !== k);
      } else {
        floor.push(flip);
      }
    }

    const over = hands.every((h) => h.length === 0);
    const pts = yakuPoints(taken[seat]);
    const pending = !over && pts > yakuPoints(s.taken[seat]) && pts > (s.claimed[seat] ?? 0)
      ? { seat, pts }
      : null;
    const seats = ctx.seats.length;
    return { ...s, hands, floor, deck, taken, pending, turn: (seat + 1) % seats, over };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    /* 장수가 아니라 끗수. 광 스무 끗과 피 한 끗이 같은 값이면 고를 것이 없다. 족보 점수는 그 위에 */
    const scores = s.taken.map((t) => t.reduce((a2, c) => a2 + pointOf(c), 0) + yakuOf(t).reduce((a2, y) => a2 + y.pts, 0));
    const top = Math.max(...scores);
    const winners = ctx.seats.filter((_, i) => scores[i] === top);
    return {
      over: true,
      scores,
      note: { key: 'arcade.hana.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat, ctx): BotMove<HanafudaAction> | null {
    if (s.over) return null;
    if (s.pending) {
      if (s.pending.seat !== seat) return null;
      const cardsLeft = s.hands.reduce((sum, hand) => sum + hand.length, 0);
      return { action: { kind: 'koi', continue: s.pending.pts < 5 && cardsLeft > 4 }, delayMs: 700 + ctx.rng() * 600 };
    }
    if (s.turn !== seat) return null;
    const hand = s.hands[seat] ?? [];
    if (!hand.length) return null;
    /* 짝이 있으면 가져간다. 없으면 제일 흔한 달을 버린다(쓸 데가 남아 있을 확률이 낮다). */
    /* 짝이 있으면 가져가되 **제일 값진 것부터**. 광을 두고 피를 집는 봇은 안 된다 */
    let best = -1;
    let bestV = -1;
    for (let i = 0; i < hand.length; i++) {
      const k = s.floor.findIndex((c) => monthOf(c) === monthOf(hand[i]));
      if (k < 0) continue;
      const v = pointOf(hand[i]) + pointOf(s.floor[k]);
      if (v > bestV) { bestV = v; best = i; }
    }
    if (best >= 0) {
      const k = s.floor.findIndex((c) => monthOf(c) === monthOf(hand[best]));
      return { action: { hand: best, floor: k }, delayMs: 700 + ctx.rng() * 600 };
    }
    /* 버릴 때는 제일 싼 것부터 */
    let cheap = 0;
    for (let i = 1; i < hand.length; i++) if (pointOf(hand[i]) < pointOf(hand[cheap])) cheap = i;
    return { action: { hand: cheap, floor: -1 }, delayMs: 700 + ctx.rng() * 600 };
  }
};
