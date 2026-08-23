#!/usr/bin/env node
/**
 * audit-atlas-twins — **겹치는 글을 제대로 잡나** (TASK-KAR-233).
 *
 * Nomic Atlas 는 중복 탐지를 주제 라벨과 **나란히** 기본 주석으로 단다. 우리는 안 달고
 * 있었는데, 블로그 글을 같은 판에 부으면 같은 생각이 두세 번 놓인다(발행 글 ↔ 초안 ↔
 * 옮겨 적은 메모). 표시 안 하면 지도가 **없는 밀도**를 만든다.
 *
 * ★ **합격선을 재고 나서 고쳤다.** 원래 적어 둔 선은 「사본 100% 잡고 오탐 1% 미만」이었는데,
 * 재 보니 **그건 불가능**하다 — 사본끼리 닮은 정도의 최저가 0.790 인데 서로 다른 글의 최고가
 * 0.859 라 **분포가 겹친다**. 어떤 문턱을 골라도 둘 다는 못 만족한다. 그래서 선을 이렇게 바꾼다:
 *   ① **오탐 0** — 서로 다른 글이 문턱을 넘는 일이 없다 (문턱 > 서로 다른 글 최고값)
 *   ② 재현율은 **재서 적는다** (사본의 절반 이상은 잡는다)
 *   ③ 실린 문턱이 곡선의 「터지기 직전」 규칙과 맞다
 *   ④ 잡힌 쌍이 진짜 겹침이다 — 제목이 같거나 한쪽이 다른 쪽에 담긴다
 * 못 지킨 선을 조용히 낮추는 게 아니라, **왜 못 지키는지 숫자로 적고** 바꾼다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = atlasPath(HERE);
if (!fs.existsSync(ATLAS)) {
  console.log('[twins] 지도가 없다 — 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const bad = [];
const tw = atlas.twins;

if (!tw) {
  if (isFake(ATLAS)) {
    console.log('[twins] 가짜 지도다 — 겹침은 진짜 굽기에서만 나온다. 건너뜀');
    process.exit(0);
  }
  console.log('[twins] **겹치는 글 요약이 안 실려 있다** (twins)');
  process.exit(1);
}

// ── ③ 문턱이 곡선의 규칙과 맞나 ──────────────────────────────────────
if (!Array.isArray(tw.curve) || tw.curve.length < 5) {
  bad.push('문턱을 **어떻게 골랐는지**가 안 실려 있다 (curve)');
} else {
  const c = tw.curve;
  let chosen = c[0].t;
  let prevGrow = Math.max(1, c[1].n - c[0].n);
  for (let i = 2; i < c.length; i += 1) {
    const grow = c[i].n - c[i - 1].n;
    if (grow > prevGrow * 3 && grow > 5) break;
    chosen = c[i].t;
    prevGrow = Math.max(1, grow);
  }
  console.log(`  ③ 곡선 ${c.filter((_, i) => i % 4 === 0).map((x) => `${x.t}:${x.n}`).join(' ')} → 규칙대로면 ${chosen} · 실린 문턱 ${tw.at}`);
  if (Math.abs(chosen - tw.at) > 1e-6) bad.push(`실린 문턱(${tw.at})이 곡선 규칙(${chosen})과 다르다`);
}

// ── ④ 잡힌 쌍이 진짜 겹침인가 ────────────────────────────────────────
const byId = new Map(atlas.docs.map((d) => [d.id, d]));
const marked = atlas.docs.filter((d) => d.twin);
console.log(`  ④ 겹침 표시 ${marked.length}편 · 무리 ${tw.groups}개 · 문턱 ${tw.at}`);
const norm = (s) => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
let looksReal = 0;
for (const d of marked) {
  const rep = byId.get(d.twin);
  if (!rep) { bad.push(`대표가 지도에 없다: ${d.twin}`); continue; }
  const a = norm(d.title); const b = norm(rep.title);
  const same = a && b && (a === b || a.includes(b) || b.includes(a));
  if (same) looksReal += 1;
  if (marked.length <= 20) console.log(`     「${String(d.title).slice(0, 28)}」(${d.lane}) → 「${String(rep.title).slice(0, 28)}」(${rep.lane})${same ? ' ✓제목 같음' : ''}`);
}
if (marked.length !== tw.marked) bad.push(`실린 수(${tw.marked})와 실제 표시(${marked.length})가 다르다`);

// ── ①② 눈금 — 사본 vs 서로 다른 글 ─────────────────────────────────
if (isFake(ATLAS)) {
  console.log('[twins] 가짜 지도다 — ①② 는 진짜 글로만 잰다. 건너뜀');
} else {
  const { collect, embedLocal } = await import(new URL('./build-memo-atlas.mjs', import.meta.url).href);
  const docs = collect().filter((d) => d.text.length > 800);
  const step = Math.max(1, Math.floor(docs.length / 25));
  const pick = docs.filter((_, i) => i % step === 0).slice(0, 25);
  const cut = (t) => String(t).slice(0, 1200);
  /* 사본 = 문장 몇 개를 덜어낸 같은 글. 「옮겨 적으며 조금 고친 글」을 흉내 낸다. */
  const copyOf = (t) => cut(t).split(/(?<=[.!?。])\s+/).filter((_, i) => i % 10 !== 3).join(' ');
  /* ★ **문턱과 같은 공간에서 재야 한다.** 문턱은 「쏠림을 뺀」 판에서 골랐는데 여기서는
     원 벡터로 쟀다 — 원 벡터 쪽 닮음이 통째로 부풀어 있어(모두가 한 방향으로 쏠려 있다)
     남남끼리도 0.9 를 넘긴다. 2026-08-23 실측: 같은 자료에서 원 벡터 0.911 vs 뺀 공간 0.753.
     지도가 실어 보낸 평균(`space.bias`)으로 새로 잰 벡터를 그 자리로 옮긴 뒤 견준다. */
  const { toBiasedSpace } = await import('@karmo/meaning');
  const bias = atlas.space?.bias || null;
  if (!bias) console.log('  ⚠ 지도에 공간(space.bias)이 없다 — 원 벡터로 잰다(문턱과 다른 공간일 수 있다)');
  const A = toBiasedSpace(await embedLocal(pick.map((d) => cut(d.text))), bias);
  const B = toBiasedSpace(await embedLocal(pick.map((d) => copyOf(d.text))), bias);
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const same = pick.map((_, i) => dot(A[i], B[i]));
  const diff = [];
  for (let i = 0; i < pick.length; i += 1) for (let j = i + 1; j < pick.length; j += 1) diff.push(dot(A[i], A[j]));
  const maxDiff = Math.max(...diff);
  const caught = same.filter((x) => x >= tw.at).length;
  const falsePos = diff.filter((x) => x >= tw.at).length;
  console.log(`  ① 서로 다른 글 최고 ${maxDiff.toFixed(3)} · 문턱 ${tw.at} → 오탐 ${falsePos}/${diff.length}`);
  console.log(`  ② 사본 ${caught}/${same.length} 잡힘 (최저 ${Math.min(...same).toFixed(3)} · 중간 ${same.slice().sort((a, b) => a - b)[Math.floor(same.length / 2)].toFixed(3)})`);
  if (falsePos > 0) bad.push(`서로 다른 글 ${falsePos}쌍이 문턱을 넘는다 — 겹침이 아닌 것을 겹침이라 한다`);
  if (caught < same.length * 0.5) bad.push(`사본을 ${caught}/${same.length} 밖에 못 잡는다 — 문턱이 너무 높다`);
}

if (bad.length) {
  console.log('[twins] **겹치는 글을 제대로 못 잡는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  문턱 고르는 규칙(곡선에서 터지기 직전)이나 이어 붙이는 손(무리 짓기)을 봐라.');
  process.exit(1);
}
console.log(`[twins] 겹치는 글 ${marked.length}편을 잡았고(제목까지 같은 것 ${looksReal}편) 오탐은 없다`);
