#!/usr/bin/env node
/**
 * audit-atlas-dense. **진짜로 뭉친 자리를 찾는 손이 성한가** (TASK-KAR-233).
 *
 * 자 둘(실루엣, DBCV)이 우리 층은 무리가 아니라 구획이라 했다. 그런데 우리 나눔은
 * k-means 라 **모든 글을 억지로 어딘가에** 넣는다. 어디에도 안 붙는다는 답이 없다.
 * HDBSCAN 은 그 답을 준다: 뭉친 데만 집고 나머지는 -1.
 *
 * 이 자가 보는 것 넷 (합격선은 재기 **전에** TASK 문서에 박아 뒀다):
 *  ① **눈금**. 지어낸 자료(갈린 세 덩어리 + 흩뿌린 잡음)에서 덩어리 셋을 찾고
 *     잡음의 90% 이상을 -1 이나 **확신 0.2 밑**으로 낸다
 *  ② 실린 나눔의 DBCV 가 k-means 층보다 **최소 0.2 높다** (밀도로 뽑았는데 밀도 자가
 *     안 낫다면 구현이 틀린 것이다)
 *  ③ **손잡이를 박지 않았나**. 실린 손잡이가 기록된 곡선의 봉우리인가
 *  ④ 화면이 뭉친 자리 N군데, 나머지 M편은 허허벌판을 적고 **그 숫자를 따라가나**
 *
 * ⚠ ①의 확신이 왜 필요한가: HDBSCAN 은 **일찍 떨어져 나간 점도 그 무리 식구로 센다**
 * (정본 그대로). 그래서 -1 만 세면 잡음인데 붙어 있는 점을 놓친다. 시제품에서
 * 그런 점 12개가 전부 확신 0.04~0.06 이었고, 진짜 식구 300개는 하나도 0.2 밑이 아니었다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

import { untilSettled } from './lib/settle.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');

if (!fs.existsSync(ATLAS)) {
  console.log('[dense] 지도가 없다. 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const bad = [];

/* 굽는 쪽 함수를 그대로 부르지 않고 **여기서 따로 구현한다**. 같은 코드를 두 번 돌리는
   건 확인이 아니다. 정의는 같게: 뿌리는 후보에서 빼고, 확신은 λ_p/λ_max. */
function distMatrix(vecs) {
  const n = vecs.length; const dim = vecs[0].length;
  const D = new Float32Array(n * n);
  for (let i = 0; i < n; i += 1) {
    const a = vecs[i];
    for (let j = i + 1; j < n; j += 1) {
      const b = vecs[j];
      let s = 0;
      for (let k = 0; k < dim; k += 1) { const t = a[k] - b[k]; s += t * t; }
      const d = Math.sqrt(s);
      D[i * n + j] = d; D[j * n + i] = d;
    }
  }
  return D;
}

function hdbscan(vecs, minSamples, minSize) {
  const n = vecs.length;
  const D = distMatrix(vecs);
  const core = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const row = [];
    for (let j = 0; j < n; j += 1) row.push(D[i * n + j]);
    row.sort((a, b) => a - b);
    core[i] = row[Math.min(minSamples, n - 1)];
  }
  /* Prim. 상호도달거리 위의 최소신장나무 */
  const inT = new Uint8Array(n); const best = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1); const edges = [];
  let cur = 0; inT[0] = 1;
  for (let s = 1; s < n; s += 1) {
    let pick = -1; let pw = Infinity;
    for (let j = 0; j < n; j += 1) {
      if (inT[j]) continue;
      const w = Math.max(core[cur], core[j], D[cur * n + j]);
      if (w < best[j]) { best[j] = w; from[j] = cur; }
      if (best[j] < pw) { pw = best[j]; pick = j; }
    }
    if (pick < 0) break;
    inT[pick] = 1; edges.push([from[pick], pick, best[pick]]); cur = pick;
  }
  edges.sort((a, b) => a[2] - b[2]);
  /* 단일연결 나무 */
  const parent = new Int32Array(2 * n - 1).fill(-1);
  const size = new Int32Array(2 * n - 1).fill(1);
  const find = (x) => { while (parent[x] >= 0) x = parent[x]; return x; };
  const rows = []; let next = n;
  for (const [a, b, w] of edges) {
    const ra = find(a); const rb = find(b);
    if (ra === rb) continue;
    rows.push([ra, rb, w, size[ra] + size[rb]]);
    parent[ra] = next; parent[rb] = next; size[next] = size[ra] + size[rb]; next += 1;
  }
  /* 압축 나무 */
  const root = 2 * n - 2;
  const sizeOf = (x) => (x < n ? 1 : rows[x - n][3]);
  const leavesOf = (x0) => { const out = []; const st = [x0]; while (st.length) { const x = st.pop(); if (x < n) out.push(x); else { const [l, r] = rows[x - n]; st.push(l, r); } } return out; };
  const relabel = new Int32Array(2 * n - 1).fill(-1); relabel[root] = n;
  let nextLabel = n + 1; const tree = []; const ignore = new Uint8Array(2 * n - 1);
  const drop = (x0) => { const st = [x0]; while (st.length) { const x = st.pop(); ignore[x] = 1; if (x >= n) { const [a, b] = rows[x - n]; st.push(a, b); } } };
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (node < n || ignore[node]) continue;
    const [l, r, dist] = rows[node - n];
    const lam = dist > 0 ? 1 / dist : Infinity;
    const ls = sizeOf(l); const rs = sizeOf(r);
    if (ls >= minSize && rs >= minSize) {
      relabel[l] = nextLabel; nextLabel += 1; tree.push([relabel[node], relabel[l], lam, ls]);
      relabel[r] = nextLabel; nextLabel += 1; tree.push([relabel[node], relabel[r], lam, rs]);
      stack.push(l, r);
    } else if (ls < minSize && rs < minSize) {
      for (const q of leavesOf(node)) tree.push([relabel[node], q, lam, 1]);
      drop(l); drop(r);
    } else {
      const big = ls >= minSize ? l : r; const small = ls >= minSize ? r : l;
      relabel[big] = relabel[node];
      for (const q of leavesOf(small)) tree.push([relabel[node], q, lam, 1]);
      drop(small); stack.push(big);
    }
  }
  /* 안정성, EOM */
  const birth = new Map();
  for (const [, c, lam] of tree) if (c >= n) birth.set(c, lam);
  const st = new Map();
  for (const [p, , lam, sz] of tree) st.set(p, (st.get(p) || 0) + (lam - (birth.get(p) ?? 0)) * sz);
  const kids = new Map(); const pts = new Map();
  for (const [p, c] of tree) {
    if (c >= n) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(c); }
    else { if (!pts.has(p)) pts.set(p, []); pts.get(p).push(c); }
  }
  const order = [...st.keys()].filter((c) => c !== n).sort((a, b) => b - a);
  const isC = new Map(order.map((c) => [c, true])); const score = new Map(st);
  for (const c of order) {
    const kk = kids.get(c) || [];
    if (!kk.length) continue;
    const sum = kk.reduce((a, x) => a + (score.get(x) || 0), 0);
    if (sum > (st.get(c) || 0)) { isC.set(c, false); score.set(c, sum); } else {
      score.set(c, st.get(c) || 0);
      const s2 = [...kk];
      while (s2.length) { const x = s2.pop(); isC.set(x, false); for (const y of kids.get(x) || []) s2.push(y); }
    }
  }
  const chosen = order.filter((c) => isC.get(c));
  const label = new Int32Array(n).fill(-1); const prob = new Float64Array(n);
  const lamOf = new Map();
  for (const [, c, lam] of tree) if (c < n) lamOf.set(c, lam);
  chosen.forEach((c, i) => {
    const mine = []; const s2 = [c];
    while (s2.length) {
      const x = s2.pop();
      for (const q of pts.get(x) || []) mine.push(q);
      for (const y of kids.get(x) || []) s2.push(y);
    }
    const lmax = Math.max(...mine.map((q) => lamOf.get(q) ?? 0));
    for (const q of mine) { label[q] = i; prob[q] = lmax > 0 ? Math.min(1, (lamOf.get(q) ?? 0) / lmax) : 1; }
  });
  return { label: Array.from(label), prob: Array.from(prob), k: chosen.length };
}

// ── ① 눈금 (지어낸 자료. 진짜 지도가 없어도 돈다) ────────────────────
{
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i += 1) s += rnd(); return s - 3; };
  const DIM = 16; const vecs = []; const truth = [];
  for (let c = 0; c < 3; c += 1) {
    const center = Array.from({ length: DIM }, () => gauss() * 4);
    for (let i = 0; i < 100; i += 1) {
      vecs.push(Float64Array.from({ length: DIM }, (_, d) => center[d] + gauss() * 0.25));
      truth.push(c);
    }
  }
  for (let i = 0; i < 60; i += 1) {
    vecs.push(Float64Array.from({ length: DIM }, () => gauss() * 6));
    truth.push(-1);
  }
  const r = hdbscan(vecs, 5, 20);
  const WEAK = 0.2;
  const noiseIdx = truth.map((t, i) => [t, i]).filter(([t]) => t === -1).map(([, i]) => i);
  const caught = noiseIdx.filter((i) => r.label[i] === -1 || r.prob[i] < WEAK).length;
  const realIdx = truth.map((t, i) => [t, i]).filter(([t]) => t >= 0).map(([, i]) => i);
  const kept = realIdx.filter((i) => r.label[i] >= 0 && r.prob[i] >= WEAK).length;
  const rate = caught / noiseIdx.length;
  console.log(`  ① 눈금. 덩어리 ${r.k}개(셋이어야), 잡음 ${caught}/${noiseIdx.length} (${Math.round(rate * 100)}%, 90% 넘어야), 진짜 ${kept}/${realIdx.length} 살아남음`);
  if (r.k !== 3) bad.push(`지어낸 덩어리 셋을 ${r.k}개로 본다. 뭉친 자리를 못 찾거나 쪼갠다`);
  if (rate < 0.9) bad.push(`흩뿌린 잡음을 ${Math.round(rate * 100)}% 밖에 못 걸러낸다`);
  if (kept < realIdx.length * 0.95) bad.push(`진짜 식구 ${realIdx.length - kept}개를 잡음 취급한다`);
}

// ── ②③ 실린 나눔 ────────────────────────────────────────────────────
const dn = atlas.dense;
if (!dn) {
  if (isFake(ATLAS)) {
    console.log('[dense] 가짜 지도다. 뭉친 자리는 진짜 굽기에서만 나온다. ②③ 건너뜀');
  } else {
    bad.push('진짜 지도인데 **뭉친 자리가 안 실려 있다** (dense)');
  }
} else {
  const lv = (atlas.levels || [])[0];
  const kmeans = lv && lv.dbcv != null ? lv.dbcv : null;
  console.log(`  ② 뭉친 자리 ${dn.k}군데, 허허벌판 ${dn.noise}편, DBCV ${dn.dbcv}`
    + (kmeans == null ? '' : ` (k-means 층 ${kmeans.toFixed(3)})`));
  if (kmeans != null && dn.dbcv < kmeans + 0.2) {
    bad.push(`밀도로 뽑았는데 밀도 자가 더 낫지 않다 (${dn.dbcv} vs 층 ${kmeans.toFixed(3)})`);
  }
  const marked = atlas.docs.filter((d) => (d.dense ?? -1) >= 0).length;
  if (marked + dn.noise !== atlas.docs.filter((d) => d.dense != null).length) {
    bad.push(`실린 수가 안 맞는다. 붙은 글 ${marked} + 허허벌판 ${dn.noise} ≠ 자리 잡힌 글`);
  }
  /* ③ 손잡이를 박지 않았나. 기록된 곡선의 봉우리여야 한다. */
  if (!Array.isArray(dn.curve) || !dn.curve.length) {
    bad.push('손잡이를 **어떻게 골랐는지**가 안 실려 있다 (curve)');
  } else {
    const ok = dn.curve.filter((c) => c.dbcv != null);
    const peak = ok.reduce((a, b) => (b.dbcv > a.dbcv ? b : a), ok[0]);
    console.log(`  ③ 손잡이 ${dn.params.minSamples}, ${dn.params.minSize}, 곡선 봉우리 ${peak.ms}, ${peak.mc} (${peak.dbcv})`);
    if (Math.abs(peak.dbcv - dn.dbcv) > 1e-6) {
      bad.push(`실린 손잡이가 곡선의 봉우리가 아니다 (실린 ${dn.dbcv}, 봉우리 ${peak.dbcv})`);
    }
  }
}

// ── ④ 화면이 그 숫자를 따라가나 ──────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE) || !dn) {
  console.log('[dense] playwright, 번들, 뭉친 자리 중 없는 게 있다. ④ 건너뜀');
} else {
  const bundle = fs.readFileSync(BUNDLE, 'utf8');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  async function screenSays(noise) {
    const copy = JSON.parse(JSON.stringify(atlas));
    copy.dense.noise = noise;
    const page = await ctx.newPage();
    await page.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.pathname.endsWith('/data/memo-atlas.json')) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(copy) });
      }
      return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
    });
    await page.goto('http://localhost/');
    await page.evaluate(() => {
      window.__reg = {};
      window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {} };
    });
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => {
      const h = document.createElement('div');
      h.id = 'host'; h.style.width = '1200px'; h.style.height = '760px';
      document.body.appendChild(h);
      /* **셸과 같은 길로 얹는다**. 셸은 `tabs[].build` 로만 그린다. 예전엔 여기서
         `render(h)` 를 직접 불렀는데, 그 바람에 위젯이 셸이 안 읽는 모양으로 등록해도
         자들은 전부 초록이었다(2026-08-21, 사람이 열어 보고서야 드러났다). */
      window.__reg['memo-atlas'].tabs[0].build(h);
    });
    await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), undefined, { timeout: 30000 });
    await page.click('#host [data-more]');
    await page.click('#host [data-dense]');
    await untilSettled(page, () => page.evaluate(() => document.querySelector('#host .atlas-count')?.textContent || ''));
    const out = await page.evaluate(() => ({
      text: document.querySelector('#host .atlas-count')?.textContent || '',
      on: window.__atlasDenseOn === true,
      channels: window.__atlasChannels || [],
    }));
    await page.close();
    return out;
  }
  const real = await screenSays(dn.noise);
  const fake = await screenSays(dn.noise + 777);
  await browser.close();
  console.log(`  ④ 화면: ${real.text.slice(0, 60)}`);
  if (!real.on) bad.push('뭉친 자리를 켜도 안 켜진다');
  if (!real.text.includes(String(dn.noise))) bad.push(`화면이 허허벌판 ${dn.noise}편을 안 적는다`);
  if (!real.text.includes(String(dn.k))) bad.push(`화면이 뭉친 자리 ${dn.k}군데를 안 적는다`);
  if (!fake.text.includes(String(dn.noise + 777))) {
    bad.push('숫자를 바꿔도 화면이 그대로다. 화면이 자료를 안 읽고 박아 둔 말을 한다');
  }
  if (!real.channels.includes('초록 테두리')) bad.push('켰는데 읽는 법 띠가 초록 테두리를 설명 안 한다');
}

if (bad.length) {
  console.log('[dense] **뭉친 자리를 찾는 손이 안 선다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  핵심거리, 상호도달거리, 압축 나무(뿌리 제외)나 화면이 읽는 숫자를 봐라.');
  process.exit(1);
}
console.log('[dense] 눈금이 맞고, 손잡이를 재서 골랐고, 화면이 그 숫자를 따라간다');
