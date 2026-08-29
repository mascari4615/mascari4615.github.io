/**
 * SQL 을 보기 좋게, 다른 DB 말로 (TASK-KL-316 / 8)
 *
 * 한 줄로 눌려 온 SQL 은 **어디가 어디에 걸리는지**가 안 보인다. 여기서는 낱말로 자른 뒤
 * 줄을 바꾸는 낱말에서만 줄을 바꾸고 괄호 깊이만큼 들여쓴다. 예쁘게가 아니라 **읽히게**.
 *
 * 하나 더: 같은 뜻인데 DB 마다 다르게 쓰는 것들(따옴표, LIMIT/TOP, AUTO_INCREMENT, NOW())을
 * 옮겨 준다. **완전한 번역기가 아니다**. 옮긴 자리는 `notes` 로 돌려주고 화면에 같이 보여 준다.
 * 옮겨 놓고 말 안 하면 됐겠지 하고 그대로 돌리다 사고가 난다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'sqlfmt',
  ops: {
    format: {
      desc: 'Pretty-print a SQL statement so the clauses line up. upper=true also uppercases keywords.',
      in: { sql: 'string', upper: 'boolean?', indent: 'number?' },
      out: 'string'
    },
    dialect: {
      desc:
        'Rewrite SQL between dialects (mysql, postgres, mssql, sqlite):' +
        ' identifier quoting, LIMIT/TOP, AUTO_INCREMENT, NOW(), IFNULL and friends.',
      in: { sql: 'string', from: 'string', to: 'string' },
      out: 'string'
    }
  }
};

export type Dialect = 'mysql' | 'postgres' | 'mssql' | 'sqlite';

type Tok = { t: 'word' | 'str' | 'num' | 'punct' | 'comment' | 'ident'; v: string };

const KEYWORDS = new Set([
  'select', 'from', 'where', 'group', 'by', 'having', 'order', 'limit', 'offset', 'insert', 'into', 'values',
  'update', 'set', 'delete', 'create', 'table', 'alter', 'drop', 'index', 'view', 'join', 'inner', 'left',
  'right', 'full', 'outer', 'cross', 'on', 'as', 'and', 'or', 'not', 'in', 'is', 'null', 'like', 'between',
  'case', 'when', 'then', 'else', 'end', 'union', 'all', 'distinct', 'exists', 'with', 'returning', 'primary',
  'key', 'foreign', 'references', 'default', 'unique', 'constraint', 'add', 'column', 'asc', 'desc', 'using',
  'begin', 'commit', 'rollback', 'if', 'top', 'fetch', 'next', 'rows', 'only'
]);

/** 이 낱말들 앞에서 줄을 바꾼다. 절이 시작되는 자리 */
const BREAK_BEFORE = new Set([
  'select', 'from', 'where', 'group', 'having', 'order', 'limit', 'offset', 'union', 'values', 'set',
  'join', 'inner', 'left', 'right', 'full', 'cross', 'on', 'returning'
]);

export function lex(sql: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const APOS = String.fromCharCode(39);
  const QUOT = String.fromCharCode(34);
  const TICK = String.fromCharCode(96);
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      let s = '';
      while (i < sql.length && sql[i] !== '\n') s += sql[i++];
      out.push({ t: 'comment', v: s });
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end < 0 ? sql.length : end + 2;
      out.push({ t: 'comment', v: sql.slice(i, stop) });
      i = stop;
      continue;
    }
    if (c === APOS) {
      let s = c;
      i++;
      while (i < sql.length) {
        s += sql[i];
        if (sql[i] === APOS && sql[i + 1] === APOS) {
          s += sql[++i];
          i++;
          continue;
        }
        if (sql[i] === APOS) {
          i++;
          break;
        }
        i++;
      }
      out.push({ t: 'str', v: s });
      continue;
    }
    if (c === QUOT || c === TICK || c === '[') {
      const close = c === '[' ? ']' : c;
      let s = c;
      i++;
      while (i < sql.length && sql[i] !== close) s += sql[i++];
      s += close;
      i++;
      out.push({ t: 'ident', v: s });
      continue;
    }
    if (/[0-9]/.test(c)) {
      let s = '';
      while (i < sql.length && /[0-9.]/.test(sql[i])) s += sql[i++];
      out.push({ t: 'num', v: s });
      continue;
    }
    if (/[A-Za-z_@#$À-￿]/.test(c)) {
      let s = '';
      while (i < sql.length && /[A-Za-z0-9_@#$.À-￿]/.test(sql[i])) s += sql[i++];
      out.push({ t: 'word', v: s });
      continue;
    }
    // `<=` `>=` `<>` `!=` `||`
    const pair = sql.slice(i, i + 2);
    if (['<=', '>=', '<>', '!=', '||', '::'].includes(pair)) {
      out.push({ t: 'punct', v: pair });
      i += 2;
      continue;
    }
    out.push({ t: 'punct', v: c });
    i++;
  }
  return out;
}

export interface FormatOpts {
  upper?: boolean;
  indent?: number;
}

export function format(sql: string, opts: FormatOpts = {}): string {
  const toks = lex(sql);
  const step = ' '.repeat(opts.indent ?? 2);
  const rows: string[] = [];
  let line = '';
  let depth = 0;
  /* 괄호를 열 때의 깊이를 쌓아 둔다. 닫을 때 그 자리로 돌아가려고 */
  const opened: number[] = [];

  const flush = (): void => {
    if (line.trim() !== '') rows.push(step.repeat(Math.max(0, depth)) + line.trim());
    line = '';
  };

  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    const lower = tk.v.toLowerCase();
    const prev = toks[i - 1];
    const next = toks[i + 1];

    if (tk.t === 'comment') {
      flush();
      rows.push(step.repeat(Math.max(0, depth)) + tk.v);
      continue;
    }

    if (tk.t === 'punct' && tk.v === '(') {
      line += '(';
      opened.push(depth);
      /* 뒤에 `SELECT` 가 오면 진짜 덩어리다. 줄을 바꾸고 들여쓴다.
         `count(...)` 같은 함수 괄호는 그대로 붙여 둔다(줄을 바꾸면 오히려 안 읽힌다). */
      if (next !== undefined && next.t === 'word' && next.v.toLowerCase() === 'select') {
        flush();
        depth++;
      }
      continue;
    }
    if (tk.t === 'punct' && tk.v === ')') {
      const back = opened.pop();
      if (back !== undefined && back < depth) {
        flush();
        depth = back;
      }
      line += (line.endsWith(' ') || line === '' ? '' : '') + ')';
      continue;
    }
    if (tk.t === 'punct' && tk.v === ',') {
      line += ',';
      /* 값 목록 `(1,2,3)` 은 한 줄에 둔다. 괄호 안에서는 줄을 안 바꾼다 */
      if (opened.length === 0) flush();
      continue;
    }
    if (tk.t === 'punct' && tk.v === ';') {
      line += ';';
      flush();
      rows.push('');
      continue;
    }

    if (tk.t === 'word' && BREAK_BEFORE.has(lower)) {
      /* `group by` 의 `by`, `order by` 의 `by` 는 앞 낱말에 붙는다 */
      const prevLower = prev === undefined ? '' : prev.v.toLowerCase();
      const glued = ['group', 'order', 'union', 'left', 'right', 'full', 'inner', 'cross'].includes(prevLower);
      if (!glued) flush();
    }

    const word = tk.t === 'word' && KEYWORDS.has(lower) && opts.upper === true ? tk.v.toUpperCase() : tk.v;
    const noSpaceBefore = tk.t === 'punct' && ['.', ')'].includes(tk.v);
    const prevNoSpace = prev !== undefined && prev.t === 'punct' && ['(', '.'].includes(prev.v);
    line += (line === '' || noSpaceBefore || prevNoSpace ? '' : ' ') + word;
  }
  flush();
  return rows.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ── DB 말 바꾸기 ──────────────────────────────────────────────────── */

export interface DialectResult {
  sql: string;
  /** 무엇을 어떻게 옮겼나. 화면에 그대로 보여 준다 */
  notes: string[];
}

const QUOTE_OPEN: Record<Dialect, string> = { mysql: '`', postgres: '"', mssql: '[', sqlite: '"' };
const QUOTE_CLOSE: Record<Dialect, string> = { mysql: '`', postgres: '"', mssql: ']', sqlite: '"' };

const FUNCS: Array<{ names: Partial<Record<Dialect, string>>; note: string }> = [
  { names: { mysql: 'NOW()', postgres: 'NOW()', mssql: 'GETDATE()', sqlite: "DATETIME('now')" }, note: '지금 시각' },
  { names: { mysql: 'IFNULL', postgres: 'COALESCE', mssql: 'ISNULL', sqlite: 'IFNULL' }, note: '없으면 대신 쓸 값' },
  { names: { mysql: 'CONCAT', postgres: 'CONCAT', mssql: 'CONCAT', sqlite: 'CONCAT' }, note: '글자 잇기' },
  { names: { mysql: 'RAND()', postgres: 'RANDOM()', mssql: 'RAND()', sqlite: 'RANDOM()' }, note: '난수' }
];

export function toDialect(sql: string, from: Dialect, to: Dialect): DialectResult {
  const notes: string[] = [];
  let out = sql;

  // ① 이름 감싸는 따옴표
  const open = QUOTE_OPEN[from];
  const close = QUOTE_CLOSE[from];
  if (open !== QUOTE_OPEN[to]) {
    const re = new RegExp('\\' + open + '([^' + (close === ']' ? '\\]' : '\\' + close) + ']+)\\' + (close === ']' ? ']' : close), 'g');
    if (re.test(out)) {
      out = out.replace(new RegExp(re.source, 'g'), (_m, name: string) => QUOTE_OPEN[to] + name + QUOTE_CLOSE[to]);
      notes.push('이름을 감싸는 기호를 ' + open + '...' + close + ' → ' + QUOTE_OPEN[to] + '...' + QUOTE_CLOSE[to] + ' 로 바꿨습니다');
    }
  }

  // ② 몇 줄만 가져오기. LIMIT / TOP / FETCH
  const limit = /\blimit\s+(\d+)(?:\s+offset\s+(\d+))?/i.exec(out);
  if (limit !== null && to === 'mssql') {
    out = out.replace(limit[0], '').trim();
    if (limit[2] === undefined) {
      out = out.replace(/\bselect\b/i, 'SELECT TOP ' + limit[1]);
      notes.push('LIMIT ' + limit[1] + ' → SELECT TOP ' + limit[1]);
    } else {
      out = out + ' OFFSET ' + limit[2] + ' ROWS FETCH NEXT ' + limit[1] + ' ROWS ONLY';
      notes.push('LIMIT/OFFSET → OFFSET ... FETCH NEXT (ORDER BY 가 있어야 돕니다)');
    }
  }
  const top = /\bselect\s+top\s+(\d+)/i.exec(out);
  if (top !== null && to !== 'mssql') {
    out = out.replace(top[0], 'SELECT').trim() + ' LIMIT ' + top[1];
    notes.push('SELECT TOP ' + top[1] + ' → LIMIT ' + top[1]);
  }

  // ③ 자동 번호
  const auto: Record<Dialect, string> = {
    mysql: 'AUTO_INCREMENT',
    postgres: 'GENERATED BY DEFAULT AS IDENTITY',
    mssql: 'IDENTITY(1,1)',
    sqlite: 'AUTOINCREMENT'
  };
  for (const [d, word] of Object.entries(auto) as Array<[Dialect, string]>) {
    if (d === to) continue;
    const re = new RegExp(word.replace(/[()]/g, '\\$&').replace(/\s+/g, '\\s+'), 'gi');
    if (re.test(out)) {
      out = out.replace(new RegExp(re.source, 'gi'), auto[to]);
      notes.push(word + ' → ' + auto[to]);
    }
  }

  // ④ 함수 이름
  for (const f of FUNCS) {
    const a = f.names[from];
    const b = f.names[to];
    if (a === undefined || b === undefined || a === b) continue;
    const re = new RegExp('\\b' + a.replace(/[()]/g, '\\$&') + (a.endsWith('()') ? '' : '\\s*\\('), 'gi');
    if (re.test(out)) {
      out = out.replace(new RegExp(re.source, 'gi'), a.endsWith('()') ? b : b + '(');
      notes.push(f.note + ': ' + a + ' → ' + b);
    }
  }

  // ⑤ 글자 잇기 연산자. MySQL 의 || 는 또는이라 그대로 두면 뜻이 달라진다
  if (from !== 'mysql' && to === 'mysql' && out.includes('||')) {
    notes.push('⚠ `||` 는 MySQL 에서 또는으로 읽힙니다. 글자를 잇는 뜻이면 CONCAT() 으로 손봐야 합니다 (그대로 뒀습니다)');
  }

  if (notes.length === 0) notes.push('바꿀 것이 없었습니다. 두 말이 같은 표현을 씁니다');
  return { sql: out, notes };
}

export const run: ToolRunner = (op, args) => {
  const sql = String(args.sql ?? '');
  if (op === 'format') return format(sql, { upper: args.upper === true, indent: args.indent === undefined ? undefined : Number(args.indent) });
  if (op === 'dialect') {
    const got = toDialect(sql, String(args.from ?? 'mysql') as Dialect, String(args.to ?? 'postgres') as Dialect);
    return got.sql;
  }
  throw new Error('sqlfmt: 모르는 연산 ' + op);
};
