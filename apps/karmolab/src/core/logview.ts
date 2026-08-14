/**
 * 큰 로그를 읽히게 (TASK-KL-316 / 15)
 *
 * 로그는 **찾는 게 아니라 좁히는 일**이다. 10만 줄에서 `grep` 을 다섯 번 치는 대신,
 * 시각·급(級)·정규식으로 좁히고 **언제 몰렸는지**를 먼저 본다.
 *
 * 형식은 하나가 아니다(ISO 시각 · syslog · nginx · JSON 한 줄). 그래서 **줄마다 알아본다** —
 * 못 알아본 줄도 버리지 않고 「시각 모름」으로 남긴다. 로그에서 버려진 줄이 대개 범인이다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'logview',
  ops: {
    summary: {
      desc: 'Summarise a log: line count, levels, time span, and the busiest moments.',
      in: { text: 'string' },
      out: 'string'
    },
    filter: {
      desc: 'Filter log lines by regex and level (comma separated, e.g. error,warn).',
      in: { text: 'string', pattern: 'string?', levels: 'string?' },
      out: 'string'
    }
  }
};

export type Level = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'other';

export interface Row {
  /** 몇 번째 줄 (1부터) */
  no: number;
  raw: string;
  /** 밀리초. 못 읽으면 없음 */
  at?: number;
  level: Level;
}

const LEVEL_WORDS: Array<[Level, RegExp]> = [
  ['error', /\b(error|err|fatal|crit(ical)?|panic|exception|severe)\b/i],
  ['warn', /\b(warn(ing)?)\b/i],
  ['info', /\b(info|notice)\b/i],
  ['debug', /\b(debug)\b/i],
  ['trace', /\b(trace|verbose)\b/i]
];

/** 줄 앞머리에서 시각을 찾는다. 못 찾으면 없음 — **줄을 버리지는 않는다**. */
export function readTime(line: string): number | undefined {
  const iso = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?/.exec(line);
  if (iso !== null) {
    const at = Date.parse(iso[0].replace(' ', 'T').replace(',', '.'));
    if (!Number.isNaN(at)) return at;
  }
  /* nginx: 10/Oct/2000:13:55:36 +0000 */
  const nginx = /(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/.exec(line);
  if (nginx !== null) {
    const at = Date.parse(nginx[1] + ' ' + nginx[2] + ' ' + nginx[3] + ' ' + nginx[4] + ':' + nginx[5] + ':' + nginx[6] + ' UTC');
    if (!Number.isNaN(at)) return at;
  }
  /* 유닉스 초·밀리초가 맨 앞에 오는 경우 */
  const epoch = /^\[?(\d{10})(\d{3})?\]?\b/.exec(line);
  if (epoch !== null) return Number(epoch[1]) * 1000 + Number(epoch[2] ?? 0);
  return undefined;
}

export function readLevel(line: string): Level {
  for (const [level, re] of LEVEL_WORDS) if (re.test(line)) return level;
  return 'other';
}

export function parse(text: string): Row[] {
  const out: Row[] = [];
  let no = 0;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    no++;
    if (raw === '') continue;
    /* JSON 한 줄 로그는 속을 들여다본다 — 겉만 보면 전부 「시각 모름」이 된다. */
    if (raw.startsWith('{') && raw.includes('"')) {
      try {
        const obj = JSON.parse(raw) as Record<string, unknown>;
        const timeField = obj.time ?? obj.timestamp ?? obj.ts ?? obj['@timestamp'];
        const levelField = String(obj.level ?? obj.severity ?? obj.lvl ?? '');
        const at = typeof timeField === 'number' ? (timeField > 1e12 ? timeField : timeField * 1000) : typeof timeField === 'string' ? Date.parse(timeField) : Number.NaN;
        out.push({
          no,
          raw,
          at: Number.isNaN(at) ? undefined : at,
          level: levelField === '' ? readLevel(raw) : readLevel(' ' + levelField + ' ')
        });
        continue;
      } catch {
        /* 깨진 JSON 은 그냥 글로 본다 */
      }
    }
    out.push({ no, raw, at: readTime(raw), level: readLevel(raw) });
  }
  return out;
}

export interface Filter {
  /** 정규식. 못 읽는 정규식이면 글자 그대로 찾는다 */
  pattern?: string;
  levels?: Level[];
  from?: number;
  to?: number;
  /** 걸린 줄을 빼고 보여 준다 */
  invert?: boolean;
}

export function filter(rows: Row[], f: Filter): Row[] {
  let re: RegExp | undefined;
  if (f.pattern !== undefined && f.pattern !== '') {
    try {
      re = new RegExp(f.pattern, 'i');
    } catch {
      /* 「(」 하나만 쳐도 화면이 빨개지면 못 쓴다 — 글자 그대로 찾는 것으로 물러선다. */
      re = new RegExp(f.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
  }
  return rows.filter((row) => {
    if (f.levels !== undefined && f.levels.length > 0 && !f.levels.includes(row.level)) return false;
    if (f.from !== undefined && (row.at === undefined || row.at < f.from)) return false;
    if (f.to !== undefined && (row.at === undefined || row.at > f.to)) return false;
    if (re !== undefined) {
      const hit = re.test(row.raw);
      if (f.invert === true ? hit : !hit) return false;
    }
    return true;
  });
}

export interface Bucket {
  at: number;
  total: number;
  error: number;
}

/** 시간을 칸으로 나눠 「언제 몰렸나」를 만든다. 시각 없는 줄은 안 센다(거짓 봉우리를 만든다). */
export function timeline(rows: Row[], slots = 60): Bucket[] {
  const timed = rows.filter((r) => r.at !== undefined);
  if (timed.length === 0) return [];
  const first = Math.min(...timed.map((r) => r.at ?? 0));
  const last = Math.max(...timed.map((r) => r.at ?? 0));
  const span = Math.max(1, last - first);
  const step = span / slots;
  const out: Bucket[] = [];
  for (let i = 0; i < slots; i++) out.push({ at: first + step * i, total: 0, error: 0 });
  for (const row of timed) {
    const idx = Math.min(slots - 1, Math.floor(((row.at ?? first) - first) / step));
    out[idx].total++;
    if (row.level === 'error') out[idx].error++;
  }
  return out;
}

export interface Summary {
  lines: number;
  timed: number;
  levels: Record<Level, number>;
  from?: number;
  to?: number;
  /** 가장 많이 몰린 칸 */
  peak?: Bucket;
  /** 자주 나온 줄 (숫자·id 를 지운 모양으로 묶는다) */
  common: Array<{ shape: string; count: number }>;
}

/** 숫자·주소·id 를 지워 「같은 모양」끼리 묶는다 — 그래야 만 줄이 열 줄로 보인다. */
export function shapeOf(line: string): string {
  return line
    /* 자리표는 **말이 아닌 기호**로 둔다 — 알맹이가 한국어를 들면 영어·일본어 화면에서 샌다. */
    .replace(/\d{4}-\d{2}-\d{2}[T ][\d:.,+Z-]+/g, '<ts>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b\d+\.\d+\.\d+\.\d+\b/g, '<ip>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export function summarise(rows: Row[]): Summary {
  const levels: Record<Level, number> = { error: 0, warn: 0, info: 0, debug: 0, trace: 0, other: 0 };
  for (const row of rows) levels[row.level]++;
  const timed = rows.filter((r) => r.at !== undefined);
  const buckets = timeline(rows);
  const peak = buckets.length === 0 ? undefined : [...buckets].sort((a, b) => b.total - a.total)[0];

  const shapes = new Map<string, number>();
  for (const row of rows) {
    const key = shapeOf(row.raw);
    shapes.set(key, (shapes.get(key) ?? 0) + 1);
  }
  const common = [...shapes.entries()]
    .map(([shape, count]) => ({ shape, count }))
    .sort((a, b) => b.count - a.count)
    .filter((c) => c.count > 1)
    .slice(0, 10);

  return {
    lines: rows.length,
    timed: timed.length,
    levels,
    from: timed.length === 0 ? undefined : Math.min(...timed.map((r) => r.at ?? 0)),
    to: timed.length === 0 ? undefined : Math.max(...timed.map((r) => r.at ?? 0)),
    peak,
    common
  };
}

export const run: ToolRunner = (op, args) => {
  const rows = parse(String(args.text ?? ''));
  if (op === 'summary') {
    const s = summarise(rows);
    const lines = [
      'lines ' + s.lines + ' (timed ' + s.timed + ')',
      Object.entries(s.levels)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => k + ' ' + n)
        .join('  ')
    ];
    for (const c of s.common) lines.push(c.count + '  ' + c.shape);
    return lines.join('\n');
  }
  if (op === 'filter') {
    const levels = String(args.levels ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '') as Level[];
    return filter(rows, { pattern: args.pattern === undefined ? undefined : String(args.pattern), levels })
      .map((r) => r.raw)
      .join('\n');
  }
  throw new Error('logview: 모르는 연산 ' + op);
};
