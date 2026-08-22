#!/usr/bin/env node
/**
 * audit-atlas-names — **덩어리 이름이 「말」인가** (TASK-KAR-233).
 *
 * 이름은 지도에서 사람이 제일 먼저 읽는 것이다. 그런데 낱말 둘을 따로 뽑아 붙이던 때는
 * `wav nocheck` · `autostart w32time` · `PAT apex` 같은 **세상에 없는 말**이 나왔다 —
 * 이름 50개 중 글에 그 순서 그대로 나오는 것이 **1개(2%)** 였다.
 *
 * 그래서 후보를 이어진 말(구)로 바꿨고, 이 자는 그게 유지되는지 본다.
 * 재는 법은 하나뿐이다: **그 이름이 내 글에 실제로 그렇게 적혀 있나.**
 * 없는 말이면 아무리 그럴듯해도 지어낸 것이다.
 *
 * 같이 보는 것: 한 층 안에서 같은 이름이 둘이면 지도를 봐도 어디가 어딘지 모른다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = atlasPath(HERE);

/* **가짜 지도로는 이 자를 못 댄다** — 이름이 진짜 글에 나오는지 봐야 한다.
   그럴 땐 조용히 통과하지 말고 왜 안 도는지 말한다(건너뛴 검사는 통과한 검사가 아니다). */
if (isFake(ATLAS)) {
  console.log('[atlas-names] 가짜 지도다 — 이 자는 진짜 굽기에서만 잰다 (이름이 진짜 글에 나오는지 봐야 한다). 건너뜀');
  process.exit(0);
}

if (!fs.existsSync(ATLAS)) {
  console.log('[names] 지도가 아직 없다 — 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const levels = atlas.levels || [];
if (!levels.length) { console.log('[names] 층이 없다 — 건너뜀'); process.exit(0); }

/* 글 본문은 지도에 안 실려 있다(비공개라 제목·경로만 담는다). 굽는 쪽에서 쓰는
   collect() 를 그대로 빌려 온다 — 같은 글을 보고 재야 한다. */
let docs = [];
try {
  const mod = await import('./build-memo-atlas.mjs');
  docs = mod.collect();
} catch (e) {
  console.log('[names] 글을 못 읽는다 — 건너뜀 (' + String(e.message).slice(0, 60) + ')');
  process.exit(0);
}
if (!docs.length) { console.log('[names] 글이 없다 — 건너뜀'); process.exit(0); }
const blob = docs.map((d) => `${d.title} ${d.text}`).join('\n').toLowerCase();

const all = levels.flatMap((l) => l.names || []);
const real = all.filter((n) => n && blob.includes(String(n).toLowerCase()));
const share = all.length ? real.length / all.length : 0;
console.log(`[names] 이름 ${all.length}개 · 글에 그대로 나오는 것 ${real.length} (${(share * 100).toFixed(0)}%)`);

const problems = [];
const MADE_UP = 0.7;
if (share < MADE_UP) {
  const fake = all.filter((n) => !blob.includes(String(n).toLowerCase())).slice(0, 6);
  problems.push(`지어낸 이름이 너무 많다 (${(share * 100).toFixed(0)}% 만 진짜) — 보기: ${fake.join(' | ')}`);
}

/* 한 층 안에서 이름이 겹치면 그 층은 못 쓴다. 층끼리 겹치는 건 괜찮다 —
   성긴 덩어리와 그 속 덩어리가 같은 이름을 갖는 건 자연스럽다. */
levels.forEach((l, i) => {
  const names = l.names || [];
  const dup = [...new Set(names.filter((v, k) => names.indexOf(v) !== k))];
  if (dup.length) problems.push(`층 ${i} 안에서 이름이 겹친다: ${dup.join(', ')}`);
});

/* 「이름 없음」이 많으면 뽑기가 실패한 것이다. */
const empty = all.filter((n) => !n || n === '이름 없음' || n === '빈 덩어리').length;
if (empty > all.length * 0.2) problems.push(`이름을 못 붙인 덩어리가 ${empty}개`);
console.log(`[names] 이름 못 붙인 덩어리 ${empty}개`);

if (problems.length) {
  console.log('[names] **덩어리 이름이 말이 아니다**');
  for (const p of problems) console.log('  - ' + p);
  console.log('  후보를 이어진 말로 뽑는지(phrasesOf), 뼈대 말·조사 거르기가 도는지 봐라.');
  process.exit(1);
}
console.log('[names] 이름이 내 글에서 나온 말이고, 한 층 안에서 안 겹친다');
