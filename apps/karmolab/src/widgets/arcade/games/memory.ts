/**
 * 짝 맞추기 — 뒤집어 기억한다 (TASK-KL-242)
 *
 * 커널의 세 번째 모서리다. 반응 측정은 「동시·실시간」, 오목·사목은 「차례·정적」인데
 * 이것은 **차례가 있으면서 시간도 흐른다** — 두 장을 뒤집고 나면 잠깐 보여 준 뒤 도로 덮인다.
 * 그 「잠깐」이 `tick` 이고, 그동안은 아무도 손을 못 댄다.
 *
 * 맞히면 **한 번 더** 둔다(맞힌 사람이 계속 가져가는 것이 이 놀이의 리듬이다).
 * 그래서 차례가 자동으로 넘어가지 않는다 — 커널이 차례를 안 갖고 게임이 갖는 이유가 여기 있다.
 *
 * 2~4인. 사람이 하나면 나머지는 봇이 앉는다.
 */
import type { GameDef, GameCtx, BotMove } from '../types';
import { shuffle } from '../rng';

/** 짝의 수. 8쌍 = 16장 — 4×4 로 떨어져 폰에서도 한 화면에 들어간다. */
const PAIRS = 8;
/** 못 맞힌 두 장을 얼마나 보여 주고 덮나. 너무 짧으면 기억할 틈이 없다. */
const PEEK_MS = 900;

export interface MemoryState {
  /** 카드에 적힌 값 (같은 값 둘이 한 짝) */
  cards: number[];
  /** 이미 가져간 카드 — 0 = 아직 판 위, 그 외 = 가져간 자리 번호+1 */
  taken: number[];
  /** 지금 뒤집혀 있는 카드 자리 (0~2장) */
  up: number[];
  turn: number;
  /** 이 시각이 지나면 못 맞힌 두 장을 덮는다. 없으면 0 */
  hideAt: number;
}

export type MemoryAction = { cell: number };

export const memory: GameDef<MemoryState, MemoryAction> = {
  id: 'memory',
  seats: [2, 4],
  rounds: 1,
  realtime: true,

  init(ctx: GameCtx) {
    const values: number[] = [];
    for (let i = 0; i < PAIRS; i++) values.push(i, i);
    return {
      cards: shuffle(ctx.rng, values),
      taken: new Array(PAIRS * 2).fill(0),
      up: [],
      turn: 0,
      hideAt: 0
    };
  },

  /** 덮이기를 기다리는 동안은 아무도 못 둔다 — 그때 누르면 남의 차례를 훔치게 된다. */
  canAct(s, seat) {
    return s.hideAt === 0 && s.turn === seat && s.up.length < 2;
  },

  reduce(s, a, seat, ctx) {
    if (s.hideAt !== 0 || s.turn !== seat || s.up.length >= 2) return s;
    if (a.cell < 0 || a.cell >= s.cards.length) return s;
    if (s.taken[a.cell] !== 0 || s.up.includes(a.cell)) return s;

    const up = [...s.up, a.cell];
    if (up.length < 2) return { ...s, up };

    const [x, y] = up;
    if (s.cards[x] === s.cards[y]) {
      /* 맞혔다 — 가져가고 **한 번 더** 둔다. */
      const taken = s.taken.slice();
      taken[x] = seat + 1;
      taken[y] = seat + 1;
      return { ...s, taken, up: [] };
    }
    /* 틀렸다 — 잠깐 보여 준 뒤 덮는다. 덮는 일은 `tick` 이 한다. */
    return { ...s, up, hideAt: ctx.now + PEEK_MS };
  },

  tick(s, ctx) {
    if (s.hideAt === 0 || ctx.now < s.hideAt) return s;
    /* 사람이 몇이든 다음 자리로 — 두 명이면 번갈이, 넷이면 돌아간다. */
    return { ...s, up: [], hideAt: 0, turn: (s.turn + 1) % ctx.seats.length };
  },

  outcome(s, ctx) {
    if (s.taken.some((v) => v === 0)) return { over: false };
    const scores = ctx.seats.map((_, i) => s.taken.filter((v) => v === i + 1).length / 2);
    const top = Math.max(...scores);
    const winners = ctx.seats.filter((_, i) => scores[i] === top);
    return {
      over: true,
      scores,
      note:
        winners.length === ctx.seats.length
          ? { key: 'arcade.memory.draw' }
          : { key: 'arcade.memory.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat): BotMove<MemoryAction> | null {
    if (s.hideAt !== 0 || s.turn !== seat || s.up.length >= 2) return null;

    const hidden = s.cards.map((_, i) => i).filter((i) => s.taken[i] === 0 && !s.up.includes(i));
    if (!hidden.length) return null;

    /* 봇의 기억은 **지금 화면에 보이는 것까지**다. 판을 통째로 훔쳐보면 사람이 한 판도 못 이긴다.
     * 한 장을 뒤집어 둔 상태에서 그 짝이 이미 뒤집혀 있으면 그것을 집는다 — 그 이상은 안 본다. */
    if (s.up.length === 1) {
      const want = s.cards[s.up[0]];
      const mate = hidden.find((i) => s.cards[i] === want);
      /* 열에 세 번쯤은 「기억해 냈다」. 늘 기억하면 봇이 아니라 벽이다. */
      if (mate !== undefined && Math.random() < 0.35) {
        return { action: { cell: mate }, delayMs: 700 + Math.random() * 500 };
      }
    }

    const pick = hidden[Math.floor(Math.random() * hidden.length)];
    return { action: { cell: pick }, delayMs: 700 + Math.random() * 600 };
  }
};
