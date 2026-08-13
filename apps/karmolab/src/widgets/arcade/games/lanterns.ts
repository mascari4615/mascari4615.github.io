/**
 * 등불 잇기 — 서로 이기는 게 아니라 같이 이긴다 (TASK-KL-242)
 *
 * 스물두 개가 전부 **누가 이기나**였다. 이건 처음으로 **다 같이 이기거나 다 같이 진다.**
 * 커널의 점수는 자리별인데, 여기서는 모두에게 같은 값을 준다 — 「협동」은 새 기능이 아니라
 * 점수를 그렇게 나눠 주는 것뿐이었다(커널을 안 고쳐도 됐다).
 *
 * 그리고 뒤집힌 `redact`: 다른 게임은 **남의 패를 감췄지만**, 여기서는 **내 패만 감춘다.**
 * 그게 이 놀이의 전부다 — 내가 못 보는 것을 남이 말해 준다.
 *
 * 간추린 규칙: 색 셋(🔴🟢🔵) × 숫자 1~5. 색마다 1부터 차례로 쌓는다. 알려 주기는 힌트 토큰을
 * 쓰고, 잘못 걸면 등불이 하나 꺼진다. 셋 다 터지면 끝. 다 쌓으면(15장) 이긴다.
 */
import type { GameDef, BotMove, Outcome } from '../types';
import { shuffle } from '../rng';

export const COLORS = 3;
export const RANKS = 5;
const HAND = 4;
const HINTS = 6;
const FUSES = 3;

export interface Card {
  /** 0~2 */
  color: number;
  /** 1~5 */
  rank: number;
}

export interface LanternsState {
  /** 자리별 손패 (내 것만 `redact` 가 지운다) */
  hands: Card[][];
  /** 색마다 어디까지 쌓았나 (0 = 아직) */
  piles: number[];
  deck: Card[];
  hints: number;
  fuses: number;
  turn: number;
  /** 자리별·자리내 카드별로 「색을 들었다 / 숫자를 들었다」 */
  told: Array<Array<{ color: boolean; rank: boolean }>>;
  /**
   * 산이 마른 뒤 **남은 차례 수**. -1 = 아직 산이 있다.
   * 원래 놀이의 규칙이고, 동시에 이 판이 멈추지 않는 이유다(아래 `advance` 참고).
   */
  finalLeft: number;
  /** 끝났나 */
  over: boolean;
  /** 마지막에 무슨 일이 있었나 — 화면이 한 줄로 말해 준다 */
  last: { kind: 'play' | 'fail' | 'hint' | 'drop'; who: number; text: string } | null;
}

export type LanternsAction =
  | { kind: 'play'; index: number }
  | { kind: 'drop'; index: number }
  | { kind: 'hint'; seat: number; color?: number; rank?: number };

function freshDeck(rng: () => number): Card[] {
  const cards: Card[] = [];
  for (let c = 0; c < COLORS; c++) {
    /* 1 은 흔하고 5 는 하나뿐 — 원래 놀이의 긴장이 여기서 나온다. */
    const counts = [0, 3, 2, 2, 2, 1];
    for (let r = 1; r <= RANKS; r++) {
      for (let k = 0; k < counts[r]; k++) cards.push({ color: c, rank: r });
    }
  }
  return shuffle(rng, cards);
}

/**
 * 차례를 넘기고 **끝을 여기서 정한다**.
 *
 * 원래 놀이의 규칙: 산이 마르면 각자 한 번씩만 더 두고 끝난다. 그 규칙이 없었더니 산도
 * 마르고 손도 거의 빈 판에서 차례가 **빈손에게** 돌아가 영영 멈췄다 — 봇끼리 200판 중
 * 115판(TASK-KL-264 F1 실측). 씨앗 하나로 「끝난다」를 봤던 계약 검사는 이걸 못 봤다.
 *
 * 빈손은 낼 것도 버릴 것도 없으니 건너뛴다. 건너뛸 자리가 하나도 없으면 그것이 판의 끝이다.
 */
function advance(
  seat: number,
  seats: number,
  hands: Card[][],
  deckLeft: number,
  finalLeft: number
): { turn: number; finalLeft: number; over: boolean } {
  const next = finalLeft >= 0 ? finalLeft - 1 : deckLeft === 0 ? seats : -1;
  if (next === 0) return { turn: seat, finalLeft: 0, over: true };
  for (let k = 1; k <= seats; k++) {
    const cand = (seat + k) % seats;
    if (hands[cand]?.length) return { turn: cand, finalLeft: next, over: false };
  }
  return { turn: seat, finalLeft: next, over: true };
}

export const lanterns: GameDef<LanternsState, LanternsAction> = {
  id: 'lanterns',
  seats: [2, 3],
  rounds: 1,

  init(ctx) {
    const deck = freshDeck(ctx.rng);
    const hands = ctx.seats.map(() => deck.splice(0, HAND));
    return {
      hands,
      piles: new Array(COLORS).fill(0),
      deck,
      hints: HINTS,
      fuses: FUSES,
      turn: 0,
      told: hands.map((h) => h.map(() => ({ color: false, rank: false }))),
      finalLeft: -1,
      over: false,
      last: null
    };
  },

  /** **내 패만 감춘다.** 다른 게임과 정반대다 — 그게 이 놀이다. */
  redact(s, seat) {
    return { ...s, hands: s.hands.map((h, i) => (i === seat ? h.map(() => ({ color: -1, rank: 0 })) : h)) };
  },

  canAct(s, seat) {
    return !s.over && s.turn === seat;
  },

  reduce(s, a, seat, ctx) {
    if (s.over || s.turn !== seat) return s;
    const seats = ctx.seats.length;
    const hand = s.hands[seat];
    if (!hand) return s;

    if (a?.kind === 'hint') {
      if (s.hints <= 0) return s;
      const to = a.seat;
      if (typeof to !== 'number' || to === seat || to < 0 || to >= seats) return s;
      const hasColor = typeof a.color === 'number';
      const hasRank = typeof a.rank === 'number';
      if (hasColor === hasRank) return s; /* 둘 중 하나만 */
      const told = s.told.map((row, i) =>
        i !== to
          ? row
          : row.map((mark, k) => {
              const card = s.hands[to][k];
              if (!card) return mark;
              if (hasColor && card.color === a.color) return { ...mark, color: true };
              if (hasRank && card.rank === a.rank) return { ...mark, rank: true };
              return mark;
            })
      );
      const step = advance(seat, seats, s.hands, s.deck.length, s.finalLeft);
      return {
        ...s,
        hints: s.hints - 1,
        told,
        turn: step.turn,
        finalLeft: step.finalLeft,
        over: step.over,
        last: { kind: 'hint', who: seat, text: hasColor ? `c${a.color}` : `r${a.rank}` }
      };
    }

    const idx = (a as { index?: number })?.index;
    if (typeof idx !== 'number' || idx < 0 || idx >= hand.length) return s;
    const card = hand[idx];

    const deck = s.deck.slice();
    const drawn = deck.shift();
    const hands = s.hands.map((h, i) =>
      i === seat ? [...h.slice(0, idx), ...h.slice(idx + 1), ...(drawn ? [drawn] : [])] : h
    );
    const told = s.told.map((row, i) =>
      i === seat
        ? [...row.slice(0, idx), ...row.slice(idx + 1), ...(drawn ? [{ color: false, rank: false }] : [])]
        : row
    );

    if (a.kind === 'drop') {
      /* 버리면 힌트가 하나 돌아온다 — 못 쓰는 카드를 버리는 것도 수다. */
      const step = advance(seat, seats, hands, deck.length, s.finalLeft);
      return {
        ...s,
        hands,
        told,
        deck,
        hints: Math.min(HINTS, s.hints + 1),
        turn: step.turn,
        finalLeft: step.finalLeft,
        over: step.over,
        last: { kind: 'drop', who: seat, text: '' }
      };
    }

    if (a.kind !== 'play') return s;

    const fits = s.piles[card.color] === card.rank - 1;
    const piles = fits ? s.piles.map((v, i) => (i === card.color ? v + 1 : v)) : s.piles;
    const fuses = fits ? s.fuses : s.fuses - 1;
    /* 5 를 놓으면 힌트가 하나 돌아온다(원래 규칙). */
    const hints = fits && card.rank === RANKS ? Math.min(HINTS, s.hints + 1) : s.hints;
    const done = piles.every((v) => v === RANKS);
    const step = advance(seat, seats, hands, deck.length, s.finalLeft);

    return {
      ...s,
      hands,
      told,
      deck,
      piles,
      fuses,
      hints,
      over: done || fuses <= 0 || step.over,
      turn: step.turn,
      finalLeft: step.finalLeft,
      last: { kind: fits ? 'play' : 'fail', who: seat, text: `${card.color}:${card.rank}` }
    };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    const score = s.piles.reduce((a, b) => a + b, 0);
    /* **모두에게 같은 점수.** 협동은 새 기능이 아니라 점수를 이렇게 나눠 주는 것이다. */
    return {
      over: true,
      scores: ctx.seats.map(() => score),
      note:
        score === COLORS * RANKS
          ? { key: 'arcade.lanterns.perfect' }
          : { key: 'arcade.lanterns.score', params: { n: String(score), max: String(COLORS * RANKS) } }
    };
  },

  bot(s, seat, ctx): BotMove<LanternsAction> | null {
    if (s.over || s.turn !== seat) return null;
    const mine = s.told[seat] ?? [];
    const hand = s.hands[seat] ?? [];

    /* ① 「숫자를 들은」 카드가 지금 놓을 수 있는 수면 낸다 — 봇도 제 패는 안 본다. */
    for (let i = 0; i < hand.length; i++) {
      const mark = mine[i];
      if (!mark?.rank) continue;
      const want = Math.min(...s.piles) + 1;
      if (hand[i].rank === want) return { action: { kind: 'play', index: i }, delayMs: 700 + Math.random() * 500 };
    }

    /* ② 힌트가 남았으면 남에게 지금 놓을 수 있는 카드를 알려 준다. */
    if (s.hints > 0) {
      for (let other = 0; other < ctx.seats.length; other++) {
        if (other === seat) continue;
        const oh = s.hands[other] ?? [];
        const k = oh.findIndex((c, j) => s.piles[c.color] === c.rank - 1 && !s.told[other]?.[j]?.rank);
        if (k >= 0) {
          return { action: { kind: 'hint', seat: other, rank: oh[k].rank }, delayMs: 700 + Math.random() * 500 };
        }
      }
    }

    /* ③ 아무것도 없으면 아무것도 안 들은 카드를 버린다. */
    const drop = mine.findIndex((m) => !m.color && !m.rank);
    return { action: { kind: 'drop', index: drop >= 0 ? drop : 0 }, delayMs: 700 + Math.random() * 500 };
  }
};
