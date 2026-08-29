#!/usr/bin/env node
/**
 * 가까이 보이면 정말 가까운가 — 스터디 맵 갈래 지도의 정직도.
 *
 * 지도의 값은 「자리가 뜻이다」 하나뿐이다. 그 말이 거짓이면 예쁜 그림일 뿐이라,
 * 굽는 방식을 손댈 때마다 **재고 넘어간다**.
 *
 * 재는 법: 갈래마다 뜻으로 가장 가까운 다섯과, 그림에서 가장 가까운 다섯이 몇 개 겹치나.
 * 아무렇게나 흩으면 5/40 ≈ 12% 다. 지금 방식(주성분 → 거리 맞추기)은 60% 다.
 *
 * 곳간(`tmp/studymap-atlas-cache.json`)이 있어야 돈다 — 굽는 자리에서만 돌릴 수 있다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};
const map = read(path.join(ROOT, 'data/studymap.json'));
const at = read(path.join(ROOT, 'data/studymap-atlas.json'));
const cache = read(path.join(ROOT, 'tmp/studymap-atlas-cache.json'));
if (!map || !at) {
  console.log('[studymap-trust] 못 돌림 — 지도나 구운 표가 없다');
  process.exit(2);
}
if (!cache) {
  console.log('[studymap-trust] 못 돌림 — 곳간이 없다 (`node scripts/build-studymap-atlas.mjs` 를 돌린 기계에서만 잰다)');
  process.exit(2);
}
const tracks = map.tracks || map;
const vec = {};
for (const [id, h] of Object.entries(at.hashes || {})) vec[id] = cache[`${at.tier}:${h}`];
const mid = tracks.map((t) => {
  const rows = t.stages.flatMap((s) => s.nodes.map((n) => vec[n.id])).filter(Boolean);
  if (!rows.length) return null;
  const d = rows[0].length;
  const a = new Float64Array(d);
  for (const v of rows) for (let i = 0; i < d; i += 1) a[i] += v[i];
  return Array.from(a, (x) => x / rows.length);
});
if (mid.some((v) => !v)) {
  console.log('[studymap-trust] 못 돌림 — 곳간이 지금 강의와 다른 판이다 (다시 구워라)');
  process.exit(2);
}
const cos = (a, b) => {
  let s = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    s += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return s / (Math.sqrt(na * nb) || 1);
};
const K = 5;
const ids = tracks.map((t) => t.id);
let hit = 0;
const worst = [];
ids.forEach((id, i) => {
  const byMeaning = new Set(
    ids.map((_, j) => j).filter((j) => j !== i).sort((a, b) => cos(mid[i], mid[b]) - cos(mid[i], mid[a])).slice(0, K),
  );
  const p = at.tracks[id];
  const byPicture = ids
    .map((_, j) => j)
    .filter((j) => j !== i)
    .sort((a, b) => {
      const da = (at.tracks[ids[a]][0] - p[0]) ** 2 + (at.tracks[ids[a]][1] - p[1]) ** 2;
      const db = (at.tracks[ids[b]][0] - p[0]) ** 2 + (at.tracks[ids[b]][1] - p[1]) ** 2;
      return da - db;
    })
    .slice(0, K);
  const h = byPicture.filter((j) => byMeaning.has(j)).length;
  hit += h;
  worst.push([tracks[i].title, h]);
});
const pct = (hit / (ids.length * K)) * 100;
/* 아무렇게나 흩은 지도는 K/(n-1) 이다. 그보다 두 배는 나아야 「자리가 뜻이다」라고 말할 수 있다. */
const chance = (K / (ids.length - 1)) * 100;
const floor = Math.max(35, chance * 2);
worst.sort((a, b) => a[1] - b[1]);
console.log(
  `[studymap-trust] 그림의 이웃 다섯 중 진짜 이웃 ${pct.toFixed(0)}% (아무렇게나 = ${chance.toFixed(0)}% · 바닥선 ${floor.toFixed(0)}%)`,
);
console.log(`  제일 안 맞는 갈래: ${worst.slice(0, 3).map(([t, h]) => `${t} ${h}/${K}`).join(' · ')}`);
if (pct < floor) {
  console.log('[studymap-trust] 빨강 — 자리가 뜻을 안 말한다. 굽는 방식을 되돌려라.');
  process.exit(1);
}
