#!/usr/bin/env node
/**
 * audit-atlas-near — **「닮은 글」이 정말 닮았나** (TASK-KAR-233).
 *
 * 닮은 글은 코사인으로 뽑는다. 그래서 「닮은 8개가 무작위 8개보다 코사인이 크냐」를
 * 묻는 건 자기가 자기를 채점하는 것이다 — 언제나 참이라 아무것도 안 잡는다.
 *
 * 그래서 **다른 잣대**로 잰다: 서로 링크로 부르는 짝(edges)이 「닮은 8개」 안에
 * 얼마나 드는가. 링크는 사람이 손으로 걸어 둔 것이라 벡터와 아무 상관이 없다.
 * 뜻을 제대로 재고 있다면 그 짝이 우연보다 훨씬 자주 이웃이어야 한다.
 *
 * 잰 값(2026-08-21): 서로 부르는 짝 18.1% vs 무작위 짝 1.2% = 15배.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = atlasPath(HERE);

if (!fs.existsSync(ATLAS)) {
  console.log('[near] 지도가 아직 없다 — 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const docs = atlas.docs || [];
const withNear = docs.filter((d) => d.near && d.near.length);
const rate = docs.length ? withNear.length / docs.length : 0;
console.log(`[near] 닮은 글이 붙은 글 ${withNear.length}/${docs.length} (${(rate * 100).toFixed(0)}%)`);

const COVER = 0.9;
if (rate < COVER) {
  console.log('[near] **닮은 글이 대부분 비어 있다** — 점을 눌러도 갈 데가 없다');
  console.log('  굽는 자리에서 nearestByMeaning 이 도는지, 벡터가 붙었는지 봐라.');
  process.exit(1);
}

const near = docs.map((d) => new Set(d.near || []));

/**
 * ★ **링크가 없어도 잴 수 있는 것 — 맞이웃(mutual) 비율.**
 *
 * 뜻으로 뽑은 이웃은 서로를 부르는 일이 많다(A 의 이웃에 B 가 있으면 B 의 이웃에도 A 가 자주 있다).
 * 아무거나 채운 목록은 그 성질이 없다 — 우연 수준은 k/n 이다(여기선 8/756 ≒ 1%).
 *
 * 왜 넣었나: 사람이 쓴 링크가 52개로 줄자 아래 검사가 통째로 **건너뛰어졌고**, 그 상태에서
 * 이웃 목록을 난수로 갈아 끼워도 자가 초록이었다(2026-08-23 물기 시험에서 잡혔다).
 * 건너뛴 검사는 통과한 검사가 아니다 — 링크가 없으면 이 잣대로 대신 문다.
 */
const k = Math.max(1, Math.round(withNear.reduce((s, d) => s + d.near.length, 0) / withNear.length));
let mutual = 0; let pairs = 0;
docs.forEach((d, i) => {
  for (const j of d.near || []) {
    if (j == null || j < 0 || j >= docs.length || j === i) continue;
    pairs += 1;
    if (near[j]?.has(i)) mutual += 1;
  }
});
const mutualRate = pairs ? mutual / pairs : 0;
const mutualChance = docs.length > 1 ? k / (docs.length - 1) : 0;
console.log(`[near] 맞이웃 ${(mutualRate * 100).toFixed(1)}% (아무거나 채우면 ${(mutualChance * 100).toFixed(2)}%)`);
const MUTUAL_TIMES = 5;
if (!(mutualRate > mutualChance * MUTUAL_TIMES)) {
  console.log('[near] **이웃 목록이 아무거나에 가깝다** — 서로를 부르는 일이 우연 수준이다');
  console.log(`  맞이웃 ${(mutualRate * 100).toFixed(1)}% vs 우연 ${(mutualChance * 100).toFixed(2)}% (${MUTUAL_TIMES}배는 넘어야 한다)`);
  process.exit(1);
}

const edges = atlas.edges || [];
if (edges.length < 50) {
  /* 링크 잣대는 못 돌리지만 **맞이웃은 실제로 쟀다** — 그래서 CANNOT-RUN 이 아니라 통과다.
     대신 못 돈 칸을 소리 내어 적는다(조용히 넘어가면 「다 쟀다」로 읽힌다). */
  console.log(`[near] 서로 부르는 짝이 ${edges.length}개뿐 — **링크 잣대는 이 판에서 못 돌렸다**`);
  console.log('  (맞이웃으로는 쟀다. 글끼리 링크가 50개를 넘으면 링크 잣대도 다시 돈다)');
  process.exit(0);
}

let hit = 0;
for (const [a, b] of edges) if (near[a]?.has(b) || near[b]?.has(a)) hit += 1;

/* 우연이면 얼마나 맞나 — 같은 수만큼 아무 짝이나 뽑아 본다. 씨앗을 박아 매번 같게. */
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const n = docs.length;
let chance = 0;
for (let t = 0; t < edges.length; t += 1) {
  const i = Math.floor(rnd() * n);
  const j = Math.floor(rnd() * n);
  if (i !== j && (near[i]?.has(j) || near[j]?.has(i))) chance += 1;
}

const p = hit / edges.length;
const q = Math.max(chance, 1) / edges.length;      // 0 이면 나누기가 무한대가 된다
console.log(`[near] 서로 부르는 짝 ${edges.length}개 중 이웃인 것 ${hit} (${(p * 100).toFixed(1)}%)`);
console.log(`[near] 무작위 짝 같은 수 중 ${chance} (${(q * 100).toFixed(2)}%) · ${(p / q).toFixed(1)}배`);

const TIMES = 5;
if (p / q < TIMES) {
  console.log('[near] **닮은 글이 뜻을 못 잡고 있다**');
  console.log(`  사람이 손으로 엮어 둔 짝이 우연보다 ${(p / q).toFixed(1)}배밖에 안 자주 이웃이다 (${TIMES}배는 넘어야 한다).`);
  console.log('  임베딩 모델이나 쏠림 빼기(--no-center)를 건드렸다면 그걸 먼저 봐라.');
  process.exit(1);
}
console.log('[near] 손으로 엮어 둔 짝이 우연보다 훨씬 자주 이웃이다 — 뜻을 잡고 있다');
