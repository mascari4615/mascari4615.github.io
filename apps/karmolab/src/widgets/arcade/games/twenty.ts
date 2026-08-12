/**
 * 스무고개 — 예/아니오로 좁힌다 (TASK-KL-242)
 *
 * 지금까지는 **모두가 같은 판을 봤다**(감춘 것이 있어도 「어디에 있나」는 대칭이었다).
 * 이건 다르다: 한 사람이 답을 쥐고, 나머지가 묻는다 — **역할이 비대칭인 첫 놀이**다.
 *
 * 커널이 이걸 감당하는 법: 답 쥔 자리를 상태에 두고 `redact` 로 **그 사람만** 답을 보게 한다.
 * 자리마다 다른 판을 보내는 구조라 여기서도 새 기능이 필요 없었다.
 *
 * 묻는 사람이 맞히면 묻는 쪽 승. 스무 번 안에 못 맞히면 답 쥔 쪽 승. 판마다 역할이 바뀐다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

const MAX_ASKS = 20;

export interface TwentyState {
  /** 정답 번호 (말 묶음의 낱말 차례). **답 쥔 사람만 본다** */
  answer: number;
  /** 후보 개수 — 화면이 넣어 준다 */
  pool: number;
  /** 답을 쥔 자리 */
  keeper: number;
  /** 지금까지 오간 것 */
  log: Array<{ q: number; yes: boolean }>;
  /** 지금 걸려 있는 질문 (답을 기다리는 중이면 번호, 아니면 -1) */
  pending: number;
  /** 누가 물었나 */
  asker: number;
  /** 이긴 자리 (아직이면 -1) */
  won: number;
  round: number;
}

export type TwentyAction =
  | { kind: 'ask'; q: number }
  | { kind: 'answer'; yes: boolean }
  | { kind: 'guess'; pick: number };

/**
 * 낱말·질문·**사실표**를 화면(말 묶음)이 넣어 준다.
 *
 * 사실표가 왜 여기 있어야 하나: 봇이 답을 쥐면 예/아니오를 **진짜로** 내야 한다. 대충 지어내면
 * 「살아 있나요?」에 아무 답이나 나오고, 그러면 좁혀 갈 수가 없어 놀이가 성립하지 않는다.
 * 낱말이 말마다 다르니 사실도 말 묶음에 있어야 한다 — 규칙 파일은 무엇이 참인지 모른다.
 */
let POOL = 12;
let QUESTIONS = 10;
/** `facts[낱말][질문]` = '1' 이면 예 */
let FACTS: string[] = [];

export function useTwentyPack(pool: number, questions: number, facts: string[]): void {
  POOL = Math.max(2, pool);
  QUESTIONS = Math.max(1, questions);
  FACTS = facts;
}

/** 그 낱말에 대해 그 질문의 답이 예인가. 표가 없으면 늘 아니오(놀이는 굴러가되 재미는 없다). */
export function factOf(answer: number, q: number): boolean {
  return FACTS[answer]?.[q] === '1';
}

export const twenty: GameDef<TwentyState, TwentyAction> = {
  id: 'twenty',
  seats: [2, 4],
  rounds: 2,

  init(ctx) {
    /* 판마다 답 쥔 사람이 바뀐다 — 한 사람만 계속 답을 쥐면 나머지는 늘 같은 일만 한다. */
    const keeper = ctx.round % ctx.seats.length;
    return {
      answer: Math.floor(ctx.rng() * POOL),
      pool: POOL,
      keeper,
      log: [],
      pending: -1,
      asker: -1,
      won: -1,
      round: ctx.round
    };
  },

  /** 답은 쥔 사람만 본다. */
  redact(s, seat) {
    return seat === s.keeper ? s : { ...s, answer: -1 };
  },

  canAct(s, seat) {
    if (s.won !== -1) return false;
    if (s.pending >= 0) return seat === s.keeper;
    return seat !== s.keeper;
  },

  reduce(s, a, seat) {
    if (s.won !== -1) return s;

    if (s.pending >= 0) {
      /* 답 쥔 사람이 예/아니오를 준다. */
      if (seat !== s.keeper || a?.kind !== 'answer') return s;
      return { ...s, log: [...s.log, { q: s.pending, yes: !!a.yes }], pending: -1, asker: -1 };
    }

    if (seat === s.keeper) return s;

    if (a?.kind === 'ask') {
      if (s.log.length >= MAX_ASKS) return s;
      const q = a.q;
      if (!Number.isInteger(q) || q < 0 || q >= QUESTIONS) return s;
      if (s.log.some((l) => l.q === q)) return s; /* 같은 걸 두 번 묻지 않는다 */
      return { ...s, pending: q, asker: seat };
    }

    if (a?.kind === 'guess') {
      const pick = a.pick;
      if (!Number.isInteger(pick) || pick < 0 || pick >= s.pool) return s;
      if (pick === s.answer) return { ...s, won: seat };
      /* 틀리면 질문 하나를 쓴 셈 친다. 스무 번을 다 쓰면 답 쥔 쪽이 이긴다. */
      const log = [...s.log, { q: -1, yes: false }];
      return { ...s, log, won: log.length >= MAX_ASKS ? s.keeper : -1 };
    }

    return s;
  },

  outcome(s, ctx): Outcome {
    if (s.won === -1) {
      if (s.log.length >= MAX_ASKS) {
        return {
          over: true,
          scores: ctx.seats.map((_, i) => (i === s.keeper ? 1 : 0)),
          note: { key: 'arcade.twenty.kept', params: { who: ctx.seats[s.keeper]?.name ?? '' } }
        };
      }
      return { over: false };
    }
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === s.won ? 1 : 0)),
      note: {
        key: s.won === s.keeper ? 'arcade.twenty.kept' : 'arcade.twenty.found',
        params: { who: ctx.seats[s.won]?.name ?? '', n: String(s.log.length) }
      }
    };
  },

  bot(s, seat): BotMove<TwentyAction> | null {
    if (s.won !== -1) return null;

    if (s.pending >= 0) {
      if (seat !== s.keeper) return null;
      /* 봇이 답을 쥐었다 — **사실표대로** 답한다. 지어내면 좁혀 갈 수가 없어 놀이가 안 된다. */
      const yes = factOf(s.answer, s.pending);
      return { action: { kind: 'answer', yes }, delayMs: 700 + Math.random() * 500 };
    }

    if (seat === s.keeper) return null;

    /* 아직 안 물은 것 중 하나. 열 번쯤 물었으면 찍어 본다. */
    if (s.log.length >= 8 && Math.random() < 0.4) {
      return { action: { kind: 'guess', pick: Math.floor(Math.random() * s.pool) }, delayMs: 900 };
    }
    const asked = new Set(s.log.map((l) => l.q));
    for (let q = 0; q < QUESTIONS; q++) {
      if (!asked.has(q)) return { action: { kind: 'ask', q }, delayMs: 800 + Math.random() * 600 };
    }
    return { action: { kind: 'guess', pick: Math.floor(Math.random() * s.pool) }, delayMs: 900 };
  }
};
