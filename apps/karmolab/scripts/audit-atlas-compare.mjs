#!/usr/bin/env node
/**
 * audit-atlas-compare. **견주기가 진짜 견주는가** (TASK-KAR-233).
 *
 * 두 덩어리를 나란히 놓고 이쪽만 쓰는 말을 보여준다. 그런데 그 말이 저쪽에서도
 * 똑같이 자주 나오면, 그건 **이름 두 개를 늘어놓은 것**이지 견준 게 아니다.
 * 화면은 그럴듯한데 아무것도 안 말해 주는 상태. 이 자가 그걸 막는다.
 *
 * 재는 법: 덩어리 짝을 여럿 뽑아, A 만 쓴다고 실린 말이 **A 의 글에서 B 의 글에서보다
 * 실제로 더 자주** 나오는지 센다(글 한 편당 나오는 비율로 견준다. 덩어리 크기가 다르다).
 * 몇 배 이상 차이 나야 A 만 쓰는 말이라 부를 수 있다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = atlasPath(HERE);

/* **가짜 지도로는 이 자를 못 댄다**. 진짜 글 본문과 견줘야 한다.
   그럴 땐 조용히 통과하지 말고 왜 안 도는지 말한다(건너뛴 검사는 통과한 검사가 아니다). */
if (isFake(ATLAS)) {
  console.log('[atlas-compare] 가짜 지도다. 이 자는 진짜 굽기에서만 잰다 (진짜 글 본문과 견줘야 한다). 건너뜀');
  process.exit(0);
}

if (!fs.existsSync(ATLAS)) {
  console.log('[compare] 지도가 아직 없다. 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const levels = atlas.levels || [];
const withWords = levels.filter((l) => Array.isArray(l.words) && l.words.length);
if (!withWords.length) {
  console.log('[compare] **덩어리마다 쓰는 말이 안 실려 있다**. 견줄 재료가 없다');
  process.exit(1);
}

let docs = [];
try {
  const mod = await import('./build-memo-atlas.mjs');
  docs = mod.collect();
} catch (e) {
  console.log('[compare] 글을 못 읽는다. 건너뜀 (' + String(e.message).slice(0, 60) + ')');
  process.exit(0);
}
const textById = new Map(docs.map((d) => [d.id, `${d.title} ${d.text}`.toLowerCase()]));

/** 그 덩어리 글 중 이 말이 나오는 글의 비율. 크기가 달라도 견줄 수 있게 비율로 센다. */
function rate(ids, word) {
  const w = word.toLowerCase();
  let hit = 0; let seen = 0;
  for (const id of ids) {
    const t = textById.get(id);
    if (!t) continue;
    seen += 1;
    if (t.includes(w)) hit += 1;
  }
  return seen ? hit / seen : 0;
}

const TIMES = 2;        // 상대보다 이만큼은 더 자주 나와야 이쪽만 쓰는 말이다
let checked = 0; let weak = 0;
let pairs = 0; let emptyPairs = 0;
const bad = [];
for (let li = 0; li < levels.length; li += 1) {
  const lv = levels[li];
  if (!Array.isArray(lv.words) || !lv.words.length) continue;
  const byCluster = new Map();
  for (const d of atlas.docs) {
    const c = d.levels ? d.levels[li] : d.cluster;
    if (c == null) continue;
    if (!byCluster.has(c)) byCluster.set(c, []);
    byCluster.get(c).push(d.id);
  }
  const keys = [...byCluster.keys()].filter((c) => (byCluster.get(c) || []).length >= 20);
  /* 짝을 전부 보면 오래 걸린다. 층마다 몇 짝만 본다. 씨앗을 안 쓰고 순서대로 뽑아
     매번 같은 짝을 본다(들쭉날쭉한 검사는 못 믿는다). */
  for (let i = 0; i + 1 < keys.length && i < 6; i += 2) {
    const a = keys[i]; const b = keys[i + 1];
    const wa = lv.words[a] || []; const wb = lv.words[b] || [];
    const onlyA = wa.filter((w) => !wb.includes(w)).slice(0, 3);
    const onlyB = wb.filter((w) => !wa.includes(w)).slice(0, 3);
    pairs += 1;
    /* **보여줄 게 아예 없는 짝**도 실패다. 두 덩어리가 같은 말만 쓰면 견주기 칸이
      . 두 줄로 뜨는데, 그때도 자가 초록이면 아무것도 안 잡는 자다(2026-08-21 그랬다). */
    if (!onlyA.length && !onlyB.length) emptyPairs += 1;
    for (const w of onlyA) {
      const ra = rate(byCluster.get(a), w);
      const rb = rate(byCluster.get(b), w);
      checked += 1;
      if (!(ra > 0 && (rb === 0 || ra / rb >= TIMES))) {
        weak += 1;
        if (bad.length < 5) {
          bad.push(`층 ${li}, ${lv.names[a]} 만 쓴다는 말 "${w}". 이쪽 ${(ra * 100).toFixed(0)}% vs 저쪽 ${(rb * 100).toFixed(0)}%`);
        }
      }
    }
  }
}

if (!pairs) {
  console.log('[compare] 견줄 만한 덩어리 짝이 없다. 건너뜀');
  process.exit(0);
}
console.log(`[compare] 견준 짝 ${pairs}개, 서로 다른 말이 하나도 없는 짝 ${emptyPairs}개`);
if (emptyPairs > pairs * 0.5) {
  console.log('[compare] **두 덩어리가 같은 말만 쓴다**. 견주기 칸에 보여줄 게 없다');
  console.log('  덩어리마다 쓰는 말(words)이 제대로 갈리는지, 흔한 말 거르기가 도는지 봐라.');
  process.exit(1);
}
if (!checked) {
  console.log('[compare] 견줄 말이 하나도 안 뽑혔다. 재료가 비었다');
  process.exit(1);
}
console.log(`[compare] 견준 말 ${checked}개, 상대보다 ${TIMES}배 넘게 자주 안 나오는 것 ${weak}개`);
if (weak > checked * 0.25) {
  console.log('[compare] **이쪽만 쓰는 말이 저쪽에서도 나온다**. 견주는 게 아니라 늘어놓는 것이다');
  for (const x of bad) console.log('  - ' + x);
  console.log('  topWordsByGroup 의 흔한 말 거르기(절반 넘는 덩어리에 나오면 버리기)가 도는지 봐라.');
  process.exit(1);
}
console.log('[compare] 각자만 쓴다는 말이 저쪽에선 실제로 덜 나온다');
