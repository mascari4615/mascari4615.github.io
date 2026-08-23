#!/usr/bin/env node
/**
 * test-related — **「비슷한 글」이 정말 비슷한가** (change.motion-3d-cores 5단계).
 *
 * 눈으로 보면 다 그럴듯하다. 그래서 **바깥 라벨**로 잰다: 사람이 글에 손으로 붙인 분류
 * (`categories`)가 이웃과 얼마나 겹치나. 우리 자 대부분은 자기 자신에게 묻는데, 이건
 * 지도 밖에서 온 답이다.
 *
 * 재는 것 넷:
 *  ① 이웃이 **같은 분류**인 비율 vs **우연**(아무 글이나 뽑았을 때) — 뚜렷이 높아야 한다
 *  ② **심는 대조군**: 이웃을 마구 섞으면 그 비율이 우연으로 **내려가야** 한다
 *     (안 내려가면 이 시험이 분류가 아니라 딴 것을 재고 있다)
 *  ③ 바닥이 **재서 고른 값**인가 — 남긴 이웃이 전부 그 위인가
 *  ④ 「이웃 없음」을 **적어 두는가** — 빈 줄이 없으면 늘 k 개를 채웠다는 뜻이다
 *
 * 못 잴 때(색인·산출물 없음)는 CANNOT-RUN(2). 통과가 아니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const OUT = path.join(KARMOLAB, 'data', 'related-posts.json');
const INDEX = path.join(KARMOLAB, 'data', 'posts-index.json');

if (!fs.existsSync(OUT) || !fs.existsSync(INDEX)) {
  console.log('[related] CANNOT-RUN — 아직 안 구웠다 (npm run gen:post-pages && npm run gen:related)');
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const rawIdx = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const posts = Array.isArray(rawIdx) ? rawIdx : (rawIdx.posts || []);
const catOf = new Map(posts.map((p) => [p.slug, (p.categories || [])[0] || null]));
const bad = [];
const related = data.related || {};
const slugs = Object.keys(related);

if (slugs.length !== posts.length) {
  bad.push(`글 ${posts.length}편인데 표에는 ${slugs.length}편이다 — 굽기가 낡았다`);
}

/** 이웃이 같은 분류인 비율. */
function sameCatRate(pick) {
  let hit = 0; let all = 0;
  for (const s of slugs) {
    const mine = catOf.get(s);
    if (!mine) continue;
    for (const n of pick(s)) {
      const his = catOf.get(n);
      if (!his) continue;
      all += 1;
      if (his === mine) hit += 1;
    }
  }
  return { rate: all ? hit / all : 0, of: all };
}

const real = sameCatRate((s) => related[s].map((x) => x.slug));

/* 우연 = 아무 글이나 같은 수만큼. 씨앗을 박아 판마다 같게. */
let seed = 4615;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const chance = sameCatRate((s) => related[s].map(() => slugs[Math.floor(rnd() * slugs.length)]));
/* ② 심는 대조군 — 이웃 목록을 통째로 섞는다(같은 목록을 남의 글에 붙인다). */
const shuffledSlugs = [...slugs];
for (let i = shuffledSlugs.length - 1; i > 0; i -= 1) {
  const j = Math.floor(rnd() * (i + 1));
  [shuffledSlugs[i], shuffledSlugs[j]] = [shuffledSlugs[j], shuffledSlugs[i]];
}
const swapped = new Map(slugs.map((s, i) => [s, shuffledSlugs[i]]));
const shuffled = sameCatRate((s) => related[swapped.get(s)].map((x) => x.slug));

console.log(`  ① 이웃이 같은 분류 ${(real.rate * 100).toFixed(1)}% (${real.of}쌍)`
  + ` · 아무 글이나 뽑으면 ${(chance.rate * 100).toFixed(1)}%`);
console.log(`  ② 이웃을 섞으면 ${(shuffled.rate * 100).toFixed(1)}%`);
const TIMES = 1.5;
if (!(real.rate > chance.rate * TIMES)) {
  bad.push(`같은 분류 비율 ${(real.rate * 100).toFixed(1)}% 가 우연 ${(chance.rate * 100).toFixed(1)}% 의 ${TIMES}배를 못 넘는다`);
}
if (!(real.rate > shuffled.rate * TIMES)) {
  bad.push(`섞은 이웃도 ${(shuffled.rate * 100).toFixed(1)}% 나온다 — 이 시험이 분류를 안 재고 있다`);
}

/* ③ 바닥이 실제로 걸렸나. */
console.log(`  ③ 바닥 ${data.floor} (아무 쌍 ${data.strangerTries}번) · 남긴 ${data.kept} · 버린 ${data.dropped}`);
if (data.floor == null) bad.push('바닥이 안 실려 있다 — 문턱을 재서 골랐는지 알 수 없다');
else {
  const under = Object.values(related).flat().filter((x) => x.sim <= data.floor).length;
  if (under) bad.push(`바닥(${data.floor}) 밑인 이웃이 ${under}개 남아 있다`);
}
if (!(data.dropped > 0)) {
  bad.push('버린 이웃이 하나도 없다 — 바닥이 아무 일도 안 하는지 봐라');
}

/* ④ 「이웃 없음」을 적는가. */
console.log(`  ④ 이웃이 없는 글 ${data.empty}편`);
if (data.empty === 0 && slugs.length > 20) {
  bad.push('이웃이 없는 글이 하나도 없다 — 늘 k 개를 채우고 있지 않은지 봐라');
}

if (bad.length) {
  console.log('[related] **「비슷한 글」이 뜻을 못 잡는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  scripts/gen-related-posts.mjs 의 textOf·바닥 고르기를 봐라.');
  process.exit(1);
}
console.log(`[related] 이웃이 사람이 붙인 분류와 우연보다 ${(real.rate / Math.max(1e-9, chance.rate)).toFixed(1)}배 자주 겹친다`);
