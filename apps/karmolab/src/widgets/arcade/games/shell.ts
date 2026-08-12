/**
 * 컵 옮기기 — 눈으로 쫓는다 (TASK-KL-242)
 *
 * 서른다섯 개가 전부 **머리로 하는** 놀이였다(반응 측정조차 「고르는」 놀이다). 이건 처음으로
 * **눈으로 따라가는** 놀이다 — 아는 것도 셈하는 것도 없고, 놓치지 않는 것이 전부다.
 *
 * 그래서 이 게임만 **섞는 차례가 상태에 들어 있다.** 화면이 알아서 흔들면 사람마다 다른
 * 것을 보게 되므로, 어떤 순서로 몇 번 바꿔치기했는지를 커널이 정해 두고 화면은 그대로 그린다.
 *
 * 판이 갈수록 빨라지고 한 번 더 섞는다. 다섯 판을 다 맞히면 완벽.
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

const CUPS = 3;
const ROUNDS = 5;
/** 한 번 바꿔치기하는 데 걸리는 시간 (판마다 짧아진다) */
const SWAP_MS = 620;
const SWAP_STEP = 70;

export interface Swap {
  a: number;
  b: number;
}

export interface ShellState {
  /** 처음에 공이 있던 컵 */
  start: number;
  /** 바꿔치기 차례 — **커널이 정한다** */
  swaps: Swap[];
  /** 한 번에 걸리는 시간 */
  swapMs: number;
  /** 섞기가 시작된 시각 */
  since: number;
  /** 자리별로 고른 컵 (아직이면 -1) */
  picks: number[];
  /** 자리별 맞힌 수 */
  score: number[];
  round: number;
  /** 결과를 보여 주는 중이면 그 끝 시각 */
  showAt: number;
  over: boolean;
}

export type ShellAction = { cup: number };

/** 섞기가 끝난 뒤 공이 있는 컵. 화면도 이 함수로 그린다 — 두 곳에서 따로 세면 어긋난다. */
export function ballAt(s: ShellState, upto = s.swaps.length): number {
  if (s.start < 0) return -1; /* 손님은 시작 자리를 모른다 — 결과가 나올 때까지 못 센다 */
  let at = s.start;
  for (let i = 0; i < upto; i++) {
    const { a, b } = s.swaps[i];
    if (at === a) at = b;
    else if (at === b) at = a;
  }
  return at;
}

/** 지금 몇 번째 바꿔치기까지 지났나. */
export function progress(s: ShellState, now: number): number {
  if (s.since === 0) return s.swaps.length;
  return Math.min(s.swaps.length, Math.floor((now - s.since) / s.swapMs));
}

function makeSwaps(ctx: GameCtx, n: number): Swap[] {
  const out: Swap[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor(ctx.rng() * CUPS);
    let b = Math.floor(ctx.rng() * (CUPS - 1));
    if (b >= a) b++;
    out.push({ a, b });
  }
  return out;
}

function newRound(ctx: GameCtx, round: number, base: Partial<ShellState>): ShellState {
  return {
    start: Math.floor(ctx.rng() * CUPS),
    swaps: makeSwaps(ctx, 4 + round * 2),
    swapMs: Math.max(180, SWAP_MS - round * SWAP_STEP),
    since: ctx.now,
    picks: ctx.seats.map(() => -1),
    score: base.score ?? ctx.seats.map(() => 0),
    round,
    showAt: 0,
    over: false
  };
}

export const shellgame: GameDef<ShellState, ShellAction> = {
  id: 'shellgame',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return newRound(ctx, 0, {});
  },

  /**
   * 감출 것은 **공이 처음 어디 있었나** 하나뿐이다.
   *
   * 바꿔치기 차례는 감추면 안 된다 — 그건 모두가 보는 공연이고, 가리면 손님 화면에서 컵이
   * 안 움직인다. 시작 자리를 모르면 끝 자리도 못 셈하므로 이 한 줄로 충분하다.
   */
  redact(s) {
    if (s.showAt !== 0) return s;
    return { ...s, start: -1 };
  },

  canAct(s, seat) {
    return !s.over && s.showAt === 0 && s.picks[seat] === -1;
  },

  reduce(s, a, seat, ctx) {
    if (s.over || s.showAt !== 0) return s;
    if (s.picks[seat] !== -1) return s;
    /* 섞는 동안에는 못 고른다 — 중간에 찍으면 눈으로 쫓을 이유가 없다. */
    if (progress(s, ctx.now) < s.swaps.length) return s;
    const cup = a?.cup;
    if (!Number.isInteger(cup) || cup < 0 || cup >= CUPS) return s;

    const picks = s.picks.map((v, i) => (i === seat ? cup : v));
    if (picks.some((v) => v === -1)) return { ...s, picks };

    const right = ballAt(s);
    const score = s.score.map((v, i) => v + (picks[i] === right ? 1 : 0));
    return { ...s, picks, score, showAt: ctx.now + 2200 };
  },

  tick(s, ctx) {
    if (s.over || s.showAt === 0 || ctx.now < s.showAt) return s;
    if (s.round + 1 >= ROUNDS) return { ...s, over: true };
    return newRound(ctx, s.round + 1, { score: s.score });
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    const top = Math.max(...s.score);
    const winners = ctx.seats.filter((_, i) => s.score[i] === top);
    return {
      over: true,
      scores: s.score,
      note:
        top === ROUNDS
          ? { key: 'arcade.shell.perfect', params: { who: winners.map((w) => w.name).join(', ') } }
          : { key: 'arcade.shell.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat, ctx): BotMove<ShellAction> | null {
    if (s.over || s.showAt !== 0 || s.picks[seat] !== -1) return null;
    if (progress(s, ctx.now) < s.swaps.length) return null;
    /* 봇도 눈으로 쫓는 셈 친다 — 판이 빨라질수록 더 자주 놓친다. */
    const right = ballAt(s);
    const keep = Math.max(0.25, 0.9 - s.round * 0.14);
    const cup = Math.random() < keep ? right : Math.floor(Math.random() * CUPS);
    return { action: { cup }, delayMs: 500 + Math.random() * 700 };
  }
};
