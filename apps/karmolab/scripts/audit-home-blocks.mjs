#!/usr/bin/env node
/**
 * 첫 화면 블록 — **지을 때 이미 감춰야 한다** (2026-08-16)
 *
 * 무엇을 막나: 기본으로 감추는 블록이 **그려졌다가 사라지는 것**.
 * 짓는 쪽(`home-page.ts`)이 감춤 여부를 모르면 세 블록이 먼저 그려지고, 꾸미기 조각이
 * 늦게 와서 접는다. `.landing-page` 는 세로 가운데 정렬이라 아래가 접히면 **위가 움직인다** —
 * 실측(390px, 실사이트): 377px 가 접히며 제목·검색칸이 205px 밀렸고, 그 한 번이
 * 사이트 밀림 0.097 중 0.091 이었다. 고친 뒤 로컬 0.103 → 0.0105.
 *
 * 사람 눈으로는 안 보인다(80ms 다). 그래서 검사로 잡는다.
 *   ① 감출 목록은 한 파일에만 있어야 한다 — 두 벌이면 갈라지고, 갈라지면 이 병이 돌아온다.
 *   ② 옮길 수 있는 블록은 전부 지을 때 감춤 판정을 받아야 한다.
 */
import fs from 'node:fs';

const DATA = 'src/home-prefs-data.ts';
const BUILDER = 'src/home-page.ts';
const fail = [];

if (fs.existsSync(DATA) === false) {
  console.error(`[home-blocks] 못 쟀다 — ${DATA} 가 없다.`);
  process.exit(2);
}

// ① 목록 한 벌
const owners = fs.readdirSync('src', { recursive: true })
  .filter((f) => typeof f === 'string' && f.endsWith('.ts'))
  .filter((f) => fs.readFileSync(`src/${f}`, 'utf8').includes('DEFAULT_HIDDEN = ['));
const owner0 = owners.length === 1 ? `src/${owners[0]}`.split(String.fromCharCode(92)).join('/') : '';
if (owner0 !== DATA) {
  fail.push(`감출 블록 목록(DEFAULT_HIDDEN)이 ${owners.length}곳에 있다: ${owners.join(', ') || '(없음)'} — ${DATA} 한 곳이어야 한다.`);
}

// ② 블록마다 지을 때 판정
const data = fs.readFileSync(DATA, 'utf8');
const builder = fs.readFileSync(BUILDER, 'utf8');
const ids = [...data.matchAll(/\{\s*id:\s*'([a-z-]+)'/g)].map((m) => m[1]);
if (ids.length === 0) fail.push(`${DATA} 에서 블록 이름을 못 읽었다 — BLOCKS 모양이 바뀌었나.`);
for (const id of ids) {
  if (builder.includes(`isHiddenAtBuild('${id}')`) === false) {
    fail.push(`블록 '${id}' 이 지을 때 감춤 판정을 안 받는다 — ${BUILDER} 에 isHiddenAtBuild('${id}') 가 없다.`);
  }
}

if (fail.length > 0) {
  console.error('[home-blocks] 첫 화면이 그렸다 지우게 된다:');
  for (const f of fail) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[home-blocks] 블록 ${ids.length}개 — 전부 지을 때 감춤 판정. 목록도 한 벌.`);
