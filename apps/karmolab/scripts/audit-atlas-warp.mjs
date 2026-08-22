#!/usr/bin/env node
/**
 * audit-atlas-warp — **어긋남을 두 쪽 다 재고, 그 자리에 칠하나** (TASK-KAR-233).
 *
 * 차원 줄인 그림의 어긋남은 **두 종류뿐**이다(CheckViz, Lespinats·Aupetit CGF 2011):
 *  · **찢김** — 원래 가까운데 화면에서 멀어진 것
 *  · **거짓 이웃** — 원래 먼데 화면에서 붙은 것
 * CheckViz 의 요점은 그 둘을 **어긋난 그 자리에 칠하는 것**이다 — 목적은 **과잉 해석 막기**.
 *
 * ★ 우리는 **찢김만 재면서 그걸 「옆에 있어도 남남」이라 불렀다.** `honest` 는 「닮은 글이
 * 지도에서도 가까운 수」라 낮으면 **닮은 글이 흩어진** 것이지 옆 사람이 남남이라는 뜻이
 * 아니다. 말과 수가 어긋나 있었다 — 이 자가 그 말을 건다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 글마다 **두 쪽 다** 실려 있다 (찢김 `honest` · 거짓 이웃 `fake`/`fakeOf`)
 *  ② 그 둘을 **칸 격자 바탕**에 칠한다 — 켜면 화면이 실제로 물든다
 *  ③ 읽는 법 띠가 두 수를 적고, **찢김을 찢김이라 부른다**
 *  ④ 잣대가 **같은 수끼리**다 — 화면 이웃 K개를 **진짜 순위 K** 로 잰다
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

if (!fs.existsSync(ATLAS)) {
  console.log('[warp] 지도가 없다 — 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const wp = atlas.warp;

// ── ①④ 실린 값 ──────────────────────────────────────────────────────
if (!wp) {
  if (isFake(ATLAS)) { console.log('[warp] 가짜 지도다 — 어긋남은 진짜 굽기에서만 잰다'); process.exit(0); }
  console.log('[warp] **어긋남이 안 실려 있다** (warp) — 반쪽(찢김)만 재고 있다');
  process.exit(1);
}
const withTear = atlas.docs.filter((d) => d.honest != null);
const withFake = atlas.docs.filter((d) => d.fakeOf);
console.log(`  ① 찢김이 실린 글 ${withTear.length} · 거짓 이웃이 실린 글 ${withFake.length}`
  + ` (찢김 평균 ${wp.tearMean} · 거짓 이웃 평균 ${wp.fakeMean} · 이웃 ${wp.k}개)`);
if (!withTear.length) bad.push('찢김(honest)이 글에 안 실려 있다');
if (!withFake.length) bad.push('**거짓 이웃(fake)이 글에 안 실려 있다** — 어긋남의 반쪽을 안 재고 있다');
else {
  /* ④ 같은 수끼리 재야 한다 — 본 이웃 수가 곧 순위 문턱이어야 한다. */
  const wrongK = withFake.filter((d) => d.fakeOf > wp.k || d.fake > d.fakeOf).length;
  if (wrongK) bad.push(`이웃 수가 이상한 글이 ${wrongK}개 있다 (${wp.k}개를 넘거나 거짓 이웃이 이웃보다 많다)`);
  const mean = withFake.reduce((a, d) => a + d.fake / d.fakeOf, 0) / withFake.length;
  console.log(`  ④ 다시 재면 거짓 이웃 평균 ${mean.toFixed(3)} (실린 값 ${wp.fakeMean})`);
  if (Math.abs(mean - wp.fakeMean) > 0.01) bad.push(`실린 거짓 이웃 평균 ${wp.fakeMean} 이 다시 재면 ${mean.toFixed(3)} 이다`);
  /* **완벽한 지도라도 다 걸리는 잣대**를 쓰고 있지 않은지 — 100% 에 붙어 있으면 그렇다. */
  if (mean > 0.95) bad.push(`거짓 이웃이 ${(mean * 100).toFixed(0)}% 다 — 잣대가 한쪽으로 기울었을 수 있다(같은 수끼리 재고 있나)`);
}
const tearMean = withTear.reduce((a, d) => a + (1 - d.honest / 8), 0) / (withTear.length || 1);
if (Math.abs(tearMean - (wp.tearMean ?? -1)) > 0.01) bad.push(`실린 찢김 평균 ${wp.tearMean} 이 다시 재면 ${tearMean.toFixed(3)} 이다`);

// ── ②③ 화면 ────────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[warp] playwright·번들 중 없는 게 있다 — 화면 확인 건너뜀');
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
  await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), { timeout: 30000 });

  const ink = () => page.evaluate(() => {
    const cv = document.querySelector('#host .atlas-canvas');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) * (d[i + 3] / 255);
    return Math.round(s / 1000);
  });

  const text0 = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
  /* ③ 찢김을 **찢김이라 부르나** — 옛 말(「옆에 있어도 남남」)을 찢김에 붙이면 안 된다. */
  const saysTear = /찢김/.test(text0);
  const saysFake = /거짓 이웃/.test(text0);
  const saysBoth = text0.includes(`${Math.round(wp.fakeMean * 100)}%`);
  console.log(`  ③ 읽는 법 — 찢김 ${saysTear ? '○' : '✗'} · 거짓 이웃 ${saysFake ? '○' : '✗'} · 수 ${saysBoth ? '○' : '✗'}`);
  if (!saysTear) bad.push('읽는 법 띠가 **찢김**을 안 적는다');
  if (!saysFake) bad.push('읽는 법 띠가 **거짓 이웃**을 안 적는다');
  if (!saysBoth) bad.push('읽는 법 띠가 거짓 이웃 수를 안 적는다');

  await page.click('#host [data-more]');
  const before = await ink();
  await page.click('#host [data-warp]');
  await page.waitForTimeout(200);
  const after = await ink();
  const info = await page.evaluate(() => window.__atlasWarp);
  const grew = after > before;
  console.log(`  ② 켜면 — 칸 ${info?.cells}개 (찢김 ${info?.tear} · 거짓 이웃 ${info?.fake}) · 화면 빛 ${before}→${after}`);
  if (!info || !(info.cells > 10)) bad.push(`칠할 칸이 ${info?.cells}개뿐이다 — 바탕이 안 그려진다`);
  if (!grew) bad.push('어긋남을 켰는데 화면이 그대로다 — 안 칠하고 있다');
  /* 두 축이 **서로 다른 것**을 재는지 — 같은 수면 한 축만 있는 셈이다. */
  if (info && Math.abs(info.tear - info.fake) < 0.005) {
    bad.push(`칸의 찢김(${info.tear})과 거짓 이웃(${info.fake})이 같다 — 두 축이 같은 것을 재고 있다`);
  }
  await page.close();
  await browser.close();
}

if (bad.length) {
  console.log('[warp] **어긋남을 반쪽만 재거나, 그 자리에 안 칠한다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 honestyPerDoc·falseNeighbours · memo-atlas.ts 의 warpGrid 를 봐라.');
  process.exit(1);
}
console.log(`[warp] 찢김 ${wp.tearMean} · 거짓 이웃 ${wp.fakeMean} — 둘 다 재고, 그 자리에 칠하고, 이름을 바로 부른다`);
