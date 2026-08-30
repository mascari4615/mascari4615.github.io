#!/usr/bin/env node
/**
 * KarmoMeaning 대조 시험. **뽑아 나오면서 셈이 바뀌지 않았나.**
 *
 * 옮긴 코드는 같아 보이니 같겠지가 가장 위험하다. 그래서 빠른 셈(`nearest`)을
 * **느리고 뻔한 셈**과 맞대 본다. 뻔한 쪽은 여기서 새로 짠다. 옮긴 코드를 옮긴 코드로
 * 검사하면 아무것도 안 재는 것이다.
 *
 * 재는 것 셋:
 *  ① 이웃. 빠른 셈 vs 전부 정렬(뻔한 셈): 자리, 순서가 **완전히 같아야** 한다
 *  ② 쏠림 빼기. 빼고 나면 평균 벡터 길이가 0 에 붙어야 하고, 한 번 더 빼도 그대로여야 한다
 *  ③ 심는 대조군. 일부러 어긋낸 답을 넣으면 ①이 **빨개져야** 한다 (안 빨개지면 이 시험이 헛돈다)
 *
 * 자료: 진짜 벡터가 있으면 그걸 쓰고(곳간), 없으면 씨앗 고정 난수로 짓는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nearest, removeSharedBias } from '../src/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.resolve(HERE, '../../../apps/karmolab/data/.memo-atlas-cache.json');
const K = 8;
const bad = [];

/** 씨앗 고정 난수 (splitmix32). 판마다 같은 자료여야 견줄 수 있다. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

function madeUp(n, dim, seed = 4615) {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const v = Array.from({ length: dim }, () => r() * 2 - 1);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => Number((x / norm).toFixed(6)));
  });
}

function realOnes(limit = 300) {
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    const vs = Object.values(cache).filter((v) => Array.isArray(v) && v.length > 8).slice(0, limit);
    return vs.length >= 50 ? vs : null;
  } catch { return null; }
}

/** 뻔한 셈. 전부 재고 전부 정렬한다. 느리지만 틀릴 데가 없다. */
function plainNearest(vectors, k) {
  const unit = vectors.map((v) => {
    const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / n);
  });
  return unit.map((a, i) => {
    const row = [];
    for (let j = 0; j < unit.length; j += 1) {
      if (j === i) continue;
      let dot = 0;
      for (let t = 0; t < a.length; t += 1) dot += a[t] * unit[j][t];
      row.push([j, dot]);
    }
    row.sort((x, y) => y[1] - x[1] || x[0] - y[0]);
    return row.slice(0, k).map((q) => q[0]);
  });
}

const real = realOnes();
const vectors = real || madeUp(300, 64);
console.log(`[meaning] 자료 ${vectors.length}개, ${vectors[0].length}차원 (${real ? '진짜 벡터' : '지어낸 벡터'})`);

// ── ① 이웃 ────────────────────────────────────────────────────────────
const mine = nearest(vectors, K).idx;
const plain = plainNearest(vectors, K);
let same = 0; let diff = 0;
for (let i = 0; i < vectors.length; i += 1) {
  if (JSON.stringify(mine[i]) === JSON.stringify(plain[i])) same += 1; else diff += 1;
}
console.log(`  ① 이웃 ${K}개. 뻔한 셈과 같은 글 ${same}/${vectors.length}, 다른 글 ${diff}`);
if (diff) bad.push(`빠른 셈과 뻔한 셈의 이웃이 ${diff}개 글에서 다르다`);

// ── ② 쏠림 빼기 ───────────────────────────────────────────────────────
const meanLen = (vs) => {
  const dim = vs[0].length;
  const m = new Float64Array(dim);
  for (const v of vs) for (let i = 0; i < dim; i += 1) m[i] += v[i] / vs.length;
  return Math.sqrt(m.reduce((s, x) => s + x * x, 0));
};
const one = removeSharedBias(vectors);
const two = removeSharedBias(one.vectors);
console.log(`  ② 쏠림. 빼기 전 ${one.before.toFixed(4)}, 뺀 뒤 ${meanLen(one.vectors).toFixed(4)}`
  + `, 한 번 더 빼면 ${meanLen(two.vectors).toFixed(4)}`);
/* ★ **한 번 빼도 0 이 안 된다**. 빼고 나서 길이를 다시 1 로 맞추기 때문에 거기서 새 평균이
   생긴다. 실측 0.7181 → 0.0708 → 0.0086. 그러니 0 이어야 한다로 재면 안 되고,
   ① 첫 판에서 크게 줄고 ② 더 빼도 **되돌아 오르지는 않는다**로 잰다. 지도는 한 번만 뺀다. */
if (!(meanLen(one.vectors) < one.before * 0.2)) {
  bad.push(`쏠림을 뺐는데 평균 벡터 길이가 ${meanLen(one.vectors).toFixed(4)} 다 (뺴기 전의 20% 밑이어야 한다)`);
}
if (meanLen(two.vectors) > meanLen(one.vectors) + 1e-6) {
  bad.push('한 번 더 빼니 쏠림이 오히려 커졌다. 셈이 뒤집혔다');
}
/* 표본이 적으면 평균이 곧 그 표본이라 손대지 않는 것이 맞다. */
const few = removeSharedBias(vectors.slice(0, 5));
if (few.applied) bad.push('표본 5개인데도 쏠림을 뺐다. 적을 땐 그대로 둬야 한다');

// ── ③ 심는 대조군. 이 시험이 진짜 무는지 ─────────────────────────────
const sabotaged = mine.map((row, i) => (i === 0 ? [...row].reverse() : row));
const caught = sabotaged.some((row, i) => JSON.stringify(row) !== JSON.stringify(plain[i]));
console.log(`  ③ 일부러 뒤집은 답. ${caught ? '잡았다' : '**못 잡았다**'}`);
if (!caught) bad.push('일부러 어긋낸 답을 못 잡는다. 이 시험은 아무것도 안 재고 있다');

if (bad.length) {
  console.log('[meaning] **셈이 옮기면서 달라졌다**');
  for (const b of bad) console.log('  - ' + b);
  process.exit(1);
}
console.log('[meaning] 뽑아 나온 셈이 뻔한 셈과 같다 (이웃, 쏠림, 대조군)');
