/**
 * 가위바위보 — 이긴 손은 봉인된다 (TASK-KL-242)
 *
 * 그냥 가위바위보는 놀이가 아니라 동전 던지기다(수가 없다). 규칙 한 줄을 얹으면 달라진다:
 * **이긴 손은 다음 판에 못 낸다.**
 *
 * 그러면 상대가 무엇을 못 내는지가 판마다 드러나고, 「이긴 손을 버리고 무엇을 남길까」가
 * 수가 된다 — 초월 틱택토에서 쓴 것과 같은 수법이다(새 소재 대신 규칙 하나를 얹는다).
 *
 * 다섯 판. 동시에 내므로 `redact` 가 낸 손을 가린다 — 안 그러면 늦게 낸 사람이 다 이긴다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

/** 0 바위, 1 보, 2 가위 */
export const HANDS = 3;
const ROUNDS = 5;
const SHOW_MS = 2200;

export interface RpsState {
  /** 자리별 이번에 낸 손 (아직이면 -1) */
  picks: number[];
  /** 자리별 봉인된 손 (없으면 -1) */
  locked: number[];
  score: number[];
  round: number;
  /** 결과를 보여 주는 끝 시각 */
  showAt: number;
  over: boolean;
}

export type RpsAction = { hand: number };

/** a 가 b 를 이기나. 바위(0) > 가위(2) > 보(1) > 바위(0). */
export function beats(a: number, b: number): boolean {
  return (a === 0 && b === 2) || (a === 2 && b === 1) || (a === 1 && b === 0);
}

export const rps: GameDef<RpsState, RpsAction> = {
  id: 'rps',
  seats: [2, 2],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return {
      picks: ctx.seats.map(() => -1),
      locked: ctx.seats.map(() => -1),
      score: ctx.seats.map(() => 0),
      round: 0,
      showAt: 0,
      over: false
    };
  },

  /** 낸 손은 둘 다 낼 때까지 안 보인다 — 이게 없으면 늦게 내는 쪽이 늘 이긴다. */
  redact(s, seat) {
    if (s.showAt !== 0) return s;
    return { ...s, picks: s.picks.map((v, i) => (i === seat ? v : v === -1 ? -1 : -2)) };
  },

  canAct(s, seat) {
    return !s.over && s.showAt === 0 && s.picks[seat] === -1;
  },

  reduce(s, a, seat, ctx) {
    if (s.over || s.showAt !== 0 || s.picks[seat] !== -1) return s;
    const hand = a?.hand;
    if (!Number.isInteger(hand) || hand < 0 || hand >= HANDS) return s;
    /* 봉인된 손은 못 낸다 — 이 한 줄이 이 놀이의 전부다. */
    if (hand === s.locked[seat]) return s;

    const picks = s.picks.map((v, i) => (i === seat ? hand : v));
    if (picks.some((v) => v === -1)) return { ...s, picks };

    const [a0, a1] = picks;
    const score = s.score.slice();
    if (beats(a0, a1)) score[0]++;
    else if (beats(a1, a0)) score[1]++;
    return { ...s, picks, score, showAt: ctx.now + SHOW_MS };
  },

  tick(s, ctx) {
    if (s.over || s.showAt === 0 || ctx.now < s.showAt) return s;
    if (s.round + 1 >= ROUNDS) return { ...s, over: true };
    /* 이번에 이긴 손을 봉인한다. 비겼으면 둘 다 그대로. */
    const [a0, a1] = s.picks;
    const locked = s.locked.slice();
    if (beats(a0, a1)) locked[0] = a0;
    else if (beats(a1, a0)) locked[1] = a1;
    return {
      ...s,
      picks: s.picks.map(() => -1),
      locked,
      round: s.round + 1,
      showAt: 0
    };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    if (s.score[0] === s.score[1]) {
      return { over: true, scores: [0, 0], note: { key: 'arcade.rps.draw', params: { n: String(s.score[0]) } } };
    }
    const win = s.score[0] > s.score[1] ? 0 : 1;
    return {
      over: true,
      scores: win === 0 ? [1, 0] : [0, 1],
      note: {
        key: 'arcade.rps.win',
        params: { who: ctx.seats[win]?.name ?? '', a: String(Math.max(...s.score)), b: String(Math.min(...s.score)) }
      }
    };
  },

  bot(s, seat): BotMove<RpsAction> | null {
    if (s.over || s.showAt !== 0 || s.picks[seat] !== -1) return null;
    const can = [0, 1, 2].filter((h) => h !== s.locked[seat]);
    /* 상대가 못 내는 손을 안다면 그것을 이기는 손은 안 고른다(헛수). */
    const foeLocked = s.locked[1 - seat];
    const smart = can.filter((h) => foeLocked < 0 || !beats(foeLocked, h));
    const pool = smart.length ? smart : can;
    return {
      action: { hand: pool[Math.floor(Math.random() * pool.length)] },
      delayMs: 600 + Math.random() * 700
    };
  }
};
