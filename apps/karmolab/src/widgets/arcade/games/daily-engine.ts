/**
 * 오늘의 하나 맞히기. 순수 셈 (change.arcade-absorbs-play 단계 4)
 *
 * 옛 `apps/daily/engine.mjs` 를 타입 붙여 옮긴 것. DOM, fetch, 저장을 모름.
 * 주제(포켓몬, 롯 등)는 표일 뿐이라 새 주제가 늘어도 여기는 안 바뀜. 그게 이 게임의 설계 목표
 *
 * 옛 앱은 주제 곱하기 모드로 페이지 15장을 구웠다. 표 넷의 속성 칸이 다 여섯이고 갈래도 같아
 * 화면 하나면 충분했다. 페이지를 구운 진짜 이유는 검색이었고, 오락실은 게임마다 정적 페이지가
 * 이미 있다 (사용자 판단 2026-09-05)
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** 1번 문제가 시작된 날 (KST). 문제 번호는 여기서부터 며칠째 */
export const EPOCH_DAY_NUMBER = Math.floor(Date.UTC(2026, 0, 1) / DAY_MS);

export type FieldKind = 'number' | 'set' | 'category';
export interface DailyField {
  key: string;
  label: string;
  kind: FieldKind;
  unit?: string;
  /** 숫자 칸에서 이만큼 안이면 가까움 */
  near?: number;
  nearRatio?: number;
}
export interface DailyItem {
  name: string;
  img?: string;
  [k: string]: string | string[] | number | undefined;
}
export interface DailyTopic {
  id: string;
  title: string;
  emoji?: string;
  fields: DailyField[];
  items: DailyItem[];
}
export type CellState = 'exact' | 'near' | 'wrong';
export interface Cell {
  key: string;
  value: string | string[] | number | undefined;
  state: CellState;
  /** 숫자 칸에서 정답이 더 큰가 작은가 */
  dir: 'up' | 'down' | null;
}

export function kstDayNumber(at: Date = new Date()): number {
  return Math.floor((at.getTime() + KST_OFFSET_MS) / DAY_MS);
}
export function kstDayKey(at: Date = new Date()): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}
/** 오늘 문제 번호 (1부터). 사람에게 보이는 번호이자 공유 글에 박히는 값 */
export function puzzleNumber(at: Date = new Date()): number {
  return kstDayNumber(at) - EPOCH_DAY_NUMBER + 1;
}

function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 하루 하나 고르기. 뽑기가 아니라 **순열**.
 * 매일 해시로 찍으면 한 해 안에 같은 정답이 여러 번 나온다. 주기(항목 수)마다 순서를 새로 섞고
 * 그 줄을 따라가므로 한 주기 안에 중복 0
 *
 * `salt` 는 모드 이름. 같은 주제라도 모드가 다르면 정답이 달라야 하루에 두 판을 두는 뜻이 있음
 */
export function dailyIndex(topicId: string, dayNumber: number, count: number, salt = ''): number {
  if (count <= 0) throw new Error('빈 표에서는 문제를 못 낸다');
  const cycle = Math.floor(dayNumber / count);
  const rand = mulberry32(hash32(salt ? `${topicId}:${salt}:${cycle}` : `${topicId}:${cycle}`));
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[((dayNumber % count) + count) % count];
}

export function answerOf(topic: DailyTopic, at: Date = new Date(), mode = ''): DailyItem {
  return topic.items[dailyIndex(topic.id, kstDayNumber(at), topic.items.length, mode)];
}

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();
/**
 * 이름 찾기용 다듬기. 띄어쓰기와 가운뎃점을 지움
 * 띄어 쓴 이름이 스물둘인데 사람은 대개 붙여 친다. 붙여 쳤다고 못 찾으면 그건 우리 잘못
 */
const nameKey = (v: unknown): string => norm(v).replace(/[\s·・‧~'’.-]/g, '');

/** 속성 한 칸 견주기 */
export function compareField(field: DailyField, guessValue: unknown, answerValue: unknown): { state: CellState; dir: 'up' | 'down' | null } {
  if (field.kind === 'number') {
    const g = Number(guessValue);
    const a = Number(answerValue);
    if (!Number.isFinite(g) || !Number.isFinite(a)) return { state: 'wrong', dir: null };
    if (g === a) return { state: 'exact', dir: null };
    const dir: 'up' | 'down' = a > g ? 'up' : 'down';
    const gap = Math.abs(a - g);
    const tolerance = field.near ?? (field.nearRatio ? Math.abs(a) * field.nearRatio : 0);
    return { state: tolerance > 0 && gap <= tolerance ? 'near' : 'wrong', dir };
  }
  if (field.kind === 'set') {
    const g = (Array.isArray(guessValue) ? guessValue : []).map(norm);
    const a = (Array.isArray(answerValue) ? answerValue : []).map(norm);
    const same = g.length === a.length && a.every((v) => g.indexOf(v) >= 0);
    if (same) return { state: 'exact', dir: null };
    return { state: g.some((v) => a.indexOf(v) >= 0) ? 'near' : 'wrong', dir: null };
  }
  return { state: norm(guessValue) === norm(answerValue) ? 'exact' : 'wrong', dir: null };
}

/** 추측 한 줄. 속성 칸들 */
export function compareItem(topic: DailyTopic, guess: DailyItem, answer: DailyItem): Cell[] {
  return topic.fields.map((field) => {
    const r = compareField(field, guess[field.key], answer[field.key]);
    return { key: field.key, value: guess[field.key], state: r.state, dir: r.dir };
  });
}

/**
 * 한 줄을 말로. 색과 화살표로만 알려 주면 화면 낭독기 쓰는 사람에게는 아무 말도 안 한 것
 */
export function describeRow(fields: DailyField[], cells: Cell[], name: string): string {
  const parts = cells.map((c, i) => {
    const label = fields[i].label;
    const value = Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '');
    if (c.state === 'exact') return `${label} ${value} 맞음`;
    if (c.dir) return `${label} ${value}, 정답은 더 ${c.dir === 'up' ? '큼' : '작음'}${c.state === 'near' ? ' (가까움)' : ''}`;
    return `${label} ${value} ${c.state === 'near' ? '일부 맞음' : '틀림'}`;
  });
  return `${name}: ${parts.join(', ')}`;
}

export function isWin(cells: Cell[]): boolean {
  return cells.length > 0 && cells.every((c) => c.state === 'exact');
}

const CELL_EMOJI: Record<CellState, string> = { exact: '🟩', near: '🟨', wrong: '⬛' };
/** 격자 한 줄. 정답을 안 흘린다. 이게 공유의 전부 */
export function shareRow(cells: Cell[]): string {
  return cells.map((c) => CELL_EMOJI[c.state] ?? '⬛').join('');
}

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
/** 한글 한 덩이의 첫 자음. 한글이 아니면 그대로 (영문, 숫자도 섞여 찾아지게) */
function choseong(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = (ch.codePointAt(0) ?? 0) - 0xac00;
    out += code >= 0 && code <= 11171 ? CHO[Math.floor(code / 588)] : ch;
  }
  return out;
}
const isChoseongQuery = (q: string): boolean => q.length > 0 && [...q].every((c) => CHO.indexOf(c) >= 0);

/**
 * 자동완성. 앞글자 먼저, 그다음 포함. 이미 낸 답은 뺌
 * 첫 자음만 쳐도 찾아짐. 고를 것이 천 개가 넘는 판에서 끝까지 치게 하면 그게 문턱
 */
export function suggest(items: DailyItem[], query: string, opts: { limit?: number; exclude?: string[] } = {}): DailyItem[] {
  const limit = opts.limit ?? 8;
  const q = nameKey(query);
  if (!q) return [];
  const cho = isChoseongQuery(q);
  const taken = new Set((opts.exclude ?? []).map(nameKey));
  const starts: DailyItem[] = [];
  const contains: DailyItem[] = [];
  for (const item of items) {
    const name = nameKey(item.name);
    if (taken.has(name)) continue;
    const hay = cho ? choseong(name) : name;
    if (hay.indexOf(q) === 0) starts.push(item);
    else if (hay.indexOf(q) > 0) contains.push(item);
    if (starts.length >= limit) break;
  }
  return starts.concat(contains).slice(0, limit);
}

/** 이름으로 항목 찾기 (대소문자, 공백 무시) */
export function findItem(items: DailyItem[], name: string): DailyItem | null {
  const n = nameKey(name);
  return items.find((item) => nameKey(item.name) === n) ?? null;
}

/* ── 전부대기 ────────────────────────────────────────────────
 * 하나를 맞힌다 옆에 전부 대본다. 다른 놀이지만 **표는 그대로**.
 * 질문도 정답도 속성표에서 파생하므로 주제를 늘릴 때 코드는 안 고침 */

/** 받침이 있나. 조사를 고르려면 필요 */
function hasFinal(text: string): boolean | null {
  const last = String(text ?? '').trim().slice(-1);
  const code = (last.codePointAt(0) ?? 0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return code % 28 !== 0;
}
/** 조사 고르기. 한글이 아니면 두 벌 다. 틀리게 적느니 어색한 게 낫다 */
function josa(word: string, withFinal: string, withoutFinal: string): string {
  const f = hasFinal(word);
  if (f === null) return `${withFinal}(${withoutFinal})`;
  return f ? withFinal : withoutFinal;
}

/** 전부 대보시오가 성립하는 크기. 적으면 삼십 초에 끝나고 많으면 아무도 완주를 안 함 */
export const LIST_MIN = 6;
export const LIST_MAX = 45;

interface Condition {
  id: string;
  key: string;
  field: string;
  short: string;
  attr: string;
  conj: string;
  names: string[];
}
export interface ListQuestion {
  id: string;
  text: string;
  answers: string[];
}

function conditionsOf(topic: DailyTopic): Condition[] {
  const out: Condition[] = [];
  for (const field of topic.fields ?? []) {
    const label = field.label;
    const of = (item: DailyItem): string[] => {
      const v = item[field.key];
      return (Array.isArray(v) ? v : [v]).filter((x) => x !== undefined && x !== null && x !== '').map(String);
    };
    if (field.kind === 'category' || field.kind === 'set') {
      const values = [...new Set(topic.items.flatMap(of))].sort();
      for (const value of values) {
        const names = topic.items.filter((i) => of(i).map(norm).indexOf(norm(value)) >= 0).map((i) => i.name);
        /* 관형형과 연결형 두 벌을 여기서. 나중에 말꼬리를 잘라 붙이면 있는에서 있으면서 같은 변형에서 반드시 어긋남 */
        out.push(
          field.kind === 'set'
            ? { id: `${field.key}=${value}`, key: field.key, field: label, short: value, attr: `${label}에 ${value}${josa(value, '이', '가')} 있는`, conj: `${label}에 ${value}${josa(value, '이', '가')} 있으면서`, names }
            : { id: `${field.key}=${value}`, key: field.key, field: label, short: value, attr: `${label}${josa(label, '이', '가')} ${value}인`, conj: `${label}${josa(label, '이', '가')} ${value}이면서`, names }
        );
      }
      continue;
    }
    if (field.kind === 'number') {
      /* 숫자라고 다 물어볼 수 있는 게 아니다. **전부대기는 분류 축에서만 성립**.
         몸무게 550kg 이상을 전부는 답이 있어도 사람이 못 댄다. 반대로 세대, 진화 단계, 성급은
         숫자지만 분류에 가깝다. 가르는 표식은 **값의 가짓수** */
      const values = [...new Set(topic.items.map((i) => Number(i[field.key])).filter(Number.isFinite))].sort((a, b) => a - b);
      if (values.length > 12) continue;
      const unit = field.unit ?? '';
      for (const value of values) {
        const names = topic.items.filter((i) => Number(i[field.key]) === value).map((i) => i.name);
        out.push({
          id: `${field.key}=${value}`,
          key: field.key,
          field: label,
          short: `${value}${unit}`,
          attr: `${label}${josa(label, '이', '가')} ${value}${unit}인`,
          conj: `${label}${josa(label, '이', '가')} ${value}${unit}이면서`,
          names
        });
      }
    }
  }
  return out;
}

export function listQuestions(topic: DailyTopic, opts: { min?: number; max?: number } = {}): ListQuestion[] {
  const min = opts.min ?? LIST_MIN;
  const max = opts.max ?? LIST_MAX;
  const title = topic.title;
  const conds = conditionsOf(topic);
  const fits = (names: string[]): boolean => names.length >= min && names.length <= max && names.length < topic.items.length;
  const single = conds.filter((c) => fits(c.names)).map((c) => ({ id: c.id, text: `${c.attr} ${title}`, answers: c.names }));
  if (single.length >= 8) return single;
  /* 표가 크면 조건 하나로는 늘 넘친다. 그때 **조건을 교차**. 크기를 줄이는 손잡이이자 질문이
     구체적이라 더 재밌다. 다른 칸끼리만. 같은 칸 두 값은 대개 교집합이 0 */
  const pairs: ListQuestion[] = [];
  for (let i = 0; i < conds.length; i += 1) {
    for (let j = i + 1; j < conds.length; j += 1) {
      const a = conds[i];
      const b = conds[j];
      if (a.key === b.key) continue;
      const bset = new Set(b.names.map(norm));
      const names = a.names.filter((n) => bset.has(norm(n)));
      if (!fits(names)) continue;
      pairs.push({ id: `${a.id}&${b.id}`, text: `${a.conj} ${b.attr} ${title}`, answers: names });
    }
  }
  return single.concat(pairs);
}

/** 전부대기가 설 수 있는 주제인가. 실루엣이 그림을 요구하는 것과 같은 자리 */
export function hasListMode(topic: DailyTopic): boolean {
  return listQuestions(topic).length >= 8;
}

/** 오늘의 질문. 정답 하나를 고를 때와 같은 순열. 난수 체계를 새로 안 만듦 */
export function listQuestionOf(topic: DailyTopic, at: Date = new Date(), questions: ListQuestion[] = listQuestions(topic)): ListQuestion | null {
  if (questions.length === 0) return null;
  return questions[dailyIndex(topic.id, kstDayNumber(at), questions.length, 'list')];
}

export type ListStatus = 'hit' | 'miss' | 'dup' | 'unknown';
/**
 * 답 한 번의 판정. 표에 아예 없는 것과 표엔 있지만 조건 밖인 것을 가름
 * 오타를 틀렸다로 처리하면 사람은 자기가 뭘 잘못했는지 모름
 */
export function listJudge(topic: DailyTopic, question: ListQuestion, raw: string, given: string[] = []): { status: ListStatus; name: string } {
  const item = findItem(topic.items, raw);
  if (!item) return { status: 'unknown', name: String(raw ?? '').trim() };
  const already = given.some((n) => nameKey(n) === nameKey(item.name));
  if (already) return { status: 'dup', name: item.name };
  const hit = question.answers.some((n) => nameKey(n) === nameKey(item.name));
  return { status: hit ? 'hit' : 'miss', name: item.name };
}

/* ── 격자판 ────────────────────────────────────────────────
 * 속성판은 하나 좁히기, 전부대기는 전부 쏟기, 격자판은 **배치**
 * 새로 만들 것은 거의 없다. 조건과 교차는 전부대기가 이미 만들어 둠 */

/** 한 칸이 성립하려면 답이 이만큼은. 하나뿐인 칸은 알거나 모르거나라 재미가 없음 */
const GRID_MIN_PER_CELL = 2;
/** 반대로 이보다 헐거우면 아무거나 넣으면 맞는 칸이라 재미가 죽음 */
const GRID_MAX_PER_CELL = 25;
export const GRID_SIZE = 3;

export interface GridAxis {
  id: string;
  label: string;
  short: string;
  field: string;
}
export interface GridPuzzle {
  id: string;
  rows: GridAxis[];
  cols: GridAxis[];
  cells: string[][][];
}

/**
 * 오늘의 격자. 못 만들면 null (그런 주제는 판이 안 생긴다. 실루엣과 같은 규칙).
 * **축은 서로 다른 칸에서.** 같은 칸의 두 값은 교집합이 대개 0
 * 아홉 칸이 **전부** 답을 가져야 함. 한 칸이라도 비면 못 깸
 */
export function gridPuzzleOf(topic: DailyTopic, at: Date = new Date(), opts: { attempts?: number } = {}): GridPuzzle | null {
  const attempts = opts.attempts ?? 400;
  const conds = conditionsOf(topic);
  const byField = new Map<string, Condition[]>();
  for (const c of conds) {
    if (!byField.has(c.key)) byField.set(c.key, []);
    byField.get(c.key)!.push(c);
  }
  const usable = [...byField.entries()].filter(([, list]) => list.length >= GRID_SIZE).sort((a, b) => a[0].localeCompare(b[0]));
  if (usable.length === 0) return null;
  const rand = mulberry32(hash32(`${topic.id}:grid:${kstDayNumber(at)}`));
  /* 후보는 **큰 조건부터**. 작은 조건끼리 걸면 아홉 칸 중 하나는 거의 반드시 비고 판이 안 생긴다 */
  const WIDE = 8;
  const widest = (list: Condition[]): Condition[] => [...list].sort((a, b) => b.names.length - a.names.length).slice(0, WIDE);
  const pick = <T,>(list: T[], n: number): T[] => {
    const pool = [...list];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
  };
  for (let n = 0; n < attempts; n += 1) {
    /* 축 둘. **여러 값을 갖는 칸(set)은 자기 자신과도 걸 수 있다**. 이걸 막으면 쓸 만한 칸이
       하나뿐인 주제는 판이 아예 안 생긴다 */
    const two = pick(usable, 2);
    const fa = two[0];
    const fbMaybe = two[1];
    const selfPair = topic.fields.find((f) => f.key === fa[0])?.kind === 'set' && rand() < 0.5;
    const fb = selfPair || !fbMaybe ? fa : fbMaybe;
    const rows = pick(widest(fa[1]), GRID_SIZE);
    const colPool = widest(fb[1]).filter((c) => !rows.some((r) => r.id === c.id));
    if (colPool.length < GRID_SIZE) continue;
    const cols = pick(colPool, GRID_SIZE);
    const cells = rows.map((r) => {
      const rowSet = new Set(r.names.map(norm));
      return cols.map((c) => c.names.filter((x) => rowSet.has(norm(x))));
    });
    /* 칸이 너무 넉넉하면 배치하는 재미가 없다. 좁은 판을 먼저 찾고 끝까지 못 찾으면 그때 넉넉한 판이라도 */
    const tight = n < attempts / 2 ? GRID_MAX_PER_CELL : Infinity;
    if (cells.every((row) => row.every((names) => names.length >= GRID_MIN_PER_CELL && names.length <= tight))) {
      return {
        id: `${rows.map((r) => r.id).join(',')}|${cols.map((c) => c.id).join(',')}`,
        rows: rows.map((r) => ({ id: r.id, label: r.attr, short: r.short, field: r.field })),
        cols: cols.map((c) => ({ id: c.id, label: c.attr, short: c.short, field: c.field })),
        cells
      };
    }
  }
  return null;
}

/** 격자판이 설 수 있는 주제인가. 하루치가 아니라 **여러 날**. 오늘만 되는 판은 판이 아니다 */
export function hasGridMode(topic: DailyTopic): boolean {
  const day = kstDayNumber();
  for (const offset of [0, 1, 2, 3, 7]) {
    if (!gridPuzzleOf(topic, new Date((day + offset) * DAY_MS))) return false;
  }
  return true;
}

export type GridStatus = 'hit' | 'miss' | 'unknown' | 'used';
/**
 * 칸 하나의 판정. **한 항목은 한 칸에만.** 안 그러면 두 조건을 다 만족하는 이름 하나로
 * 여러 칸을 메울 수 있고, 그러면 배치하는 놀이가 아니라 이름 하나 아는 놀이
 */
export function gridJudge(topic: DailyTopic, puzzle: GridPuzzle, row: number, col: number, raw: string, used: string[] = []): { status: GridStatus; name: string } {
  const item = findItem(topic.items, raw);
  if (!item) return { status: 'unknown', name: String(raw ?? '').trim() };
  if (used.some((n) => nameKey(n) === nameKey(item.name))) return { status: 'used', name: item.name };
  const cell = puzzle.cells[row]?.[col] ?? [];
  return { status: cell.some((n) => nameKey(n) === nameKey(item.name)) ? 'hit' : 'miss', name: item.name };
}

/** 실루엣이 설 수 있는 주제인가. 모든 항목에 그림이 있어야 함 */
export function hasSilhouetteMode(topic: DailyTopic): boolean {
  return topic.items.length > 0 && topic.items.every((i) => typeof i.img === 'string' && i.img);
}
