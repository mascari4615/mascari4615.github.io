/**
 * 경매 — 얼마를 부를지만 정한다 (TASK-KL-242)
 *
 * 여기 오락실에서 처음 나오는 **돈 쓰는 게임**이다. 판에 놓을 말도, 맞힐 과녁도 없다.
 * 하는 일이라곤 「얼마 부를까」 하나뿐인데, 그게 전부 남이 얼마 부를지에 달려 있다.
 *
 * 규칙은 셋: ① 물건마다 값어치가 **모두에게 보인다** ② 부르는 값은 **아무도 못 본다**
 * ③ 제일 높이 부른 사람이 그 돈을 내고 가져간다. 같은 값이 겹치면 아무도 못 가져간다 —
 * 그래서 남들이 쓸 만한 숫자(10, 20 같은 것)를 피해 가는 판이 된다.
 *
 * 돈은 처음 준 것이 전부다. 아껴 두면 나중에 좋은 물건을 살 수 있지만, 아끼다 아무것도
 * 못 사면 남은 돈은 **십분의 일 값**밖에 안 된다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

const PURSE = 100;
const LOTS = 8;
/** 물건 값어치 범위 */
const LOW = 3;
const HIGH = 12;
/** 한 물건에 주는 시간 */
const BID_MS = 14000;
/** 낙찰 결과를 보여 주는 시간 */
const SHOW_MS = 2200;

export interface AuctionState {
  /** 물건 값어치 — 이건 처음부터 다 보인다 */
  lots: number[];
  at: number;
  money: number[];
  points: number[];
  /** 이번 물건에 부른 값 — **`redact` 가 남의 것을 가린다** */
  bids: Array<number | null>;
  phase: 'bid' | 'show';
  until: number;
  /** 방금 누가 얼마에 가져갔나 */
  last: { seat: number; paid: number; lot: number; bids: number[] } | null;
  over: boolean;
}

export type AuctionAction = { bid: number };

export const auction: GameDef<AuctionState, AuctionAction> = {
  id: 'auction',
  seats: [2, 6],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return {
      lots: Array.from({ length: LOTS }, () => LOW + Math.floor(ctx.rng() * (HIGH - LOW + 1))),
      at: 0,
      money: ctx.seats.map(() => PURSE),
      points: ctx.seats.map(() => 0),
      bids: ctx.seats.map(() => null),
      phase: 'bid',
      until: ctx.now + BID_MS,
      last: null,
      over: false
    };
  },

  /** 부른 값은 남이 못 본다 — 「부르긴 했다」만 보인다. */
  redact(s, seat) {
    if (s.phase !== 'bid') return s;
    return { ...s, bids: s.bids.map((b, i) => (i === seat ? b : b === null ? null : -1)) };
  },

  canAct(s, seat) {
    return !s.over && s.phase === 'bid' && s.bids[seat] === null;
  },

  reduce(s, a, seat) {
    if (s.over || s.phase !== 'bid' || s.bids[seat] !== null) return s;
    const bid = a?.bid;
    if (!Number.isInteger(bid) || bid < 0 || bid > s.money[seat]) return s;
    return { ...s, bids: s.bids.map((b, i) => (i === seat ? bid : b)) };
  },

  tick(s, ctx) {
    if (s.over) return s;

    if (s.phase === 'show') {
      if (ctx.now < s.until) return s;
      const at = s.at + 1;
      if (at >= s.lots.length) return { ...s, over: true };
      return { ...s, at, bids: s.bids.map(() => null), phase: 'bid', until: ctx.now + BID_MS };
    }

    /* 다 불렀거나, 시간이 다 됐거나 — 안 부른 사람은 0 을 부른 것으로 친다. */
    if (s.bids.some((b) => b === null) && ctx.now < s.until) return s;
    const bids = s.bids.map((b) => b ?? 0);
    const top = Math.max(...bids);
    const takers = bids.map((b, i) => (b === top ? i : -1)).filter((i) => i >= 0);
    /* 겹치면 아무도 못 가져간다 — 돈도 안 나간다. */
    const winner = takers.length === 1 && top > 0 ? takers[0] : -1;
    const lot = s.lots[s.at];
    return {
      ...s,
      money: s.money.map((m, i) => (i === winner ? m - top : m)),
      points: s.points.map((p, i) => (i === winner ? p + lot : p)),
      bids,
      phase: 'show',
      until: ctx.now + SHOW_MS,
      last: { seat: winner, paid: top, lot, bids }
    };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    /* 남은 돈은 십분의 일 값 — 아끼기만 한 사람이 이기면 경매가 아니다. */
    const total = ctx.seats.map((_, i) => s.points[i] + Math.floor(s.money[i] / 10));
    const top = Math.max(...total);
    const best = ctx.seats.filter((_, i) => total[i] === top);
    return {
      over: true,
      scores: total,
      note: { key: 'arcade.auction.win', params: { who: best.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat): BotMove<AuctionAction> | null {
    if (s.over || s.phase !== 'bid' || s.bids[seat] !== null) return null;
    const lot = s.lots[s.at];
    const left = s.lots.length - s.at;
    /* 남은 물건 수로 지갑을 나눠 「이번 몫」을 잡고, 값어치에 비례해 늘린다.
       거기에 흔들림을 얹는다 — 봇들이 늘 같은 숫자를 부르면 매번 겹쳐서 아무도 못 산다. */
    const share = s.money[seat] / Math.max(1, left);
    const want = share * (lot / ((LOW + HIGH) / 2)) * (0.65 + Math.random() * 0.7);
    const bid = Math.max(0, Math.min(s.money[seat], Math.round(want)));
    return { action: { bid }, delayMs: 900 + Math.random() * 2600 };
  }
};
