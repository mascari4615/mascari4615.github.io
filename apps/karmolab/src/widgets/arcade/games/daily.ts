/**
 * 오늘의 하나 맞히기. 네 갈래 (change.arcade-absorbs-play 단계 4)
 *
 * 옛 `/daily/` 정적 앱을 오락실 게임 하나로. 주제(포켓몬, 롯, 원신, 블루아카)와 갈래는 첫 화면에서
 * 옛 앱은 주제 곱하기 갈래로 페이지 15장. 표 넷이 다 속성 칸 여섯에 같은 갈래라 화면 하나면 됐음
 * 페이지를 구운 진짜 까닭은 검색이었고 오락실은 게임마다 정적 페이지가 이미 있다 (사용자 판단 2026-09-05)
 *
 * 갈래 넷. 시작 옵션 `mode`
 *  - 속성 (0): 이름을 넣으면 속성 칸마다 맞음, 가까움, 틀림. 여덟 번
 *  - 실루엣 (1): 규칙은 속성과 같고 화면이 그림만 어둡게 보여 줌. 여섯 번
 *  - 전부대기 (2): 조건에 드는 것을 90초 안에 최대한 많이
 *  - 격자판 (3): 가로세로 조건이 만나는 아홉 칸. 한 항목은 한 칸에만
 *
 * **표 전체를 상태에 안 싣는다.** 포켓몬만 1025 항목이라 방과 다시보기가 무거워진다. 첫 수는 그날의
 * 정답(또는 질문, 격자)만 싣고, 이름 찾기와 자동완성은 화면이 제 표로
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';
import { compareItem, isWin, type Cell, type DailyField, type DailyItem, type GridPuzzle, type ListQuestion } from './daily-engine';

export type DailyMode = 0 | 1 | 2 | 3;
export const MODE_ATTR = 0;
export const MODE_SILHOUETTE = 1;
export const MODE_LIST = 2;
export const MODE_GRID = 3;

export const TRIES_ATTR = 8;
export const TRIES_SILHOUETTE = 6;
export const LIST_MS = 90000;
export const GRID_TRIES = 15;

export interface DailyLane {
  /** 속성, 실루엣의 준 답들 */
  rows: Array<{ name: string; cells: Cell[] }>;
  /** 전부대기에서 맞힌 이름 */
  found: string[];
  /** 격자판. 아홉 칸에 넣은 이름 */
  grid: Array<Array<string | null>>;
  tries: number;
  won: boolean;
  done: boolean;
}
export interface DailyState {
  mode: DailyMode;
  topicId: string;
  title: string;
  fields: DailyField[];
  /** 속성, 실루엣의 정답. **답 쥔 자리 없이 모두에게 감춘다** (`redact`) */
  answer: DailyItem | null;
  question: ListQuestion | null;
  grid: GridPuzzle | null;
  /** 전부대기의 끝 시각 */
  endsAt: number;
  lanes: DailyLane[];
}
export type DailyAction =
  | { kind: 'load'; mode: DailyMode; topicId: string; title: string; fields: DailyField[]; answer?: DailyItem; question?: ListQuestion; grid?: GridPuzzle }
  | { kind: 'guess'; item: DailyItem }
  | { kind: 'name'; name: string }
  | { kind: 'place'; row: number; col: number; name: string };

const emptyLane = (): DailyLane => ({ rows: [], found: [], grid: [[null, null, null], [null, null, null], [null, null, null]], tries: 0, won: false, done: false });

const triesOf = (mode: DailyMode): number => (mode === MODE_SILHOUETTE ? TRIES_SILHOUETTE : mode === MODE_GRID ? GRID_TRIES : TRIES_ATTR);

const isField = (v: unknown): v is DailyField => {
  const f = v as DailyField | null;
  return !!f && typeof f === 'object' && typeof f.key === 'string' && typeof f.label === 'string';
};
const isItem = (v: unknown): v is DailyItem => {
  const it = v as DailyItem | null;
  return !!it && typeof it === 'object' && typeof it.name === 'string' && it.name.length > 0;
};

const nameKey = (v: unknown): string => String(v ?? '').trim().toLowerCase().replace(/[\s·・‧~'’.-]/g, '');

export const daily: GameDef<DailyState, DailyAction> = {
  id: 'daily',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx: GameCtx): DailyState {
    return { mode: MODE_ATTR, topicId: '', title: '', fields: [], answer: null, question: null, grid: null, endsAt: 0, lanes: ctx.seats.map(() => emptyLane()) };
  },

  /** 정답은 아무에게도 안 보낸다. 전부대기와 격자판의 답 목록도 */
  redact(s) {
    return {
      ...s,
      answer: s.answer ? { name: '', img: s.answer.img } : null,
      question: s.question ? { ...s.question, answers: [] } : null,
      grid: s.grid ? { ...s.grid, cells: s.grid.cells.map((r) => r.map(() => [])) } : null
    };
  },

  canAct(s, seat) {
    if (!s.topicId) return seat === 0;
    const l = s.lanes[seat];
    return !!l && !l.done;
  },

  reduce(s, a, seat, ctx) {
    if (!a || typeof a !== 'object') return s;
    if (!s.topicId) {
      if (seat !== 0 || a.kind !== 'load') return s;
      if (typeof a.topicId !== 'string' || !a.topicId || !Array.isArray(a.fields)) return s;
      const mode: DailyMode = a.mode === 1 || a.mode === 2 || a.mode === 3 ? a.mode : 0;
      const fields = a.fields.filter(isField);
      if (!fields.length) return s;
      if ((mode === MODE_ATTR || mode === MODE_SILHOUETTE) && !isItem(a.answer)) return s;
      if (mode === MODE_LIST && (!a.question || !Array.isArray(a.question.answers) || !a.question.answers.length)) return s;
      if (mode === MODE_GRID && (!a.grid || !Array.isArray(a.grid.cells) || a.grid.cells.length !== 3)) return s;
      return {
        mode,
        topicId: a.topicId,
        title: String(a.title ?? ''),
        fields,
        answer: mode === MODE_ATTR || mode === MODE_SILHOUETTE ? (a.answer as DailyItem) : null,
        question: mode === MODE_LIST ? (a.question as ListQuestion) : null,
        grid: mode === MODE_GRID ? (a.grid as GridPuzzle) : null,
        endsAt: mode === MODE_LIST ? ctx.now + LIST_MS : 0,
        lanes: ctx.seats.map(() => emptyLane())
      };
    }
    const lane = s.lanes[seat];
    if (!lane || lane.done) return s;
    const put = (next: DailyLane): DailyState => ({ ...s, lanes: s.lanes.map((l, i) => (i === seat ? next : l)) });

    if ((s.mode === MODE_ATTR || s.mode === MODE_SILHOUETTE) && a.kind === 'guess') {
      if (!isItem(a.item) || !s.answer) return s;
      if (lane.rows.some((r) => nameKey(r.name) === nameKey(a.item.name))) return s;
      const cells = compareItem({ id: s.topicId, title: s.title, fields: s.fields, items: [] }, a.item, s.answer);
      const won = isWin(cells);
      const tries = lane.tries + 1;
      return put({ ...lane, rows: lane.rows.concat([{ name: a.item.name, cells }]), tries, won, done: won || tries >= triesOf(s.mode) });
    }
    if (s.mode === MODE_LIST && a.kind === 'name') {
      if (typeof a.name !== 'string' || !a.name.trim() || !s.question) return s;
      if (ctx.now >= s.endsAt) return put({ ...lane, done: true });
      if (lane.found.some((n) => nameKey(n) === nameKey(a.name))) return s;
      const hit = s.question.answers.find((n) => nameKey(n) === nameKey(a.name));
      const tries = lane.tries + 1;
      if (!hit) return put({ ...lane, tries });
      const found = lane.found.concat([hit]);
      const all = found.length >= s.question.answers.length;
      return put({ ...lane, found, tries, won: all, done: all });
    }
    if (s.mode === MODE_GRID && a.kind === 'place') {
      if (!s.grid) return s;
      const { row, col } = a;
      if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 2 || col < 0 || col > 2) return s;
      if (typeof a.name !== 'string' || !a.name.trim()) return s;
      if (lane.grid[row][col]) return s;
      /* 한 항목은 한 칸에만 */
      if (lane.grid.some((r) => r.some((n) => n && nameKey(n) === nameKey(a.name)))) return s;
      const cell = s.grid.cells[row]?.[col] ?? [];
      const hitName = cell.find((n) => nameKey(n) === nameKey(a.name));
      const tries = lane.tries + 1;
      if (!hitName) return put({ ...lane, tries, done: tries >= GRID_TRIES });
      const grid = lane.grid.map((r, i) => r.map((n, j) => (i === row && j === col ? hitName : n)));
      const filled = grid.flat().filter(Boolean).length;
      return put({ ...lane, grid, tries, won: filled === 9, done: filled === 9 || tries >= GRID_TRIES });
    }
    return s;
  },

  tick(s, ctx) {
    if (s.mode !== MODE_LIST || !s.topicId || ctx.now < s.endsAt) return s;
    if (s.lanes.every((l) => l.done)) return s;
    return { ...s, lanes: s.lanes.map((l) => (l.done ? l : { ...l, done: true })) };
  },

  outcome(s, ctx): Outcome {
    if (!s.topicId || !s.lanes.every((l) => l.done)) return { over: false };
    /* 점수. 속성과 실루엣은 적게 쓸수록 높게, 전부대기는 맞힌 수, 격자판은 채운 칸 */
    const scores = s.lanes.map((l) => {
      if (s.mode === MODE_LIST) return l.found.length;
      if (s.mode === MODE_GRID) return l.grid.flat().filter(Boolean).length;
      return l.won ? triesOf(s.mode) + 1 - l.tries : 0;
    });
    const top = Math.max(...scores);
    const who = scores.indexOf(top);
    if (top <= 0) return { over: true, scores, note: { key: 'arcade.daily.note.none', sound: 'lose' } };
    const key = s.mode === MODE_LIST ? 'arcade.daily.note.list' : s.mode === MODE_GRID ? 'arcade.daily.note.grid' : 'arcade.daily.note.attr';
    const params = s.mode === MODE_LIST || s.mode === MODE_GRID
      ? { who: ctx.seats[who]?.name ?? '', n: String(top) }
      : { who: ctx.seats[who]?.name ?? '', n: String(triesOf(s.mode) + 1 - top) };
    return { over: true, scores, note: { key, params, sound: 'win' } };
  },

  /**
   * 봇은 표를 모름(상태에 안 실림). 그래서 속성 갈래는 헛짚기만, 전부대기와 격자판은 안 둠.
   * 사람 자리가 끝나면 봇 자리도 시도 상한에서 저절로 끝남
   */
  bot(s, seat, ctx): BotMove<DailyAction> | null {
    if (!s.topicId) {
      if (seat !== 0) return null;
      /* 봇끼리 검사용 최소 판. 속성 갈래, 칸 하나 */
      const fields: DailyField[] = [{ key: 'k', label: 'k', kind: 'category' }];
      return { action: { kind: 'load', mode: MODE_ATTR, topicId: 'bot', title: 'bot', fields, answer: { name: 'a', k: 'x' } }, delayMs: 200 };
    }
    const lane = s.lanes[seat];
    if (!lane || lane.done) return null;
    if (s.mode === MODE_ATTR || s.mode === MODE_SILHOUETTE) {
      const guess: DailyItem = { name: 'b' + lane.tries + '-' + seat };
      for (const f of s.fields) guess[f.key] = ctx.rng() < 0.3 ? 'x' : 'y' + Math.floor(ctx.rng() * 5);
      return { action: { kind: 'guess', item: guess }, delayMs: 900 + ctx.rng() * 1200 };
    }
    if (s.mode === MODE_LIST) return { action: { kind: 'name', name: 'z' + lane.tries }, delayMs: 1200 + ctx.rng() * 1500 };
    return { action: { kind: 'place', row: Math.floor(ctx.rng() * 3), col: Math.floor(ctx.rng() * 3), name: 'z' + lane.tries }, delayMs: 1200 + ctx.rng() * 1500 };
  }
};
