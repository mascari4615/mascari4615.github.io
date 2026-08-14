/**
 * jq 놀이터 — 붙여넣은 JSON 에 물어보기 (TASK-KL-316 / 7)
 *
 * `jq` 는 좋은데 **켜 두고 쓰기가 번거롭다** — 터미널을 열고, 파일로 저장하고, 따옴표를 이겨야 한다.
 * 여기서는 붙여넣고 `.users[] | select(.age > 20) | .name` 을 치면 그 자리에서 답이 나온다.
 *
 * 진짜 jq 를 통째로 들이지 않는다(그 무게가 화면으로 따라 나간다 — 번들 예산, KL-128).
 * 대신 **자주 쓰는 만큼**을 여기서 직접 읽는다. 무엇이 되고 무엇이 안 되는지는 `SUPPORTED` 에
 * 적어 두고 화면에도 그대로 보여 준다 — 「되는 줄 알았는데 안 되는」 것이 제일 나쁘다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'jqplay',
  ops: {
    query: {
      desc:
        'Run a jq-style query over JSON text and return the results, one JSON value per line.' +
        ' Supports paths, .[], pipes, comma, select/map/keys/length/sort_by/group_by/unique/add/join and friends.',
      in: { json: 'string', query: 'string', compact: 'boolean?' },
      out: 'string'
    }
  }
};

/** 되는 것 — 화면에도 이 목록을 그대로 보여 준다. */
export const SUPPORTED = [
  '.  ·  .key  ·  .a.b  ·  .["키 이름"]  ·  .[0]  ·  .[1:3]  ·  .[]  ·  ..',
  '| (이어서)  ·  , (둘 다)  ·  ? (없으면 넘어가기)',
  'select(…) · map(…) · map_values(…) · has("k") · empty',
  'length · keys · values · type · not · add · any · all',
  'sort · sort_by(…) · group_by(…) · unique · unique_by(…) · reverse · first · last · flatten',
  'min · max · min_by(…) · max_by(…) · range(n) · tostring · tonumber · ascii_downcase · ascii_upcase',
  'join("·") · split(",") · test("정규식") · startswith · endswith · contains',
  'to_entries · from_entries · with_entries(…) · paths · del(.k) · [ … ] · { a: … }',
  '== != < <= > >= and or + - * / %'
];

export type Json = unknown;

/* ── 낱말로 자르기 ─────────────────────────────────────────────────── */

type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const two = ['==', '!=', '<=', '>=', '|='];
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"') {
      let s = '';
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === String.fromCharCode(92)) {
          const n = src[i + 1];
          s += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          i += 2;
          continue;
        }
        s += src[i++];
      }
      i++;
      out.push({ t: 'str', v: s });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] ?? '') && (out.length === 0 || (out[out.length - 1].t === 'op' && out[out.length - 1].v !== ')' && out[out.length - 1].v !== ']')))) {
      let s = '';
      if (c === '-') s += src[i++];
      while (i < src.length && /[0-9.]/.test(src[i])) s += src[i++];
      out.push({ t: 'num', v: parseFloat(s) });
      continue;
    }
    /* 열쇠는 한글·한자일 수 있다 — 아스키만 낱말로 보면 「나이」가 「나」와 「이」로 쪼개진다 (실측). */
    if (/[\p{L}_]/u.test(c)) {
      let s = '';
      while (i < src.length && /[\p{L}\p{N}_]/u.test(src[i])) s += src[i++];
      out.push({ t: 'id', v: s });
      continue;
    }
    if (src.startsWith('..', i)) {
      out.push({ t: 'op', v: '..' });
      i += 2;
      continue;
    }
    const pair = src.slice(i, i + 2);
    if (two.includes(pair)) {
      out.push({ t: 'op', v: pair });
      i += 2;
      continue;
    }
    out.push({ t: 'op', v: c });
    i++;
  }
  return out;
}

/* ── 읽어서 나무로 ─────────────────────────────────────────────────── */

interface Node {
  kind: string;
  [key: string]: unknown;
}

class Parser {
  private at = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.at];
  }
  private eat(v?: string): Tok {
    const tk = this.toks[this.at];
    if (tk === undefined) throw new Error('쿼리가 도중에 끝났습니다');
    if (v !== undefined && !(tk.t === 'op' && tk.v === v) && !(tk.t === 'id' && tk.v === v)) {
      throw new Error('「' + v + '」 가 있어야 할 자리에 「' + String(tk.v) + '」 가 있습니다');
    }
    this.at++;
    return tk;
  }
  private isOp(v: string): boolean {
    const tk = this.peek();
    return tk !== undefined && tk.t === 'op' && tk.v === v;
  }

  parse(): Node {
    const node = this.pipe();
    if (this.at < this.toks.length) throw new Error('「' + String(this.toks[this.at].v) + '」 를 못 읽었습니다');
    return node;
  }

  private pipe(): Node {
    let left = this.comma();
    while (this.isOp('|')) {
      this.eat('|');
      left = { kind: 'pipe', left, right: this.comma() };
    }
    return left;
  }

  private comma(): Node {
    let left = this.binary(0);
    while (this.isOp(',')) {
      this.eat(',');
      left = { kind: 'comma', left, right: this.binary(0) };
    }
    return left;
  }

  private static readonly LEVELS = [['or'], ['and'], ['==', '!=', '<', '<=', '>', '>='], ['+', '-'], ['*', '/', '%']];

  private binary(level: number): Node {
    if (level >= Parser.LEVELS.length) return this.postfix();
    let left = this.binary(level + 1);
    for (;;) {
      const tk = this.peek();
      if (tk === undefined) break;
      const v = String(tk.v);
      const isWord = tk.t === 'id' && (v === 'and' || v === 'or');
      if (!(tk.t === 'op' || isWord) || !Parser.LEVELS[level].includes(v)) break;
      this.at++;
      left = { kind: 'binary', op: v, left, right: this.binary(level + 1) };
    }
    return left;
  }

  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      if (this.isOp('.')) {
        const next = this.toks[this.at + 1];
        if (next !== undefined && next.t === 'id') {
          this.eat('.');
          node = { kind: 'field', on: node, name: String(this.eat().v) };
          continue;
        }
        break;
      }
      if (this.isOp('[')) {
        this.eat('[');
        if (this.isOp(']')) {
          this.eat(']');
          node = { kind: 'iterate', on: node };
          continue;
        }
        const first = this.isOp(':') ? undefined : this.pipe();
        if (this.isOp(':')) {
          this.eat(':');
          const second = this.isOp(']') ? undefined : this.pipe();
          this.eat(']');
          node = { kind: 'slice', on: node, from: first, to: second };
          continue;
        }
        this.eat(']');
        node = { kind: 'index', on: node, index: first };
        continue;
      }
      if (this.isOp('?')) {
        this.eat('?');
        node = { kind: 'try', on: node };
        continue;
      }
      break;
    }
    return node;
  }

  private primary(): Node {
    const tk = this.peek();
    if (tk === undefined) throw new Error('쿼리가 비었습니다');
    if (tk.t === 'num') {
      this.at++;
      return { kind: 'lit', value: tk.v };
    }
    if (tk.t === 'str') {
      this.at++;
      return { kind: 'lit', value: tk.v };
    }
    if (tk.t === 'op' && tk.v === '..') {
      this.at++;
      return { kind: 'descend' };
    }
    if (tk.t === 'op' && tk.v === '.') {
      this.at++;
      const next = this.peek();
      if (next !== undefined && next.t === 'id') {
        this.at++;
        return { kind: 'field', on: { kind: 'identity' }, name: String(next.v) };
      }
      if (next !== undefined && next.t === 'str') {
        this.at++;
        return { kind: 'field', on: { kind: 'identity' }, name: String(next.v) };
      }
      return { kind: 'identity' };
    }
    if (tk.t === 'op' && tk.v === '(') {
      this.at++;
      const inner = this.pipe();
      this.eat(')');
      return inner;
    }
    if (tk.t === 'op' && tk.v === '[') {
      this.at++;
      if (this.isOp(']')) {
        this.eat(']');
        return { kind: 'array', body: undefined };
      }
      const body = this.pipe();
      this.eat(']');
      return { kind: 'array', body };
    }
    if (tk.t === 'op' && tk.v === '{') {
      this.at++;
      const pairs: Array<{ key: string; value: Node }> = [];
      while (!this.isOp('}')) {
        const keyTok = this.eat();
        const key = String(keyTok.v);
        let value: Node = { kind: 'field', on: { kind: 'identity' }, name: key };
        if (this.isOp(':')) {
          this.eat(':');
          value = this.binary(0);
        }
        pairs.push({ key, value });
        if (this.isOp(',')) this.eat(',');
      }
      this.eat('}');
      return { kind: 'object', pairs };
    }
    if (tk.t === 'id') {
      this.at++;
      const name = tk.v;
      if (name === 'true') return { kind: 'lit', value: true };
      if (name === 'false') return { kind: 'lit', value: false };
      if (name === 'null') return { kind: 'lit', value: null };
      const args: Node[] = [];
      if (this.isOp('(')) {
        this.eat('(');
        while (!this.isOp(')')) {
          args.push(this.pipe());
          if (this.isOp(';') || this.isOp(',')) this.at++;
        }
        this.eat(')');
      }
      return { kind: 'call', name, args };
    }
    throw new Error('「' + String(tk.v) + '」 는 여기서 못 씁니다');
  }
}

/* ── 셈하기 ────────────────────────────────────────────────────────── */

const isObj = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);
const typeOf = (v: Json): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v);

function truthy(v: Json): boolean {
  return v !== false && v !== null && v !== undefined;
}

function compare(a: Json, b: Json): number {
  const rank = (v: Json): number => ['null', 'boolean', 'number', 'string', 'array', 'object'].indexOf(typeOf(v));
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return JSON.stringify(a) === JSON.stringify(b) ? 0 : JSON.stringify(a) < JSON.stringify(b) ? -1 : 1;
}

function descend(v: Json, out: Json[]): void {
  out.push(v);
  if (Array.isArray(v)) for (const x of v) descend(x, out);
  else if (isObj(v)) for (const k of Object.keys(v)) descend(v[k], out);
}

function evalNode(node: Node, input: Json): Json[] {
  switch (node.kind) {
    case 'identity':
      return [input];
    case 'lit':
      return [node.value as Json];
    case 'descend': {
      const out: Json[] = [];
      descend(input, out);
      return out;
    }
    case 'pipe': {
      const out: Json[] = [];
      for (const v of evalNode(node.left as Node, input)) out.push(...evalNode(node.right as Node, v));
      return out;
    }
    case 'comma':
      return [...evalNode(node.left as Node, input), ...evalNode(node.right as Node, input)];
    case 'try':
      try {
        return evalNode(node.on as Node, input);
      } catch {
        return [];
      }
    case 'field': {
      const out: Json[] = [];
      for (const v of evalNode(node.on as Node, input)) {
        if (v === null || v === undefined) {
          out.push(null);
          continue;
        }
        if (!isObj(v)) throw new Error(typeOf(v) + ' 에서는 「.' + String(node.name) + '」 를 꺼낼 수 없습니다');
        out.push(v[String(node.name)] ?? null);
      }
      return out;
    }
    case 'iterate': {
      const out: Json[] = [];
      for (const v of evalNode(node.on as Node, input)) {
        if (Array.isArray(v)) out.push(...v);
        else if (isObj(v)) out.push(...Object.values(v));
        else throw new Error(typeOf(v) + ' 는 하나씩 꺼낼 수 없습니다');
      }
      return out;
    }
    case 'index': {
      const out: Json[] = [];
      for (const v of evalNode(node.on as Node, input)) {
        for (const key of evalNode(node.index as Node, input)) {
          if (Array.isArray(v) && typeof key === 'number') out.push(v[key < 0 ? v.length + key : key] ?? null);
          else if (isObj(v) && typeof key === 'string') out.push(v[key] ?? null);
          else if (v === null) out.push(null);
          else throw new Error(typeOf(v) + ' 에서 ' + JSON.stringify(key) + ' 로 꺼낼 수 없습니다');
        }
      }
      return out;
    }
    case 'slice': {
      const out: Json[] = [];
      for (const v of evalNode(node.on as Node, input)) {
        const from = node.from === undefined ? 0 : Number(evalNode(node.from as Node, input)[0]);
        const to = node.to === undefined ? undefined : Number(evalNode(node.to as Node, input)[0]);
        if (Array.isArray(v)) out.push(v.slice(from, to));
        else if (typeof v === 'string') out.push(v.slice(from, to));
        else throw new Error(typeOf(v) + ' 는 자를 수 없습니다');
      }
      return out;
    }
    case 'array': {
      if (node.body === undefined) return [[]];
      return [evalNode(node.body as Node, input)];
    }
    case 'object': {
      const pairs = node.pairs as Array<{ key: string; value: Node }>;
      let rows: Array<Record<string, Json>> = [{}];
      for (const pair of pairs) {
        const next: Array<Record<string, Json>> = [];
        for (const row of rows) for (const v of evalNode(pair.value, input)) next.push({ ...row, [pair.key]: v });
        rows = next;
      }
      return rows;
    }
    case 'binary': {
      const out: Json[] = [];
      for (const a of evalNode(node.left as Node, input)) {
        for (const b of evalNode(node.right as Node, input)) out.push(binop(String(node.op), a, b));
      }
      return out;
    }
    case 'call':
      return builtin(String(node.name), (node.args as Node[]) ?? [], input);
    default:
      throw new Error('모르는 마디: ' + node.kind);
  }
}

function binop(op: string, a: Json, b: Json): Json {
  switch (op) {
    case '==':
      return JSON.stringify(a) === JSON.stringify(b);
    case '!=':
      return JSON.stringify(a) !== JSON.stringify(b);
    case '<':
      return compare(a, b) < 0;
    case '<=':
      return compare(a, b) <= 0;
    case '>':
      return compare(a, b) > 0;
    case '>=':
      return compare(a, b) >= 0;
    case 'and':
      return truthy(a) && truthy(b);
    case 'or':
      return truthy(a) || truthy(b);
    case '+':
      if (typeof a === 'number' && typeof b === 'number') return a + b;
      if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
      if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
      if (isObj(a) && isObj(b)) return { ...a, ...b };
      if (a === null) return b;
      if (b === null) return a;
      throw new Error(typeOf(a) + ' 와 ' + typeOf(b) + ' 는 더할 수 없습니다');
    case '-':
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      if (Array.isArray(a) && Array.isArray(b)) return a.filter((x) => !b.some((y) => JSON.stringify(x) === JSON.stringify(y)));
      throw new Error(typeOf(a) + ' 와 ' + typeOf(b) + ' 는 뺄 수 없습니다');
    case '*':
      if (typeof a === 'number' && typeof b === 'number') return a * b;
      throw new Error('곱하기는 숫자끼리만 됩니다');
    case '/':
      if (typeof a === 'number' && typeof b === 'number') {
        if (b === 0) throw new Error('0 으로 나눌 수 없습니다');
        return a / b;
      }
      if (typeof a === 'string' && typeof b === 'string') return a.split(b);
      throw new Error('나누기는 숫자끼리 (또는 글자 쪼개기) 만 됩니다');
    case '%':
      if (typeof a === 'number' && typeof b === 'number') return a % b;
      throw new Error('나머지는 숫자끼리만 됩니다');
    default:
      throw new Error('모르는 셈: ' + op);
  }
}

function one(args: Node[], index: number, input: Json): Json {
  return evalNode(args[index], input)[0] ?? null;
}

function builtin(name: string, args: Node[], input: Json): Json[] {
  const arr = (): Json[] => {
    if (!Array.isArray(input)) throw new Error(name + ' 은 목록에만 씁니다 (' + typeOf(input) + ' 를 받았습니다)');
    return input;
  };
  switch (name) {
    case 'empty':
      return [];
    case 'length':
      if (input === null) return [0];
      if (Array.isArray(input)) return [input.length];
      if (typeof input === 'string') return [[...input].length];
      if (isObj(input)) return [Object.keys(input).length];
      if (typeof input === 'number') return [Math.abs(input)];
      return [0];
    case 'keys':
      if (Array.isArray(input)) return [input.map((_, i) => i)];
      if (isObj(input)) return [Object.keys(input).sort()];
      throw new Error('keys 는 물체·목록에만 씁니다');
    case 'values':
      if (Array.isArray(input)) return [input];
      if (isObj(input)) return [Object.values(input)];
      throw new Error('values 는 물체·목록에만 씁니다');
    case 'type':
      return [typeOf(input)];
    case 'not':
      return [!truthy(input)];
    case 'select':
      return evalNode(args[0], input).some(truthy) ? [input] : [];
    case 'map':
      return [arr().flatMap((v) => evalNode(args[0], v))];
    case 'map_values': {
      if (Array.isArray(input)) return [input.map((v) => evalNode(args[0], v)[0] ?? null)];
      if (isObj(input)) {
        const out: Record<string, Json> = {};
        for (const [k, v] of Object.entries(input)) {
          const got = evalNode(args[0], v);
          if (got.length > 0) out[k] = got[0];
        }
        return [out];
      }
      throw new Error('map_values 는 물체·목록에만 씁니다');
    }
    case 'has': {
      const key = one(args, 0, input);
      if (Array.isArray(input) && typeof key === 'number') return [key >= 0 && key < input.length];
      if (isObj(input) && typeof key === 'string') return [Object.prototype.hasOwnProperty.call(input, key)];
      return [false];
    }
    case 'add':
      return [arr().reduce((sum: Json, v) => (sum === null ? v : binop('+', sum, v)), null)];
    case 'any':
      return [arr().some(truthy)];
    case 'all':
      return [arr().every(truthy)];
    case 'sort':
      return [[...arr()].sort(compare)];
    case 'sort_by':
      return [[...arr()].sort((a, b) => compare(one(args, 0, a), one(args, 0, b)))];
    case 'group_by': {
      const groups = new Map<string, Json[]>();
      for (const v of arr()) {
        const key = JSON.stringify(one(args, 0, v));
        const cur = groups.get(key);
        if (cur === undefined) groups.set(key, [v]);
        else cur.push(v);
      }
      return [[...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v)];
    }
    case 'unique':
      return [[...new Map(arr().map((v) => [JSON.stringify(v), v])).values()].sort(compare)];
    case 'unique_by':
      return [[...new Map(arr().map((v) => [JSON.stringify(one(args, 0, v)), v])).values()]];
    case 'reverse':
      if (typeof input === 'string') return [[...input].reverse().join('')];
      return [[...arr()].reverse()];
    case 'first':
      return args.length > 0 ? evalNode(args[0], input).slice(0, 1) : [arr()[0] ?? null];
    case 'last':
      return [arr()[arr().length - 1] ?? null];
    case 'flatten':
      return [arr().flat(args.length > 0 ? Number(one(args, 0, input)) : 1) as Json];
    case 'min':
      return [arr().length === 0 ? null : [...arr()].sort(compare)[0]];
    case 'max':
      return [arr().length === 0 ? null : [...arr()].sort(compare)[arr().length - 1]];
    case 'min_by':
      return [arr().length === 0 ? null : [...arr()].sort((a, b) => compare(one(args, 0, a), one(args, 0, b)))[0]];
    case 'max_by':
      return [arr().length === 0 ? null : [...arr()].sort((a, b) => compare(one(args, 0, b), one(args, 0, a)))[0]];
    case 'range': {
      const n = Number(one(args, 0, input));
      const out: Json[] = [];
      for (let i = 0; i < n; i++) out.push(i);
      return out;
    }
    case 'tostring':
      return [typeof input === 'string' ? input : JSON.stringify(input) ?? ''];
    case 'tonumber': {
      const n = Number(input);
      if (Number.isNaN(n)) throw new Error(JSON.stringify(input) + ' 는 숫자로 못 읽습니다');
      return [n];
    }
    case 'ascii_downcase':
      return [String(input).toLowerCase()];
    case 'ascii_upcase':
      return [String(input).toUpperCase()];
    case 'join':
      return [arr().map((v) => (v === null ? '' : String(v))).join(String(one(args, 0, input)))];
    case 'split':
      return [String(input).split(String(one(args, 0, input)))];
    case 'test':
      return [new RegExp(String(one(args, 0, input))).test(String(input))];
    case 'startswith':
      return [String(input).startsWith(String(one(args, 0, input)))];
    case 'endswith':
      return [String(input).endsWith(String(one(args, 0, input)))];
    case 'contains': {
      const needle = one(args, 0, input);
      if (typeof input === 'string') return [input.includes(String(needle))];
      if (Array.isArray(input) && Array.isArray(needle)) return [needle.every((x) => input.some((y) => JSON.stringify(x) === JSON.stringify(y)))];
      throw new Error('contains 는 글자·목록에만 씁니다');
    }
    case 'to_entries': {
      if (!isObj(input)) throw new Error('to_entries 는 물체에만 씁니다');
      return [Object.entries(input).map(([key, value]) => ({ key, value }))];
    }
    case 'from_entries': {
      const out: Record<string, Json> = {};
      for (const row of arr()) {
        if (!isObj(row)) continue;
        const key = row.key ?? row.k ?? row.name;
        out[String(key)] = (row.value ?? row.v ?? null) as Json;
      }
      return [out];
    }
    case 'with_entries': {
      const entries = builtin('to_entries', [], input)[0] as Json[];
      const mapped = entries.map((e) => evalNode(args[0], e)[0] ?? null);
      return builtin('from_entries', [], mapped);
    }
    case 'paths': {
      const out: Json[] = [];
      const walk = (v: Json, path: Json[]): void => {
        if (path.length > 0) out.push(path);
        if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, i]));
        else if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, [...path, k]);
      };
      walk(input, []);
      return out;
    }
    case 'del': {
      if (args.length === 0) throw new Error('del 은 지울 자리를 받아야 합니다');
      const target = args[0];
      if (target.kind === 'field' && isObj(input)) {
        const copy = { ...input };
        delete copy[String(target.name)];
        return [copy];
      }
      throw new Error('del 은 지금 `.열쇠` 만 지웁니다');
    }
    default:
      throw new Error('아직 없는 함수: ' + name + '()');
  }
}

export function compile(query: string): (input: Json) => Json[] {
  const node = new Parser(lex(query)).parse();
  return (input: Json) => evalNode(node, input);
}

export interface QueryResult {
  values: Json[];
  error?: string;
}

export function query(jsonText: string, q: string): QueryResult {
  let input: Json;
  try {
    input = JSON.parse(jsonText === '' ? 'null' : jsonText);
  } catch (e) {
    return { values: [], error: 'JSON 이 아닙니다 — ' + (e as Error).message };
  }
  try {
    return { values: compile(q.trim() === '' ? '.' : q)(input) };
  } catch (e) {
    return { values: [], error: (e as Error).message };
  }
}

export function format(values: Json[], compact = false): string {
  return values.map((v) => (compact ? JSON.stringify(v) : JSON.stringify(v, null, 2)) ?? 'null').join('\n');
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'query') throw new Error('jqplay: 모르는 연산 ' + op);
  const got = query(String(args.json ?? ''), String(args.query ?? '.'));
  if (got.error !== undefined) throw new Error(got.error);
  return format(got.values, args.compact === true);
};
