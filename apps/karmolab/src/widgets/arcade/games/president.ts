/**
 * 대부호. 같은 수를 같은 장수로, 더 높게 (TASK-KL-242)
 *
 * 여럿이 하는 카드 놀이의 뼈대다. 앞의 스피드가 둘이서 실시간이었다면 이건 **셋넷이 차례로**,
 * 그리고 **한 수가 카드 여러 장**이다. 커널이 한 수 = 값 하나를 가정하지 않는다는 마지막 증명.
 *
 * 간추린 규칙: 낸 사람이 정한 장수를 맞춰야 하고, 수는 더 높아야 한다. 못 내면 넘긴다.
 * 나만 빼고 다 넘기면 판이 비고, 내가 새로 시작한다. **손이 먼저 비는 사람이 대부호.**
 *
 * 2 가 제일 세다(원래 놀이 그대로). 1(A) 다음이 아니라 맨 위다. 그 한 줄이 판을 뒤집는 재미다.
 *
 * 레퍼런스(pagat, 위키, 2026-09-01 조사)의 두 규칙을 넣었다. 이 놀이를 이 놀이답게 하는 것들
 *  - **혁명**. 같은 수 넉 장 이상을 한 번에 내면 세기가 뒤집힘. 또 나오면 되돌아옴
 *  - **8 자르기**. 8 을 내면 그 자리에서 판이 걷히고 낸 사람이 다시 시작(잇기에는 안 통함)
 */
import type { GameDef, BotMove, Outcome } from '../types';
import { shuffle } from '../rng';

/** 세기 순서. 3 이 제일 약하고 2 가 제일 세다. 혁명 중이면 뒤집힌다 */
export const power = (rank: number, rev = false): number => {
  const base = rank === 2 ? 15 : rank === 1 ? 14 : rank;
  return rev ? -base : base;
};

/** 혁명이 되는 장수. 레퍼런스는 넉 장 이상 */
const REVOLUTION = 4;
/** 판을 걷는 수. 8 을 내면 그 자리에서 끝난다 */
const CUT = 8;

export interface PresidentState {
  /** 자리별 손패 (남의 것은 `redact` 가 지운다) */
  hands: number[][];
  /** 지금 판에 깔린 것. 없으면 아무 장수나 시작할 수 있다 */
  pile: { rank: number; count: number } | null;
  /** 마지막으로 낸 자리 */
  leader: number;
  turn: number;
  /** 자리별로 이번 판을 넘겼나 */
  passed: boolean[];
  /** 손이 빈 차례대로 */
  out: number[];
  /** 혁명 중인가. 세기가 뒤집힌 상태 */
  rev: boolean;
  /** 방금 무슨 일이 있었나. 화면이 알린다. 시각으로 같은 일을 두 번 안 말하게 */
  bang?: { kind: 'rev' | 'unrev' | 'cut'; by: number; at: number };
}

export type PresidentAction = { kind: 'play'; rank: number; count: number } | { kind: 'pass' };

const countOf = (hand: number[], rank: number): number => hand.filter((c) => c === rank).length;

/** 지금 낼 수 있는 수, 장수 조합. */
export function options(s: PresidentState, seat: number): Array<{ rank: number; count: number }> {
  const hand = s.hands[seat] ?? [];
  const out: Array<{ rank: number; count: number }> = [];
  const ranks = [...new Set(hand)];
  for (const r of ranks) {
    const have = countOf(hand, r);
    if (!s.pile) {
      for (let n = 1; n <= have; n++) out.push({ rank: r, count: n });
    } else if (have >= s.pile.count && power(r, s.rev) > power(s.pile.rank, s.rev)) {
      out.push({ rank: r, count: s.pile.count });
    }
  }
  return out;
}

/** 다음에 둘 사람. 이미 손이 빈 사람은 건너뛴다. */
function nextSeat(s: PresidentState, from: number, seats: number): number {
  for (let k = 1; k <= seats; k++) {
    const i = (from + k) % seats;
    if ((s.hands[i]?.length ?? 0) > 0) return i;
  }
  return from;
}

export const president: GameDef<PresidentState, PresidentAction> = {
  id: 'president',
  seats: [3, 4],
  rounds: 1,

  init(ctx) {
    const deck: number[] = [];
    for (let r = 1; r <= 13; r++) for (let k = 0; k < 4; k++) deck.push(r);
    const mixed = shuffle(ctx.rng, deck);
    const n = ctx.seats.length;
    const hands = ctx.seats.map((_, i) =>
      mixed.filter((_, k) => k % n === i).sort((a, b) => power(a) - power(b))
    );
    /* 3 을 가진 사람이 먼저 낸다. 누가 시작할지 규칙으로 정해야 매번 같다. */
    const first = hands.findIndex((h) => h.includes(3));
    return {
      hands,
      pile: null,
      leader: first < 0 ? 0 : first,
      turn: first < 0 ? 0 : first,
      passed: ctx.seats.map(() => false),
      out: [],
      rev: false
    };
  },

  redact(s, seat) {
    return { ...s, hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => 0))) };
  },

  canAct(s, seat) {
    return s.out.length === 0 && s.turn === seat && (s.hands[seat]?.length ?? 0) > 0;
  },

  reduce(s, a, seat, ctx) {
    if (s.out.length > 0 || s.turn !== seat) return s;
    const hand = s.hands[seat];
    if (!hand || !hand.length) return s;
    const seats = ctx.seats.length;

    if (a?.kind === 'pass') {
      const passed = s.passed.map((v, i) => (i === seat ? true : v));
      const turn = nextSeat(s, seat, seats);
      /* 낸 사람 차례로 돌아왔으면 판이 비고 그 사람이 새로 시작한다. */
      if (turn === s.leader) {
        return { ...s, pile: null, passed: s.passed.map(() => false), turn };
      }
      return { ...s, passed, turn };
    }

    if (a?.kind !== 'play') return s;
    const { rank, count } = a;
    if (typeof rank !== 'number' || typeof count !== 'number' || count < 1) return s;
    if (!options(s, seat).some((o) => o.rank === rank && o.count === count)) return s;

    let left = count;
    const rest = hand.filter((c) => {
      if (c === rank && left > 0) { left--; return false; }
      return true;
    });
    const hands = s.hands.map((h, i) => (i === seat ? rest : h));
    const out = rest.length === 0 ? [...s.out, seat] : s.out;
    const at = ctx.now;

    /* 혁명. 넉 장 이상이면 세기가 뒤집힌다. 판은 그대로 이어진다 */
    const rev = count >= REVOLUTION ? !s.rev : s.rev;
    const bang: PresidentState['bang'] =
      count >= REVOLUTION ? { kind: s.rev ? 'unrev' : 'rev', by: seat, at } : rank === CUT ? { kind: 'cut', by: seat, at } : undefined;

    /* 8 자르기. 판을 걷고 낸 사람이 다시 시작한다. 손이 비었으면 다음 사람 */
    if (rank === CUT) {
      const base = { ...s, hands, pile: null, leader: seat, passed: s.passed.map(() => false), out, rev, bang };
      const turn = rest.length === 0 ? nextSeat(base, seat, seats) : seat;
      return { ...base, turn };
    }

    const base = { ...s, hands, pile: { rank, count }, leader: seat, passed: s.passed.map(() => false), out, rev, bang };
    return { ...base, turn: nextSeat(base, seat, seats) };
  },

  outcome(s, ctx): Outcome {
    if (!s.out.length) return { over: false };
    const first = s.out[0];
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === first ? 1 : 0)),
      note: { key: 'arcade.president.win', params: { who: ctx.seats[first]?.name ?? '' } }
    };
  },

  bot(s, seat, ctx): BotMove<PresidentAction> | null {
    if (s.out.length > 0 || s.turn !== seat) return null;
    const opts = options(s, seat);
    if (!opts.length) return { action: { kind: 'pass' }, delayMs: 700 + ctx.rng() * 600 };

    /* 제일 약한 것부터 텀. 세게 나가면 당장은 이기지만 마지막에 쓸 카드가 없음
       다만 넉 장이 모이면 혁명. 약한 패만 남았을 때 판을 뒤집는 것이 이 놀이의 한 수 */
    const revChance = opts.filter((o) => o.count >= REVOLUTION);
    if (revChance.length && ctx.rng() < 0.7) {
      const pick = revChance[Math.floor(ctx.rng() * revChance.length)];
      return { action: { kind: 'play', ...pick }, delayMs: 800 + ctx.rng() * 600 };
    }
    const best = opts.reduce((a, b) => {
      const av = power(a.rank, s.rev) * 10 - a.count;
      const bv = power(b.rank, s.rev) * 10 - b.count;
      return bv < av ? b : a;
    }, opts[0]);
    return { action: { kind: 'play', ...best }, delayMs: 700 + ctx.rng() * 700 };
  }
};
