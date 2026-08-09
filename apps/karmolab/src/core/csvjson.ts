/**
 * CSV ↔ JSON — 알맹이 (TASK-KL-088 / S1)
 *
 * CSV 는 쉼표로 자르면 되는 것처럼 보이지만 **따옴표 안의 쉼표와 줄바꿈**이 있다.
 * 순진하게 자르면 열이 밀려 **조용히 망가진 데이터**가 나온다 — 그래서 한 글자씩 읽는다.
 * 되돌릴 때도 쉼표·따옴표·줄바꿈이 든 값은 따옴표로 감싸고 안쪽 따옴표는 겹쳐 적는다(RFC 4180).
 *
 * MCP 로 내놓는 이유(A등급): 표가 조금만 길어지면 LLM 은 **중간 줄을 흘리거나 열을 밀어** 옮긴다.
 * 게다가 따옴표 안 쉼표를 만나면 거의 반드시 틀린다 — 그런데 결과가 그럴듯한 표라서 안 보인다.
 * 여기선 규칙대로 한 글자씩 읽으니 줄 수와 열 수가 보존된다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'csvjson',
  ops: {
    toJson: {
      desc:
        'CSV 를 JSON 배열로 바꾼다. 따옴표 안의 쉼표·줄바꿈을 규칙대로(RFC 4180) 처리한다.' +
        ' delimiter 기본은 쉼표, coerce 를 켜면 숫자/true/false/null 을 그 타입으로 바꾼다.',
      in: { csv: 'string', delimiter: 'string?', coerce: 'boolean?' },
      out: 'string'
    },
    toCsv: {
      desc: 'JSON 배열을 CSV 로 바꾼다. 값에 쉼표·따옴표·줄바꿈이 있으면 규칙대로 감싼다.',
      in: { json: 'string', delimiter: 'string?' },
      out: 'string'
    }
  }
};

/** 따옴표 규칙(RFC 4180)을 지키며 한 글자씩 읽는다. */
export function parseCsv(text: string, delim = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuote = false;
      } else cell += c;
      continue;
    }
    if (c === '"') inQuote = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

export function toCsv(rows: Array<Record<string, unknown>>, delim = ','): string {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (cols.indexOf(k) < 0) cols.push(k);
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /["\n\r]|^\s|\s$/.test(s) || s.includes(delim) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(delim), ...rows.map((r) => cols.map((c) => esc(r[c])).join(delim))].join('\n');
}

/** 숫자·불리언처럼 보이면 그 타입으로 — 표를 그대로 쓰려면 대개 이쪽이 편하다. */
export function coerce(s: string): unknown {
  if (s === '') return '';
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(s) && String(Number(s)) === s) return Number(s);
  return s;
}

/** 첫 줄을 열 이름으로 보고 객체 배열을 만든다. 이름이 비면 `열N` 을 붙인다. */
export function rowsToObjects(rows: string[][], useCoerce = true): Array<Record<string, unknown>> {
  if (rows.length === 0) return [];
  const head = rows[0];
  return rows.slice(1).map((r) => {
    const o: Record<string, unknown> = {};
    head.forEach((h, i) => (o[h === '' ? `열${i + 1}` : h] = useCoerce ? coerce(r[i] ?? '') : (r[i] ?? '')));
    return o;
  });
}

const delimOf = (raw: unknown): string => {
  const d = raw === undefined ? ',' : String(raw);
  if (d === 'tab' || d === '\\t') return '\t';
  if (d === 'semicolon') return ';';
  return d === '' ? ',' : d;
};

export const run: ToolRunner = (op, args) => {
  const delim = delimOf(args.delimiter);

  if (op === 'toJson') {
    const rows = parseCsv(String(args.csv ?? '').trim(), delim);
    if (rows.length < 2) throw new Error('머리글 한 줄과 자료 한 줄 이상이 필요합니다');
    const objs = rowsToObjects(rows, args.coerce !== false);
    return JSON.stringify(objs, null, 2);
  }

  if (op === 'toCsv') {
    let data: unknown;
    try {
      data = JSON.parse(String(args.json ?? ''));
    } catch (e) {
      throw new Error(`JSON 을 읽을 수 없습니다: ${(e as Error).message}`);
    }
    if (Array.isArray(data) === false) throw new Error('JSON 배열이어야 합니다 (예: [{"a":1},{"a":2}])');
    if (data.length === 0) throw new Error('빈 배열입니다');
    return toCsv(data as Array<Record<string, unknown>>, delim);
  }

  throw new Error(`csvjson 에 「${op}」 는 없습니다`);
};
