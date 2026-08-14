/**
 * CSS·HTML 을 펴고 누른다 (TASK-KL-316 / 21)
 *
 * 원래 계획은 「여러 언어 한 칸」이었는데, 열어 보니 **이미 있는 것이 많았다**:
 * JSON 은 `jsonfmt`, SQL 은 `sqlfmt`(16), XML 은 `xmlfmt`. 같은 일을 또 만들면 두 답이 갈린다.
 * 그래서 여기서는 **비어 있던 둘**만 맡는다 — CSS 와 HTML.
 *
 * 자바스크립트는 **일부러 안 한다.** 제대로 하려면 진짜 파서가 필요하고(무게), 어설프게 하면
 * 세미콜론 없는 코드에서 **뜻이 바뀐다**. 「대충 되는 포맷터」는 안 하느니만 못하다 —
 * 화면에서도 그렇게 말한다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'prettyall',
  ops: {
    format: {
      desc: 'Pretty-print CSS or HTML (the kind is detected unless `as` is given: css, html).',
      in: { text: 'string', as: 'string?', indent: 'number?' },
      out: 'string'
    },
    minify: {
      desc: 'Squash CSS or HTML: drop comments and needless whitespace, keeping what the browser needs.',
      in: { text: 'string', as: 'string?' },
      out: 'string'
    }
  }
};

export type Kind = 'css' | 'html' | 'json' | 'sql' | 'xml' | 'unknown';

/** 무엇인지 알아본다. 우리가 안 맡는 것(JSON·SQL·XML)도 **이름을 대 준다** — 화면이 그 도구로 보낸다. */
export function detect(text: string): Kind {
  const body = text.trim();
  if (body === '') return 'unknown';
  if (body.startsWith('{') || body.startsWith('[')) {
    try {
      JSON.parse(body);
      return 'json';
    } catch {
      /* JSON 이 아니면 아래로 */
    }
  }
  if (/^\s*<\?xml|^\s*<[a-z-]+:[a-z-]+/i.test(body)) return 'xml';
  if (/^\s*(<!doctype html|<html|<head|<body|<div|<section|<main|<span|<p[\s>]|<ul|<table)/i.test(body)) return 'html';
  if (/^\s*(select|insert|update|delete|create|alter|drop|with)\b/i.test(body)) return 'sql';
  if (/[{][^{}]*:[^{}]*[;}]/.test(body) || /^\s*[@.#][\w-]/.test(body)) return 'css';
  if (/^\s*</.test(body)) return 'html';
  return 'unknown';
}

/* ── CSS ───────────────────────────────────────────────────────────── */

/** 따옴표·주석 안은 건드리지 않는다 — 안 그러면 `content: "}"` 하나에 파일이 무너진다. */
function cssTokens(css: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '"' || c === "'") {
      let s = c;
      i++;
      while (i < css.length) {
        s += css[i];
        if (css[i] === String.fromCharCode(92)) {
          s += css[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (css[i] === c) {
          i++;
          break;
        }
        i++;
      }
      cur += s;
      continue;
    }
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? css.length : end + 2;
      if (cur.trim() !== '') out.push(cur.trim());
      cur = '';
      out.push(css.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '{' || c === '}' || c === ';') {
      if (cur.trim() !== '') out.push(cur.trim());
      out.push(c);
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

export function formatCss(css: string, indent = 2): string {
  const step = ' '.repeat(indent);
  const rows: string[] = [];
  let depth = 0;
  let pending = '';
  for (const token of cssTokens(css)) {
    if (token === '{') {
      rows.push(step.repeat(depth) + pending.replace(/\s*,\s*/g, ',\n' + step.repeat(depth)) + ' {');
      pending = '';
      depth++;
      continue;
    }
    if (token === '}') {
      depth = Math.max(0, depth - 1);
      if (pending !== '') {
        rows.push(step.repeat(depth + 1) + pending + ';');
        pending = '';
      }
      rows.push(step.repeat(depth) + '}');
      continue;
    }
    if (token === ';') {
      if (pending !== '') rows.push(step.repeat(depth) + pending.replace(/\s*:\s*/, ': ') + ';');
      pending = '';
      continue;
    }
    if (token.startsWith('/*')) {
      rows.push(step.repeat(depth) + token.replace(/\s+/g, ' '));
      continue;
    }
    pending = token.replace(/\s+/g, ' ').trim();
  }
  if (pending !== '') rows.push(pending);
  return rows.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function minifyCss(css: string): string {
  const parts: string[] = [];
  for (const token of cssTokens(css)) {
    if (token.startsWith('/*')) continue;
    if (token === '{' || token === '}' || token === ';') {
      /* 마지막 `;` 는 브라우저가 안 따진다 — 지운다. 다만 `}` 앞에서만. */
      if (token === '}' && parts[parts.length - 1] === ';') parts.pop();
      parts.push(token);
      continue;
    }
    parts.push(token.replace(/\s+/g, ' ').replace(/\s*([:,>+~])\s*/g, '$1').trim());
  }
  return parts.join('').replace(/;}/g, '}');
}

/* ── HTML ──────────────────────────────────────────────────────────── */

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/** 속을 건드리면 안 되는 것들 — 여기 안의 빈칸은 **뜻이 있다**. */
const RAW_TAGS = new Set(['pre', 'textarea', 'script', 'style', 'code']);

interface HtmlToken {
  kind: 'open' | 'close' | 'self' | 'text' | 'comment' | 'doctype';
  text: string;
  name?: string;
}

export function htmlTokens(html: string): HtmlToken[] {
  const out: HtmlToken[] = [];
  let i = 0;
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      const stop = end < 0 ? html.length : end + 3;
      out.push({ kind: 'comment', text: html.slice(i, stop) });
      i = stop;
      continue;
    }
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end < 0) break;
      const raw = html.slice(i, end + 1);
      const name = (/^<\/?\s*([\w-]+)/.exec(raw)?.[1] ?? '').toLowerCase();
      i = end + 1;
      if (/^<!/.test(raw)) {
        out.push({ kind: 'doctype', text: raw });
        continue;
      }
      if (raw.startsWith('</')) {
        out.push({ kind: 'close', text: raw, name });
        continue;
      }
      const self = raw.endsWith('/>') || VOID_TAGS.has(name);
      out.push({ kind: self ? 'self' : 'open', text: raw, name });
      /* 속을 그대로 둬야 하는 것은 통째로 삼킨다 */
      if (!self && RAW_TAGS.has(name)) {
        const closeAt = html.toLowerCase().indexOf('</' + name, i);
        const stop = closeAt < 0 ? html.length : closeAt;
        if (stop > i) out.push({ kind: 'text', text: html.slice(i, stop) });
        i = stop;
      }
      continue;
    }
    const next = html.indexOf('<', i);
    const stop = next < 0 ? html.length : next;
    out.push({ kind: 'text', text: html.slice(i, stop) });
    i = stop;
  }
  return out;
}

export function formatHtml(html: string, indent = 2): string {
  const step = ' '.repeat(indent);
  const rows: string[] = [];
  let depth = 0;
  const stack: string[] = [];
  for (const token of htmlTokens(html)) {
    if (token.kind === 'text') {
      const inRaw = stack.length > 0 && RAW_TAGS.has(stack[stack.length - 1]);
      if (inRaw) {
        rows.push(token.text.replace(/\s+$/, ''));
        continue;
      }
      const text = token.text.replace(/\s+/g, ' ').trim();
      if (text !== '') rows.push(step.repeat(depth) + text);
      continue;
    }
    if (token.kind === 'close') {
      depth = Math.max(0, depth - 1);
      stack.pop();
      rows.push(step.repeat(depth) + token.text);
      continue;
    }
    rows.push(step.repeat(depth) + token.text);
    if (token.kind === 'open') {
      stack.push(token.name ?? '');
      depth++;
    }
  }
  return rows.join('\n').trim();
}

export function minifyHtml(html: string): string {
  const parts: string[] = [];
  const stack: string[] = [];
  for (const token of htmlTokens(html)) {
    if (token.kind === 'comment') continue;
    if (token.kind === 'text') {
      const inRaw = stack.length > 0 && RAW_TAGS.has(stack[stack.length - 1]);
      parts.push(inRaw ? token.text : token.text.replace(/\s+/g, ' '));
      continue;
    }
    if (token.kind === 'close') stack.pop();
    if (token.kind === 'open') stack.push(token.name ?? '');
    parts.push(token.text.replace(/\s+/g, ' ').replace(/\s+>/, '>'));
  }
  return parts.join('').replace(/>\s+</g, '><').trim();
}

/* ── 창구 ──────────────────────────────────────────────────────────── */

export function format(text: string, as?: Kind, indent = 2): string {
  const kind = as ?? detect(text);
  if (kind === 'css') return formatCss(text, indent);
  if (kind === 'html' || kind === 'xml') return formatHtml(text, indent);
  throw new Error('여기서는 CSS·HTML 만 폅니다 (' + kind + ')');
}

export function minify(text: string, as?: Kind): string {
  const kind = as ?? detect(text);
  if (kind === 'css') return minifyCss(text);
  if (kind === 'html' || kind === 'xml') return minifyHtml(text);
  throw new Error('여기서는 CSS·HTML 만 누릅니다 (' + kind + ')');
}

/** 우리가 안 맡는 것은 **어느 도구로 가면 되는지** 알려 준다 (id 만 — 말은 화면이 만든다). */
export function goTo(kind: Kind): string | undefined {
  if (kind === 'json') return 'jsonfmt';
  if (kind === 'sql') return 'sqlfmt';
  if (kind === 'xml') return 'xmlfmt';
  return undefined;
}

export const run: ToolRunner = (op, args) => {
  const as = args.as === undefined ? undefined : (String(args.as) as Kind);
  if (op === 'format') return format(String(args.text ?? ''), as, args.indent === undefined ? undefined : Number(args.indent));
  if (op === 'minify') return minify(String(args.text ?? ''), as);
  throw new Error('prettyall: 모르는 연산 ' + op);
};
