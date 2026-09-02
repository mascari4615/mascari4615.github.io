/**
 * 블랙잭. 21에 가깝게, 넘으면 죽는다 (TASK-KL-242, 2026-09-01 전면 개편)
 *
 * 옛 판이 최악이었던 까닭은 규칙이 얇아서다. 히트와 스탠드 둘뿐이었고,
 * 딜러와 동점이면 패배(무승부 9.3%를 통째로), 판돈이 없어 결정에 무게도 없었음
 * 50만판 시뮬로 잰 옛 승률 42.5승 57.5패. 잘 쳐도 계속 지는 판
 *
 * 지금은 카지노 표준
 *  - 6벌 슈. 카드가 실제로 줄어든다 (`deck.ts` 의 `makeShoe`)
 *  - 딜러는 소프트 17에 멈춘다 (S17)
 *  - 내추럴 블랙잭 3:2, 딜러와 둘 다면 무승부
 *  - 더블다운, 스플릿(손 넷까지, 나뉜 에이스는 한 장만), 늦은 서렌더, 보험 2:1
 *  - 무승부는 본전
 * 이 규칙 묶음의 하우스 엣지 0.4~0.5%
 *
 * 한 판(match)은 **슈 한 통에 여덟 손**이다. 커널의 라운드를 여덟 번 도는 대신
 * 상태 안에서 손을 넘김. 그래야 슈가 줄고 칩이 이어짐
 *
 * 딜러의 두 번째 카드는 상태에 **들어 있다**. 옛 판은 감출 게 없게 하려고 아예 안 뽑았고,
 * 그래서 뒤집는 연출이 통째로 없었음. 지금은 넣어 두고 `redact` 로 남의 창에서 지움
 */
import type { GameDef, BotMove, Outcome, GameCtx } from '../types';
import { makeShoe, codeRank, codeSuit, isRedSuit } from '../deck';

/** 슈 몇 벌. 카지노는 6~8 */
const DECKS = 6;
/** 한 통에 몇 손 */
export const HANDS = 8;
/** 시작 칩 */
export const START_CHIPS = 100;
/**
 * 걸 수 있는 값. **전부 짝수**. 블랙잭이 3:2 라 홀수로 걸면 칩이 107.5 처럼 갈라짐
 * (2026-09-01 화면 실측). 보험과 서렌더의 절반도 짝수라야 딱 떨어짐
 */
export const BETS: readonly number[] = [2, 4, 10, 20, 50];
/** 퍼펙트 페어 곁수는 본판과 따로 2칩만 건다. */
export const PAIR_BET = 2;
/** 결과를 보여 주고 다음 손으로 넘어가기까지 */
const SHOW_MS = 2600;
/** 스플릿 상한. 손 넷까지 */
const MAX_HANDS = 4;

/** 한 손의 결과 여섯. 화면은 이 목록을 읽지 다시 적지 않는다 */
export const BJ_RESULTS = ['bj', 'win', 'push', 'lose', 'bust', 'surrender'] as const;
export type BjRes = (typeof BJ_RESULTS)[number];
export type PairRes = 'perfect' | 'colored' | 'mixed' | 'none';

/** 첫 두 장의 퍼펙트 페어 판정. 같은 무늬 25:1, 같은 색 12:1, 다른 색 6:1. */
export function perfectPair(cards: readonly number[]): { res: PairRes; odds: number } {
  if (cards.length < 2 || codeRank(cards[0]) !== codeRank(cards[1])) return { res: 'none', odds: 0 };
  const a = codeSuit(cards[0]);
  const b = codeSuit(cards[1]);
  if (a === b) return { res: 'perfect', odds: 25 };
  if (isRedSuit(a) === isRedSuit(b)) return { res: 'colored', odds: 12 };
  return { res: 'mixed', odds: 6 };
}

export interface BjHand {
  /** 카드 번호 0~51 (`deck.ts` 의 셈법) */
  cards: number[];
  bet: number;
  /** 이 손은 더 못 침 */
  done: boolean;
  doubled: boolean;
  /** 나뉘어 나온 손인가 */
  split: boolean;
  /** 에이스를 나눠 한 장만 받은 손 */
  aceSplit: boolean;
  res?: BjRes;
  /** 이 손이 주고받은 칩. 건 것 대비 순증감 */
  pay?: number;
}

export interface BjSeat {
  hands: BjHand[];
  /** 지금 치고 있는 손 */
  at: number;
  chips: number;
  /** 이번 손에 걸기로 한 값. 0 이면 아직 안 걺 */
  bet: number;
  /** 보험에 넣은 값 */
  insurance: number;
  /** 첫 두 장 퍼펙트 페어에 따로 건 값 */
  pairBet: number;
  pairRes?: PairRes;
  /** 곁수의 순이익. 지면 음수 */
  pairPay?: number;
  /** 보험 물음에 답했나 */
  answered: boolean;
}

export interface BlackjackState {
  /** 걸기 -> (보험) -> 치기 -> 보여 주기 */
  phase: 'bet' | 'insure' | 'play' | 'done';
  shoe: number[];
  next: number;
  seats: BjSeat[];
  /** 딜러 손. [보인 카드, 감춘 카드, ...] */
  dealer: number[];
  /** 감춘 카드가 뒤집혔나 */
  revealed: boolean;
  /** 몇 번째 손인가 (0부터) */
  hand: number;
  /** 결과를 보여 주기 시작한 시각 */
  doneAt: number;
  /** 슈를 다 썼나 */
  over: boolean;
}

export type BlackjackAction =
  | { kind: 'bet'; amount: number }
  | { kind: 'pair'; take: boolean }
  | { kind: 'insure'; take: boolean }
  | { kind: 'hit' }
  | { kind: 'stand' }
  | { kind: 'double' }
  | { kind: 'split' }
  | { kind: 'surrender' };

/** 카드 하나의 끗수 값. 그림은 전부 10 */
const val = (code: number): number => Math.min(codeRank(code), 10);

/** 손의 합. 에이스를 11로 세되 넘치면 1로 내림 */
export function total(cards: number[]): number {
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    const r = codeRank(c);
    sum += r === 1 ? 11 : val(c);
    if (r === 1) aces++;
  }
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces--;
  }
  return sum;
}

/** 에이스를 11로 세고도 안 넘치나. 소프트 핸드 */
export function isSoft(cards: number[]): boolean {
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    const r = codeRank(c);
    sum += r === 1 ? 11 : val(c);
    if (r === 1) aces++;
  }
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces--;
  }
  return aces > 0 && sum <= 21;
}

export const bust = (cards: number[]): boolean => total(cards) > 21;

/** 첫 두 장 21. 나뉘어 나온 손은 내추럴이 아님 */
export const isNatural = (h: BjHand): boolean =>
  !h.split && h.cards.length === 2 && total(h.cards) === 21;

const mkHand = (bet: number): BjHand => ({
  cards: [],
  bet,
  done: false,
  doubled: false,
  split: false,
  aceSplit: false
});

const mkSeat = (chips: number): BjSeat => ({
  hands: [mkHand(0)],
  at: 0,
  chips,
  bet: 0,
  insurance: 0,
  pairBet: 0,
  answered: false
});

/** 슈에서 한 장. 다 쓰면 처음으로 돌아감 (한 통에 여덟 손이라 실제로는 안 닿음) */
const take = (s: BlackjackState): number => {
  const c = s.shoe[s.next % s.shoe.length];
  s.next += 1;
  return c;
};

/** 지금 치는 손 */
export const activeHand = (seat: BjSeat): BjHand | undefined => seat.hands[seat.at];

/** 이 손이 지금 할 수 있는 것 */
export function options(
  s: BlackjackState,
  seatIdx: number
): { hit: boolean; stand: boolean; double: boolean; split: boolean; surrender: boolean } {
  const none = { hit: false, stand: false, double: false, split: false, surrender: false };
  if (s.phase !== 'play') return none;
  const seat = s.seats[seatIdx];
  if (!seat) return none;
  const h = activeHand(seat);
  if (!h || h.done || bust(h.cards)) return none;
  const first = h.cards.length === 2;
  const pair = first && val(h.cards[0]) === val(h.cards[1]);
  return {
    hit: true,
    stand: true,
    /* 첫 두 장에만. 칩이 모자라면 불가 */
    double: first && seat.chips >= h.bet,
    /* 손 넷까지. 나뉜 에이스는 다시 못 나눔 */
    split: pair && seat.hands.length < MAX_HANDS && seat.chips >= h.bet && !h.aceSplit,
    /* 늦은 서렌더. 나뉘지 않은 첫 두 장에만 */
    surrender: first && !h.split
  };
}

/** 다음에 칠 손으로. 없으면 이 자리는 끝 */
const advance = (seat: BjSeat): void => {
  while (seat.at < seat.hands.length) {
    const h = seat.hands[seat.at];
    if (!h.done && !bust(h.cards) && total(h.cards) < 21) return;
    if (!h.done) h.done = true;
    seat.at += 1;
  }
  seat.at = Math.max(0, seat.hands.length - 1);
};

const everyoneDone = (s: BlackjackState): boolean =>
  s.seats.every((st) => st.hands.every((h) => h.done || bust(h.cards)));

/** 딜러가 뽑고 값을 치름 */
const settle = (s: BlackjackState, now: number): void => {
  s.revealed = true;
  const dealerBj = s.dealer.length === 2 && total(s.dealer) === 21;

  /* 살아 있는 손이 하나라도 있어야 딜러가 더 뽑음 */
  const alive = s.seats.some((st) =>
    st.hands.some((h) => !bust(h.cards) && h.res !== 'surrender')
  );
  if (alive && !dealerBj) {
    /* S17. 소프트 17에서도 멈춤 */
    while (total(s.dealer) < 17) s.dealer.push(take(s));
  }
  const dt = total(s.dealer);
  const dBust = dt > 21;

  for (const st of s.seats) {
    /* 보험. 딜러가 내추럴이면 2:1, 아니면 잃음 */
    if (st.insurance > 0 && dealerBj) st.chips += st.insurance * 3;

    for (const h of st.hands) {
      /* 물러난 손은 그때 이미 값을 치름. `pay` 도 그때 적음 */
      if (h.res === 'surrender') continue;
      const t = total(h.cards);
      const nat = isNatural(h);
      if (t > 21) {
        h.res = 'bust';
        h.pay = -h.bet;
      } else if (nat && !dealerBj) {
        h.res = 'bj';
        h.pay = h.bet * 1.5;
        st.chips += h.bet + h.pay;
      } else if (nat && dealerBj) {
        h.res = 'push';
        h.pay = 0;
        st.chips += h.bet;
      } else if (dealerBj) {
        h.res = 'lose';
        h.pay = -h.bet;
      } else if (dBust || t > dt) {
        h.res = 'win';
        h.pay = h.bet;
        st.chips += h.bet * 2;
      } else if (t === dt) {
        /* 무승부는 본전. 옛 판이 여기서 9.3%를 통째로 패배로 넘김 */
        h.res = 'push';
        h.pay = 0;
        st.chips += h.bet;
      } else {
        h.res = 'lose';
        h.pay = -h.bet;
      }
    }
  }
  s.phase = 'done';
  s.doneAt = now;
};

/** 내추럴 정리. 모두 칠 것이 없으면 바로 값을 치름 */
const finishNaturals = (s: BlackjackState, now: number): void => {
  for (const st of s.seats) {
    const h = st.hands[0];
    if (h && isNatural(h)) h.done = true;
  }
  const dealerBj = s.dealer.length === 2 && total(s.dealer) === 21;
  if (dealerBj || everyoneDone(s)) {
    settle(s, now);
    return;
  }
  for (const st of s.seats) advance(st);
};

/** 다 걸었으면 나눠 줌 */
const deal = (s: BlackjackState, now: number): void => {
  for (const st of s.seats) {
    st.hands = [mkHand(st.bet)];
    st.at = 0;
    st.insurance = 0;
    st.answered = false;
  }
  s.dealer = [];
  s.revealed = false;
  /* 한 장씩 두 바퀴. 실제 딜러가 돌리는 차례 그대로 */
  for (let r = 0; r < 2; r++) {
    for (const st of s.seats) st.hands[0].cards.push(take(s));
    s.dealer.push(take(s));
  }
  /* 곁수는 첫 두 장이 놓인 즉시 본판과 독립해 끝난다. */
  for (const st of s.seats) {
    if (st.pairBet < 1) continue;
    const pair = perfectPair(st.hands[0].cards);
    st.pairRes = pair.res;
    st.pairPay = pair.odds > 0 ? st.pairBet * pair.odds : -st.pairBet;
    if (pair.odds > 0) st.chips += st.pairBet + st.pairPay;
  }
  /* 딜러가 에이스를 보이면 보험을 물음 */
  if (codeRank(s.dealer[0]) === 1) {
    s.phase = 'insure';
    return;
  }
  s.phase = 'play';
  finishNaturals(s, now);
};

const clone = (s: BlackjackState): BlackjackState => ({
  ...s,
  shoe: s.shoe,
  seats: s.seats.map((st) => ({
    ...st,
    hands: st.hands.map((h) => ({ ...h, cards: [...h.cards] }))
  })),
  dealer: [...s.dealer]
});

/** 다음 손. 칩과 슈는 이어짐 */
const nextHand = (s: BlackjackState): void => {
  s.hand += 1;
  if (s.hand >= HANDS || s.seats.every((st) => st.chips < 1)) {
    s.over = true;
    return;
  }
  s.phase = 'bet';
  /* 앞 손의 카드는 그대로 둔다. 거는 동안 상이 비면 볼 것이 없다(2026-09-01 화면 실측).
     새 카드는 `deal` 이 나눠 줄 때 갈린다 */
  for (const st of s.seats) {
    st.bet = 0;
    st.insurance = 0;
    st.pairBet = 0;
    delete st.pairRes;
    delete st.pairPay;
    st.answered = false;
  }
};

export const blackjack: GameDef<BlackjackState, BlackjackAction> = {
  id: 'blackjack',
  seats: [1, 4],
  rounds: 1,
  /* 결과를 보여 준 뒤 다음 손으로 넘기려면 시계가 필요 */
  clocked: true,

  init(ctx: GameCtx): BlackjackState {
    return {
      phase: 'bet',
      shoe: makeShoe(DECKS, ctx.rng),
      next: 0,
      seats: ctx.seats.map(() => mkSeat(START_CHIPS)),
      dealer: [],
      revealed: false,
      hand: 0,
      doneAt: 0,
      over: false
    };
  },

  canAct(s, seat) {
    const st = s.seats[seat];
    if (!st || s.over) return false;
    if (s.phase === 'bet') return st.bet === 0 && st.chips >= 1;
    if (s.phase === 'insure') return !st.answered && st.bet > 0;
    if (s.phase === 'play') {
      const h = activeHand(st);
      return !!h && !h.done && !bust(h.cards);
    }
    return false;
  },

  reduce(s0, a, seat, ctx) {
    if (s0.over) return s0;
    const st0 = s0.seats[seat];
    if (!st0 || !a) return s0;

    if (s0.phase === 'bet') {
      if (a.kind === 'pair') {
        if (st0.bet !== 0) return s0;
        const s = clone(s0);
        const st = s.seats[seat];
        if (a.take) {
          if (st.pairBet > 0 || st.chips < PAIR_BET + BETS[0]) return s0;
          st.pairBet = PAIR_BET;
          st.chips -= PAIR_BET;
        } else {
          if (st.pairBet < 1) return s0;
          st.chips += st.pairBet;
          st.pairBet = 0;
        }
        return s;
      }
      if (a.kind !== 'bet') return s0;
      if (st0.bet !== 0) return s0;
      const want = Math.floor(a.amount);
      if (!Number.isFinite(want) || want < 1) return s0;
      const amount = Math.min(want, st0.chips);
      if (amount < 1) return s0;
      const s = clone(s0);
      const st = s.seats[seat];
      st.bet = amount;
      st.chips -= amount;
      /* 칩이 없어 못 거는 자리는 안 기다림 */
      if (s.seats.every((x) => x.bet > 0 || x.chips < 1)) deal(s, ctx.now);
      return s;
    }

    if (s0.phase === 'insure') {
      if (a.kind !== 'insure') return s0;
      if (st0.answered) return s0;
      const s = clone(s0);
      const st = s.seats[seat];
      st.answered = true;
      /* 보험은 판돈의 절반까지 */
      const half = Math.floor(st.bet / 2);
      if (a.take && half >= 1 && st.chips >= half) {
        st.insurance = half;
        st.chips -= half;
      }
      if (s.seats.every((x) => x.answered || x.bet === 0)) {
        s.phase = 'play';
        finishNaturals(s, ctx.now);
      }
      return s;
    }

    if (s0.phase !== 'play') return s0;
    const opt = options(s0, seat);
    const s = clone(s0);
    const st = s.seats[seat];
    const h = activeHand(st);
    if (!h) return s0;

    if (a.kind === 'hit') {
      if (!opt.hit) return s0;
      h.cards.push(take(s));
      if (bust(h.cards) || total(h.cards) === 21) h.done = true;
    } else if (a.kind === 'stand') {
      if (!opt.stand) return s0;
      h.done = true;
    } else if (a.kind === 'double') {
      if (!opt.double) return s0;
      st.chips -= h.bet;
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(take(s));
      h.done = true;
    } else if (a.kind === 'split') {
      if (!opt.split) return s0;
      const ace = codeRank(h.cards[0]) === 1;
      const moved = h.cards.pop() as number;
      const right = mkHand(h.bet);
      right.split = true;
      right.cards = [moved];
      h.split = true;
      st.chips -= h.bet;
      st.hands.splice(st.at + 1, 0, right);
      /* 나뉜 손은 각각 한 장을 받음 */
      h.cards.push(take(s));
      right.cards.push(take(s));
      if (ace) {
        /* 나뉜 에이스는 한 장으로 끝 */
        h.aceSplit = true;
        right.aceSplit = true;
        h.done = true;
        right.done = true;
      }
    } else if (a.kind === 'surrender') {
      if (!opt.surrender) return s0;
      h.res = 'surrender';
      h.done = true;
      /* 절반을 돌려받음. 칩은 정수라 내림. 실제로 오간 값을 그대로 적음
         (어림한 값을 적으면 하우스 엣지가 0.46%p 낮게 잡힌다. 2026-09-01 실측) */
      const back = Math.floor(h.bet / 2);
      st.chips += back;
      h.pay = back - h.bet;
    } else {
      return s0;
    }

    advance(st);
    if (everyoneDone(s)) settle(s, ctx.now);
    return s;
  },

  tick(s0, ctx) {
    if (s0.phase !== 'done' || s0.over) return s0;
    if (ctx.now - s0.doneAt < SHOW_MS) return s0;
    const s = clone(s0);
    nextHand(s);
    return s;
  },

  outcome(s, ctx): Outcome {
    if (!s.over) {
      /* 아직 안 끝났어도 방금 손의 결과는 냄. 화면과 소리가 씀 */
      if (s.phase === 'done') {
        const dt = total(s.dealer);
        const won: string[] = [];
        s.seats.forEach((st, i) => {
          if (st.hands.some((h) => h.res === 'win' || h.res === 'bj')) {
            won.push(ctx.seats[i]?.name ?? '');
          }
        });
        return {
          over: false,
          note: won.length
            ? {
                key: 'arcade.blackjack.win',
                params: { who: won.join(', '), n: String(dt) },
                sound: 'good'
              }
            : { key: 'arcade.blackjack.house', params: { n: String(dt) }, sound: 'bad' }
        };
      }
      return { over: false };
    }
    const scores = s.seats.map((st) => st.chips - START_CHIPS);
    const best = Math.max(...scores);
    const winners = ctx.seats.filter((_, i) => scores[i] === best && best > 0);
    return {
      over: true,
      scores,
      note: winners.length
        ? {
            key: 'arcade.blackjack.chipWin',
            params: { who: winners.map((w) => w.name).join(', '), n: String(best) },
            sound: 'win'
          }
        : { key: 'arcade.blackjack.chipHouse', sound: 'lose' }
    };
  },

  /** 감춘 카드는 남의 창에 안 감. 뒤집기 전까지 자리를 비움 */
  redact(s) {
    if (s.revealed || s.dealer.length < 2) return s;
    return { ...s, dealer: [s.dealer[0]] };
  },

  bot(s, seat, ctx): BotMove<BlackjackAction> | null {
    const st = s.seats[seat];
    if (!st || s.over) return null;

    if (s.phase === 'bet') {
      if (st.bet !== 0 || st.chips < 1) return null;
      /* 가진 칩의 5% 언저리에서 고른다. 다 걸어 한 손에 나가떨어지지 않게 */
      const want = Math.max(1, Math.round(st.chips * 0.05));
      let pick = 1;
      for (const b of BETS) {
        if (b <= st.chips && Math.abs(b - want) < Math.abs(pick - want)) pick = b;
      }
      return { action: { kind: 'bet', amount: pick }, delayMs: 300 + ctx.rng() * 500 };
    }

    if (s.phase === 'insure') {
      if (st.answered) return null;
      /* 보험은 기대값이 음수. 안 듦 */
      return { action: { kind: 'insure', take: false }, delayMs: 400 + ctx.rng() * 400 };
    }

    if (s.phase !== 'play') return null;
    const h = activeHand(st);
    if (!h || h.done || bust(h.cards)) return null;
    const opt = options(s, seat);
    const upRank = codeRank(s.dealer[0]);
    const up = upRank === 1 ? 11 : Math.min(upRank, 10);
    const t = total(h.cards);
    const soft = isSoft(h.cards);
    const pair = h.cards.length === 2 && val(h.cards[0]) === val(h.cards[1]);
    const pv = pair ? val(h.cards[0]) : 0;
    const pAce = pair && codeRank(h.cards[0]) === 1;
    const delayMs = 500 + ctx.rng() * 600;
    const go = (kind: BlackjackAction['kind']): BotMove<BlackjackAction> => ({
      action: { kind } as BlackjackAction,
      delayMs
    });

    /* 기본 전략. S17, 더블 뒤 스플릿 허용, 늦은 서렌더 */
    if (opt.surrender) {
      if (!soft && t === 16 && (up === 9 || up === 10 || up === 11)) return go('surrender');
      if (!soft && t === 15 && up === 10) return go('surrender');
    }
    if (opt.split) {
      if (pAce || pv === 8) return go('split');
      if (pv === 9 && up >= 2 && up <= 9 && up !== 7) return go('split');
      if (pv === 7 && up >= 2 && up <= 7) return go('split');
      if (pv === 6 && up >= 2 && up <= 6) return go('split');
      if (pv === 4 && (up === 5 || up === 6)) return go('split');
      if ((pv === 3 || pv === 2) && up >= 2 && up <= 7) return go('split');
    }
    if (opt.double) {
      if (!soft && t === 11) return go('double');
      if (!soft && t === 10 && up <= 9) return go('double');
      if (!soft && t === 9 && up >= 3 && up <= 6) return go('double');
      if (soft && (t === 13 || t === 14) && (up === 5 || up === 6)) return go('double');
      if (soft && (t === 15 || t === 16) && up >= 4 && up <= 6) return go('double');
      if (soft && (t === 17 || t === 18) && up >= 3 && up <= 6) return go('double');
    }
    if (soft) {
      if (t >= 19) return go('stand');
      if (t === 18) return up >= 2 && up <= 8 ? go('stand') : go('hit');
      return go('hit');
    }
    if (t >= 17) return go('stand');
    if (t >= 13) return up <= 6 ? go('stand') : go('hit');
    if (t === 12) return up >= 4 && up <= 6 ? go('stand') : go('hit');
    return go('hit');
  }
};
