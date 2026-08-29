#!/usr/bin/env node
/**
 * audit-atlas-dip. **갈린다에 p 값이 붙어 있나** (TASK-KAR-233).
 *
 * 여기까지 구획이지 무리가 아니다의 근거는 전부 **문턱을 손으로 고른 자**(실루엣, DBCV, 
 * 꿋꿋함)이거나 **섞은 대조군**이었다. **p 값이 하나도 없었다.**
 *
 * Hartigan & Hartigan(1985)의 dip = 표본의 계단분포와 **가장 가까운 단봉 함수** 사이 거리.
 * 두 덩어리의 **중심을 잇는 선에 투영**하면 1차원이 되므로 바로 쓸 수 있다.
 *
 * ★ **함정이 있다.** 중심을 잇는 선은 **그 자료로 고른 방향**이다. 아무 점 무더기라도
 * 가장 갈라 보이는 방향에 투영하면 두 봉우리처럼 보인다. 그래서 대조군 둘을 건다:
 * , **아무 방향** 에 투영했을 때
 * , **거짓 쪼개기**. 한 덩어리를 억지로 둘로 쪼개고 같은 셈을 했을 때
 * 뒤엣것에서도 p 가 바닥이면 이 검정은 방향 고르기의 산물이지 자료의 것이 아니다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① dip 통계량을 직접 구현한다. 자가 **다시 세서** 대조한다
 *  ② p 는 표를 베끼지 말고 **우리 N 으로 되뽑기**, 판 수와 **p 바닥**을 화면이 적는다
 *  ③ 짝마다 p 를 내고 화면이 짝 N개 중 몇 개가 갈린다와 **대조군 둘**을 적는다
 *  ④ 자. 극단값이 상한 0.25 에 닿고, 고른 격자는 0, 간격을 벌리면 단조로 커진다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
/* ★ **가짜 지도로는 이 자를 못 댄다.** 조용히 통과시키지 않고 **왜 안 도는지 말한다** . 
   건너뛴 검사는 통과한 검사가 아니다. 진짜로 구운 뒤 `npm run atlas` 에서 돈다. */
if (isFake(ATLAS)) { console.log('[dip] 가짜 지도다. 갈린다는 진짜 굽기에서만 잰다'); process.exit(0); }

const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
const bad = [];

/* ── 굽는 쪽과 **같은 뜻, 셈은 따로**. 자가 스스로 dip 을 센다 ───────────────── */
function gcmGap(xs, fs2, lo, hi) {
  if (hi - lo < 2) return 0;
  const st = [lo];
  for (let i = lo + 1; i <= hi; i += 1) {
    while (st.length >= 2) {
      const a = st[st.length - 2]; const b = st[st.length - 1];
      if ((fs2[b] - fs2[a]) * (xs[i] - xs[a]) >= (fs2[i] - fs2[a]) * (xs[b] - xs[a])) st.pop();
      else break;
    }
    st.push(i);
  }
  let d = 0; let k = 0;
  for (let i = lo; i <= hi; i += 1) {
    while (k + 1 < st.length && st[k + 1] < i) k += 1;
    const a = st[k]; const b = st[Math.min(k + 1, st.length - 1)];
    const t = xs[b] === xs[a] ? 0 : (xs[i] - xs[a]) / (xs[b] - xs[a]);
    const on = fs2[a] + t * (fs2[b] - fs2[a]);
    if (fs2[i] - on > d) d = fs2[i] - on;
  }
  return d;
}
function dip(xs) {
  const n = xs.length;
  if (n < 8) return 0;
  const fs2 = Array.from({ length: n }, (_, i) => (i + 0.5) / n);
  const rx = Array.from({ length: n }, (_, i) => -xs[n - 1 - i]);
  const rf = Array.from({ length: n }, (_, i) => -fs2[n - 1 - i]);
  let best = Infinity;
  for (let m = 0; m < n; m += 1) {
    const d = Math.max(gcmGap(xs, fs2, 0, m), gcmGap(rx, rf, 0, n - 1 - m));
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best / 2;
}

// ── ④ 눈금 (지도가 없어도 돈다) ───────────────────────────────────────
{
  let s = 4242;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const g = () => { const u = Math.max(1e-9, rnd()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const srt = (a) => a.slice().sort((x, y) => x - y);
  /* 극단. 반은 0, 반은 100. 이 검정의 이론 상한이 0.25 다. */
  const ext = srt([
    ...Array.from({ length: 100 }, () => rnd() * 1e-9),
    ...Array.from({ length: 100 }, () => 100 + rnd() * 1e-9),
  ]);
  const grid = srt(Array.from({ length: 200 }, (_, i) => i / 200));
  const de = dip(ext); const dg = dip(grid);
  console.log(`  ④ 눈금. 완전히 갈린 둘 ${de.toFixed(4)} (상한 0.25), 고른 격자 ${dg.toFixed(5)} (0 이어야)`);
  if (!(de > 0.2)) bad.push(`완전히 갈린 둘의 dip 이 ${de.toFixed(4)} 다. 0.25 에 가까워야 한다`);
  if (dg > 1e-9) bad.push(`고른 격자의 dip 이 ${dg.toFixed(6)} 다. 0 이어야 한다`);
  /* 간격을 벌리면 커져야 한다. 20판 평균. */
  const means = [];
  for (const gap of [0, 2, 4, 6]) {
    const ds = [];
    for (let t = 0; t < 20; t += 1) {
      const a = [];
      for (let k = 0; k < 200; k += 1) a.push(g() + (k % 2 ? gap : 0));
      ds.push(dip(srt(a)));
    }
    means.push(ds.reduce((x, y) => x + y, 0) / ds.length);
  }
  console.log(`  ④ 간격 0, 2, 4, 6 → dip ${means.map((m) => m.toFixed(4)).join(', ')}`);
  for (let i = 1; i < means.length; i += 1) {
    if (!(means[i] > means[i - 1])) bad.push(`간격을 벌렸는데 dip 이 안 커진다 (${means[i - 1].toFixed(4)} → ${means[i].toFixed(4)})`);
  }
  if (!(means[3] > means[0] * 3)) bad.push(`잘 갈린 둘(${means[3].toFixed(4)})이 한 봉우리(${means[0].toFixed(4)})의 세 배도 안 된다. 구별을 못 한다`);
}

// ── ①②③ 실린 값 ────────────────────────────────────────────────────
let atlas = null;
if (!fs.existsSync(ATLAS)) {
  console.log('[dip] 지도가 없다. 실린 값 확인 건너뜀');
} else {
  atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
  const withDip = (atlas.levels || []).filter((l) => l.dip && l.dip.pairs);
  if (!withDip.length) {
    if (isFake(ATLAS) || !(atlas.levels || []).length) {
      console.log('[dip] 층이 없다. 가짜 지도이거나 아직 안 구웠다');
    } else {
      console.log('[dip] **갈린다에 p 값이 없다** (levels[].dip). 문턱을 손으로 고른 자만 있다');
      process.exit(1);
    }
  } else {
    for (const L of withDip) {
      const d = L.dip;
      console.log(`  ③ 층 ${L.k}. 짝 ${d.pairs}개 중 **갈린 짝 ${d.split}개**`
        + `, 대조군: 아무 방향 ${d.randSplit}개, 거짓 쪼개기 ${d.fakeSplit}/${d.fakes.length}개`
        + `, dip 중앙값 ${d.medDip} vs 아무 방향 ${d.medRandDip}`);
      if (d.floor !== Number((1 / (d.runs + 1)).toFixed(4))) {
        bad.push(`층 ${L.k}: p 바닥 ${d.floor} 이 되뽑기 ${d.runs}판과 안 맞는다`);
      }
      /* ② **p 바닥을 문턱 밑에 두면 아무것도 안 걸린다**. 처음에 p<0.01 로 쟀다가 걸렸다. */
      if (d.alpha < d.floor) {
        bad.push(`층 ${L.k}: 문턱 ${d.alpha} 가 p 바닥 ${d.floor} 보다 작다. 어떤 짝도 못 걸린다`);
      }
      /* ★ **대조군이 살아 있어야 한다.** 아무 방향에서도 다 갈리면 방향 고르기의 산물이다. */
      if (d.split > 0 && d.randSplit > d.split * 0.5) {
        bad.push(`층 ${L.k}: 아무 방향에 투영해도 ${d.randSplit}개가 갈린다 (진짜 방향 ${d.split}개). 방향 고르기의 산물이다`);
      }
      if (d.fakes.length >= 3 && d.fakeSplit === d.fakes.length) {
        bad.push(`층 ${L.k}: **한 덩어리를 억지로 쪼개도 ${d.fakeSplit}/${d.fakes.length} 전부 갈린다고 나온다**. 이 검정은 자료를 안 보고 있다`);
      }
      for (const r of d.rows.slice(0, 3)) {
        if (!(r.dip > 0) || !(r.p > 0 && r.p <= 1)) bad.push(`층 ${L.k}: ${r.a}↔${r.b} 값이 이상하다 (dip ${r.dip}, p ${r.p})`);
        if (r.used > r.na + r.nb) bad.push(`층 ${L.k}: 쓴 점 ${r.used}개가 있는 점 ${r.na + r.nb}개보다 많다`);
      }
      if (!(d.medDip > d.medRandDip)) {
        bad.push(`층 ${L.k}: 중심을 잇는 선의 dip 중앙값 ${d.medDip} 이 아무 방향 ${d.medRandDip} 보다 안 크다`);
      }
    }
  }
}

// ── ③ 화면 ──────────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE) || !atlas) {
  console.log('[dip] playwright, 번들 중 없는 게 있다. 화면 확인 건너뜀');
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
  const shown = (atlas.levels || []).find((l) => l.dip && l.dip.pairs && text.includes(`짝 ${l.dip.pairs}개`));
  const d = shown ? shown.dip : null;
  const saysSplit = d ? text.includes(`${d.split}개가 갈린다`) : false;
  const saysRuns = d ? text.includes(`${d.runs}판`) && text.includes(String(d.floor)) : false;
  const saysCtrl = text.includes('아무 방향') && text.includes('억지로 쪼개면');
  console.log(`  ③ 화면. 갈린 짝 수 ${saysSplit ? '○' : '✗'}, 되뽑기 판, p 바닥 ${saysRuns ? '○' : '✗'}, 대조군 둘 ${saysCtrl ? '○' : '✗'}`);
  if (!shown) bad.push('화면이 지금 층의 짝 수를 안 적는다. 어느 층 값인지 알 수 없다');
  if (!saysSplit) bad.push('화면이 짝 N개 중 몇 개가 갈린다를 안 적는다');
  if (!saysRuns) bad.push('화면이 **되뽑기 판 수와 p 바닥**을 안 적는다. p 가 표에서 온 값처럼 읽힌다');
  if (!saysCtrl) bad.push('화면이 **대조군 둘**(아무 방향, 거짓 쪼개기)을 안 적는다. 갈린다가 발견처럼 읽힌다');
  await browser.close();
}

if (bad.length) {
  console.log('[dip] **갈린다를 제대로 재지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 dipStat, dipP, dipPairs 를 봐라.');
  process.exit(1);
}
console.log('[dip] 짝마다 p 를 내고, 아무 방향, 거짓 쪼개기와 나란히 적는다. 표를 안 베끼고 우리 N 으로 되뽑는다');
