/**
 * 오늘의 초성. 초성만 보고 낱말 다섯 (change.arcade-absorbs-play 단계 4)
 *
 * 놀이터의 초성 맞히기를 오락실 게임으로. 답은 이 사이트의 도구 이름이라 맞히면 그 도구를 알게 됨.
 * 문제는 첫 수 `load` 가 싣는다(화면이 `core/dailycho` 에서 오늘 것을 만듦. 한국 시간으로 하루 한 벌).
 * 자리마다 다섯 칸을 채우고 채점. 맞힌 수가 점수. 채점은 `core/dailycho` 의 것을 그대로 써서
 * 화면과 공유 격자가 서로 다른 말을 안 함
 *
 * 답은 상태에 있으나 `redact` 로 남의 창에는 안 나감. DOM 에는 맞힌 칸에만 글자
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';
import { grade, puzzleFor, type ChoPuzzle } from '../../../core/dailycho';
import type { Mark } from '../../../core/daily';

export interface ChoLane {
  answers: string[];
  /** 채점했나. 그 뒤로는 못 고침 */
  done: boolean;
  marks: Mark[];
  right: number;
}
export interface ChoState {
  puzzle: ChoPuzzle | null;
  lanes: ChoLane[];
}
export type ChoAction =
  | { kind: 'load'; puzzle: ChoPuzzle }
  | { kind: 'answer'; i: number; text: string }
  | { kind: 'submit' };

const isPuzzle = (v: unknown): v is ChoPuzzle => {
  const p = v as ChoPuzzle | null;
  return !!p && typeof p === 'object' && Array.isArray(p.questions) && p.questions.length > 0 &&
    p.questions.every((q) => q && typeof q.hint === 'string' && typeof q.answer === 'string' && typeof q.length === 'number');
};

const emptyLane = (n: number): ChoLane => ({ answers: Array.from({ length: n }, () => ''), done: false, marks: [], right: 0 });

export const dailycho: GameDef<ChoState, ChoAction> = {
  id: 'dailycho',
  seats: [1, 4],
  rounds: 1,

  init(ctx: GameCtx): ChoState {
    return { puzzle: null, lanes: ctx.seats.map(() => emptyLane(0)) };
  },

  /** 답은 남의 창에 안 보냄. 맞힌 칸의 답은 화면이 제 입력으로 안다 */
  redact(s) {
    if (!s.puzzle) return s;
    return { ...s, puzzle: { ...s.puzzle, questions: s.puzzle.questions.map((q) => ({ ...q, answer: '' })) } };
  },

  canAct(s, seat) {
    if (!s.puzzle) return seat === 0;
    return !!s.lanes[seat] && !s.lanes[seat].done;
  },

  reduce(s, a, seat, ctx) {
    if (!a || typeof a !== 'object') return s;
    if (!s.puzzle) {
      if (seat !== 0 || a.kind !== 'load' || !isPuzzle(a.puzzle)) return s;
      const puzzle: ChoPuzzle = { date: String(a.puzzle.date ?? ''), day: Number(a.puzzle.day) || 0, questions: a.puzzle.questions.map((q) => ({ hint: q.hint, length: q.length, tool: String(q.tool ?? ''), answer: q.answer })) };
      return { puzzle, lanes: ctx.seats.map(() => emptyLane(puzzle.questions.length)) };
    }
    const lane = s.lanes[seat];
    if (!lane || lane.done) return s;
    if (a.kind === 'answer') {
      if (!Number.isInteger(a.i) || a.i < 0 || a.i >= lane.answers.length || typeof a.text !== 'string') return s;
      const answers = lane.answers.slice();
      answers[a.i] = a.text.slice(0, 16);
      return { ...s, lanes: s.lanes.map((l, i) => (i === seat ? { ...l, answers } : l)) };
    }
    if (a.kind === 'submit') {
      const r = grade(s.puzzle, lane.answers);
      return { ...s, lanes: s.lanes.map((l, i) => (i === seat ? { ...l, done: true, marks: r.marks, right: r.right } : l)) };
    }
    return s;
  },

  outcome(s, ctx): Outcome {
    if (!s.puzzle || !s.lanes.every((l) => l.done)) return { over: false };
    const scores = s.lanes.map((l) => l.right);
    const top = Math.max(...scores);
    const who = scores.indexOf(top);
    return { over: true, scores, note: { key: 'arcade.dailycho.note', params: { who: ctx.seats[who]?.name ?? '', n: String(top), total: String(s.puzzle.questions.length) }, sound: top > 0 ? 'win' : 'lose' } };
  },

  /** 봇은 칸마다 반은 맞힘. 문제가 없으면(봇끼리 검사) 정해진 날의 것을 싣는다 */
  bot(s, seat, ctx): BotMove<ChoAction> | null {
    if (!s.puzzle) {
      if (seat !== 0) return null;
      return { action: { kind: 'load', puzzle: puzzleFor('2026-01-01') }, delayMs: 200 };
    }
    const lane = s.lanes[seat];
    if (!lane || lane.done) return null;
    const i = lane.answers.findIndex((x) => !x);
    if (i < 0) return { action: { kind: 'submit' }, delayMs: 600 };
    const q = s.puzzle.questions[i];
    const text = ctx.rng() < 0.5 ? q.answer : '?'.repeat(Math.max(1, q.length));
    return { action: { kind: 'answer', i, text }, delayMs: 900 + ctx.rng() * 900 };
  }
};
