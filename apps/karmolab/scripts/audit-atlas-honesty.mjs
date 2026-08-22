#!/usr/bin/env node
/**
 * audit-atlas-honesty — **「이 자리는 못 믿는다」가 정말 못 믿는 자리인가** (TASK-KAR-233).
 *
 * 지도에 붉은 테두리로 「여기선 옆에 있어도 남남이다」를 그린다. 그 표시가 틀리면
 * 없느니만 못하다 — 멀쩡한 자리를 의심하게 만들고, 진짜 거짓말은 그냥 지나간다.
 *
 * 그래서 **다른 잣대로 대 본다.** 화면에 쓰는 점수는 사람이 읽으라고 만든 쉬운 수
 * (「닮은 8개 중 지도에서도 가까운 수」)이고, 여기서 대는 잣대는 정석 수
 * (거짓이웃 벌점 — 지도에서 이웃인데 원래는 몇 번째로 먼 놈이었나)다.
 * 둘은 만드는 법이 다르므로, 같은 자리를 가리키면 그 표시는 믿을 만하다.
 *
 * 잰 값(2026-08-21): 믿음 0~1 → 벌점 980 · 2~5 → 635 · 6~8 → 423 (2.31배).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, cachePath } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', 'data');
const ATLAS = atlasPath(HERE);
const CACHE = cachePath(HERE);

const SAMPLE = 400;
const K = 8;
const TIMES = 1.5;        // 눈짐작용 참고선 (판정은 아래 **섞은 대조군**이 한다)
const SHUFFLES = 200;     // 믿음 점수를 마구 섞어 「우연히 이만큼 갈릴 확률」을 낸다

if (!fs.existsSync(ATLAS) || !fs.existsSync(CACHE)) {
  console.log('[honesty] 지도나 벡터가 없다 — 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const withXY = atlas.docs.filter((d) => d.xy);
const scored = withXY.filter((d) => d.honest != null);
const rate = withXY.length ? scored.length / withXY.length : 0;
console.log(`[honesty] 점수 붙은 글 ${scored.length}/${withXY.length} (${(rate * 100).toFixed(0)}%)`);
if (rate < 0.9) {
  console.log('[honesty] **믿음 점수가 대부분 비어 있다** — 단추를 켜도 아무것도 안 나온다');
  process.exit(1);
}

const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const tiers = new Map();
for (const k of Object.keys(cache)) {
  const parts = k.split(':');
  if (parts.length !== 3 || parts[0] !== 'local') continue;
  const t = `${parts[0]}:${parts[1]}`;
  tiers.set(t, (tiers.get(t) || 0) + 1);
}
const tier = [...tiers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
if (!tier) { console.log('[honesty] 이 기계에서 잰 벡터가 없다 — 건너뜀'); process.exit(0); }

const docs = scored.filter((d) => d.hash && cache[`${tier}:${d.hash}`]);
if (docs.length < 100) { console.log(`[honesty] 맞춰진 글이 ${docs.length}개뿐 — 건너뜀`); process.exit(0); }

const step = Math.max(1, Math.floor(docs.length / SAMPLE));
const S = [];
for (let i = 0; i < docs.length; i += step) S.push(docs[i]);
const hi = S.map((d) => cache[`${tier}:${d.hash}`]);
const lo = S.map((d) => d.xy);
const n = S.length;

const dHi = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 1) { const t = a[i] - b[i]; s += t * t; } return s; };
const dLo = (a, b) => { const x = a[0] - b[0]; const y = a[1] - b[1]; return x * x + y * y; };
function ranks(pts, d) {
  return pts.map((p, i) => {
    const o = pts.map((q, j) => [j, d(p, q)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]);
    const r = new Map();
    o.forEach(([j], k) => r.set(j, k + 1));
    return { order: o.map(([j]) => j), rank: r };
  });
}
const RH = ranks(hi, dHi);
const RL = ranks(lo, dLo);

const rows = [];
for (let i = 0; i < n; i += 1) {
  const nearLo = new Set(RL[i].order.slice(0, K));
  const nearHi = new Set(RH[i].order.slice(0, K));
  let penalty = 0;
  for (const j of nearLo) if (!nearHi.has(j)) penalty += RH[i].rank.get(j) - K;
  rows.push([S[i].honest, penalty]);
}
const mean = (a) => (a.length ? a.reduce((s, r) => s + r[1], 0) / a.length : 0);
const low = rows.filter((r) => r[0] <= 1);
const mid = rows.filter((r) => r[0] > 1 && r[0] < 6);
const high = rows.filter((r) => r[0] >= 6);
console.log(`[honesty] 믿음 0~1: ${low.length}개 · 벌점 ${mean(low).toFixed(0)}`);
console.log(`[honesty] 믿음 2~5: ${mid.length}개 · 벌점 ${mean(mid).toFixed(0)}`);
console.log(`[honesty] 믿음 6~8: ${high.length}개 · 벌점 ${mean(high).toFixed(0)}`);

if (low.length < 5 || high.length < 5) {
  console.log('[honesty] 양쪽 끝이 너무 적어 견줄 수 없다 — 건너뜀');
  process.exit(0);
}
const ratio = mean(low) / Math.max(1, mean(high));
/**
 * ★ **손으로 고른 문턱(1.5배)을 버린다.**
 *
 * 글이 1516편에서 1918편으로 늘자 이 값이 1.49 가 되어 자가 빨개졌다 — 그런데 1.5 는
 * 아무 근거 없이 박아 둔 상수였다. 「1.49 는 안 되고 1.51 은 된다」고 말할 근거가 없다.
 * 그래서 이 프로젝트의 나머지와 같은 규칙으로 바꾼다: **믿음 점수를 마구 섞어** 같은 셈을
 * 하고, 우연히 나오는 비의 95분위를 넘어야 통과다. 자료가 늘어도 자가 같이 움직인다.
 */
let seed = 20260822;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const nulls = [];
for (let b = 0; b < SHUFFLES; b += 1) {
  const tags = rows.map((r) => r[0]);
  for (let i = tags.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [tags[i], tags[j]] = [tags[j], tags[i]];
  }
  const shuffled = rows.map((r, i) => [tags[i], r[1]]);
  const lo2 = shuffled.filter((r) => r[0] <= 1);
  const hi2 = shuffled.filter((r) => r[0] >= 6);
  if (lo2.length < 5 || hi2.length < 5) continue;
  nulls.push(mean(lo2) / Math.max(1, mean(hi2)));
}
nulls.sort((a, b) => a - b);
const cut = nulls.length ? nulls[Math.floor(0.95 * (nulls.length - 1))] : TIMES;
const med = nulls.length ? nulls[Math.floor(0.5 * (nulls.length - 1))] : 1;
console.log(`[honesty] 못 믿는 쪽이 ${ratio.toFixed(2)}배 더 거짓말한다`
  + ` — **믿음 점수를 섞으면 ${med.toFixed(2)}배** (${nulls.length}판 · 95분위 ${cut.toFixed(2)} · 눈짐작 참고선 ${TIMES})`);
if (ratio <= cut) {
  console.log('[honesty] **붉게 칠한 자리가 실제로 더 거짓말하지 않는다**');
  console.log(`  쉬운 점수와 정석 벌점이 따로 논다 (${ratio.toFixed(2)}배 — 섞어도 ${cut.toFixed(2)}배까지 나온다).`);
  console.log('  honestyPerDoc 의 화면 이웃 수(screenK)나 자리 잡는 방식을 건드렸는지 봐라.');
  process.exit(1);
}
console.log('[honesty] 쉬운 점수와 정석 벌점이 같은 자리를 가리킨다');
