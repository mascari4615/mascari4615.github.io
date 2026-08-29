/**
 * 보안 헤더 읽고 짓기 (TASK-KL-316 / 14)
 *
 * CSP 는 **한 줄이 길어서 눈으로 못 읽는다**. 그래서 붙여넣으면 갈래별로 펴고,
 * 이건 사실상 꺼 둔 것인 자리(`'unsafe-inline'`, `*`, `data:` 스크립트)를 짚는다.
 * 반대로 몇 가지만 고르면 헤더 한 줄을 지어 준다.
 *
 * **점수를 매기지 않는다**. A 등급 같은 것은 안심만 주고 무엇이 위험한지는 안 알려 준다.
 * 대신 발견마다 *무엇이 왜 위험한지*를 열쇠로 돌려주고, 문장은 화면(i18n)이 만든다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'csp',
  ops: {
    parse: {
      desc: 'Split a Content-Security-Policy header into its directives, one per line.',
      in: { header: 'string' },
      out: 'string'
    },
    review: {
      desc:
        'Review security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)' +
        ' and list what is weak or missing.',
      in: { headers: 'string' },
      out: 'string'
    },
    build: {
      desc:
        'Build a Content-Security-Policy header. self=true starts from a strict self-only policy;' +
        ' inlineStyles / images / fonts / connect add the usual exceptions.',
      in: { images: 'string?', connect: 'string?', fonts: 'string?', inlineStyles: 'boolean?', frames: 'boolean?' },
      out: 'string'
    }
  }
};

export type Level = 'weak' | 'missing' | 'note';

export interface Finding {
  /** 어느 헤더, 갈래에서 */
  where: string;
  /** i18n 열쇠 (`csp.find.<key>`) */
  key: string;
  level: Level;
  /** 문제가 된 값 */
  value?: string;
}

/** `default-src 'self'; img-src *` → 갈래별 목록 */
export function parseCsp(header: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const body = header.replace(/^\s*content-security-policy\s*:/i, '');
  for (const piece of body.split(';')) {
    const parts = piece.trim().split(/\s+/).filter((s) => s !== '');
    if (parts.length === 0) continue;
    out[parts[0].toLowerCase()] = parts.slice(1);
  }
  return out;
}

/** 헤더 뭉치(`Name: value` 여러 줄)를 이름→값 으로 */
export function parseHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const at = line.indexOf(':');
    if (at <= 0) continue;
    out[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
  }
  return out;
}

const FETCH_DIRECTIVES = ['script-src', 'style-src', 'img-src', 'connect-src', 'font-src', 'frame-src', 'object-src'];

export function reviewCsp(header: string): Finding[] {
  const csp = parseCsp(header);
  const out: Finding[] = [];
  const has = (name: string): boolean => csp[name] !== undefined;
  const valuesOf = (name: string): string[] => csp[name] ?? csp['default-src'] ?? [];

  if (!has('default-src')) out.push({ where: 'default-src', key: 'noDefault', level: 'missing' });

  for (const dir of FETCH_DIRECTIVES) {
    const values = valuesOf(dir);
    if (values.length === 0) continue;
    if (values.includes('*')) out.push({ where: dir, key: 'wildcard', level: 'weak', value: '*' });
    if (values.includes("'unsafe-inline'")) {
      /* nonce, 해시가 같이 있으면 최신 브라우저는 `'unsafe-inline'` 을 무시한다. 그건 위험이 아니다. */
      const guarded = values.some((v) => v.startsWith("'nonce-") || v.startsWith("'sha256-") || v.includes("'strict-dynamic'"));
      if (!guarded) out.push({ where: dir, key: 'unsafeInline', level: 'weak', value: "'unsafe-inline'" });
    }
    if (values.includes("'unsafe-eval'")) out.push({ where: dir, key: 'unsafeEval', level: 'weak', value: "'unsafe-eval'" });
    if (dir === 'script-src' && values.some((v) => v === 'data:' || v === 'blob:')) {
      out.push({ where: dir, key: 'scriptData', level: 'weak', value: 'data:' });
    }
    if (values.some((v) => v.startsWith('http://'))) out.push({ where: dir, key: 'plainHttp', level: 'weak' });
  }

  if (!has('object-src') && !has('default-src')) out.push({ where: 'object-src', key: 'noObject', level: 'missing' });
  else if ((csp['object-src'] ?? []).length > 0 && !(csp['object-src'] ?? []).includes("'none'")) {
    out.push({ where: 'object-src', key: 'objectNotNone', level: 'note' });
  }
  if (!has('frame-ancestors')) out.push({ where: 'frame-ancestors', key: 'noFrameAncestors', level: 'missing' });
  if (!has('base-uri')) out.push({ where: 'base-uri', key: 'noBaseUri', level: 'missing' });
  if (!has('form-action')) out.push({ where: 'form-action', key: 'noFormAction', level: 'note' });
  return out;
}

export function reviewHeaders(text: string): Finding[] {
  const headers = parseHeaders(text);
  const out: Finding[] = [];
  const csp = headers['content-security-policy'];
  if (csp === undefined) out.push({ where: 'Content-Security-Policy', key: 'noCsp', level: 'missing' });
  else out.push(...reviewCsp(csp));

  const hsts = headers['strict-transport-security'];
  if (hsts === undefined) out.push({ where: 'Strict-Transport-Security', key: 'noHsts', level: 'missing' });
  else {
    const age = /max-age\s*=\s*(\d+)/i.exec(hsts);
    if (age === null || Number(age[1]) < 15552000) out.push({ where: 'Strict-Transport-Security', key: 'shortHsts', level: 'weak', value: age?.[1] });
  }

  if (headers['x-content-type-options'] !== 'nosniff') out.push({ where: 'X-Content-Type-Options', key: 'noSniff', level: 'missing' });
  if (headers['referrer-policy'] === undefined) out.push({ where: 'Referrer-Policy', key: 'noReferrer', level: 'note' });
  if (headers['x-frame-options'] === undefined && csp !== undefined && parseCsp(csp)['frame-ancestors'] === undefined) {
    out.push({ where: 'X-Frame-Options', key: 'noFrameOptions', level: 'note' });
  }
  if (headers['permissions-policy'] === undefined) out.push({ where: 'Permissions-Policy', key: 'noPermissions', level: 'note' });
  return out;
}

export interface BuildOpts {
  /** 그림, 글꼴, 연결을 어디까지 받나 (빈 값이면 자기 자신만) */
  images?: string;
  connect?: string;
  fonts?: string;
  /** 인라인 스타일을 허용해야 하나 (많은 UI 라이브러리가 쓴다) */
  inlineStyles?: boolean;
  /** 남의 화면에 넣기(iframe) 를 허용하나 */
  frames?: boolean;
}

/** 기본은 **가장 좁게**. 넓히는 건 사람이 고르게 한다. */
export function build(opts: BuildOpts = {}): string {
  const add = (base: string, extra?: string): string => (extra === undefined || extra.trim() === '' ? base : base + ' ' + extra.trim());
  const rows = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'" + (opts.inlineStyles === true ? " 'unsafe-inline'" : ''),
    add("img-src 'self' data:", opts.images),
    add("font-src 'self'", opts.fonts),
    add("connect-src 'self'", opts.connect),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'frame-ancestors ' + (opts.frames === true ? "'self'" : "'none'"),
    'upgrade-insecure-requests'
  ];
  return rows.join('; ');
}

export const run: ToolRunner = (op, args) => {
  if (op === 'parse') {
    const csp = parseCsp(String(args.header ?? ''));
    return Object.entries(csp)
      .map(([k, v]) => k + ': ' + v.join(' '))
      .join('\n');
  }
  if (op === 'review') {
    return reviewHeaders(String(args.headers ?? ''))
      .map((f) => f.level + '  ' + f.where + '  ' + f.key + (f.value === undefined ? '' : '  ' + f.value))
      .join('\n');
  }
  if (op === 'build') {
    return build({
      images: args.images === undefined ? undefined : String(args.images),
      connect: args.connect === undefined ? undefined : String(args.connect),
      fonts: args.fonts === undefined ? undefined : String(args.fonts),
      inlineStyles: args.inlineStyles === true,
      frames: args.frames === true
    });
  }
  throw new Error('csp: 모르는 연산 ' + op);
};
