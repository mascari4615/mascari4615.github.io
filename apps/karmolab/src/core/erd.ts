/**
 * 표 사이의 관계를 그림으로 (TASK-KL-316 / 9)
 *
 * 스키마를 처음 받으면 제일 알고 싶은 건 「어느 표가 어느 표를 가리키나」인데,
 * `CREATE TABLE` 을 눈으로 따라가며 `REFERENCES` 를 줍는 건 사람이 할 일이 아니다.
 *
 * 여기서는 DDL·Prisma 를 읽어 **표·칸·이어짐**만 뽑고(`parse`), 그걸 mermaid `erDiagram` 으로 찍는다.
 * 그림 그리는 건 이미 있는 mermaid 에 맡긴다 — 우리가 또 그리기 엔진을 갖고 있을 이유가 없다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'erd',
  ops: {
    diagram: {
      desc: 'Turn CREATE TABLE statements or a Prisma schema into a mermaid erDiagram.',
      in: { schema: 'string' },
      out: 'string'
    },
    outline: {
      desc: 'Summarise a schema as text: tables, columns, keys and which table points at which.',
      in: { schema: 'string' },
      out: 'string'
    }
  }
};

export interface Column {
  name: string;
  type: string;
  pk?: boolean;
  required?: boolean;
  unique?: boolean;
  /** 이 칸이 가리키는 표 */
  ref?: string;
}

export interface Table {
  name: string;
  columns: Column[];
}

export interface Link {
  from: string;
  to: string;
  /** 어느 칸이 가리키나 */
  by: string;
  /** 하나-여럿 (`}o--||`) 인가 하나-하나 인가 */
  one?: boolean;
}

export interface Schema {
  tables: Table[];
  links: Link[];
  kind: 'sql' | 'prisma' | 'unknown';
}

const unquote = (s: string): string => s.replace(/^[`"[\]]+|[`"[\]]+$/g, '').trim();

/** 괄호 균형을 보며 `CREATE TABLE …( … )` 한 덩이를 떼어 낸다. */
function tableBodies(sql: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([`"[\]\w.]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    let body = '';
    while (i < sql.length && depth > 0) {
      const c = sql[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      if (depth > 0) body += c;
      i++;
    }
    out.push({ name: unquote(m[1]).split('.').pop() ?? '', body });
  }
  return out;
}

/** 괄호 안의 쉼표로만 자른다(`decimal(10,2)` 를 안 쪼개게). */
function splitTop(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of body) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim() !== '') out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

export function parseSql(sql: string): Schema {
  const tables: Table[] = [];
  const links: Link[] = [];
  for (const { name, body } of tableBodies(sql)) {
    const columns: Column[] = [];
    for (const piece of splitTop(body)) {
      const lower = piece.toLowerCase();
      if (/^primary\s+key/.test(lower)) {
        const keys = /\(([^)]*)\)/.exec(piece);
        if (keys !== null) {
          for (const k of keys[1].split(',').map(unquote)) {
            const col = columns.find((c) => c.name === k);
            if (col !== undefined) col.pk = true;
          }
        }
        continue;
      }
      if (/^(constraint|foreign\s+key|unique|check|key|index)/.test(lower)) {
        const fk = /foreign\s+key\s*\(([^)]*)\)\s*references\s+([`"[\]\w.]+)/i.exec(piece);
        if (fk !== null) {
          const by = unquote(fk[1].split(',')[0]);
          const to = unquote(fk[2]).split('.').pop() ?? '';
          links.push({ from: name, to, by });
          const col = columns.find((c) => c.name === by);
          if (col !== undefined) col.ref = to;
        }
        continue;
      }
      const m = /^([`"[\]\w]+)\s+([\w]+(?:\s*\([^)]*\))?(?:\s+unsigned)?)/i.exec(piece);
      if (m === null) continue;
      const col: Column = { name: unquote(m[1]), type: m[2].replace(/\s+/g, ' ').trim() };
      if (/primary\s+key/i.test(piece)) col.pk = true;
      if (/\bnot\s+null\b/i.test(piece)) col.required = true;
      if (/\bunique\b/i.test(piece)) col.unique = true;
      const ref = /references\s+([`"[\]\w.]+)/i.exec(piece);
      if (ref !== null) {
        const to = unquote(ref[1]).split('.').pop() ?? '';
        col.ref = to;
        links.push({ from: name, to, by: col.name });
      }
      columns.push(col);
    }
    tables.push({ name, columns });
  }
  return { tables, links, kind: 'sql' };
}

export function parsePrisma(text: string): Schema {
  const tables: Table[] = [];
  const links: Link[] = [];
  const re = /model\s+(\w+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  const modelNames = new Set<string>();
  const raw: Array<{ name: string; body: string }> = [];
  while ((m = re.exec(text)) !== null) {
    modelNames.add(m[1]);
    raw.push({ name: m[1], body: m[2] });
  }
  for (const { name, body } of raw) {
    const columns: Column[] = [];
    for (const line of body.split('\n')) {
      const row = line.trim();
      if (row === '' || row.startsWith('//') || row.startsWith('@@')) continue;
      const f = /^(\w+)\s+([\w\[\]?]+)(.*)$/.exec(row);
      if (f === null) continue;
      const bare = f[2].replace(/[[\]?]/g, '');
      const rest = f[3] ?? '';
      if (modelNames.has(bare)) {
        /* 다른 모델을 가리키는 칸 = 관계. 어느 칸으로 잇는지는 `@relation(fields: [x])` 에 적힌다. */
        const by = /fields:\s*\[([^\]]*)\]/.exec(rest);
        links.push({ from: name, to: bare, by: by === null ? bare : by[1].split(',')[0].trim(), one: !f[2].includes('[]') && by !== null });
        continue;
      }
      const col: Column = { name: f[1], type: f[2] };
      if (/@id\b/.test(rest)) col.pk = true;
      if (/@unique\b/.test(rest)) col.unique = true;
      if (!f[2].includes('?')) col.required = true;
      columns.push(col);
    }
    tables.push({ name, columns });
  }
  return { tables, links, kind: 'prisma' };
}

export function parse(text: string): Schema {
  if (/\bmodel\s+\w+\s*\{/.test(text)) return parsePrisma(text);
  if (/create\s+table/i.test(text)) return parseSql(text);
  return { tables: [], links: [], kind: 'unknown' };
}

/** mermaid 는 이름에 점·따옴표가 있으면 싫어한다 — 안전한 이름으로 바꾼다. */
const safe = (name: string): string => name.replace(/[^\w]/g, '_');

export function toMermaid(schema: Schema): string {
  const rows: string[] = ['erDiagram'];
  for (const link of schema.links) {
    if (!schema.tables.some((t) => t.name === link.to)) continue;
    const shape = link.one === true ? '||--||' : '}o--||';
    rows.push('  ' + safe(link.from) + ' ' + shape + ' ' + safe(link.to) + ' : ' + safe(link.by));
  }
  for (const table of schema.tables) {
    rows.push('  ' + safe(table.name) + ' {');
    for (const col of table.columns) {
      const marks = [col.pk === true ? 'PK' : '', col.ref !== undefined ? 'FK' : '', col.unique === true ? 'UK' : '']
        .filter((s) => s !== '')
        .join(',');
      rows.push('    ' + safe(col.type) + ' ' + safe(col.name) + (marks === '' ? '' : ' ' + marks));
    }
    rows.push('  }');
  }
  return rows.join('\n');
}

export function outline(schema: Schema): string {
  if (schema.tables.length === 0) return 'CREATE TABLE 이나 Prisma model 을 못 찾았습니다.';
  const rows: string[] = [];
  rows.push('표 ' + schema.tables.length + '개 · 이어짐 ' + schema.links.length + '개');
  for (const table of schema.tables) {
    const keys = table.columns.filter((c) => c.pk === true).map((c) => c.name);
    rows.push('');
    rows.push('[' + table.name + ']' + (keys.length > 0 ? '  열쇠: ' + keys.join(', ') : '  (열쇠 없음)'));
    for (const col of table.columns) {
      const marks = [col.pk === true ? '열쇠' : '', col.required === true ? '필수' : '', col.unique === true ? '하나뿐' : '', col.ref !== undefined ? '→ ' + col.ref : '']
        .filter((s) => s !== '')
        .join(' · ');
      rows.push('  ' + col.name + ' : ' + col.type + (marks === '' ? '' : '   ' + marks));
    }
  }
  const dangling = schema.links.filter((l) => !schema.tables.some((t) => t.name === l.to));
  if (dangling.length > 0) {
    rows.push('');
    rows.push('⚠ 여기 없는 표를 가리킵니다: ' + dangling.map((l) => l.from + '.' + l.by + ' → ' + l.to).join(', '));
  }
  return rows.join('\n');
}

export const run: ToolRunner = (op, args) => {
  const schema = parse(String(args.schema ?? ''));
  if (op === 'diagram') return toMermaid(schema);
  if (op === 'outline') return outline(schema);
  throw new Error('erd: 모르는 연산 ' + op);
};
