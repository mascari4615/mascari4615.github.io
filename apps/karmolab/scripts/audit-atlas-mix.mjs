#!/usr/bin/env node
/**
 * audit-atlas-mix — **갈래가 만나는 자리가 정말 있나** (TASK-KAR-233).
 *
 * 이 지도를 만든 이유가 「따로 자란 것들이 뜻으로는 맞닿는 자리」를 보는 것이다.
 * 그게 사라지면 지도는 예쁜 그림만 남는다 — 갈래마다 자기 섬에 앉아 있으면
 * 겹칠 일이 없고, 겹칠 일이 없으면 이 도구는 할 일이 없다.
 *
 * 재는 법 = **iLISI**(Local Inverse Simpson's Index · Harmony/scib):
 * 이웃 안 라벨의 **유효 개수** = 1 / Σ(비율²). 한 갈래뿐이면 1, 반반이면 2, 넷이 고르면 4.
 * 덩어리를 안 나눠도 점마다 재지므로 **경계에서 안 튄다** — 덩어리 순도는 한 번 뒤집혔다.
 *
 * 위쪽 한계는 **라벨을 마구 섞어** 구한다. 갈래를 무작위로 뿌리면 이웃은 전체 갈래 분포를
 * 그대로 닮으므로, 그 값이 「이 자료에서 나올 수 있는 최대 섞임」이다. 실제 값이 그 한계의
 * 몇 할인지를 본다 — 절대값만 보면 갈래 수가 바뀔 때마다 기준이 흔들린다.
 *
 * 잰 값(2026-08-21): 실제 1.95 · 마구 섞으면 3.29 → 0.59.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = atlasPath(HERE);

if (!fs.existsSync(ATLAS)) {
  console.log('[mix] 지도가 아직 없다 — 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const docs = atlas.docs || [];
const lanes = new Set(docs.map((d) => d.lane));
if (lanes.size < 2) {
  console.log('[mix] 갈래가 하나뿐 — 따질 것이 없다');
  process.exit(0);
}

const scored = docs.filter((d) => d.mix != null);
const withNear = docs.filter((d) => d.near && d.near.length);
const rate = withNear.length ? scored.length / withNear.length : 0;
console.log(`[mix] 점수 붙은 글 ${scored.length}/${withNear.length} (${(rate * 100).toFixed(0)}%)`);
if (rate < 0.9) {
  console.log('[mix] **만나는 자리 점수가 대부분 비어 있다** — 단추를 켜도 아무것도 안 나온다');
  process.exit(1);
}

function ilisi(labels) {
  const c = new Map();
  for (const l of labels) c.set(l, (c.get(l) || 0) + 1);
  let s = 0;
  for (const v of c.values()) s += (v / labels.length) ** 2;
  return 1 / s;
}

/** 실린 값이 맞나 — 다시 재서 견준다. 안 맞으면 화면이 거짓말을 하고 있다. */
let real = 0; let n = 0; let off = 0;
for (const d of docs) {
  if (!d.near || !d.near.length || d.mix == null) continue;
  const labels = d.near.map((j) => docs[j] && docs[j].lane).filter(Boolean);
  if (!labels.length) continue;
  const v = ilisi(labels);
  real += v; n += 1;
  if (Math.abs(v - d.mix) > 0.05) off += 1;
}
if (!n) { console.log('[mix] 잴 것이 없다 — 건너뜀'); process.exit(0); }
const mean = real / n;
if (off / n > 0.02) {
  console.log('[mix] **실린 점수가 다시 재면 안 맞는다**');
  console.log(`  ${off}/${n} 개가 어긋난다. 굽는 쪽과 이 자가 다른 이웃을 보고 있는지 봐라.`);
  process.exit(1);
}

/* 위쪽 한계 — 갈래를 마구 섞었을 때. 씨앗을 박아 매번 같게. */
let seed = 5;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const shuffled = docs.map((d) => d.lane);
for (let i = shuffled.length - 1; i > 0; i -= 1) {
  const j = Math.floor(rnd() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
let cap = 0; let cn = 0;
for (const d of docs) {
  if (!d.near || !d.near.length) continue;
  const labels = d.near.map((j) => shuffled[j]).filter(Boolean);
  if (!labels.length) continue;
  cap += ilisi(labels); cn += 1;
}
const ceiling = cap / cn;
const share = mean / ceiling;
const meet = docs.filter((d) => (d.mix ?? 1) >= 1.5).length;
console.log(`[mix] 이웃 갈래 평균 ${mean.toFixed(2)}종 · 마구 섞으면 ${ceiling.toFixed(2)}종 → ${(share * 100).toFixed(0)}%`);
console.log(`[mix] 만나는 자리(1.5종 이상) ${meet}개 · 한 갈래뿐인 자리 ${docs.filter((d) => (d.mix ?? 1) < 1.01).length}개`);

const FLOOR = 0.45;
if (share < FLOOR) {
  console.log('[mix] **갈래가 저마다 섬에 앉아 있다**');
  console.log(`  나올 수 있는 섞임의 ${(share * 100).toFixed(0)}% 밖에 안 된다 (${FLOOR * 100}% 는 넘어야 한다).`);
  console.log('  임베딩이 뜻이 아니라 글의 틀(제목 규칙·길이)을 잡고 있는지 봐라 — 갈래마다 틀이 다르다.');
  process.exit(1);
}
console.log('[mix] 갈래끼리 맞닿는 자리가 살아 있다');
