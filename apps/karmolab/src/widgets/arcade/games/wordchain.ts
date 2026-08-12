/**
 * 끝말잇기 — 앞사람 끝 글자로 시작한다 (TASK-KL-242)
 *
 * 스물셋 중 **말로 하는 첫 놀이**다. 그리고 여기서 처음으로 규칙이 *말 자체*에 걸린다 —
 * 「끝 글자」는 한국어에서만 뜻이 통하고, 영어·일본어에서는 다른 규칙이 된다.
 *
 * 그래서 낱말 목록을 게임 파일에 두지 않고 **말 묶음에서 받는다**(`arcade.chain.words`).
 * 한국어면 끝말잇기, 영어면 끝 **알파벳**, 일본어면 시리토리 — 같은 규칙이 말마다 제 모습이 된다.
 * 규칙 파일은 여전히 말을 모른다. 「이어지나」를 묻는 함수만 밖에서 받는다.
 *
 * 못 이으면 진다. 남은 사람이 하나면 그 사람이 이긴다.
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

/** 낱말 목록과 「이어지나」 판단 — 화면(말 묶음)이 넣어 준다. */
export interface WordPack {
  words: string[];
  /** `prev` 다음에 `next` 를 놓을 수 있나 */
  links(prev: string, next: string): boolean;
}

/** 기본 = 한국어 끝말잇기. 말 묶음이 안 오면 이걸 쓴다. */
export const KO_PACK: WordPack = {
  words: [
    '사과', '과일', '일기', '기차', '차선', '선물', '물감', '감자', '자연', '연필',
    '필통', '통조림', '림보', '보리', '리본', '본색', '색종이', '이불', '불꽃', '꽃병',
    '병아리', '리듬', '음악', '악기', '기린', '인형', '형광', '광장', '장미', '미소',
    '소나기', '기자', '자전거', '거울', '울음', '음식', '식탁', '탁구', '구름', '음료',
    '요리', '이야기', '기억', '억새', '새벽', '벽돌', '돌고래', '래시', '시계', '계단'
  ],
  links: (prev, next) => !!prev && !!next && prev[prev.length - 1] === next[0]
};

export interface ChainState {
  /** 지금까지 이어진 낱말 */
  chain: string[];
  /** 자리별로 아직 살아 있나 */
  alive: boolean[];
  turn: number;
  /** 이번 차례가 끝나는 시각 — 오래 못 대면 진다 */
  endsAt: number;
  /** 진 자리 차례 */
  out: number[];
}

export type ChainAction = { word: string };

const LIMIT_MS = 15000;

/** 화면이 넣어 준 낱말 목록. 없으면 한국어 기본. */
let PACK: WordPack = KO_PACK;
export function useWordPack(pack: WordPack): void {
  PACK = pack;
}

const aliveCount = (s: ChainState): number => s.alive.filter(Boolean).length;

function nextAlive(s: ChainState, from: number): number {
  for (let k = 1; k <= s.alive.length; k++) {
    const i = (from + k) % s.alive.length;
    if (s.alive[i]) return i;
  }
  return from;
}

export const wordchain: GameDef<ChainState, ChainAction> = {
  id: 'wordchain',
  seats: [2, 4],
  rounds: 1,
  realtime: true,

  init(ctx: GameCtx) {
    const first = PACK.words[Math.floor(ctx.rng() * PACK.words.length)];
    return {
      chain: [first],
      alive: ctx.seats.map(() => true),
      turn: 0,
      endsAt: ctx.now + LIMIT_MS,
      out: []
    };
  },

  canAct(s, seat) {
    return s.alive[seat] && s.turn === seat && aliveCount(s) > 1;
  },

  reduce(s, a, seat, ctx) {
    if (!s.alive[seat] || s.turn !== seat) return s;
    const word = typeof a?.word === 'string' ? a.word.trim() : '';
    if (!word) return s;
    const prev = s.chain[s.chain.length - 1];
    if (!PACK.links(prev, word)) return s;
    /* 한 번 나온 낱말은 다시 못 쓴다 — 안 그러면 둘이 같은 말을 주고받으며 안 끝난다. */
    if (s.chain.includes(word)) return s;

    return { ...s, chain: [...s.chain, word], turn: nextAlive(s, seat), endsAt: ctx.now + LIMIT_MS };
  },

  /** 시간이 다 되면 그 사람이 떨어진다. */
  tick(s, ctx) {
    if (aliveCount(s) <= 1 || ctx.now < s.endsAt) return s;
    const alive = s.alive.map((v, i) => (i === s.turn ? false : v));
    const out = [...s.out, s.turn];
    const rest = { ...s, alive, out };
    return { ...rest, turn: nextAlive(rest, s.turn), endsAt: ctx.now + LIMIT_MS };
  },

  outcome(s, ctx): Outcome {
    if (aliveCount(s) > 1) return { over: false };
    const win = s.alive.findIndex(Boolean);
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === win ? 1 : 0)),
      note: { key: 'arcade.chain.win', params: { who: ctx.seats[win]?.name ?? '', n: String(s.chain.length) } }
    };
  },

  bot(s, seat): BotMove<ChainAction> | null {
    if (!s.alive[seat] || s.turn !== seat || aliveCount(s) <= 1) return null;
    const prev = s.chain[s.chain.length - 1];
    const can = PACK.words.filter((w) => PACK.links(prev, w) && !s.chain.includes(w));
    /* 못 이으면 아무 말도 안 한다 — 시간이 다 되어 스스로 떨어진다(사람과 같은 조건). */
    if (!can.length) return null;
    /* 다섯 번에 한 번쯤은 못 찾은 척 넘긴다. 봇이 사전을 다 알면 사람이 못 이긴다. */
    if (Math.random() < 0.2) return null;
    const pick = can[Math.floor(Math.random() * can.length)];
    return { action: { word: pick }, delayMs: 1500 + Math.random() * 3500 };
  }
};
