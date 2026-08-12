/**
 * 블랙잭 — 21에 가깝게, 넘으면 죽는다 (TASK-KL-242)
 *
 * 여기까지 온 게임들은 전부 **사람끼리** 붙었다. 이건 처음으로 **판 자체(딜러)와 붙는다** —
 * 자리에 앉지 않은 상대가 있는 셈이고, 그 상대는 규칙만으로 움직인다(17 이상이면 멈춘다).
 * 그래서 여럿이 해도 서로의 수가 남의 승패를 안 바꾼다. 차례가 없다 — 각자 자기 속도로 친다.
 *
 * **감출 카드를 아예 안 만든다.** 딜러의 두 번째 카드를 상태에 넣어 두면 주인 창에서는 보인다
 * (커널을 주인이 돌리므로). 대신 딜러는 **모두가 멈춘 뒤에 그 자리에서 뽑는다** — 감출 게 없으면
 * 새는 곳도 없다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

/** 1(A)~13. 10·J·Q·K 는 전부 10으로 센다. */
const draw = (rng: () => number): number => Math.floor(rng() * 13) + 1;

export interface BlackjackState {
  /** 자리별 손패 */
  hands: number[][];
  /** 자리별로 그만 쳤나 */
  stood: boolean[];
  /** 딜러가 처음 보여 주는 한 장 */
  up: number;
  /** 딜러가 다 뽑은 뒤의 손패. 아직이면 빈 배열 */
  dealer: number[];
  /** 딜러까지 끝났나 */
  settled: boolean;
}

export type BlackjackAction = { kind: 'hit' } | { kind: 'stand' };

/** A 를 11로 세되 넘치면 1로 내린다. */
export function total(hand: number[]): number {
  let sum = 0;
  let aces = 0;
  for (const c of hand) {
    const v = c === 1 ? 11 : Math.min(c, 10);
    if (c === 1) aces++;
    sum += v;
  }
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces--;
  }
  return sum;
}

const bust = (hand: number[]): boolean => total(hand) > 21;

export const blackjack: GameDef<BlackjackState, BlackjackAction> = {
  id: 'blackjack',
  seats: [1, 4],
  rounds: 3,

  init(ctx) {
    return {
      hands: ctx.seats.map(() => [draw(ctx.rng), draw(ctx.rng)]),
      stood: ctx.seats.map(() => false),
      up: draw(ctx.rng),
      dealer: [],
      settled: false
    };
  },

  canAct(s, seat) {
    return !s.settled && !s.stood[seat] && !bust(s.hands[seat] ?? []);
  },

  reduce(s, a, seat, ctx) {
    if (s.settled) return s;
    const hand = s.hands[seat];
    if (!hand || s.stood[seat] || bust(hand)) return s;

    let hands = s.hands;
    let stood = s.stood;

    if (a?.kind === 'hit') {
      const next = [...hand, draw(ctx.rng)];
      hands = s.hands.map((h, i) => (i === seat ? next : h));
      /* 넘으면 더 칠 수 없다 — 따로 멈추라고 시키지 않는다. */
      stood = bust(next) ? s.stood.map((v, i) => (i === seat ? true : v)) : s.stood;
    } else if (a?.kind === 'stand') {
      stood = s.stood.map((v, i) => (i === seat ? true : v));
    } else {
      return s;
    }

    if (!stood.every(Boolean)) return { ...s, hands, stood };

    /* 다 멈췄다 — 이제 딜러가 그 자리에서 뽑는다. 17 이상이면 멈춘다. */
    const dealer = [s.up, draw(ctx.rng)];
    while (total(dealer) < 17) dealer.push(draw(ctx.rng));
    return { ...s, hands, stood, dealer, settled: true };
  },

  outcome(s, ctx): Outcome {
    if (!s.settled) return { over: false };
    const dt = total(s.dealer);
    const scores = s.hands.map((h) => {
      const t = total(h);
      if (t > 21) return 0;
      if (dt > 21 || t > dt) return 1;
      return 0;
    });
    const winners = ctx.seats.filter((_, i) => scores[i] === 1);
    return {
      over: true,
      scores,
      note: winners.length
        ? { key: 'arcade.blackjack.win', params: { who: winners.map((w) => w.name).join(', '), n: String(dt) } }
        : { key: 'arcade.blackjack.house', params: { n: String(dt) } }
    };
  },

  bot(s, seat): BotMove<BlackjackAction> | null {
    if (s.settled || s.stood[seat]) return null;
    const hand = s.hands[seat];
    if (!hand || bust(hand)) return null;
    /* 딜러가 보여 준 카드가 세면 더 친다 — 카지노에서 쓰는 기본 표를 한 줄로 줄인 것. */
    const t = total(hand);
    const strong = s.up >= 7 || s.up === 1;
    const hit = t <= 11 || (t <= 16 && strong);
    return { action: { kind: hit ? 'hit' : 'stand' }, delayMs: 700 + Math.random() * 800 };
  }
};
