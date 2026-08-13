/**
 * **기다림이 진짜 그만큼 기다리는지** (TASK-KL-301)
 *
 * Playwright 의 `waitForFunction(함수, 넘길값, 옵션)` 은 자리가 셋이다. 그런데 넘길 값이 없을 때
 * 사람은 자연스럽게 `waitForFunction(함수, { timeout: 90000 })` 이라고 적는다 — 그러면 그 객체는
 * **옵션이 아니라 함수에 넘길 값**이 되고, 기다림은 조용히 **기본 30초**로 돌아간다.
 *
 * 조용한 게 문제다: 대개는 30초 안에 끝나서 초록이고, 무거운 판에서만 가끔 빨개진다. 판본 대조
 * 검사가 그렇게 「원래 깨져 있는 것」으로 며칠 방치됐다(실측: 12번 중 1번 빨강).
 * 틀린 기다림은 **눈으로는 절대 안 보인다** — 그래서 센다.
 *
 * 사용: node scripts/audit-wait-timeout.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BACKSLASH = String.fromCharCode(92); /* 여기 적는 것 자체가 헷갈리는 글자다 */
const dirs = [path.join(root, 'scripts'), path.join(root, 'scripts/lib')];

/** 괄호 균형을 세어 `waitForFunction(` 부터 짝이 맞는 `)` 까지를 떼어 온다. */
function callAt(src, open) {
  let depth = 0;
  let quote = '';
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === BACKSLASH) i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}

/** 맨 바깥 쉼표로만 자른다 — 함수 안의 쉼표에 속으면 안 된다. */
function topArgs(call) {
  const inner = call.slice(1, -1);
  const out = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      cur += c;
      if (c === BACKSLASH) cur += inner[++i] ?? '';
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** 주석을 같은 길이 공백으로 바꾼다 (줄 번호가 어긋나지 않게 줄바꿈은 남긴다). */
function strip(src) {
  const NL = String.fromCharCode(10);
  const blank = (m) => m.split(NL).map((line) => ' '.repeat(line.length)).join(NL);
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"`])\/\/.*/gm, (m, p) => p + blank(m.slice(p.length)));
}

const bad = [];
let seen = 0;
for (const dir of dirs) {
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.mjs')) continue;
    const file = path.join(dir, name);
    /* 주석 속 글자에 속으면 안 된다 — 이 검사 자신의 머리말에도 `waitForFunction` 이 적혀 있다.
       (첫 판이 저를 잡고 빨개졌다.) 자리는 그대로 두려고 **같은 길이의 공백**으로 지운다. */
    const src = strip(fs.readFileSync(file, 'utf8'));
    let at = 0;
    for (;;) {
      const hit = src.indexOf('waitForFunction', at);
      if (hit < 0) break;
      at = hit + 1;
      const open = src.indexOf('(', hit);
      if (open < 0) continue;
      const call = callAt(src, open);
      if (!call) continue;
      seen++;
      const args = topArgs(call);
      /* 두 번째 자리에 `timeout`/`polling` 이 들어 있는데 세 번째 자리가 없다 = 옵션이 아니라
         **넘길 값**으로 들어간 것. 기다림은 기본 30초로 돌아간다. */
      if (args.length === 2 && /^\{[\s\S]*\b(timeout|polling)\s*:/.test(args[1])) {
        const line = src.slice(0, hit).split('\n').length;
        bad.push(`${path.relative(root, file)}:${line} — 옵션이 두 번째 자리에 있다 (기다림이 기본 30초로 돌아간다)`);
      }
    }
  }
}

if (bad.length) {
  console.log(`[audit-wait-timeout] 기다림 ${seen}곳 중 잘못 준 곳 ${bad.length}곳`);
  for (const b of bad) console.log('  - ' + b);
  console.log('  고치는 법: waitForFunction(함수, undefined, { timeout: … })');
  process.exit(1);
}
console.log(`[audit-wait-timeout] 기다림 ${seen}곳 — 시간 지정이 전부 제자리`);
