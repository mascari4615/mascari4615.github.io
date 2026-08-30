#!/usr/bin/env node
/**
 * audit-atlas-hub. **몇 편이 모두의 이웃 자리를 먹나** (TASK-KAR-233).
 *
 * 차원이 높아지면 **몇몇 점이 모두의 이웃 목록에 끼어든다**(Radovanović, Nanopoulos, Ivanović,
 * Hubs in Space JMLR 2010). 원인은 성김이 아니라 **본질 차원**. 자료의 평균에 가까운
 * 점은 남들까지의 거리가 천천히 늘어 어디서 봐도 가까워 보인다. 그러면 **나머지는 이웃이
 * 없어진다.** 우리 증상과 겹친다: 거짓 이웃 69%, HDBSCAN 이 75%를 어디에도 안 붙는다, 
 * 혼자 있는 글 39편.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① **비뚤어짐 S_Nk** 를 k=8, 24 에서 재서 싣고, **위 1% 가 이웃 자리의 몇 %** 인지도
 *  ② 화면이 그 수를 적는다
 *  ③ **NICDM**(이웃까지 평균 거리로 나누기)을 후보로 재서 **나란히** 싣는다
 *  ④ 자. 지어낸 고차원 자료에서 비뚤어짐이 크게 나오고 NICDM 을 대면 줄어든다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
const bad = [];

/* ── 굽는 쪽과 **같은 정의, 셈은 따로** ────────────────────────────────── */
function hubness(dist, n, k, scale = null) {
  const cnt = new Int32Array(n);
  const row = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      row[j] = j === i ? Infinity
        : (scale ? dist[i * n + j] / Math.sqrt(scale[i] * scale[j]) : dist[i * n + j]);
    }
    const idx = Array.from({ length: n }, (_, j) => j);
    idx.sort((a, b) => row[a] - row[b]);
    for (let t = 0; t < k; t += 1) cnt[idx[t]] += 1;
  }
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += cnt[i];
  mean /= n;
  let m2 = 0; let m3 = 0;
  for (let i = 0; i < n; i += 1) { const d = cnt[i] - mean; m2 += d * d; m3 += d * d * d; }
  m2 /= n; m3 /= n;
  const sorted = Array.from(cnt).sort((a, b) => b - a);
  const total = sorted.reduce((a, b) => a + b, 0) || 1;
  const topN = Math.max(1, Math.round(n * 0.01));
  return {
    skew: m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0,
    max: sorted[0],
    top1: sorted.slice(0, topN).reduce((a, b) => a + b, 0) / total,
    orphans: Array.from(cnt).filter((c) => c === 0).length,
  };
}
function nicdmScale(dist, n, k) {
  const out = new Float64Array(n);
  const row = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) row[j] = j === i ? Infinity : dist[i * n + j];
    const sorted = Array.prototype.slice.call(row).sort((a, b) => a - b);
    let acc = 0;
    for (let t = 0; t < k; t += 1) acc += sorted[t];
    out[i] = (acc / k) || 1e-9;
  }
  return out;
}

// ── ④ 눈금 (지도가 없어도 돈다) ───────────────────────────────────────
{
  let seed = 5;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gs = () => { let s = 0; for (let i = 0; i < 6; i += 1) s += rnd(); return s - 3; };
  /* ★ **눈금 자료를 단위 구면으로 만들면 허브가 안 생긴다**. 허브는 자료의 평균에
     가까운 점에서 나는데, 길이를 1 로 맞추면 그 차이가 통째로 사라진다(처음 그렇게
     만들었다가 120차원에서도 쏠림이 0.29 밖에 안 나왔다). 정본이 쓰는 꼴 그대로
     **정규분포 구름을 길이 안 맞추고** 쓴다. */
  const make = (dim, n) => {
    const P = [];
    for (let i = 0; i < n; i += 1) P.push(Array.from({ length: dim }, () => gs()));
    const d = new Float64Array(n * n);
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let s = 0;
        for (let t = 0; t < dim; t += 1) { const q = P[i][t] - P[j][t]; s += q * q; }
        const v = Math.sqrt(s); d[i * n + j] = v; d[j * n + i] = v;
      }
    }
    return { d, n };
  };
  const K = 10;
  const lo = make(3, 300);
  const hi = make(120, 300);
  const loS = hubness(lo.d, lo.n, K).skew;
  const hiRaw = hubness(hi.d, hi.n, K);
  const hiFix = hubness(hi.d, hi.n, K, nicdmScale(hi.d, hi.n, K));
  console.log(`  ④ 눈금. 3차원 비뚤어짐 ${loS.toFixed(3)}, 120차원 ${hiRaw.skew.toFixed(3)}`
    + ` → 거리를 다시 재면 ${hiFix.skew.toFixed(3)}`);
  if (!(hiRaw.skew > loS)) bad.push(`차원이 높아져도 비뚤어짐이 안 는다 (${loS.toFixed(2)} → ${hiRaw.skew.toFixed(2)}). 재는 손이 틀렸다`);
  if (!(hiFix.skew < hiRaw.skew)) {
    bad.push(`거리를 다시 재도 비뚤어짐이 안 준다 (${hiRaw.skew.toFixed(2)} → ${hiFix.skew.toFixed(2)}). NICDM 셈이 틀렸다`);
  }
}

// ── ①③ 실린 값 ──────────────────────────────────────────────────────
if (!fs.existsSync(ATLAS)) {
  console.log('[hub] 지도가 없다. 실린 값, 화면 확인 건너뜀');
} else {
  const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
  const hub = atlas.hub;
  if (!hub || !Array.isArray(hub.rows) || !hub.rows.length) {
    if (isFake(ATLAS)) console.log('[hub] 가짜 지도다. 허브는 진짜 굽기에서만 잰다');
    else bad.push('진짜 지도인데 **허브가 안 실려 있다** (hub). 몇 편이 이웃 자리를 먹는지 모른다');
  } else {
    for (const r of hub.rows) {
      console.log(`  ① k=${r.k}. 비뚤어짐 ${r.raw.skew}, 가장 인기 있는 글 ${r.raw.max}번`
        + `, 위 1% 가 ${(r.raw.top1 * 100).toFixed(0)}%, 안 불린 글 ${r.raw.orphans}편`
        + ` | 다시 재면 ${r.fixed.skew}, 위 1% ${(r.fixed.top1 * 100).toFixed(0)}%, 안 불린 글 ${r.fixed.orphans}편`);
      if (typeof r.raw.skew !== 'number' || typeof r.fixed.skew !== 'number') bad.push(`k=${r.k} 줄에 비뚤어짐이 없다`);
      if (r.raw.mean == null) bad.push(`k=${r.k} 줄에 평균이 없다`);
      /* 이웃 자리 총합은 n×k 이므로 평균은 반드시 k 다. 아니면 셈이 틀렸다. */
      if (Math.abs(r.raw.mean - r.k) > 0.05) bad.push(`k=${r.k} 인데 평균 N_k 가 ${r.raw.mean} 이다 (k 여야 한다)`);
      if (!(r.raw.max >= r.k)) bad.push(`k=${r.k} 에서 가장 인기 있는 글이 ${r.raw.max}번뿐이다. 셈을 봐라`);
    }
    if (!hub.rows.some((r) => r.fixed)) bad.push('거리를 다시 잰 값(NICDM)이 없다. 고칠 수 있는지를 모른다');

    /* ③ **처방 셋을 다 재 봤나, 그리고 승자를 제대로 골랐나**. 표에서 다시 세운다. */
    for (const r of hub.rows) {
      const cand = [['국소 배율', r.fixed], ['상호 근접도', r.mp], ['공유 이웃', r.snn]];
      const missing = cand.filter(([, v]) => !v || typeof v.skew !== 'number').map(([nm]) => nm);
      if (missing.length) { bad.push(`k=${r.k}. 처방 ${missing.join(', ')} 를 안 재 봤다`); continue; }
      const win = cand.reduce((a, b) => ((b[1].skew < a[1].skew
        || (b[1].skew === a[1].skew && b[1].orphans < a[1].orphans)) ? b : a))[0];
      console.log(`  ③ k=${r.k}. 국소 배율 ${r.fixed.skew}(${r.fixed.orphans}), 상호 근접도 ${r.mp.skew}(${r.mp.orphans})`
        + `, 공유 이웃 ${r.snn.skew}(${r.snn.orphans}) → 표대로면 ${win}, 실린 것 ${r.best}`);
      if (r.best !== win) bad.push(`k=${r.k}. 표대로면 ${win} 인데 ${r.best} 라 적혀 있다`);
      /* 어느 처방이든 **그냥보다는 나아야** 한다. 아니면 셈이 틀렸다. */
      if (!(r.fixed.skew < r.raw.skew)) bad.push(`k=${r.k}. 국소 배율이 그냥보다 안 낫다 (${r.raw.skew} → ${r.fixed.skew})`);
    }

    // ② 화면
    let chromium;
    try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
    if (!chromium || !fs.existsSync(BUNDLE)) {
      console.log('[hub] playwright, 번들 중 없는 게 있다. 화면 확인 건너뜀');
    } else {
      const bundle = fs.readFileSync(BUNDLE, 'utf8');
      const browser = await chromium.launch();
      const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
      await page.route('**/*', (r) => {
        const u = new URL(r.request().url());
        if (u.pathname.endsWith('/data/memo-atlas.json')) {
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(atlas) });
        }
        return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
      });
      await page.goto('http://localhost/');
      await page.evaluate(() => {
        window.__reg = {};
        window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {}, onDispose() {} };
      });
      await page.addScriptTag({ content: bundle });
      await page.evaluate(() => {
        const h = document.createElement('div');
        h.id = 'host'; h.style.width = '1200px'; h.style.height = '760px';
        document.body.appendChild(h);
        window.__reg['memo-atlas'].tabs[0].build(h);
      });
      await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), undefined, { timeout: 30000 });
      const text = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
      await browser.close();
      /* 화면은 **한 줄만** 적어도 된다. 어느 k 든 그 수가 있으면 통과. */
      const says = /인기 있는 이웃|이웃 자리/.test(text)
        && hub.rows.some((r) => text.includes(String(r.raw.max)) && text.includes(String(r.raw.orphans)));
      console.log(`  ② 화면이 적나. ${says ? '적는다' : '**안 적는다**'}`);
      if (!says) bad.push('화면이 허브를 안 적는다. 몇 편이 이웃 자리를 먹는지 보는 사람은 모른다');
    }
  }
}

// ── ⑤ **저 덩어리 진짜 있나** (Jeon 2022) ─────────────────────────────
/* 점 단위 잣대(믿을 만함, 안 놓침)로는 **덩어리 사이를 못 잰다.** 화면에서 뭉친 자리를
   무작위 걷기로 뽑아 원래 공간에서도 뭉치는지(꿋꿋함), 반대로도(뭉침) 본다.
   ★ 절대값만 보면 안 된다. **자리를 마구 섞은 대조군**과 나란히 놓아야 뜻이 산다. */
{
  const atlas2 = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
  const g = atlas2.group;
  if (!g) {
    if (!isFake(ATLAS)) bad.push('덩어리가 진짜인지를 안 재고 있다 (group). 저 덩어리 진짜 있어?에 답이 없다');
  } else {
    console.log(`  ⑤ 꿋꿋함 ${g.steady}, 뭉침 ${g.cohesive} | 섞으면 ${g.randSteady}, ${g.randCohesive}`
      + ` (표본 ${g.n}편, 이웃 ${g.k}, ${g.iters}판)`);
    for (const [nm, v] of [['꿋꿋함', g.steady], ['뭉침', g.cohesive]]) {
      if (typeof v !== 'number' || v < 0 || v > 1) bad.push(`${nm} 이 ${v} 다 (0~1 이어야 한다)`);
    }
    if (g.randSteady == null || g.randCohesive == null) {
      bad.push('섞은 대조군이 없다. 그것 없이 꿋꿋함 0.121은 아무 뜻이 없다');
    } else {
      if (!(g.steady > g.randSteady * 2)) bad.push(`꿋꿋함 ${g.steady} 가 섞은 것(${g.randSteady})의 두 배도 안 된다`);
      if (!(g.cohesive > g.randCohesive * 2)) bad.push(`뭉침 ${g.cohesive} 가 섞은 것(${g.randCohesive})의 두 배도 안 된다`);
      if (g.randSteady > 0.2 || g.randCohesive > 0.2) {
        bad.push(`섞은 지도인데 ${g.randSteady}, ${g.randCohesive} 나 된다. 재는 손이 아무 데서나 무리를 본다`);
      }
    }
    if (!(g.n >= 100) || !(g.iters >= 50)) bad.push(`표본 ${g.n}편, ${g.iters}판으로는 못 믿는다`);
  }
}

if (bad.length) {
  console.log('[hub] **허브를 안 재거나, 재고도 안 말한다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 hubness, nicdmScale 을 봐라.');
  process.exit(1);
}
console.log('[hub] 몇 편이 이웃 자리를 먹는지 재고, 거리를 다시 재면 어떻게 되는지도 나란히 적는다');
