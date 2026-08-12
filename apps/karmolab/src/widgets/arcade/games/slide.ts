/**
 * 조각 맞추기 경주 — 같은 판을 놓고 누가 먼저 (TASK-KL-242)
 *
 * 클럽하우스의 「슬라이딩 퍼즐」은 혼자 하는 놀이다. 여기서는 **같은 씨앗으로 흐트러진 같은 판**을
 * 모두에게 주고 먼저 맞추는 쪽이 이긴다 — 혼자 하던 것을 여럿이 하게 만드는 방법은 대개 이거다.
 *
 * 이 게임이 커널에서 처음 밟는 자리: **자리 최소가 1**이다. 혼자 열면 봇이 안 앉는다
 * (`bot` 이 한 번도 안 불린다). 51개 중에 혼자만 하는 것들이 여기로 들어온다.
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

/** 4×4 = 15조각. 3×3 은 너무 쉽고 5×5 는 폰에서 손이 아프다. */
export const N = 4;
const SIZE = N * N;
/** 빈 칸을 이렇게 많이 흔든다. 무작위 배열은 절반이 못 맞추는 판이라 **섞지 않고 민다**. */
const SHUFFLE = 200;
/**
 * 판이 끝나는 시각. **경주에 끝이 없으면 그건 경주가 아니다** — 아무도 못 맞추면 화면이 영영
 * 안 닫힌다(봇만 있는 방에서 실제로 안 끝났다). 시간이 다 되면 제자리에 든 조각이 많은 쪽이 이긴다.
 */
const LIMIT_MS = 180000;

export interface SlideState {
  /** 자리별 판. 0 = 빈 칸 */
  boards: number[][];
  /** 맞춘 자리 (아직이면 -1) */
  won: number;
  /** 자리별 민 횟수 */
  moves: number[];
  /** 이 시각을 넘기면 끝난다 (커널 시계) */
  endsAt: number;
  /** 시간이 다 됐나 */
  timeUp: boolean;
}

export type SlideAction = { cell: number };

const solved = (b: number[]): boolean => b.every((v, i) => (i === SIZE - 1 ? v === 0 : v === i + 1));

/** 빈 칸 옆인가. 판을 넘어가는 이동은 막는다(맨 왼쪽에서 왼쪽은 없다). */
function adjacent(a: number, b: number): boolean {
  const ax = a % N;
  const ay = Math.floor(a / N);
  const bx = b % N;
  const by = Math.floor(b / N);
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

/**
 * **맞춘 판에서 거꾸로 민다.** 무작위로 늘어놓으면 절반은 아무리 밀어도 못 맞추는 판이 된다
 * (홀짝이 안 맞는다). 미는 것으로만 흐트러뜨리면 반드시 되돌릴 수 있다.
 */
function scramble(ctx: GameCtx): number[] {
  const b = Array.from({ length: SIZE }, (_, i) => (i === SIZE - 1 ? 0 : i + 1));
  let empty = SIZE - 1;
  for (let n = 0; n < SHUFFLE; n++) {
    const near = b.map((_, i) => i).filter((i) => adjacent(i, empty));
    const pick = near[Math.floor(ctx.rng() * near.length)];
    b[empty] = b[pick];
    b[pick] = 0;
    empty = pick;
  }
  return solved(b) ? scramble(ctx) : b;
}

export const slide: GameDef<SlideState, SlideAction> = {
  id: 'slide',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx) {
    /* 모두 **같은 판**을 받는다 — 판이 다르면 누가 빨랐는지가 아니라 누가 쉬운 판을 받았는지가 된다. */
    const one = scramble(ctx);
    return {
      boards: ctx.seats.map(() => one.slice()),
      won: -1,
      moves: ctx.seats.map(() => 0),
      endsAt: ctx.now + LIMIT_MS,
      timeUp: false
    };
  },

  canAct(s, seat) {
    return s.won === -1 && !s.timeUp && !!s.boards[seat];
  },

  reduce(s, a, seat) {
    if (s.won !== -1 || s.timeUp) return s;
    const b = s.boards[seat];
    if (!b) return s;
    const i = a?.cell;
    if (typeof i !== 'number' || i < 0 || i >= SIZE || b[i] === 0) return s;
    const empty = b.indexOf(0);
    if (!adjacent(i, empty)) return s;

    const nb = b.slice();
    nb[empty] = nb[i];
    nb[i] = 0;
    const boards = s.boards.map((x, k) => (k === seat ? nb : x));
    const moves = s.moves.map((m, k) => (k === seat ? m + 1 : m));
    return { ...s, boards, moves, won: solved(nb) ? seat : -1 };
  },

  tick(s, ctx) {
    if (s.won !== -1 || s.timeUp || ctx.now < s.endsAt) return s;
    return { ...s, timeUp: true };
  },

  outcome(s, ctx): Outcome {
    if (s.won === -1 && !s.timeUp) return { over: false };

    if (s.won === -1) {
      /* 시간이 다 됐다 — 제자리에 든 조각이 제일 많은 쪽. 같으면 아무도 못 가져간다. */
      const home = s.boards.map((b) => b.filter((v, i) => v !== 0 && v === i + 1).length);
      const top = Math.max(...home);
      const winners = home.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0);
      if (winners.length === ctx.seats.length) {
        return { over: true, scores: ctx.seats.map(() => 0), note: { key: 'arcade.slide.timeup' } };
      }
      return {
        over: true,
        scores: ctx.seats.map((_, i) => (winners.includes(i) ? 1 : 0)),
        note: {
          key: 'arcade.slide.closest',
          params: { who: winners.map((i) => ctx.seats[i]?.name ?? '').join(', '), n: String(top) }
        }
      };
    }

    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === s.won ? 1 : 0)),
      note: {
        key: 'arcade.slide.win',
        params: { who: ctx.seats[s.won]?.name ?? '', n: String(s.moves[s.won]) }
      }
    };
  },

  /**
   * 혼자 열면 이 함수는 한 번도 안 불린다(자리 최소가 1이라 봇이 안 앉는다).
   * 여럿일 때만 빈 자리를 메우는데, **푸는 척만 한다** — 최단 경로로 밀면 사람이 한 번도 못 이긴다.
   */
  bot(s, seat): BotMove<SlideAction> | null {
    if (s.won !== -1 || s.timeUp) return null;
    const b = s.boards[seat];
    if (!b) return null;
    const empty = b.indexOf(0);
    const near = b.map((_, i) => i).filter((i) => adjacent(i, empty));
    if (!near.length) return null;
    /* 제자리에 없는 조각을 살짝 더 자주 고른다 — 아주 느리게, 그러나 나아지긴 한다. */
    const wrong = near.filter((i) => b[i] !== i + 1);
    const pool = wrong.length && Math.random() < 0.7 ? wrong : near;
    return { action: { cell: pool[Math.floor(Math.random() * pool.length)] }, delayMs: 900 + Math.random() * 900 };
  }
};
