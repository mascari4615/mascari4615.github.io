#!/usr/bin/env node
/**
 * **글마다 「비슷한 글」을 미리 구워 둔다** — KarmoMeaning 의 **두 번째 사용처**.
 *
 * 왜 이걸로 재사용을 증명하나: 코어는 「한 곳에서 쓰이는 코드」와 구분이 안 된다. 두 번째
 * 쓰임이 붙어야 그릇이 맞는지 드러난다. 지형도와 여기는 **자료도 목적도 다르다** —
 * 지형도는 비공개 지식베이스를 그리고, 이건 **공개 블로그 글**의 발밑에 붙는 목록이다.
 *
 * 지형도 굽기와 다른 점(그래서 시험이 된다):
 * - 글 몸통이 아니라 **제목 + 요약 + 분류**로 잰다 (색인이 그것만 준다)
 * - 곳간이 다른 파일이다 (`.related-cache.json`) — 꾸러미가 곳간을 안 소유한다는 계약이 여기서 확인된다
 * - 이웃 수가 다르다 (3개)
 *
 * 산출물: `data/related-posts.json` = `{ slug: [{ slug, title, sim }] }`
 * 공개 자료만 들어간다(색인 자체가 공개 글만 담는다) — 지형도의 비공개 계약과 안 섞인다.
 *
 * 쓰기: `npm run gen:related`  ·  `--limit N` 으로 맛보기
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { embedAll, removeSharedBias, nearest } from '@karmo/meaning';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const INDEX = path.join(KARMOLAB, 'data', 'posts-index.json');
const OUT = path.join(KARMOLAB, 'data', 'related-posts.json');
const CACHE = path.join(KARMOLAB, 'data', '.related-cache.json');
const K = 3;

const argv = process.argv.slice(2);
const limitAt = argv.indexOf('--limit');
const LIMIT = limitAt >= 0 ? Number(argv[limitAt + 1]) || 0 : 0;

if (!fs.existsSync(INDEX)) {
  console.error('[related] 글 색인이 없다 — `npm run gen:post-pages` 를 먼저 돌려라');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
let posts = Array.isArray(raw) ? raw : (raw.posts || []);
if (LIMIT) posts = posts.slice(0, LIMIT);
if (posts.length < K + 1) {
  console.log(`[related] 글이 ${posts.length}편뿐 — 이웃 ${K}개를 낼 수 없다`);
  process.exit(2);
}

/** 색인이 주는 것만으로 글의 정체를 만든다. 분류·꼬리표도 뜻의 일부다. */
const textOf = (p) => [
  p.title || '',
  (p.categories || []).join(' '),
  (p.tags || []).join(' '),
  p.excerpt || '',
].join('\n').trim();

const items = posts.map((p) => {
  const text = textOf(p);
  return { id: p.slug, hash: crypto.createHash('sha1').update(text).digest('hex').slice(0, 12), text };
});

let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { /* 첫 판 */ }

const t0 = Date.now();
const got = await embedAll(items, {
  cache,
  loadRunner: () => import('@huggingface/transformers'),
  onLoad: () => console.log('[related] 이 기계에서 도는 모델을 준비한다 (처음 한 번은 내려받는다)'),
  onProgress: (done, all) => console.log(`[related]   ${done}/${all}`),
  onFlush: (c) => fs.writeFileSync(CACHE, JSON.stringify(c)),
});
console.log(`[related] 글 ${items.length}편 · 새로 잰 것 ${got.todo}편 · ${((Date.now() - t0) / 1000).toFixed(1)}초 (${got.tier})`);

const ok = [];
const okAt = [];
got.vectors.forEach((v, i) => { if (v) { ok.push(v); okAt.push(i); } });
if (ok.length < K + 1) {
  console.error(`[related] 벡터가 ${ok.length}개뿐 — 이웃을 못 낸다`);
  process.exit(1);
}
/* 지형도와 **같은 손**으로 쏠림을 뺀다 — 안 빼면 긴 글끼리 뭉친다. */
const flat = removeSharedBias(ok).vectors;
const { idx, sim } = nearest(flat, K);

/**
 * ★ **바닥을 재서 깐다** — 이웃을 k 개 「늘 채우면」 안 닮은 글도 목록에 오른다
 * (실측: 어떤 글의 이웃 셋이 0.17 대였다. 그건 이웃이 아니라 그냥 가장 덜 먼 글이다).
 * 아무 쌍이나 뽑아 **남남의 닮은 정도**를 재고, 그 위 5%(95분위)를 문턱으로 쓴다.
 * 문턱을 손으로 박지 않는다 — 글이 바뀌면 문턱도 같이 움직인다.
 */
let s = 20260823;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const dot = (a, b) => { let t = 0; for (let q = 0; q < a.length; q += 1) t += a[q] * b[q]; return t; };
const strangers = [];
for (let t = 0; t < 3000; t += 1) {
  const a = Math.floor(rnd() * flat.length);
  const b = Math.floor(rnd() * flat.length);
  if (a !== b) strangers.push(dot(flat[a], flat[b]));
}
strangers.sort((a, b) => a - b);
const floor = strangers[Math.floor(strangers.length * 0.95)];

const out = {};
let kept = 0; let dropped = 0; let empty = 0;
okAt.forEach((pi, i) => {
  const row = idx[i]
    .map((j, r) => ({ slug: posts[okAt[j]].slug, title: posts[okAt[j]].title, sim: Number(sim[i][r].toFixed(4)) }))
    .filter((x) => x.sim > floor);
  dropped += idx[i].length - row.length;
  kept += row.length;
  if (!row.length) empty += 1;
  /* 빈 줄도 **적어 둔다** — 「비슷한 글이 없다」와 「아직 안 쟀다」는 다르다. */
  out[posts[pi].slug] = row;
});
console.log(`[related] 바닥 ${floor.toFixed(3)} (아무 쌍 ${strangers.length}번의 95분위)`
  + ` · 남긴 이웃 ${kept}개 · 버린 것 ${dropped}개 · 이웃이 없는 글 ${empty}편`);
fs.writeFileSync(OUT, JSON.stringify({
  k: K, floor: Number(floor.toFixed(4)), strangerTries: strangers.length,
  posts: Object.keys(out).length, kept, dropped, empty,
  model: got.tier,
  related: out,
}, null, 1));
const sims = Object.values(out).flatMap((row) => row.map((x) => x.sim)).sort((a, b) => a - b);
console.log(`[related] 썼다: ${path.relative(KARMOLAB, OUT)} — 글 ${Object.keys(out).length}편`
  + ` · 닮은 정도 중간값 ${sims.length ? sims[Math.floor(sims.length / 2)].toFixed(3) : '—'}`
  + (sims.length ? ` (가장 낮은 것 ${sims[0].toFixed(3)} · 가장 높은 것 ${sims[sims.length - 1].toFixed(3)})` : ''));
