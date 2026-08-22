#!/usr/bin/env node
/**
 * audit-atlas-trust — 지도가 「가까이 있으면 정말 가깝다」를 지키는지 본다.
 *
 * 자리 잡는 방식·손잡이를 건드리면 그림은 그럴듯한데 **속으로는 나빠질 수 있다.**
 * 실제로 화면을 채우려고 손잡이를 돌렸을 때, 이 값이 얼마나 깎였는지 우리는 몰랐다.
 * 그때 이 자가 있었어야 했다.
 *
 * 두 가지를 잰다:
 *   믿을 만함 — 지도에서 이웃인 것이 **원래도** 이웃인가 (거짓 이웃을 벌한다)
 *   안 놓침   — 원래 이웃을 지도가 **지키는가** (흩어 버린 것을 벌한다)
 * 1 이 완벽. 기준선 아래로 떨어지면 빨개진다.
 *
 * ⚠ 재는 법 주의: 벡터와 좌표를 **해시로 맞춰야** 한다. 순서로 짝지으면 서로 다른
 * 글을 견주게 되고, 그러면 멀쩡한 지도가 0.59 로 나온다(처음에 그렇게 틀렸다).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, cachePath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', 'data');
const ATLAS = atlasPath(HERE);

/* **가짜 지도로는 이 자를 못 댄다** — 기준선이 진짜 지도로 박혀 있다.
   그럴 땐 조용히 통과하지 말고 왜 안 도는지 말한다(건너뛴 검사는 통과한 검사가 아니다). */
if (isFake(ATLAS)) {
  console.log('[atlas-trust] 가짜 지도다 — 이 자는 진짜 굽기에서만 잰다 (기준선이 진짜 지도로 박혀 있다). 건너뜀');
  process.exit(0);
}
const CACHE = cachePath(HERE);
const BASELINE = path.join(DATA, 'atlas-trust-baseline.json');

const SAMPLE = 400;      // 전수는 글 수의 제곱이라 오래 걸린다
const K = 8;             // 이웃 몇을 볼까
const SLACK = 0.05;      // 기준선보다 이만큼 넘게 나빠지면 빨개진다

if (!fs.existsSync(ATLAS) || !fs.existsSync(CACHE)) {
  console.log('[atlas-trust] 지도나 벡터가 없다 — 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));

/* 어느 층(모델)으로 구운 벡터인지 찾는다. 층이 섞이면 안 된다.
   옛 열쇠(local:해시)와 지금 열쇠(local:모델:해시)가 같이 있으므로, **토막이 셋인
   것**만 본다 — 앞엣것을 그냥 집으면 옛 열쇠를 골라 하나도 안 맞는다(그렇게 틀렸다). */
const tiers = new Map();
for (const k of Object.keys(cache)) {
  const parts = k.split(':');
  if (parts.length !== 3 || parts[0] !== 'local') continue;
  const t = `${parts[0]}:${parts[1]}`;
  tiers.set(t, (tiers.get(t) || 0) + 1);
}
const tier = [...tiers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
if (!tier) { console.log('[atlas-trust] 이 기계에서 잰 벡터가 없다 — 건너뜀'); process.exit(0); }

const docs = atlas.docs.filter((d) => d.xy && d.hash && cache[`${tier}:${d.hash}`]);
if (docs.length < 50) { console.log(`[atlas-trust] 맞춰진 글이 ${docs.length}개뿐 — 건너뜀`); process.exit(0); }

const step = Math.max(1, Math.floor(docs.length / SAMPLE));
const hi = []; const lo = [];
for (let i = 0; i < docs.length; i += step) { hi.push(cache[`${tier}:${docs[i].hash}`]); lo.push(docs[i].xy); }
const n = hi.length;

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

let T = 0; let C = 0;
for (let i = 0; i < n; i += 1) {
  const nearLo = new Set(RL[i].order.slice(0, K));
  const nearHi = new Set(RH[i].order.slice(0, K));
  for (const j of nearLo) if (!nearHi.has(j)) T += RH[i].rank.get(j) - K;
  for (const j of nearHi) if (!nearLo.has(j)) C += RL[i].rank.get(j) - K;
}
const norm = 2 / (n * K * (2 * n - 3 * K - 1));
const trust = 1 - norm * T;
const cont = 1 - norm * C;
console.log(`[atlas-trust] 표본 ${n}개 · 이웃 ${K}`);
console.log(`  믿을 만함 ${trust.toFixed(3)} · 안 놓침 ${cont.toFixed(3)} (1 이 완벽)`);

let base = null;
try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch { /* 없으면 이번이 기준 */ }
if (!base) {
  fs.writeFileSync(BASELINE, JSON.stringify({ trust: Number(trust.toFixed(3)), cont: Number(cont.toFixed(3)) }, null, 1));
  console.log('[atlas-trust] 기준선이 없어 이번 값을 기준으로 박았다');
  process.exit(0);
}

const problems = [];
if (trust < base.trust - SLACK) problems.push(`믿을 만함 ${base.trust} → ${trust.toFixed(3)}`);
if (cont < base.cont - SLACK) problems.push(`안 놓침 ${base.cont} → ${cont.toFixed(3)}`);
if (problems.length) {
  console.log('[atlas-trust] **지도가 전보다 거짓말을 더 한다**');
  for (const p of problems) console.log(`  - ${p}`);
  console.log('  자리 잡는 방식이나 손잡이를 건드렸다면 그 값을 되돌려 봐라.');
  console.log(`  일부러 바꾼 거면 기준선을 다시 박아라: rm ${path.relative(process.cwd(), BASELINE)}`);
  process.exit(1);
}
console.log(`[atlas-trust] 기준선(${base.trust}/${base.cont}) 아래로 안 떨어졌다`);
