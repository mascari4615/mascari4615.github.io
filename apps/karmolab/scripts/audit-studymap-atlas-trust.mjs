#!/usr/bin/env node
/**
 * 가까이 보이면 정말 가까운가. 스터디 맵 갈래 지도의 정직도.
 *
 * 지도의 값은 자리가 뜻이다 하나뿐이다. 그 말이 거짓이면 예쁜 그림일 뿐이라,
 * 굽는 방식을 손댈 때마다 **재고 넘어간다**.
 *
 * 재는 법: 갈래마다 뜻으로 가장 가까운 다섯과, 그림에서 가장 가까운 다섯이 몇 개 겹치나.
 * 아무렇게나 흩으면 5/40 ≈ 12% 다. 지금 방식(주성분 → 거리 맞추기)은 60% 다.
 *
 * 곳간(`tmp/studymap-atlas-cache.json`)이 있어야 돈다. 굽는 자리에서만 돌릴 수 있다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackMeaning } from './lib/studymap-meaning.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};
const map = read(path.join(ROOT, 'data/studymap.json'));
const at = read(process.env.STUDYMAP_ATLAS_FILE || path.join(ROOT, 'data/studymap-atlas.json'));
const cache = read(process.env.STUDYMAP_CACHE_FILE || path.join(ROOT, 'tmp/studymap-atlas-cache.json'));
const proof = read(path.join(ROOT, 'data/studymap-atlas-meaning.json'));
if (!map || !at) {
  console.log('[studymap-trust] 못 돌림. 지도나 구운 표가 없다');
  process.exit(2);
}
if (!cache && !proof) {
  console.log('[studymap-trust] 못 돌림. 의미 벡터 자료 없음 (build-studymap-atlas.mjs --meaning-only)');
  process.exit(2);
}
const tracks = map.tracks || map;
let means;
if (cache) {
  const vec = Object.fromEntries(Object.entries(at.hashes || {}).map(([id, h]) => [id, cache[`${at.tier}:${h}`]]));
  means = trackMeaning(tracks, vec);
} else {
  if (proof.tier !== at.tier || JSON.stringify(Object.entries(proof.hashes).sort()) !== JSON.stringify(Object.entries(at.hashes).sort())) {
    throw new Error('의미 벡터 자료와 지도 강의 판 불일치');
  }
  means = proof.tracks;
  console.log('[studymap-trust] 공개 강의 평균 벡터 사용. 좌표와 독립적인 실제 의미 자료');
}
const mid = tracks.map((track) => means[track.id]);
if (!mid[0]?.length || mid.some((row) => row?.length !== mid[0].length || row.some((v) => !Number.isFinite(v)))) throw new Error('갈래 의미 벡터 누락 또는 손상');
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
/* 아무렇게나 흩은 지도는 K/(n-1) 이다. 그보다 두 배는 나아야 자리가 뜻이다라고 말할 수 있다. */
const chance = (K / (ids.length - 1)) * 100;
const floor = Math.max(35, chance * 2);
worst.sort((a, b) => a[1] - b[1]);
console.log(
  `[studymap-trust] 그림의 이웃 다섯 중 진짜 이웃 ${pct.toFixed(0)}% (아무렇게나 = ${chance.toFixed(0)}%, 바닥선 ${floor.toFixed(0)}%)`,
);
console.log(`  제일 안 맞는 갈래: ${worst.slice(0, 3).map(([t, h]) => `${t} ${h}/${K}`).join(', ')}`);
if (pct < floor) {
  console.log('[studymap-trust] 빨강. 자리가 뜻을 안 말한다. 굽는 방식을 되돌려라.');
  process.exit(1);
}
