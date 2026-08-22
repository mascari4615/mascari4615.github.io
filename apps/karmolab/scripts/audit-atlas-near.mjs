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
const edges = atlas.edges || [];
if (edges.length < 50) {
  console.log('[near] 서로 부르는 짝이 너무 적다 — 견줄 잣대가 없어 건너뜀');
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
