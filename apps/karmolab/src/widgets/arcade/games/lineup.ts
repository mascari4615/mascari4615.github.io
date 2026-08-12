/**
 * 한 줄 서기 — 남이 뭐라고 답했을지 맞힌다 (TASK-KL-242)
 *
 * 지금까지는 전부 **판**을 읽었다(돌·카드·공). 이건 처음으로 **사람**을 읽는다 —
 * 답을 맞히는 게 아니라 *남이 어떻게 답했을지*를 맞힌다. 그래서 혼자 하면 재미가 반이고,
 * 셋넷이 붙어야 산다(그래도 봇이 있으면 굴러가긴 한다).
 *
 * 한 판: 모두 「얼마나?」 질문에 몰래 숫자를 낸다 → 그다음 **작은 것부터 큰 것 순서로 사람을
 * 늘어놓아** 맞힌다. 순서가 맞은 만큼 점수.
 *
 * 질문은 말 묶음에서 온다 — 규칙 파일은 무엇을 묻는지 모른다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

const ROUNDS = 3;

export interface LineupState {
  /** 이번 판 질문 번호 (화면이 말 묶음에서 꺼낸다) */
  q: number;
  /** 자리별로 낸 숫자 (아직이면 null) */
  picks: Array<number | null>;
  /** 자리별로 「이 순서일 것」이라 답한 것 (자리 번호 배열) */
  guesses: Array<number[] | null>;
  /** 지금 무엇을 하는 때인가 */
  phase: 'pick' | 'order' | 'reveal';
  round: number;
  score: number[];
  /** 결과를 보여 주다 다음 판으로 넘어갈 시각. 0 이면 아직 아니다 */
  nextAt: number;
}

export type LineupAction = { kind: 'pick'; value: number } | { kind: 'order'; order: number[] };

/** 질문 몇 개가 있나 — 화면이 넣어 준다(말 묶음). 안 넣으면 이 값. */
let QUESTIONS = 8;
export function useQuestionCount(n: number): void {
  QUESTIONS = Math.max(1, n);
}

/** 진짜 순서 — 작은 것부터. 같으면 자리 번호로. */
function trueOrder(picks: Array<number | null>): number[] {
  return picks
    .map((v, i) => ({ v: v ?? 0, i }))
    .sort((a, b) => a.v - b.v || a.i - b.i)
    .map((x) => x.i);
}

/** 두 줄이 얼마나 닮았나 — 같은 자리에 같은 사람이 몇 명인가. */
function agree(a: number[], b: number[]): number {
  return a.reduce((n, v, i) => n + (b[i] === v ? 1 : 0), 0);
}

export const lineup: GameDef<LineupState, LineupAction> = {
  id: 'lineup',
  seats: [2, 6],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return {
      q: Math.floor(ctx.rng() * QUESTIONS),
      picks: ctx.seats.map(() => null),
      guesses: ctx.seats.map(() => null),
      phase: 'pick',
      round: 0,
      score: ctx.seats.map(() => 0),
      nextAt: 0
    };
  },

  /** 남이 낸 숫자는 순서를 맞힐 때까지 안 보인다. */
  redact(s, seat) {
    if (s.phase === 'reveal') return s;
    return { ...s, picks: s.picks.map((v, i) => (i === seat ? v : v === null ? null : -1)) };
  },

  canAct(s, seat) {
    if (s.phase === 'pick') return s.picks[seat] === null;
    if (s.phase === 'order') return s.guesses[seat] === null;
    return false;
  },

  reduce(s, a, seat, ctx) {
    const seats = ctx.seats.length;

    if (s.phase === 'pick') {
      if (a?.kind !== 'pick') return s;
      if (s.picks[seat] !== null) return s;
      const v = Math.max(0, Math.min(100, Math.round(a.value)));
      const picks = s.picks.map((x, i) => (i === seat ? v : x));
      return { ...s, picks, phase: picks.every((x) => x !== null) ? 'order' : 'pick' };
    }

    if (s.phase === 'order') {
      if (a?.kind !== 'order' || !Array.isArray(a.order)) return s;
      if (s.guesses[seat] !== null) return s;
      /* 자리 번호가 하나씩 다 들어 있어야 한다 — 아니면 안 받는다. */
      const ok = a.order.length === seats && new Set(a.order).size === seats &&
        a.order.every((n) => Number.isInteger(n) && n >= 0 && n < seats);
      if (!ok) return s;
      const guesses = s.guesses.map((x, i) => (i === seat ? a.order.slice() : x));
      if (!guesses.every((x) => x !== null)) return { ...s, guesses };

      /* 다 냈다 — 맞은 자리 수만큼 점수. */
      const real = trueOrder(s.picks);
      const score = s.score.map((v, i) => v + agree(guesses[i] as number[], real));
      /* 결과를 잠깐 보여 준 뒤 다음 판. **넘기는 일도 커널 안에서** 한다 —
         화면이 상태를 바꾸면 주인과 손님이 서로 다른 판을 보게 된다. */
      return { ...s, guesses, score, phase: 'reveal', nextAt: ctx.now + 3500 };
    }

    return s;
  },

  /** 보여 줄 시간이 지나면 다음 판을 세운다. */
  tick(s, ctx) {
    if (s.phase !== 'reveal' || s.nextAt === 0 || ctx.now < s.nextAt) return s;
    if (s.round + 1 >= ROUNDS) return s;
    return {
      ...s,
      q: Math.floor(ctx.rng() * QUESTIONS),
      picks: ctx.seats.map(() => null),
      guesses: ctx.seats.map(() => null),
      phase: 'pick',
      round: s.round + 1,
      nextAt: 0
    };
  },

  outcome(s, ctx): Outcome {
    if (s.phase !== 'reveal') return { over: false };
    if (s.round + 1 < ROUNDS) return { over: false };
    const top = Math.max(...s.score);
    const winners = ctx.seats.filter((_, i) => s.score[i] === top);
    return {
      over: true,
      scores: s.score,
      note: { key: 'arcade.lineup.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat, ctx): BotMove<LineupAction> | null {
    if (s.phase === 'pick') {
      if (s.picks[seat] !== null) return null;
      return { action: { kind: 'pick', value: Math.floor(Math.random() * 101) }, delayMs: 800 + Math.random() * 900 };
    }
    if (s.phase === 'order') {
      if (s.guesses[seat] !== null) return null;
      /* 봇은 남의 숫자를 안 본다 — 자기 자리를 어림으로 끼우고 나머지는 섞는다. */
      const seats = ctx.seats.length;
      const order = Array.from({ length: seats }, (_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      return { action: { kind: 'order', order }, delayMs: 1000 + Math.random() * 1200 };
    }
    return null;
  }
};
