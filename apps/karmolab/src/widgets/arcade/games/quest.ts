/**
 * 오늘의 문제. 도구를 열어야 풀리는 하루 한 문제 (change.arcade-absorbs-play 단계 4)
 *
 * 놀이터의 오늘의 문제를 오락실 게임으로. 문제는 첫 수 `load` 가 싣는다(화면이 오늘 것을 고름).
 * 답 대조는 둘 중 하나: 표에 적힌 문제는 답의 지문(sha-256 앞 16자)만 있어 화면이 지문을 만들어 보내고
 * 여기서 견줌. 그날 만든 문제(진법, 단위, 용량, 시간)는 값으로 실려 와 여기서 바로 셈.
 * 자리마다 다섯 번. 맞히면 6 에서 쓴 횟수를 뺀 것이 점수
 *
 * 규칙 파일에 한국어 없음. 질문과 힌트 글은 화면이 만들어 첫 수에 실음
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

/** 그날 만든 문제의 셈. 값만 */
export type QuestGen =
  | { kind: 'radix'; n: number; base: number }
  | { kind: 'unit'; want: number }
  | { kind: 'bytes'; mb: number }
  | { kind: 'time'; total: number };

export interface QuestPuzzle {
  id: string;
  q: string;
  hint: string;
  tool: string;
  /** 표 문제. 답 지문 목록 */
  a?: string[];
  gen?: QuestGen;
}
export interface QuestLane {
  tries: number;
  won: boolean;
  out: boolean;
  /** 마지막에 낸 답. 화면이 다시 보여 줌 */
  last: string;
}
export interface QuestState {
  puzzle: QuestPuzzle | null;
  lanes: QuestLane[];
}
export type QuestAction =
  | { kind: 'load'; puzzle: QuestPuzzle }
  | { kind: 'try'; raw: string; fp?: string };

export const MAX_TRIES = 5;

export const norm = (s: string): string => s.toLowerCase().replace(/[\s,]/g, '');

/** 그날 만든 문제의 정답 판정 */
export function genHit(g: QuestGen, raw: string): boolean {
  const v = norm(raw);
  if (g.kind === 'radix') return v.replace(/^0[bxo]/, '') === g.n.toString(g.base);
  if (g.kind === 'unit') return Math.abs(parseFloat(v) - g.want) < 0.15;
  if (g.kind === 'bytes') return parseFloat(v.replace(/kb$/, '')) === g.mb * 1024;
  return parseFloat(v.replace(/분$/, '')) === g.total;
}

/** 봇이 그날 만든 문제에 낼 답 */
export function genAnswer(g: QuestGen): string {
  if (g.kind === 'radix') return g.n.toString(g.base);
  if (g.kind === 'unit') return g.want.toFixed(1);
  if (g.kind === 'bytes') return String(g.mb * 1024);
  return String(g.total);
}

const isGen = (v: unknown): v is QuestGen => {
  const g = v as QuestGen | null;
  if (!g || typeof g !== 'object') return false;
  if (g.kind === 'radix') return Number.isFinite(g.n) && [2, 8, 16].indexOf(g.base) >= 0;
  if (g.kind === 'unit') return Number.isFinite(g.want);
  if (g.kind === 'bytes') return Number.isFinite(g.mb);
  if (g.kind === 'time') return Number.isFinite(g.total);
  return false;
};
const isPuzzle = (v: unknown): v is QuestPuzzle => {
  const p = v as QuestPuzzle | null;
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || typeof p.q !== 'string') return false;
  return (Array.isArray(p.a) && p.a.every((x) => typeof x === 'string')) || isGen(p.gen);
};

const emptyLane = (): QuestLane => ({ tries: 0, won: false, out: false, last: '' });

export const quest: GameDef<QuestState, QuestAction> = {
  id: 'quest',
  seats: [1, 4],
  rounds: 1,

  init(ctx: GameCtx): QuestState {
    return { puzzle: null, lanes: ctx.seats.map(() => emptyLane()) };
  },

  canAct(s, seat) {
    if (!s.puzzle) return seat === 0;
    const l = s.lanes[seat];
    return !!l && !l.won && !l.out;
  },

  reduce(s, a, seat, ctx) {
    if (!a || typeof a !== 'object') return s;
    if (!s.puzzle) {
      if (seat !== 0 || a.kind !== 'load' || !isPuzzle(a.puzzle)) return s;
      const p = a.puzzle;
      const puzzle: QuestPuzzle = { id: p.id, q: p.q, hint: String(p.hint ?? ''), tool: String(p.tool ?? ''), a: p.a ? p.a.slice(0, 8) : undefined, gen: p.gen };
      return { puzzle, lanes: ctx.seats.map(() => emptyLane()) };
    }
    if (a.kind !== 'try' || typeof a.raw !== 'string' || !a.raw.trim()) return s;
    const l = s.lanes[seat];
    if (!l || l.won || l.out) return s;
    const hit = s.puzzle.gen ? genHit(s.puzzle.gen, a.raw) : typeof a.fp === 'string' && (s.puzzle.a ?? []).indexOf(a.fp) >= 0;
    const tries = l.tries + 1;
    const lane: QuestLane = { tries, won: hit, out: !hit && tries >= MAX_TRIES, last: a.raw.slice(0, 40) };
    return { ...s, lanes: s.lanes.map((x, i) => (i === seat ? lane : x)) };
  },

  outcome(s, ctx): Outcome {
    if (!s.puzzle || !s.lanes.every((l) => l.won || l.out)) return { over: false };
    const scores = s.lanes.map((l) => (l.won ? MAX_TRIES + 1 - l.tries : 0));
    const top = Math.max(...scores);
    const who = scores.indexOf(top);
    if (top <= 0) return { over: true, scores, note: { key: 'arcade.quest.note.none', sound: 'lose' } };
    return { over: true, scores, note: { key: 'arcade.quest.note', params: { who: ctx.seats[who]?.name ?? '', n: String(MAX_TRIES + 1 - top) }, sound: 'win' } };
  },

  /** 봇은 그날 만든 문제만 안다. 한두 번 틀린 뒤 맞힘. 표 문제는 다섯 번 헛짚음 */
  bot(s, seat, ctx): BotMove<QuestAction> | null {
    if (!s.puzzle) {
      if (seat !== 0) return null;
      return { action: { kind: 'load', puzzle: { id: 'bot', q: 'bot', hint: '', tool: 'timecalc', gen: { kind: 'time', total: 125 } } }, delayMs: 200 };
    }
    const l = s.lanes[seat];
    if (!l || l.won || l.out) return null;
    const g = s.puzzle.gen;
    const right = !!g && (l.tries >= 2 || ctx.rng() < 0.35);
    const raw = right && g ? genAnswer(g) : String(Math.floor(ctx.rng() * 999));
    return { action: { kind: 'try', raw }, delayMs: 1500 + ctx.rng() * 2500 };
  }
};
