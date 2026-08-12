/**
 * 도미노 — 양 끝에 숫자를 맞춰 잇는다 (TASK-KL-242)
 *
 * 카드 놀이들과 다른 자리: **한 수가 「무엇을·어느 쪽에」**이고, 낼 게 없으면 **더미에서 가져온다**.
 * 즉 못 낼 때 아무것도 안 하고 넘기는 게 아니라 판이 바뀐다 — 「못 두면 패스」와 다른 결이다.
 *
 * 손이 먼저 비면 이긴다. 아무도 못 내고 더미도 비면 **남은 눈이 적은 쪽**이 이긴다(원래 규칙).
 */
import type { GameDef, BotMove, Outcome } from '../types';
import { shuffle } from '../rng';

/** 0~6 짝. 스물여덟 장이 한 벌이다. */
const MAX = 6;
const HAND = 5;

export type Tile = [number, number];

export interface DominoesState {
  /** 자리별 손패 (남의 것은 `redact` 가 지운다) */
  hands: Tile[][];
  /** 깔린 줄. 비어 있으면 아무거나 놓을 수 있다 */
  line: Tile[];
  /** 아직 안 가져간 것 */
  stock: Tile[];
  turn: number;
  /** 연달아 못 낸 사람 수 — 다 못 내면 판이 막힌다 */
  stuck: number;
  /** 이긴 자리 (아직이면 -1) */
  won: number;
}

export type DominoesAction = { index: number; side: 'left' | 'right' } | { kind: 'draw' };

const ends = (line: Tile[]): [number, number] | null =>
  line.length ? [line[0][0], line[line.length - 1][1]] : null;

export function canPlace(line: Tile[], t: Tile, side: 'left' | 'right'): boolean {
  const e = ends(line);
  if (!e) return true;
  return side === 'left' ? t[0] === e[0] || t[1] === e[0] : t[0] === e[1] || t[1] === e[1];
}

const playable = (line: Tile[], hand: Tile[]): boolean =>
  hand.some((t) => canPlace(line, t, 'left') || canPlace(line, t, 'right'));

const pips = (hand: Tile[]): number => hand.reduce((a, t) => a + t[0] + t[1], 0);

export const dominoes: GameDef<DominoesState, DominoesAction> = {
  id: 'dominoes',
  seats: [2, 4],
  rounds: 1,

  init(ctx) {
    const all: Tile[] = [];
    for (let a = 0; a <= MAX; a++) for (let b = a; b <= MAX; b++) all.push([a, b]);
    const mixed = shuffle(ctx.rng, all) as Tile[];
    const hands = ctx.seats.map((_, i) => mixed.slice(i * HAND, i * HAND + HAND));
    return {
      hands,
      line: [],
      stock: mixed.slice(ctx.seats.length * HAND),
      turn: 0,
      stuck: 0,
      won: -1
    };
  },

  redact(s, seat) {
    return {
      ...s,
      hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => [0, 0] as Tile))),
      stock: s.stock.map(() => [0, 0] as Tile)
    };
  },

  canAct(s, seat) {
    return s.won === -1 && s.turn === seat;
  },

  reduce(s, a, seat, ctx) {
    if (s.won !== -1 || s.turn !== seat) return s;
    const hand = s.hands[seat];
    if (!hand) return s;
    const seats = ctx.seats.length;

    if ((a as { kind?: string })?.kind === 'draw') {
      /* 낼 수 있으면 못 가져간다 — 안 그러면 더미를 다 비워 버릴 수 있다. */
      if (playable(s.line, hand)) return s;
      if (!s.stock.length) {
        /* 가져올 것도 없으면 넘긴다. 다 못 내면 판이 막힌다. */
        const stuck = s.stuck + 1;
        if (stuck >= seats) {
          const left = s.hands.map(pips);
          const best = Math.min(...left);
          return { ...s, stuck, won: left.indexOf(best) };
        }
        return { ...s, stuck, turn: (seat + 1) % seats };
      }
      const stock = s.stock.slice();
      const got = stock.pop() as Tile;
      const hands = s.hands.map((h, i) => (i === seat ? [...h, got] : h));
      return { ...s, hands, stock, stuck: 0 };
    }

    const mv = a as { index: number; side: 'left' | 'right' };
    if (!mv || typeof mv.index !== 'number' || (mv.side !== 'left' && mv.side !== 'right')) return s;
    const t = hand[mv.index];
    if (!t || !canPlace(s.line, t, mv.side)) return s;

    const e = ends(s.line);
    let placed: Tile = t;
    if (e) {
      /* 이어 붙일 쪽 숫자가 맞닿게 뒤집는다 — 화면에서 「왜 안 붙지」가 안 생기게 규칙이 정한다. */
      if (mv.side === 'left') placed = t[1] === e[0] ? t : [t[1], t[0]];
      else placed = t[0] === e[1] ? t : [t[1], t[0]];
    }
    const line = mv.side === 'left' ? [placed, ...s.line] : [...s.line, placed];
    const hands = s.hands.map((h, i) => (i === seat ? h.filter((_, k) => k !== mv.index) : h));
    const won = hands[seat].length === 0 ? seat : -1;
    return { ...s, hands, line, stuck: 0, won, turn: (seat + 1) % seats };
  },

  outcome(s, ctx): Outcome {
    if (s.won === -1) return { over: false };
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === s.won ? 1 : 0)),
      note: { key: 'arcade.dominoes.win', params: { who: ctx.seats[s.won]?.name ?? '' } }
    };
  },

  bot(s, seat): BotMove<DominoesAction> | null {
    if (s.won !== -1 || s.turn !== seat) return null;
    const hand = s.hands[seat] ?? [];
    const moves: Array<{ index: number; side: 'left' | 'right'; weight: number }> = [];
    hand.forEach((t, index) => {
      for (const side of ['left', 'right'] as const) {
        if (canPlace(s.line, t, side)) moves.push({ index, side, weight: t[0] + t[1] });
      }
    });
    if (!moves.length) return { action: { kind: 'draw' }, delayMs: 600 + Math.random() * 500 };
    /* 눈이 큰 것부터 턴다 — 막혔을 때 손에 남은 눈이 적어야 이긴다. */
    const best = moves.reduce((a, b) => (b.weight > a.weight ? b : a), moves[0]);
    return { action: { index: best.index, side: best.side }, delayMs: 600 + Math.random() * 700 };
  }
};
