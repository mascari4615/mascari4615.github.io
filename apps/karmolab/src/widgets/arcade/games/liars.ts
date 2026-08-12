/**
 * 거짓말 주사위 — 부르거나, 거짓말이라 하거나 (TASK-KL-242)
 *
 * 스물여섯 개가 전부 **정직한** 놀이였다. 여기서 처음으로 **속이는 것이 규칙 안에 있다** —
 * 자기 주사위만 보고 「판 전체에 O 이 N개 있다」고 부르는데, 그 말이 참일 필요가 없다.
 *
 * 커널에게는 새로울 게 없다: 감추는 것은 `redact` 가 이미 하고, 부르는 말은 그냥 수다.
 * 다만 **거짓말이 성립하려면 남의 주사위가 진짜로 안 보여야** 하고, 그건 이 커널이
 * 자리마다 다른 판을 보내기 때문에 공짜로 된다.
 *
 * 진 사람은 주사위를 하나 잃는다. 다 잃으면 떨어진다. 마지막 하나가 이긴다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

const START_DICE = 4;
const FACES = 6;

export interface LiarsState {
  /** 자리별 주사위 눈 (남의 것은 `redact` 가 지운다) */
  dice: number[][];
  /** 지금 걸린 말 — 「눈 face 가 count 개 이상」 */
  bid: { face: number; count: number } | null;
  /** 누가 그 말을 했나 */
  bidder: number;
  turn: number;
  /** 살아 있는 자리 */
  alive: boolean[];
  /** 방금 벌어진 일 — 화면이 한 줄로 말한다 */
  last: { kind: 'bid' | 'call'; who: number; text: string } | null;
  /** 판정을 보여 주는 동안 */
  showAt: number;
}

export type LiarsAction = { kind: 'bid'; face: number; count: number } | { kind: 'call' };

const aliveCount = (s: LiarsState): number => s.alive.filter(Boolean).length;

function nextAlive(s: LiarsState, from: number): number {
  for (let k = 1; k <= s.alive.length; k++) {
    const i = (from + k) % s.alive.length;
    if (s.alive[i]) return i;
  }
  return from;
}

/** 판 전체에 그 눈이 몇 개인가. 1 은 아무 눈이나 된다(원래 놀이 그대로). */
function countFace(dice: number[][], face: number): number {
  return dice.flat().filter((d) => d === face || d === 1).length;
}

function roll(rng: () => number, n: number): number[] {
  return Array.from({ length: n }, () => Math.floor(rng() * FACES) + 1);
}

export const liars: GameDef<LiarsState, LiarsAction> = {
  id: 'liars',
  seats: [2, 4],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return {
      dice: ctx.seats.map(() => roll(ctx.rng, START_DICE)),
      bid: null,
      bidder: -1,
      turn: 0,
      alive: ctx.seats.map(() => true),
      last: null,
      showAt: 0
    };
  },

  /** 남의 주사위는 안 보인다 — 이게 없으면 속일 수가 없다. */
  redact(s, seat) {
    if (s.showAt !== 0) return s; /* 판정 중에는 다 보여 준다 */
    return { ...s, dice: s.dice.map((d, i) => (i === seat ? d : d.map(() => 0))) };
  },

  canAct(s, seat) {
    return s.showAt === 0 && s.alive[seat] && s.turn === seat && aliveCount(s) > 1;
  },

  reduce(s, a, seat, ctx) {
    if (s.showAt !== 0 || !s.alive[seat] || s.turn !== seat) return s;

    if (a?.kind === 'bid') {
      const face = a.face;
      const count = a.count;
      if (!Number.isInteger(face) || face < 2 || face > FACES) return s;
      if (!Number.isInteger(count) || count < 1) return s;
      /* 앞말보다 세야 한다 — 개수가 많거나, 개수가 같고 눈이 높거나. */
      if (s.bid && !(count > s.bid.count || (count === s.bid.count && face > s.bid.face))) return s;
      return {
        ...s,
        bid: { face, count },
        bidder: seat,
        turn: nextAlive(s, seat),
        last: { kind: 'bid', who: seat, text: `${count}×${face}` }
      };
    }

    if (a?.kind !== 'call') return s;
    if (!s.bid || s.bidder < 0) return s;

    /* 「거짓말이다」 — 세어 본다. 말이 참이면 부른 사람이, 거짓이면 말한 사람이 잃는다. */
    const real = countFace(s.dice, s.bid.face);
    const truth = real >= s.bid.count;
    const loser = truth ? seat : s.bidder;
    const dice = s.dice.map((d, i) => (i === loser ? d.slice(0, Math.max(0, d.length - 1)) : d));
    const alive = s.alive.map((v, i) => (i === loser ? dice[i].length > 0 : v));
    return {
      ...s,
      dice,
      alive,
      last: { kind: 'call', who: seat, text: `${real}` },
      showAt: ctx.now + 3000,
      turn: alive[loser] ? loser : nextAlive({ ...s, alive }, loser)
    };
  },

  /** 판정을 보여 준 뒤 다시 굴린다. */
  tick(s, ctx) {
    if (s.showAt === 0 || ctx.now < s.showAt) return s;
    if (aliveCount(s) <= 1) return { ...s, showAt: 0 };
    return {
      ...s,
      dice: s.dice.map((d) => roll(ctx.rng, d.length)),
      bid: null,
      bidder: -1,
      showAt: 0,
      last: null
    };
  },

  outcome(s, ctx): Outcome {
    if (aliveCount(s) > 1) return { over: false };
    const win = s.alive.findIndex(Boolean);
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === win ? 1 : 0)),
      note: { key: 'arcade.liars.win', params: { who: ctx.seats[win]?.name ?? '' } }
    };
  },

  bot(s, seat): BotMove<LiarsAction> | null {
    if (s.showAt !== 0 || !s.alive[seat] || s.turn !== seat || aliveCount(s) <= 1) return null;
    const mine = s.dice[seat] ?? [];
    const total = s.dice.reduce((n, d) => n + d.length, 0);

    if (!s.bid) {
      /* 첫 말 — 내 주사위에 많은 눈으로 조심스럽게 부른다. */
      const counts = new Array(FACES + 1).fill(0);
      for (const d of mine) if (d !== 1) counts[d]++;
      let face = 2;
      for (let f = 2; f <= FACES; f++) if (counts[f] >= counts[face]) face = f;
      return { action: { kind: 'bid', face, count: Math.max(1, counts[face]) }, delayMs: 800 + Math.random() * 700 };
    }

    /* 내 손에 있는 것 + 남들에게 기대되는 수(3분의 1쯤)로 어림한다. */
    const mineHas = mine.filter((d) => d === s.bid!.face || d === 1).length;
    const others = total - mine.length;
    const expect = mineHas + others / 3;
    if (s.bid.count > expect + 1.2) return { action: { kind: 'call' }, delayMs: 800 + Math.random() * 700 };

    return {
      action: { kind: 'bid', face: s.bid.face, count: s.bid.count + 1 },
      delayMs: 800 + Math.random() * 700
    };
  }
};
