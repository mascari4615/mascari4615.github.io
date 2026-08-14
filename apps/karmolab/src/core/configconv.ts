/**
 * 설정 파일을 서로 옮긴다 — .env ↔ YAML ↔ TOML ↔ JSON ↔ .properties (TASK-KL-316 / 3)
 *
 * 같은 설정을 형식만 바꿔 다시 적는 일은 흔한데, 손으로 옮기면 **중첩과 따옴표에서 샌다**.
 * 여기서는 무엇으로 들어오든 **한 가지 나무**(`Value`)로 읽고, 거기서 다섯 모양으로 찍는다.
 * 읽기 다섯 × 쓰기 다섯을 스물다섯 벌로 적지 않기 위해서다.
 *
 * **일부러 안 하는 것**(적어 두지 않으면 「되는 줄 알고」 쓴다):
 *   YAML 의 앵커·별칭(`&a`/`*a`)·여러 문서(`---`)·복잡한 블록 스칼라 접기,
 *   TOML 의 배열 표(`[[table]]`) 안 중첩 표, 날짜 형식 보존.
 *   .env 와 .properties 는 원래 **평평하다** — 중첩은 `A.B=1` 처럼 점으로 편다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'configconv',
  ops: {
    convert: {
      desc:
        'Convert a config file between formats: json, yaml, toml, env, properties.' +
        ' The input format is detected unless `from` is given.',
      in: { text: 'string', to: 'string', from: 'string?' },
      out: 'string'
    },
    detect: {
      desc: 'Say which config format the text is (json / yaml / toml / env / properties).',
      in: { text: 'string' },
      out: 'string'
    }
  }
};

export type Format = 'json' | 'yaml' | 'toml' | 'env' | 'properties';
export type Value = string | number | boolean | null | Value[] | { [key: string]: Value };

/* ── 무엇으로 들어왔나 ─────────────────────────────────────────────── */

export function detect(text: string): Format {
  const body = text.trim();
  if (body === '') return 'json';
  if (body.startsWith('{')) return 'json';
  const lines = body.split(/\r?\n/).filter((l) => l.trim() !== '' && !/^\s*[#;]/.test(l));
  /* `[server]` 로 시작하는 TOML 도 대괄호로 열린다 — **읽어 봐야** 갈린다.
     (예전엔 첫 글자만 보고 json 이라 했다가 TOML 표를 json 으로 잘못 짚었다.) */
  if (body.startsWith('[')) {
    try {
      JSON.parse(body);
      return 'json';
    } catch {
      return 'toml';
    }
  }
  if (lines.some((l) => /^\s*\[[^\]]+\]\s*$/.test(l))) return 'toml';
  // `키: 값` 이 있고 `키=값` 이 없으면 YAML 쪽이다.
  const colon = lines.filter((l) => /^\s*[-\w."'[\]]+\s*:(\s|$)/.test(l)).length;
  const equal = lines.filter((l) => /^\s*[\w.\-/]+\s*=/.test(l)).length;
  if (colon > equal) return 'yaml';
  if (equal > 0) {
    // 대문자·밑줄 위주면 .env, 점 많은 소문자면 .properties 로 본다.
    const envish = lines.filter((l) => /^\s*(export\s+)?[A-Z0-9_]+\s*=/.test(l)).length;
    return envish >= equal / 2 ? 'env' : 'properties';
  }
  return 'yaml';
}

/* ── 읽기 ──────────────────────────────────────────────────────────── */

function scalar(raw: string): Value {
  const v = raw.trim();
  if (v === '') return '';
  if ((v.startsWith('"') && v.endsWith('"') && v.length > 1) || (v.startsWith("'") && v.endsWith("'") && v.length > 1)) {
    return v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
  }
  if (v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === 'no' || v === 'off') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d*\.\d+(e[-+]?\d+)?$/i.test(v)) return parseFloat(v);
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (inner === '') return [];
    return splitTop(inner).map(scalar);
  }
  if (v.startsWith('{') && v.endsWith('}')) {
    const inner = v.slice(1, -1).trim();
    const obj: Record<string, Value> = {};
    if (inner === '') return obj;
    for (const part of splitTop(inner)) {
      const at = part.indexOf(':');
      if (at < 0) continue;
      obj[scalarKey(part.slice(0, at))] = scalar(part.slice(at + 1));
    }
    return obj;
  }
  return v;
}

/** 괄호·따옴표 안의 쉼표는 자르지 않는다. */
function splitTop(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const c of text) {
    if (quote !== '') {
      cur += c;
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
      continue;
    }
    if (c === '[' || c === '{') depth++;
    if (c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim() !== '') out.push(cur);
  return out.map((s) => s.trim());
}

function scalarKey(raw: string): string {
  const v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

/** 들여쓰기로 묶는 YAML — 우리가 쓰는 만큼만. */
export function parseYaml(text: string): Value {
  interface Frame {
    indent: number;
    node: Record<string, Value> | Value[];
  }
  const root: Record<string, Value> = {};
  const stack: Frame[] = [{ indent: -1, node: root }];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || /^\s*#/.test(line) || line.trim() === '---') continue;
    const indent = line.length - line.replace(/^\s*/, '').length;
    const body = line.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const top = stack[stack.length - 1];

    if (body.startsWith('- ') || body === '-') {
      const arr = Array.isArray(top.node) ? top.node : undefined;
      if (arr === undefined) continue;
      const rest = body === '-' ? '' : body.slice(2).trim();
      if (rest.includes(': ') || /:$/.test(rest)) {
        const obj: Record<string, Value> = {};
        arr.push(obj);
        const at = rest.indexOf(':');
        const key = scalarKey(rest.slice(0, at));
        const val = rest.slice(at + 1).trim();
        if (val === '') {
          const child: Record<string, Value> = {};
          obj[key] = child;
          stack.push({ indent, node: obj });
          stack.push({ indent: indent + 2, node: child });
        } else {
          obj[key] = scalar(val);
          stack.push({ indent, node: obj });
        }
        continue;
      }
      arr.push(scalar(rest));
      continue;
    }

    const at = body.indexOf(':');
    if (at < 0) continue;
    const key = scalarKey(body.slice(0, at));
    const val = body.slice(at + 1).trim();
    const parent = Array.isArray(top.node) ? undefined : top.node;
    if (parent === undefined) continue;

    if (val === '' || val === '|' || val === '>') {
      // 다음 줄을 보고 목록인지 묶음인지 고른다 — 여는 괄호가 없는 형식이라 이렇게밖에 못 안다.
      let j = i + 1;
      while (j < lines.length && (lines[j].trim() === '' || /^\s*#/.test(lines[j]))) j++;
      const nextIndent = j < lines.length ? lines[j].length - lines[j].replace(/^\s*/, '').length : -1;
      if (val === '|' || val === '>') {
        const rows: string[] = [];
        while (j < lines.length) {
          const ind = lines[j].length - lines[j].replace(/^\s*/, '').length;
          if (lines[j].trim() !== '' && ind <= indent) break;
          rows.push(lines[j].slice(nextIndent));
          j++;
        }
        parent[key] = val === '|' ? rows.join('\n') : rows.join(' ').trim();
        i = j - 1;
        continue;
      }
      if (j < lines.length && nextIndent > indent && lines[j].trim().startsWith('-')) {
        const arr: Value[] = [];
        parent[key] = arr;
        stack.push({ indent, node: arr });
      } else {
        const child: Record<string, Value> = {};
        parent[key] = child;
        stack.push({ indent, node: child });
      }
      continue;
    }
    parent[key] = scalar(val);
  }
  return root;
}

export function parseToml(text: string): Value {
  const root: Record<string, Value> = {};
  let table: Record<string, Value> = root;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const arrTable = /^\[\[(.+)\]\]$/.exec(line);
    if (arrTable !== null) {
      const path = arrTable[1].split('.').map(scalarKey);
      let cur: Record<string, Value> = root;
      for (let i = 0; i < path.length - 1; i++) cur = (cur[path[i]] ??= {}) as Record<string, Value>;
      const last = path[path.length - 1];
      const list = (cur[last] ??= []) as Value[];
      table = {};
      list.push(table);
      continue;
    }
    const head = /^\[(.+)\]$/.exec(line);
    if (head !== null) {
      const path = head[1].split('.').map(scalarKey);
      let cur: Record<string, Value> = root;
      for (const part of path) cur = (cur[part] ??= {}) as Record<string, Value>;
      table = cur;
      continue;
    }
    const at = line.indexOf('=');
    if (at < 0) continue;
    table[scalarKey(line.slice(0, at))] = scalar(line.slice(at + 1).replace(/\s+#.*$/, ''));
  }
  return root;
}

/** `.env` 와 `.properties` 는 평평하다 — 점 있는 열쇠는 중첩으로 편다. */
export function parseFlat(text: string): Value {
  const root: Record<string, Value> = {};
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith('!') || line.startsWith(';')) continue;
    const body = line.replace(/^export\s+/, '');
    const at = body.search(/[=:]/);
    if (at < 0) continue;
    const key = body.slice(0, at).trim();
    const val = scalar(body.slice(at + 1));
    const path = key.split('.');
    let cur: Record<string, Value> = root;
    for (let i = 0; i < path.length - 1; i++) {
      const next = cur[path[i]];
      cur = (typeof next === 'object' && next !== null && !Array.isArray(next) ? next : (cur[path[i]] = {})) as Record<string, Value>;
    }
    cur[path[path.length - 1]] = val;
  }
  return root;
}

export function parse(text: string, format?: Format): Value {
  const kind = format ?? detect(text);
  if (kind === 'json') return JSON.parse(text === '' ? 'null' : text) as Value;
  if (kind === 'yaml') return parseYaml(text);
  if (kind === 'toml') return parseToml(text);
  return parseFlat(text);
}

/* ── 쓰기 ──────────────────────────────────────────────────────────── */

const isMap = (v: Value): v is Record<string, Value> => typeof v === 'object' && v !== null && !Array.isArray(v);

function yamlScalar(v: Value): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (s === '') return "''";
  if (s.includes('\n')) return '|\n' + s.split('\n').map((l) => '  ' + l).join('\n');
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s) || /:\s/.test(s) || /^(true|false|null|yes|no|on|off|-?\d+(\.\d+)?)$/i.test(s)) {
    return "'" + s.replace(/'/g, "''") + "'";
  }
  return s;
}

export function toYaml(value: Value, indent = 0): string {
  const pad = ' '.repeat(indent);
  if (isMap(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return pad + '{}';
    return keys
      .map((k) => {
        const v = value[k];
        if (isMap(v) && Object.keys(v).length > 0) return pad + k + ':\n' + toYaml(v, indent + 2);
        /* 목록도 한 칸 더 들여쓴다 — 열쇠와 같은 자리에 두면 우리 읽기가 「빈 묶음」으로 본다(왕복이 깨진다). */
        if (Array.isArray(v) && v.length > 0) return pad + k + ':\n' + toYaml(v, indent + 2);
        return pad + k + ': ' + yamlScalar(isMap(v) ? {} : Array.isArray(v) ? [] : v).replace(/^\{\}$/, '{}');
      })
      .join('\n');
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return pad + '[]';
    return value
      .map((v) => {
        if (isMap(v)) {
          const inner = toYaml(v, indent + 2);
          return pad + '- ' + inner.slice(indent + 2);
        }
        return pad + '- ' + yamlScalar(v);
      })
      .join('\n');
  }
  return pad + yamlScalar(value);
}

function tomlScalar(v: Value): string {
  if (v === null) return '""';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return '[' + v.map(tomlScalar).join(', ') + ']';
  if (isMap(v)) return '{ ' + Object.entries(v).map(([k, x]) => k + ' = ' + tomlScalar(x)).join(', ') + ' }';
  return '"' + String(v).replace(/(["\\])/g, '\\$1').replace(/\n/g, '\\n') + '"';
}

export function toToml(value: Value, prefix = ''): string {
  if (!isMap(value)) return tomlScalar(value);
  const plain: string[] = [];
  const tables: string[] = [];
  for (const [k, v] of Object.entries(value)) {
    const path = prefix === '' ? k : prefix + '.' + k;
    if (isMap(v)) {
      tables.push('[' + path + ']\n' + toToml(v, path));
      continue;
    }
    if (Array.isArray(v) && v.length > 0 && v.every(isMap)) {
      for (const item of v) tables.push('[[' + path + ']]\n' + toToml(item, path));
      continue;
    }
    plain.push(k + ' = ' + tomlScalar(v));
  }
  return [plain.join('\n'), tables.join('\n\n')].filter((s) => s !== '').join('\n\n');
}

/** 중첩을 점으로 편다 — 평평한 형식으로 나갈 때 쓴다. */
export function flatten(value: Value, prefix = ''): Array<[string, Value]> {
  const out: Array<[string, Value]> = [];
  if (isMap(value)) {
    for (const [k, v] of Object.entries(value)) out.push(...flatten(v, prefix === '' ? k : prefix + '.' + k));
    return out;
  }
  if (Array.isArray(value) && value.some(isMap)) {
    value.forEach((v, i) => out.push(...flatten(v, prefix + '.' + i)));
    return out;
  }
  out.push([prefix, value]);
  return out;
}

function flatScalar(v: Value, quote: boolean): string {
  if (v === null) return '';
  if (Array.isArray(v)) return v.map((x) => String(x)).join(',');
  const s = String(v);
  if (quote && (/\s/.test(s) || s.includes('#') || s === '')) return '"' + s.replace(/"/g, '\\"') + '"';
  return s;
}

export function toEnv(value: Value): string {
  return flatten(value)
    .map(([k, v]) => k.replace(/[.\-]/g, '_').toUpperCase() + '=' + flatScalar(v, true))
    .join('\n');
}

export function toProperties(value: Value): string {
  return flatten(value)
    .map(([k, v]) => k + '=' + flatScalar(v, false))
    .join('\n');
}

export function emit(value: Value, to: Format): string {
  if (to === 'json') return JSON.stringify(value, null, 2);
  if (to === 'yaml') return toYaml(value);
  if (to === 'toml') return toToml(value);
  if (to === 'env') return toEnv(value);
  return toProperties(value);
}

export function convert(text: string, to: Format, from?: Format): string {
  return emit(parse(text, from), to);
}

export const run: ToolRunner = (op, args) => {
  const text = String(args.text ?? '');
  if (op === 'detect') return detect(text);
  if (op === 'convert') {
    return convert(text, String(args.to ?? 'json') as Format, args.from === undefined ? undefined : (String(args.from) as Format));
  }
  throw new Error('configconv: 모르는 연산 ' + op);
};
