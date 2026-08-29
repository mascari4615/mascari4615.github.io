/**
 * 두 글을 견주는 알맹이 (TASK-KL-316 / 1)
 *
 * 줄 단위로만 견주면 JSON, YAML 에서 **줄이 밀린 것**과 **값이 바뀐 것**이 같아 보인다.
 * 열쇠 하나를 위로 옮겼을 뿐인데 스무 줄이 빨갛게 되는 화면이 그래서 나온다.
 * 그래서 여기엔 둘이 있다. 줄 견주기(`diffLines`)와 **구조 견주기**(`diffStructure`).
 * 구조 쪽은 열쇠 경로로 짝을 지어서, 자리만 바뀐 것은 옮김이라고 말한다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'diff',
  ops: {
    text: {
      desc:
        'Compare two texts line by line and return a unified diff.' +
        ' Set ignoreWs to ignore whitespace-only changes, ignoreCase for case.',
      in: { a: 'string', b: 'string', ignoreWs: 'boolean?', ignoreCase: 'boolean?' },
      out: 'string'
    },
    structure: {
      desc:
        'Compare two JSON documents by key path, not by line.' +
        ' Reports added / removed / changed / moved, so reordering a key is not a rewrite.',
      in: { a: 'string', b: 'string' },
      out: 'string'
    },
    merge: {
      desc:
        'Three-way merge: a base plus two edits. Returns the merged text, with conflict markers' +
        ' where both sides changed the same lines.',
      in: { base: 'string', mine: 'string', theirs: 'string' },
      out: 'string'
    }
  }
};

/* ── 줄 견주기 ─────────────────────────────────────────────────────── */

export type EditKind = 'same' | 'add' | 'del';

export interface Edit {
  kind: EditKind;
  /** 원본 줄 번호 (1부터). `add` 면 없다. */
  aLine?: number;
  /** 새 글 줄 번호 (1부터). `del` 면 없다. */
  bLine?: number;
  text: string;
}

export interface LineOpts {
  ignoreWs?: boolean;
  ignoreCase?: boolean;
}

function splitLines(text: string): string[] {
  const body = text.replace(/\r\n?/g, '\n');
  const rows = body.split('\n');
  // 끝의 개행 하나는 줄이 아니다. 이걸 세면 모든 파일에 빈 줄이 하나씩 더 있다고 나온다.
  if (rows.length > 1 && rows[rows.length - 1] === '') rows.pop();
  return rows;
}

function normalize(line: string, opts: LineOpts): string {
  let out = line;
  if (opts.ignoreWs === true) out = out.replace(/\s+/g, ' ').trim();
  if (opts.ignoreCase === true) out = out.toLowerCase();
  return out;
}

/**
 * 최장 공통 부분수열. 표를 다 채우면 만 줄 × 만 줄에서 메모리가 터지니,
 * **앞뒤로 같은 부분을 먼저 깎아** 실제로 다른 가운데만 표로 만든다.
 */
export function diffLines(aText: string, bText: string, opts: LineOpts = {}): Edit[] {
  const a = splitLines(aText);
  const b = splitLines(bText);
  const na = a.map((l) => normalize(l, opts));
  const nb = b.map((l) => normalize(l, opts));

  let head = 0;
  while (head < na.length && head < nb.length && na[head] === nb[head]) head++;
  let tail = 0;
  while (
    tail < na.length - head &&
    tail < nb.length - head &&
    na[na.length - 1 - tail] === nb[nb.length - 1 - tail]
  ) {
    tail++;
  }

  const out: Edit[] = [];
  for (let i = 0; i < head; i++) out.push({ kind: 'same', aLine: i + 1, bLine: i + 1, text: a[i] });

  const midA = na.slice(head, na.length - tail);
  const midB = nb.slice(head, nb.length - tail);

  // 표 크기 보호막. 너무 크면 가운데는 통째로 지우고 넣은 것으로 본다 (화면이 멎는 것보다 낫다).
  const CELL_CAP = 4000000;
  if (midA.length * midB.length > CELL_CAP) {
    for (let i = 0; i < midA.length; i++) out.push({ kind: 'del', aLine: head + i + 1, text: a[head + i] });
    for (let j = 0; j < midB.length; j++) out.push({ kind: 'add', bLine: head + j + 1, text: b[head + j] });
  } else {
    const w = midB.length + 1;
    const lcs = new Uint32Array((midA.length + 1) * w);
    for (let i = midA.length - 1; i >= 0; i--) {
      for (let j = midB.length - 1; j >= 0; j--) {
        lcs[i * w + j] =
          midA[i] === midB[j]
            ? lcs[(i + 1) * w + (j + 1)] + 1
            : Math.max(lcs[(i + 1) * w + j], lcs[i * w + (j + 1)]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length && j < midB.length) {
      if (midA[i] === midB[j]) {
        out.push({ kind: 'same', aLine: head + i + 1, bLine: head + j + 1, text: a[head + i] });
        i++;
        j++;
      } else if (lcs[(i + 1) * w + j] >= lcs[i * w + (j + 1)]) {
        out.push({ kind: 'del', aLine: head + i + 1, text: a[head + i] });
        i++;
      } else {
        out.push({ kind: 'add', bLine: head + j + 1, text: b[head + j] });
        j++;
      }
    }
    while (i < midA.length) {
      out.push({ kind: 'del', aLine: head + i + 1, text: a[head + i] });
      i++;
    }
    while (j < midB.length) {
      out.push({ kind: 'add', bLine: head + j + 1, text: b[head + j] });
      j++;
    }
  }

  for (let k = 0; k < tail; k++) {
    const ai = a.length - tail + k;
    const bi = b.length - tail + k;
    out.push({ kind: 'same', aLine: ai + 1, bLine: bi + 1, text: a[ai] });
  }
  return out;
}

export interface Stat {
  added: number;
  removed: number;
  same: number;
}

export function countEdits(edits: Edit[]): Stat {
  let added = 0;
  let removed = 0;
  let same = 0;
  for (const e of edits) {
    if (e.kind === 'add') added++;
    else if (e.kind === 'del') removed++;
    else same++;
  }
  return { added, removed, same };
}

/** 바뀐 줄 안에서 **어디가** 바뀌었는지 (낱말 단위). */
export interface Span {
  kind: EditKind;
  text: string;
}

export function diffWords(a: string, b: string): { left: Span[]; right: Span[] } {
  const cut = (s: string): string[] => s.match(/\s+|[^\s]+/g) ?? [];
  const wa = cut(a);
  const wb = cut(b);
  const edits = diffLines(wa.join('\n'), wb.join('\n'));
  const left: Span[] = [];
  const right: Span[] = [];
  for (const e of edits) {
    if (e.kind === 'same') {
      left.push({ kind: 'same', text: e.text });
      right.push({ kind: 'same', text: e.text });
    } else if (e.kind === 'del') left.push({ kind: 'del', text: e.text });
    else right.push({ kind: 'add', text: e.text });
  }
  return { left, right };
}

/** `git diff` 와 같은 모양. 붙여서 쓰라고 낸다. */
export function toUnified(edits: Edit[], context = 3): string {
  const rows: string[] = [];
  const keep = new Set<number>();
  for (let i = 0; i < edits.length; i++) {
    if (edits[i].kind === 'same') continue;
    for (let k = Math.max(0, i - context); k <= Math.min(edits.length - 1, i + context); k++) keep.add(k);
  }
  if (keep.size === 0) return '';

  let i = 0;
  while (i < edits.length) {
    if (!keep.has(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < edits.length && keep.has(j)) j++;
    const chunk = edits.slice(i, j);
    const aStart = chunk.find((e) => e.aLine !== undefined)?.aLine ?? 0;
    const bStart = chunk.find((e) => e.bLine !== undefined)?.bLine ?? 0;
    const aCount = chunk.filter((e) => e.aLine !== undefined).length;
    const bCount = chunk.filter((e) => e.bLine !== undefined).length;
    rows.push('@@ -' + aStart + ',' + aCount + ' +' + bStart + ',' + bCount + ' @@');
    for (const e of chunk) rows.push((e.kind === 'add' ? '+' : e.kind === 'del' ? '-' : ' ') + e.text);
    i = j;
  }
  return rows.join('\n');
}

/* ── 구조 견주기 ───────────────────────────────────────────────────── */

export type ChangeKind = 'add' | 'del' | 'change' | 'move';

export interface Change {
  kind: ChangeKind;
  /** `user.roles[2]` 같은 열쇠 경로 */
  path: string;
  before?: string;
  after?: string;
}

type Json = unknown;

function isObj(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function show(v: Json): string {
  if (typeof v === 'string') return v;
  const s = JSON.stringify(v);
  return s === undefined ? String(v) : s;
}

function join(path: string, key: string | number): string {
  if (typeof key === 'number') return path + '[' + key + ']';
  return path === '' ? key : path + '.' + key;
}

/**
 * 열쇠 경로로 짝을 지어 견준다. **자리만 바뀐 것은 옮김**이다 . 
 * 배열 안의 같은 값이 다른 자리로 갔으면 지우고 넣은 두 줄이 아니라 옮김 한 줄로 말한다.
 */
export function diffStructure(a: Json, b: Json, path = ''): Change[] {
  const out: Change[] = [];
  if (isObj(a) && isObj(b)) {
    for (const key of Object.keys(a)) {
      if (!(key in b)) out.push({ kind: 'del', path: join(path, key), before: show(a[key]) });
      else out.push(...diffStructure(a[key], b[key], join(path, key)));
    }
    for (const key of Object.keys(b)) {
      if (!(key in a)) out.push({ kind: 'add', path: join(path, key), after: show(b[key]) });
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const keyOf = (v: Json): string => {
      const s = JSON.stringify(v);
      return s === undefined ? String(v) : s;
    };
    const ka = a.map(keyOf);
    const kb = b.map(keyOf);
    const used = new Set<number>();
    for (let i = 0; i < ka.length; i++) {
      if (kb[i] === ka[i]) continue;
      const at = kb.indexOf(ka[i]);
      if (at >= 0 && !used.has(at)) {
        used.add(at);
        out.push({ kind: 'move', path: join(path, i), before: '#' + i, after: '#' + at });
        continue;
      }
      if (i < b.length) out.push(...diffStructure(a[i], b[i], join(path, i)));
      else out.push({ kind: 'del', path: join(path, i), before: show(a[i]) });
    }
    for (let j = a.length; j < b.length; j++) {
      out.push({ kind: 'add', path: join(path, j), after: show(b[j]) });
    }
    return out;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push({ kind: 'change', path, before: show(a), after: show(b) });
  }
  return out;
}

export function structureReport(changes: Change[]): string {
  if (changes.length === 0) return '';
  return changes
    .map((c) => {
      const where = c.path === '' ? '(root)' : c.path;
      if (c.kind === 'add') return '+ ' + where + ' = ' + String(c.after);
      if (c.kind === 'del') return '- ' + where + ' = ' + String(c.before);
      if (c.kind === 'move') return '~ ' + where + ': ' + String(c.before) + ' -> ' + String(c.after);
      return '* ' + where + ': ' + String(c.before) + ' -> ' + String(c.after);
    })
    .join('\n');
}

/* ── 셋을 합치기 ───────────────────────────────────────────────────── */

/**
 * 바탕 하나에 고침 둘. 서로 다른 자리를 고쳤으면 그냥 합치고,
 * **같은 자리를 둘 다 고쳤으면** git 과 같은 표식을 넣어 사람에게 넘긴다.
 */
export function merge3(
  base: string,
  mine: string,
  theirs: string
): { text: string; conflicts: number } {
  /** 바탕 줄 번호 → 그 자리가 어떤 줄들이 됐나 (0 = 첫 줄 앞) */
  const sideOf = (edits: Edit[]): Map<number, string[]> => {
    const map = new Map<number, string[]>();
    let anchor = 0;
    for (const e of edits) {
      if (e.kind === 'same') {
        anchor = e.aLine === undefined ? anchor : e.aLine;
        const cur = map.get(anchor);
        if (cur === undefined) map.set(anchor, [e.text]);
        else cur.push(e.text);
      } else if (e.kind === 'del') {
        anchor = e.aLine === undefined ? anchor : e.aLine;
        if (!map.has(anchor)) map.set(anchor, []);
      } else {
        const cur = map.get(anchor);
        if (cur === undefined) map.set(anchor, [e.text]);
        else cur.push(e.text);
      }
    }
    return map;
  };

  const baseLines = splitLines(base);
  const mm = sideOf(diffLines(base, mine));
  const mt = sideOf(diffLines(base, theirs));
  const rows: string[] = [];
  let conflicts = 0;

  const emit = (anchor: number): void => {
    const orig = anchor === 0 ? [] : [baseLines[anchor - 1]];
    const a = mm.get(anchor);
    const b = mt.get(anchor);
    const sideA = a === undefined ? orig : a;
    const sideB = b === undefined ? orig : b;
    const ja = sideA.join('\n');
    const jb = sideB.join('\n');
    if (ja === jb) {
      rows.push(...sideA);
      return;
    }
    const origJoined = orig.join('\n');
    if (ja === origJoined) {
      rows.push(...sideB);
      return;
    }
    if (jb === origJoined) {
      rows.push(...sideA);
      return;
    }
    conflicts++;
    rows.push('<<<<<<< mine');
    rows.push(...sideA);
    rows.push('=======');
    rows.push(...sideB);
    rows.push('>>>>>>> theirs');
  };

  emit(0);
  for (let i = 1; i <= baseLines.length; i++) emit(i);
  return { text: rows.join('\n'), conflicts };
}

/* ── 이름으로 부르는 창구 ──────────────────────────────────────────── */

export const run: ToolRunner = (op, args) => {
  if (op === 'text') {
    const edits = diffLines(String(args.a ?? ''), String(args.b ?? ''), {
      ignoreWs: args.ignoreWs === true,
      ignoreCase: args.ignoreCase === true
    });
    return toUnified(edits);
  }
  if (op === 'structure') {
    const a: Json = JSON.parse(String(args.a ?? 'null'));
    const b: Json = JSON.parse(String(args.b ?? 'null'));
    return structureReport(diffStructure(a, b));
  }
  if (op === 'merge') {
    return merge3(String(args.base ?? ''), String(args.mine ?? ''), String(args.theirs ?? '')).text;
  }
  throw new Error('diff: 모르는 연산 ' + op);
};
