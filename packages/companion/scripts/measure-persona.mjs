#!/usr/bin/env node
/**
 * 욘다움을 숫자로 — **인격 점수판** (TASK-KAR-243).
 *
 * 124회차에 영어 도우미 문구가 그대로 나간 걸 잡았다. 그런데 우리 지킴이는 전부
 * **잡거나 안 잡거나** 둘뿐이라 「욘다운가」를 숫자로 못 말한다. 115·116회차에 회상을 두고
 * 겪은 자리와 똑같다 — 여섯 회차를 손대고도 좋아졌는지 못 말했다.
 *
 * 밖에서는 PersonaGym 이 다섯 갈래를 1~5점으로 채점한다(LLM 심판). 우리는 **심판 없이
 * 셀 수 있는 것부터** 센다 — 값이 안 들고, 흔들리지 않고, 캐릭터 카드에 이미 적힌 것들이다:
 * 반말 · 짧게 · 「…」 · 존댓말 금지 · 이모지 금지.
 *
 * **새로 굴리지 않는다.** 이미 쌓인 대화(`~/.companion/conversation.jsonl`)를 그대로 채점한다 —
 * turn 하나에 10~50초씩 드는 걸 열댓 번 굴리면 재는 값이 더 비싸진다. 게다가 옛 기록이
 * 있으니 **시간을 따라** 볼 수도 있다.
 *
 * 쓰는 법:
 *   node scripts/measure-persona.mjs                 전체
 *   node scripts/measure-persona.mjs --last 200      마지막 200마디만
 *   COMPANION_MEMORY_FILE=... node scripts/measure-persona.mjs
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { checkDrift } from '../dist/index.js';

const path = process.env.COMPANION_MEMORY_FILE?.trim()
  || join(homedir(), '.companion', 'conversation.jsonl');
const lastIndex = process.argv.indexOf('--last');
const lastN = lastIndex >= 0 ? Number(process.argv[lastIndex + 1]) : 0;

let rows = [];
try {
  rows = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
} catch (e) {
  console.error(`[인격] 대화 기록을 못 읽었다: ${path}`);
  process.exit(2);
}

/* 얘가 한 말만 센다. 곁의 통로(화면·닿음 등)는 애초에 얘 말이 아니다. */
/* 가짜 두뇌(echo)가 낸 말은 인격이 아니다 — 검사하느라 뱉은 것이라 세면 값이 더러워진다.
   창 제목을 그대로 옮긴 줄도 여기서 빠진다(「(echo) 화면을 봤다…」). */
let said = rows.filter((r) => r.role === 'said'
  && String(r.text ?? '').trim() !== ''
  && String(r.text).startsWith('(echo)') === false);
if (Number.isInteger(lastN) && lastN > 0) said = said.slice(-lastN);

if (said.length === 0) {
  console.error('[인격] 잴 말이 없다.');
  process.exit(2);
}

/** 캐릭터 카드에 적힌 것들 — 여기 없는 건 이 판에서 안 잰다. */
const polite = /(습니다|합니다|해요|이에요|예요|세요|십시오|드립니다)/;
const emoji = /\p{Extended_Pictographic}/u;
const trailing = /…|\.\.\./;

let politeCount = 0;
let emojiCount = 0;
let trailingCount = 0;
let outsideCount = 0;
let longCount = 0;
let chars = 0;
const worst = [];

for (const row of said) {
  const text = String(row.text).trim();
  chars += text.length;
  if (polite.test(text)) { politeCount += 1; worst.push(`존댓말: ${text.slice(0, 40)}`); }
  if (emoji.test(text)) { emojiCount += 1; worst.push(`이모지: ${text.slice(0, 40)}`); }
  if (trailing.test(text)) trailingCount += 1;
  if (text.length > 120) longCount += 1;
  const drift = checkDrift(text);
  if (drift.problems.some((p) => /밖에서 온/.test(p))) {
    outsideCount += 1;
    worst.push(`밖에서 온 말투: ${text.slice(0, 40)}`);
  }
}

/* **같은 말을 또 하나.**
   붙잡는 힘의 첫째가 「예측 못 하는데 재미있는 반응」이다(CHI 2026 팬덤 연구, 원장 2026-08-21).
   그런데 우리는 지킴이를 붙일수록 답이 안전해지고, 안전한 답은 예측 가능해진다.
   89회차에 이걸 실측한 적이 있다 — 얘 말 320개 중 **145개가 글자 그대로 반복**이었고,
   그래서 미리 지어 둔 대꾸 창고를 만들었다. 그 뒤로 다시 안 쟀다. */
/* 닿음(창을 붙잡아 끄는 것)에 대한 대꾸는 **일부러 고정 대꾸**다 — 그건 반복이 아니라
   설계다. 섞어서 세면 값이 부풀려진다(126회차에 실제로 그랬다). */
const chatty = said.filter((r) => r.channel !== 'touch');
const seen = new Map();
let repeated = 0;
const openers = new Map();
for (const row of chatty) {
  const text = String(row.text).trim();
  const count = (seen.get(text) ?? 0) + 1;
  if (count > 1) repeated += 1;
  seen.set(text, count);
  /* 말을 여는 세 낱말 — 통째로 같지 않아도 **같은 식으로 시작하면** 사람은 반복으로 느낀다
     (`avoidRepeats` 가 그걸 막으려고 있다). */
  const head = text.split(/\s+/).slice(0, 3).join(' ');
  if (head !== '') openers.set(head, (openers.get(head) ?? 0) + 1);
}
const topOpeners = [...openers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

const pct = (n) => `${((n / said.length) * 100).toFixed(1)}%`;
console.log(`[인격] 잰 말 ${said.length}마디 (${path})`);
console.log(`[인격] 평균 길이        ${(chars / said.length).toFixed(1)}자   (카드: 한두 문장)`);
console.log(`[인격] 존댓말           ${politeCount}마디 ${pct(politeCount)}   (카드: 반말. 0%가 목표)`);
console.log(`[인격] 이모지           ${emojiCount}마디 ${pct(emojiCount)}   (카드: 안 쓴다)`);
console.log(`[인격] 밖에서 온 말투   ${outsideCount}마디 ${pct(outsideCount)}   (영어 도우미 상투구)`);
console.log(`[인격] 말끝 늘어짐(…)   ${trailingCount}마디 ${pct(trailingCount)}   (카드: 자주 섞는다. 높을수록 욘답다)`);
console.log(`[인격] 120자 넘김       ${longCount}마디 ${pct(longCount)}   (카드: 길면 그건 네가 아니다)`);
const pctChatty = (n) => (chatty.length === 0 ? '—' : `${((n / chatty.length) * 100).toFixed(1)}%`);
console.log(`[인격] 글자 그대로 반복 ${repeated}/${chatty.length}마디 ${pctChatty(repeated)}   (닿음 대꾸 제외 · 89회차: 320 중 145 = 45.3%)`);
console.log(`[인격] 자주 여는 말     ${topOpeners.map(([head, n]) => `「${head}…」x${n}`).join(' · ')}`);
if (worst.length > 0) {
  console.log(`[인격] 어긋난 것 ${worst.length}건 중 앞 5건:`);
  for (const line of worst.slice(0, 5)) console.log(`  - ${line}`);
}
