/**
 * OpenAPI 를 읽어 **눌러 볼 수 있게** (TASK-KL-316 / 16)
 *
 * 스펙 파일은 사람이 읽으라고 만든 게 아니다 — 「이 API 를 한 번 찔러 보고 싶다」가 대부분인데
 * 그러려면 경로·파라미터·본문 예시를 손으로 조립해야 한다. 여기서 그 조립을 대신한다.
 *
 * **목 서버는 안 만든다** (원래 계획에서 바꾼 것 — 이유를 적어 둔다):
 * 브라우저에서 가짜 서버를 세우려면 Service Worker 를 등록해야 하는데, 이 사이트에는 **이미
 * 자기 Service Worker 가 있다**. 도구가 두 번째 것을 등록하면 사이트 전체의 요청을 가로챌 수 있다 —
 * 도구 하나 쓰자고 앱을 망가뜨릴 위험을 질 수는 없다. 대신 **스키마에서 예시 응답을 만들어 준다**:
 * 그 JSON 을 자기 목 서버(msw·json-server 등)에 그대로 붙이면 된다.
 */
import type { ToolRunner, ToolSpec } from './types';
import { parseYaml } from './configconv';

export const spec: ToolSpec = {
  id: 'apitest',
  ops: {
    list: {
      desc: 'List the operations in an OpenAPI document (method, path, summary).',
      in: { doc: 'string' },
      out: 'string'
    },
    example: {
      desc: 'Build an example request body (or response) for one operation, from its schema.',
      in: { doc: 'string', method: 'string', path: 'string', of: 'string?' },
      out: 'string'
    }
  }
};

export type Json = unknown;

export interface Param {
  name: string;
  where: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  /** 스키마에서 뽑은 예시 값 */
  example?: Json;
}

export interface Operation {
  method: string;
  path: string;
  summary?: string;
  params: Param[];
  /** 보낼 몸통의 예시 (있으면) */
  body?: Json;
  /** 답의 예시 — 코드별 */
  responses: Array<{ code: string; example?: Json; description?: string }>;
}

export interface Doc {
  title?: string;
  version?: string;
  servers: string[];
  operations: Operation[];
}

const isObj = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `#/components/schemas/User` 를 따라간다. 고리가 있으면 거기서 멈춘다. */
function deref(root: Json, node: Json, seen: Set<string> = new Set()): Json {
  if (!isObj(node)) return node;
  const ref = node.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return node;
  if (seen.has(ref)) return {};
  seen.add(ref);
  let cur: Json = root;
  for (const part of ref.slice(2).split('/')) {
    if (!isObj(cur)) return {};
    cur = cur[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return deref(root, cur, seen);
}

/** 스키마에서 **그럴듯한 예시**를 만든다. `example` 이 적혀 있으면 그것을 그대로 쓴다. */
export function exampleOf(root: Json, schemaIn: Json, depth = 0): Json {
  const schema = deref(root, schemaIn);
  if (!isObj(schema) || depth > 6) return null;
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;

  const type = typeof schema.type === 'string' ? schema.type : Array.isArray(schema.properties) || isObj(schema.properties) ? 'object' : 'string';
  switch (type) {
    case 'object': {
      const props = isObj(schema.properties) ? schema.properties : {};
      const out: Record<string, Json> = {};
      for (const [key, value] of Object.entries(props)) out[key] = exampleOf(root, value, depth + 1);
      return out;
    }
    case 'array':
      return [exampleOf(root, schema.items ?? {}, depth + 1)];
    case 'integer':
      return typeof schema.minimum === 'number' ? schema.minimum : 1;
    case 'number':
      return 1.5;
    case 'boolean':
      return true;
    default: {
      const format = typeof schema.format === 'string' ? schema.format : '';
      if (format === 'date-time') return '2026-08-14T09:00:00Z';
      if (format === 'date') return '2026-08-14';
      if (format === 'email') return 'someone@example.com';
      if (format === 'uuid') return '00000000-0000-4000-a000-000000000000';
      if (format === 'uri' || format === 'url') return 'https://example.com';
      return 'string';
    }
  }
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

export function parse(text: string): Doc {
  const body = text.trim();
  let root: Json;
  if (body.startsWith('{')) root = JSON.parse(body) as Json;
  else root = parseYaml(body) as Json;
  if (!isObj(root)) throw new Error('OpenAPI 문서로 안 읽힙니다');

  const info = isObj(root.info) ? root.info : {};
  const servers = Array.isArray(root.servers)
    ? root.servers.map((s) => (isObj(s) && typeof s.url === 'string' ? s.url : '')).filter((s) => s !== '')
    : [];
  const paths = isObj(root.paths) ? root.paths : {};
  const operations: Operation[] = [];

  for (const [path, itemRaw] of Object.entries(paths)) {
    const item = deref(root, itemRaw);
    if (!isObj(item)) continue;
    /* 경로에 공통으로 걸린 파라미터는 각 연산이 물려받는다 — 안 물려받으면 필수 값이 사라진다. */
    const shared = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of METHODS) {
      const opRaw = item[method];
      if (!isObj(opRaw)) continue;
      const paramList = [...shared, ...(Array.isArray(opRaw.parameters) ? opRaw.parameters : [])];
      const params: Param[] = paramList
        .map((p) => deref(root, p))
        .filter(isObj)
        .map((p) => ({
          name: String(p.name ?? ''),
          where: (String(p.in ?? 'query') as Param['where']),
          required: p.required === true || p.in === 'path',
          example: p.schema === undefined ? undefined : exampleOf(root, p.schema)
        }));

      let bodyExample: Json | undefined;
      const requestBody = deref(root, opRaw.requestBody);
      if (isObj(requestBody) && isObj(requestBody.content)) {
        const json = requestBody.content['application/json'];
        if (isObj(json) && json.schema !== undefined) bodyExample = exampleOf(root, json.schema);
      }

      const responses: Operation['responses'] = [];
      if (isObj(opRaw.responses)) {
        for (const [code, resRaw] of Object.entries(opRaw.responses)) {
          const res = deref(root, resRaw);
          let example: Json | undefined;
          if (isObj(res) && isObj(res.content)) {
            const json = res.content['application/json'];
            if (isObj(json) && json.schema !== undefined) example = exampleOf(root, json.schema);
          }
          responses.push({ code, example, description: isObj(res) && typeof res.description === 'string' ? res.description : undefined });
        }
      }

      operations.push({
        method: method.toUpperCase(),
        path,
        summary: typeof opRaw.summary === 'string' ? opRaw.summary : typeof opRaw.operationId === 'string' ? opRaw.operationId : undefined,
        params,
        body: bodyExample,
        responses
      });
    }
  }

  return {
    title: typeof info.title === 'string' ? info.title : undefined,
    version: typeof info.version === 'string' ? info.version : undefined,
    servers,
    operations
  };
}

export interface Filled {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/** 값을 채워 **진짜 보낼 수 있는 요청**으로 만든다. 안 채운 자리는 예시로 메운다. */
export function fill(op: Operation, server: string, values: Record<string, string> = {}): Filled {
  let path = op.path;
  const query: string[] = [];
  const headers: Record<string, string> = {};
  for (const p of op.params) {
    const given = values[p.name];
    const value = given !== undefined && given !== '' ? given : p.example === undefined ? '' : String(p.example);
    if (p.where === 'path') path = path.replace('{' + p.name + '}', encodeURIComponent(value));
    else if (p.where === 'query') {
      if (value !== '' || p.required) query.push(encodeURIComponent(p.name) + '=' + encodeURIComponent(value));
    } else if (p.where === 'header' && value !== '') headers[p.name] = value;
  }
  const base = server.replace(/\/$/, '');
  const url = base + path + (query.length > 0 ? '?' + query.join('&') : '');
  const out: Filled = { method: op.method, url, headers };
  if (op.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    out.body = JSON.stringify(op.body, null, 2);
  }
  return out;
}

/** 목 서버에 그대로 붙일 수 있는 「경로 → 답」 표 */
export function mockTable(doc: Doc): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const op of doc.operations) {
    const ok = op.responses.find((r) => r.code.startsWith('2')) ?? op.responses[0];
    if (ok === undefined || ok.example === undefined) continue;
    out[op.method + ' ' + op.path] = ok.example;
  }
  return out;
}

export const run: ToolRunner = (op, args) => {
  const doc = parse(String(args.doc ?? ''));
  if (op === 'list') {
    return doc.operations.map((o) => o.method + ' ' + o.path + (o.summary === undefined ? '' : '  — ' + o.summary)).join('\n');
  }
  if (op === 'example') {
    const found = doc.operations.find((o) => o.method === String(args.method ?? '').toUpperCase() && o.path === String(args.path ?? ''));
    if (found === undefined) throw new Error('그런 연산이 없습니다');
    if (String(args.of ?? 'request') === 'response') {
      const ok = found.responses.find((r) => r.code.startsWith('2')) ?? found.responses[0];
      return JSON.stringify(ok?.example ?? null, null, 2);
    }
    return JSON.stringify(found.body ?? null, null, 2);
  }
  throw new Error('apitest: 모르는 연산 ' + op);
};
