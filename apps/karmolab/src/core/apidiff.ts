/**
 * API 두 판을 견준다. **깨지는 변경만 골라서** (TASK-KL-316 / 17)
 *
 * 스펙이 바뀌면 무엇이 바뀌었나보다 **남의 코드가 깨지나**가 궁금하다.
 * 그래서 여기서는 바뀐 것을 다 늘어놓지 않고 *깨짐/안 깨짐*을 가른다:
 *
 *   깨진다. 있던 연산, 파라미터, 응답이 **사라짐**, 선택이던 게 **필수**가 됨, 타입이 바뀜
 *   안 깨진다. 새 연산, 새 선택 파라미터, 새 응답 코드가 **늘어남**
 *
 * 판단 기준은 **부르는 쪽**이다. 서버가 무엇을 더 받는 건 괜찮고, 덜 받거나 더 요구하면 깨진다.
 * 말은 여기서 안 짓는다. `key` 만 돌려주고 문장은 화면(i18n)이 만든다.
 */
import type { ToolRunner, ToolSpec } from './types';
import { parse as parseApi, type Doc, type Operation, type Param } from './apitest';

export const spec: ToolSpec = {
  id: 'apidiff',
  ops: {
    compare: {
      desc: 'Compare two OpenAPI documents and list the changes, marking which ones break existing callers.',
      in: { before: 'string', after: 'string' },
      out: 'string'
    }
  }
};

export interface Change {
  /** i18n 열쇠 (`apidiff.what.<key>`) */
  key: string;
  breaking: boolean;
  /** 어느 연산에서 */
  where: string;
  /** 무엇이 (파라미터 이름, 응답 코드 ...) */
  what?: string;
  from?: string;
  to?: string;
}

const opKey = (op: Operation): string => op.method + ' ' + op.path;
const paramKey = (p: Param): string => p.where + ':' + p.name;

/** 값의 모양만 본다. 값이 달라진 건 변경이 아니다(예시일 뿐이다). */
function shape(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'array<' + (v.length === 0 ? 'any' : shape(v[0])) + '>';
  if (typeof v === 'object') {
    return '{' + Object.entries(v as Record<string, unknown>).map(([k, x]) => k + ':' + shape(x)).sort().join(',') + '}';
  }
  return typeof v;
}

/** 물체에서 **사라진 열쇠**만 찾는다 (부르는 쪽이 읽던 것이 없어지면 깨진다). */
function missingKeys(before: unknown, after: unknown, path = ''): string[] {
  if (typeof before !== 'object' || before === null || Array.isArray(before)) return [];
  if (typeof after !== 'object' || after === null || Array.isArray(after)) return [path === '' ? '(root)' : path];
  const out: string[] = [];
  for (const [key, value] of Object.entries(before as Record<string, unknown>)) {
    const next = (after as Record<string, unknown>)[key];
    const here = path === '' ? key : path + '.' + key;
    if (next === undefined) {
      out.push(here);
      continue;
    }
    out.push(...missingKeys(value, next, here));
  }
  return out;
}

export function compare(before: Doc, after: Doc): Change[] {
  const out: Change[] = [];
  const afterOps = new Map(after.operations.map((o) => [opKey(o), o]));
  const beforeOps = new Map(before.operations.map((o) => [opKey(o), o]));

  for (const [key, op] of beforeOps) {
    const next = afterOps.get(key);
    if (next === undefined) {
      out.push({ key: 'operationGone', breaking: true, where: key });
      continue;
    }

    const beforeParams = new Map(op.params.map((p) => [paramKey(p), p]));
    const afterParams = new Map(next.params.map((p) => [paramKey(p), p]));

    for (const [pk, p] of beforeParams) {
      const np = afterParams.get(pk);
      if (np === undefined) {
        /* 선택 파라미터가 사라지는 것도 깨짐이다. 보내던 쪽이 400 을 받을 수 있다. */
        out.push({ key: 'paramGone', breaking: true, where: key, what: p.name });
        continue;
      }
      if (!p.required && np.required) out.push({ key: 'paramNowRequired', breaking: true, where: key, what: p.name });
      if (p.required && !np.required) out.push({ key: 'paramNowOptional', breaking: false, where: key, what: p.name });
    }
    for (const [pk, p] of afterParams) {
      if (beforeParams.has(pk)) continue;
      out.push({ key: p.required ? 'newRequiredParam' : 'newOptionalParam', breaking: p.required, where: key, what: p.name });
    }

    /* 보낼 몸통: 부르는 쪽이 **더 보내야 하면** 깨진다 */
    if (op.body !== undefined && next.body === undefined) out.push({ key: 'bodyGone', breaking: false, where: key });
    if (op.body === undefined && next.body !== undefined) out.push({ key: 'bodyNew', breaking: true, where: key });
    if (op.body !== undefined && next.body !== undefined) {
      const added = missingKeys(next.body, op.body);
      if (added.length > 0) out.push({ key: 'bodyNeedsMore', breaking: true, where: key, what: added.join(', ') });
    }

    /* 답: 부르는 쪽이 **읽던 것이 없어지면** 깨진다 */
    const beforeRes = new Map(op.responses.map((r) => [r.code, r]));
    const afterRes = new Map(next.responses.map((r) => [r.code, r]));
    for (const [code, res] of beforeRes) {
      const nr = afterRes.get(code);
      if (nr === undefined) {
        out.push({ key: 'responseGone', breaking: true, where: key, what: code });
        continue;
      }
      if (res.example === undefined || nr.example === undefined) continue;
      const gone = missingKeys(res.example, nr.example);
      if (gone.length > 0) out.push({ key: 'fieldGone', breaking: true, where: key, what: code + ', ' + gone.join(', ') });
      else if (shape(res.example) !== shape(nr.example)) out.push({ key: 'shapeChanged', breaking: true, where: key, what: code, from: shape(res.example), to: shape(nr.example) });
    }
    for (const code of afterRes.keys()) if (!beforeRes.has(code)) out.push({ key: 'responseNew', breaking: false, where: key, what: code });
  }

  for (const key of afterOps.keys()) if (!beforeOps.has(key)) out.push({ key: 'operationNew', breaking: false, where: key });

  /* 깨지는 것부터. 목록이 길어도 위만 보면 된다 */
  return out.sort((a, b) => Number(b.breaking) - Number(a.breaking));
}

export function compareText(beforeText: string, afterText: string): Change[] {
  return compare(parseApi(beforeText), parseApi(afterText));
}

export const run: ToolRunner = (op, args) => {
  if (op !== 'compare') throw new Error('apidiff: 모르는 연산 ' + op);
  return compareText(String(args.before ?? ''), String(args.after ?? ''))
    .map((c) => (c.breaking ? 'BREAKING  ' : 'ok        ') + c.key + '  ' + c.where + (c.what === undefined ? '' : '  ' + c.what))
    .join('\n');
};
