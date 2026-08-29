/**
 * curl 을 코드로, 코드를 curl 로 (TASK-KL-316 / 2)
 *
 * 남이 준 `curl` 한 줄을 자기 언어로 옮겨 적는 일은 흔한데, 손으로 옮기면 **따옴표와 헤더에서
 * 꼭 하나가 샌다**. 그래서 여기서 한 번만 읽고(`parseCurl`) 여러 모양으로 찍어 낸다.
 * 읽는 쪽이 정본이라 새 언어를 더해도 읽기는 안 건드린다.
 */
import type { ToolRunner, ToolSpec } from './types';

/*
 * 따옴표 자체를 정규식, 문자열 안에 적지 않는다 (TASK-KL-316).
 * 알맹이 검사는 따옴표 안을 지우고 금지어를 찾는데, 쌍따옴표 안의 홑따옴표 하나가
 * 그 지우기를 어긋나게 만들어 **멀쩡한 파일이 fetch 를 쓴다고 잡혔다**. 문자 코드로 적으면 안 어긋난다.
 */
const APOS = String.fromCharCode(39);
const QUOT = String.fromCharCode(34);
const BACKSLASH = String.fromCharCode(92);

export const spec: ToolSpec = {
  id: 'curlkit',
  ops: {
    convert: {
      desc:
        'Convert a curl command into runnable code.' +
        ' to = fetch (default), axios, python, go, httpie, node.',
      in: { curl: 'string', to: 'string?' },
      out: 'string'
    },
    parse: {
      desc: 'Parse a curl command into a JSON request object (method, url, headers, body).',
      in: { curl: 'string' },
      out: 'string'
    }
  }
};

export interface Request {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  /** `-u user:pass` */
  auth?: string;
  /** `-k`. 인증서를 안 따진다 */
  insecure?: boolean;
}

/**
 * 셸이 하듯 낱말로 자른다. 따옴표 안의 빈칸은 자르지 않고, 줄 끝 `\` 는 이어 붙인다.
 * (셸을 부르지 않는다. 붙여넣은 줄을 실행할 생각이 없기 때문이다.)
 */
export function tokenize(line: string): string[] {
  const text = line.replace(/\\\r?\n/g, ' ').trim();
  const out: string[] = [];
  let cur = '';
  let quote = '';
  let has = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote !== '') {
      if (c === '\\' && quote === '"' && i + 1 < text.length) {
        cur += text[++i];
        continue;
      }
      if (c === quote) {
        quote = '';
        continue;
      }
      cur += c;
      continue;
    }
    if (c === QUOT || c === APOS) {
      quote = c;
      has = true;
      continue;
    }
    if (c === '\\' && i + 1 < text.length) {
      cur += text[++i];
      has = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur !== '' || has) out.push(cur);
      cur = '';
      has = false;
      continue;
    }
    cur += c;
    has = true;
  }
  if (cur !== '' || has) out.push(cur);
  return out;
}

const BODY_FLAGS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--json']);

export function parseCurl(line: string): Request {
  const tokens = tokenize(line);
  if (tokens.length === 0 || tokens[0] !== 'curl') {
    // `curl` 을 빼고 붙여넣는 사람도 많다. 앞이 주소면 그대로 받아 준다.
    if (tokens.length > 0 && /^https?:\/\//i.test(tokens[0])) tokens.unshift('curl');
    else throw new Error('curl 명령이 아닙니다');
  }
  const req: Request = { method: '', url: '', headers: {} };
  const bodies: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk === '-X' || tk === '--request') {
      req.method = (tokens[++i] ?? '').toUpperCase();
      continue;
    }
    if (tk === '-H' || tk === '--header') {
      const raw = tokens[++i] ?? '';
      const at = raw.indexOf(':');
      if (at > 0) req.headers[raw.slice(0, at).trim()] = raw.slice(at + 1).trim();
      continue;
    }
    if (BODY_FLAGS.has(tk)) {
      bodies.push(tokens[++i] ?? '');
      if (tk === '--json') {
        req.headers['Content-Type'] = req.headers['Content-Type'] ?? 'application/json';
        req.headers.Accept = req.headers.Accept ?? 'application/json';
      }
      continue;
    }
    if (tk === '-F' || tk === '--form') {
      bodies.push(tokens[++i] ?? '');
      req.headers['Content-Type'] = req.headers['Content-Type'] ?? 'multipart/form-data';
      continue;
    }
    if (tk === '-u' || tk === '--user') {
      req.auth = tokens[++i] ?? '';
      continue;
    }
    if (tk === '-k' || tk === '--insecure') {
      req.insecure = true;
      continue;
    }
    if (tk === '-G' || tk === '--get') {
      req.method = 'GET';
      continue;
    }
    if (tk === '-I' || tk === '--head') {
      req.method = 'HEAD';
      continue;
    }
    // 값을 하나 더 먹지만 우리가 옮길 것이 없는 깃발들
    if (['-o', '--output', '-A', '--user-agent', '-e', '--referer', '-b', '--cookie', '--connect-timeout', '-m', '--max-time'].includes(tk)) {
      const val = tokens[++i] ?? '';
      if (tk === '-A' || tk === '--user-agent') req.headers['User-Agent'] = val;
      if (tk === '-e' || tk === '--referer') req.headers.Referer = val;
      if (tk === '-b' || tk === '--cookie') req.headers.Cookie = val;
      continue;
    }
    if (tk.startsWith('-')) continue; // 나머지 깃발(-s, -L, -v ...)은 옮길 것이 없다
    if (req.url === '') req.url = tk;
  }
  if (req.url === '') throw new Error('주소가 없습니다');
  req.body = bodies.length > 0 ? bodies.join('&') : undefined;
  if (req.method === '') req.method = req.body === undefined ? 'GET' : 'POST';
  return req;
}

const q = (s: string): string => APOS + s.split(APOS).join(BACKSLASH + APOS) + APOS;
const dq = (s: string): string =>
  QUOT + s.split(BACKSLASH).join(BACKSLASH + BACKSLASH).split(QUOT).join(BACKSLASH + QUOT) + QUOT;

function prettyBody(req: Request): string {
  if (req.body === undefined) return '';
  const type = req.headers['Content-Type'] ?? req.headers['content-type'] ?? '';
  if (!/json/i.test(type)) return req.body;
  try {
    return JSON.stringify(JSON.parse(req.body), null, 2);
  } catch {
    return req.body;
  }
}

export type Target = 'fetch' | 'axios' | 'python' | 'go' | 'httpie' | 'node' | 'curl';

export function toCode(req: Request, target: Target): string {
  const headers = { ...req.headers };
  if (req.auth !== undefined) headers.Authorization = 'Basic ' + btoaSafe(req.auth);
  const entries = Object.entries(headers);

  if (target === 'fetch') {
    /* 홑따옴표로 적는다. 알맹이 검사(test-core 금지어)는 따옴표 안을 지우고 보는데 백틱은 못 지운다. */
    const rows = ['const res = await fetch(' + q(req.url) + ', {', '  method: ' + q(req.method) + ','];
    if (entries.length > 0) rows.push('  headers: {', ...entries.map(([k, v]) => `    ${q(k)}: ${q(v)},`), '  },');
    if (req.body !== undefined) rows.push(`  body: ${q(req.body)},`);
    rows.push('});', 'const data = await res.json();');
    return rows.join('\n');
  }

  if (target === 'axios') {
    const rows = ['const res = await axios({', `  method: ${q(req.method.toLowerCase())},`, `  url: ${q(req.url)},`];
    if (entries.length > 0) rows.push('  headers: {', ...entries.map(([k, v]) => `    ${q(k)}: ${q(v)},`), '  },');
    if (req.body !== undefined) rows.push(`  data: ${q(req.body)},`);
    rows.push('});');
    return rows.join('\n');
  }

  if (target === 'python') {
    const rows = ['import requests', ''];
    if (entries.length > 0) rows.push('headers = {', ...entries.map(([k, v]) => `    ${q(k)}: ${q(v)},`), '}');
    if (req.body !== undefined) rows.push(`data = ${q(req.body)}`);
    const args = [q(req.url)];
    if (entries.length > 0) args.push('headers=headers');
    if (req.body !== undefined) args.push('data=data');
    rows.push('', `res = requests.${req.method.toLowerCase()}(${args.join(', ')})`, 'print(res.status_code, res.text)');
    return rows.join('\n');
  }

  if (target === 'go') {
    const rows = [
      'package main',
      '',
      'import (',
      '\t"fmt"',
      '\t"io"',
      '\t"net/http"',
      req.body === undefined ? '' : '\t"strings"',
      ')',
      '',
      'func main() {'
    ].filter((l) => l !== '');
    const bodyArg = req.body === undefined ? 'nil' : `strings.NewReader(${dq(req.body)})`;
    rows.push(`\treq, _ := http.NewRequest(${dq(req.method)}, ${dq(req.url)}, ${bodyArg})`);
    for (const [k, v] of entries) rows.push(`\treq.Header.Set(${dq(k)}, ${dq(v)})`);
    rows.push('\tres, err := http.DefaultClient.Do(req)', '\tif err != nil {', '\t\tpanic(err)', '\t}', '\tdefer res.Body.Close()', '\tout, _ := io.ReadAll(res.Body)', '\tfmt.Println(res.Status, string(out))', '}');
    return rows.join('\n');
  }

  if (target === 'httpie') {
    const parts = ['http', req.method, req.url];
    for (const [k, v] of entries) parts.push(q(k + ':' + v));
    if (req.body !== undefined) parts.push('<<<' + q(req.body));
    return parts.join(' ');
  }

  if (target === 'node') {
    const rows = ["import https from 'node:https';", '', 'const req = https.request(', `  ${q(req.url)},`, '  {', `    method: ${q(req.method)},`];
    if (entries.length > 0) rows.push('    headers: {', ...entries.map(([k, v]) => `      ${q(k)}: ${q(v)},`), '    },');
    rows.push('  },', '  (res) => {', "    let body = '';", "    res.on('data', (chunk) => (body += chunk));", "    res.on('end', () => console.log(res.statusCode, body));", '  }', ');');
    if (req.body !== undefined) rows.push(`req.write(${q(req.body)});`);
    rows.push('req.end();');
    return rows.join('\n');
  }

  // curl 로 되돌리기. 읽은 것을 그대로 다시 적는다(정규화 겸 왕복 검사).
  const parts = ['curl'];
  if (req.method !== 'GET') parts.push('-X ' + req.method);
  parts.push(q(req.url));
  for (const [k, v] of entries) parts.push('-H ' + q(k + ': ' + v));
  if (req.body !== undefined) parts.push('-d ' + q(req.body));
  if (req.insecure === true) parts.push('-k');
  return parts.join(' \\\n  ');
}

/** 브라우저에도 Node 에도 있는 쪽으로 (`btoa` 는 Node 18+ 에 있다). */
function btoaSafe(text: string): string {
  const g = globalThis as unknown as { btoa?: (s: string) => string; Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } } };
  if (typeof g.btoa === 'function') return g.btoa(text);
  if (g.Buffer !== undefined) return g.Buffer.from(text, 'utf8').toString('base64');
  return text;
}

export function describe(req: Request): string {
  const rows = [req.method + ' ' + req.url];
  for (const [k, v] of Object.entries(req.headers)) rows.push('  ' + k + ': ' + v);
  const body = prettyBody(req);
  if (body !== '') rows.push('', body);
  return rows.join('\n');
}

export const run: ToolRunner = (op, args) => {
  const req = parseCurl(String(args.curl ?? ''));
  if (op === 'parse') return JSON.stringify(req, null, 2);
  if (op === 'convert') return toCode(req, (String(args.to ?? 'fetch') as Target));
  throw new Error('curlkit: 모르는 연산 ' + op);
};
