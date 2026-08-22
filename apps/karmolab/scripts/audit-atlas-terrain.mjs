#!/usr/bin/env node
/**
 * audit-atlas-terrain — **선을 긋지 않고 높이를 그리나** (TASK-KAR-233).
 *
 * ThemeScape(Wise 외, SPIRE/PNNL 1995)의 은유: 글 무더기를 **산과 등고선**으로 그린다.
 * 등고선은 「여기가 빽빽하다」만 말하고 **「여기서부터 남이다」는 말하지 않는다.**
 *
 * ★ 우리가 이걸 하는 이유는 예뻐서가 아니다. 우리 수는 이미 **덩어리가 진짜로 겹쳐
 * 있다**고 말한다(표준화 중심거리 0.13~0.59 · 꿋꿋함 0.121 · 안 갈리는 까닭 = 겹침).
 * 그런데 화면은 **덩어리마다 색을 칠해** 반대말을 하고 있었다. 글과 그림을 맞추는 일이다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 밀도를 쌓아 **선으로** 등고선을 그린다 (채우기 X)
 *  ② 켜면 **덩어리 색이 흐려진다** — 화면의 색기(채도)가 실제로 떨어진다
 *  ③ 화면이 「**높이 = 몰린 정도 · 경계는 없다**」를 적는다
 *  ④ 자 — 지어낸 자료에서 **봉우리 수가 맞고, 섞으면 평평해진다**
 *  ⑤ 봉우리를 **높이로 자르지 않는다** — 두드러짐(ToMATo)으로 세고, 문턱은 되뽑기로 낸다(AuToMATo)
 *
 * ★ 「높낮이 0.2 면 지형이 있다」로 처음 재려다 **물어 보니 안 물었다**(고르게 흩은 지도를
 * 넣었는데 초록). 점 1516개를 고르게 흩어도 푸아송 요동으로 0.16 이 나온다 — 문턱이
 * 잡음 안에 있었다. 그래서 이 자는 **같은 수를 고르게 흩은 바탕값과 견준다.**
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
const bad = [];

if (!fs.existsSync(ATLAS) || !fs.existsSync(BUNDLE)) {
  console.log('[terrain] 지도나 번들이 없다 — 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium) {
  console.log('[terrain] playwright 가 없다 — 검사 건너뜀');
  process.exit(0);
}

const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
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

// ── ④ 눈금 — **지어낸 자료**를 화면과 **같은 코드**에 먹인다 ────────────────
const cal = await page.evaluate(() => {
  const probe = window.__atlasTerrainProbe;
  if (typeof probe !== 'function') return null;
  let s = 12345;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const gauss = () => {
    const u = Math.max(1e-9, rnd());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
  const clamp = (v) => Math.min(0.999, Math.max(0.001, v));
  const blobs = [[0.22, 0.24], [0.76, 0.28], [0.5, 0.8]];
  const three = [];
  for (const [cx, cy] of blobs) {
    for (let i = 0; i < 400; i += 1) three.push([clamp(cx + gauss() * 0.045), clamp(cy + gauss() * 0.045)]);
  }
  const one = [];
  for (let i = 0; i < 1200; i += 1) one.push([clamp(0.5 + gauss() * 0.05), clamp(0.5 + gauss() * 0.05)]);
  const flat = [];
  for (let i = 0; i < 1200; i += 1) flat.push([rnd(), rnd()]);
  return { three: probe(three), one: probe(one), flat: probe(flat) };
});
if (!cal) {
  bad.push('지어낸 자료를 먹여 볼 창구(__atlasTerrainProbe)가 없다 — 자가 화면과 다른 코드를 재게 된다');
} else {
  console.log(`  ④ 눈금 — 봉우리 셋: ${cal.three.peaks}개(높낮이 ${cal.three.relief})`
    + ` · 하나: ${cal.one.peaks}개(${cal.one.relief})`
    + ` · **마구 섞으면**: ${cal.flat.peaks}개(${cal.flat.relief})`);
  if (cal.three.peaks !== 3) bad.push(`봉우리 셋을 지어냈는데 ${cal.three.peaks}개로 센다`);
  if (cal.one.peaks !== 1) bad.push(`봉우리 하나를 지어냈는데 ${cal.one.peaks}개로 센다`);
  if (!(cal.three.relief > 0.5)) bad.push(`봉우리가 뚜렷한데 높낮이가 ${cal.three.relief} 뿐이다`);
  /* 바탕값이 **자료 수에 따라** 나와야 한다 — 박아 둔 상수면 견주는 뜻이 없다. */
  if (!(cal.flat.base > 0 && Math.abs(cal.flat.relief - cal.flat.base) < 0.12)) {
    bad.push(`고르게 흩은 자료의 높낮이 ${cal.flat.relief} 와 바탕값 ${cal.flat.base} 이 딴판이다 — 바탕값이 자료 수를 안 본다`);
  }
  /* ★ **섞으면 평평해져야 한다** — 안 그러면 등고선은 자료가 아니라 알고리즘의 무늬다. */
  if (!(cal.flat.relief < cal.three.relief * 0.4)) {
    bad.push(`마구 섞어도 높낮이가 ${cal.flat.relief} 다 (봉우리 셋은 ${cal.three.relief}) — 지형이 자료의 것이 아니다`);
  }
  if (!(cal.three.lines > 20)) bad.push(`등고선 선분이 ${cal.three.lines}개뿐이다 — 선을 안 낸다`);
}

// ── ①②③ 화면 ──────────────────────────────────────────────────────────
/** 색기(채도) 합 — 회색 선이 늘어도 안 오르고, 색점이 흐려지면 떨어진다. */
const look = () => page.evaluate(() => {
  const cv = document.querySelector('#host .atlas-canvas');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let ink = 0; let sat = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    const r = d[i] * a; const g = d[i + 1] * a; const b = d[i + 2] * a;
    ink += r + g + b;
    sat += Math.max(r, g, b) - Math.min(r, g, b);
  }
  return { ink: Math.round(ink / 1000), sat: Math.round(sat / 1000) };
});

await page.click('#host [data-more]');
const before = await look();
const off = await page.evaluate(() => window.__atlasTerrain);
if (off && off.on) bad.push('켜지도 않았는데 지형이 켜져 있다');

await page.click('#host [data-terrain]');
await page.waitForTimeout(250);
const after = await look();
const info = await page.evaluate(() => window.__atlasTerrain);
console.log(`  ① 켜면 — 봉우리 ${info?.peaks}개 · 등고선 선분 ${info?.lines}개 (${info?.bands}겹)`
  + ` · 높낮이 ${info?.relief} · 화면 빛 ${before.ink}→${after.ink}`);
if (!info?.on) bad.push('켰는데 지형이 안 켜졌다');
if (!(info?.lines > 50)) bad.push(`등고선 선분이 ${info?.lines}개뿐이다 — 선을 안 그린다`);
if (after.ink === before.ink) bad.push('지형을 켰는데 화면이 한 픽셀도 안 달라졌다');
/* ★ **바탕값과 견준다** — 절대값 문턱은 잡음 안에 있어서 아무것도 못 잡았다. */
if (!(info?.base > 0)) bad.push('고르게 흩은 점의 바탕값이 안 실려 있다 — 그것 없이 「높낮이 N」은 아무 뜻이 없다');
else {
  const ratio = info.relief / info.base;
  console.log(`  ④ 우리 높낮이 ${info.relief} · 같은 수를 **고르게 흩으면** ${info.base} → ${ratio.toFixed(2)}배`);
  if (!(ratio > 1.5)) {
    bad.push(`우리 높낮이 ${info.relief} 가 고르게 흩은 점의 ${ratio.toFixed(2)}배뿐이다 — 등고선이 자료가 아니라 알고리즘의 무늬다`);
  }
}

console.log(`  ② 색기 ${before.sat} → ${after.sat}`
  + ` (${before.sat ? Math.round((after.sat / before.sat - 1) * 100) : 0}%)`);
if (!(after.sat < before.sat * 0.85)) {
  bad.push(`지형을 켜도 덩어리 색이 그대로다 (색기 ${before.sat}→${after.sat}) — 그림이 아직 「여긴 한 무리」라고 우긴다`);
}

const text = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
const saysHeight = /높이\s*=\s*몰린 정도/.test(text);
const saysNoEdge = /경계는 없다/.test(text);
const saysPeaks = text.includes(`봉우리 ${info?.peaks}개`);
const saysBase = text.includes(`${info?.base}`);
if (!saysBase) bad.push('화면이 **고르게 흩었을 때의 바탕값**을 안 적는다 — 「높낮이 N」이 발견처럼 읽힌다');
console.log(`  ③ 화면 — 「높이 = 몰린 정도」 ${saysHeight ? '○' : '✗'} · 「경계는 없다」 ${saysNoEdge ? '○' : '✗'}`
  + ` · 봉우리 수 ${saysPeaks ? '○' : '✗'}`);
if (!saysHeight) bad.push('화면이 「높이 = 몰린 정도」를 안 적는다');
if (!saysNoEdge) bad.push('화면이 **「경계는 없다」**를 안 적는다 — 등고선을 무리 표시로 오해하게 둔다');
if (!saysPeaks) bad.push('화면이 봉우리 수를 안 적는다');


// ── ⑤ **봉우리를 높이로 자르지 않는다** (ToMATo / AuToMATo) ────────────────
/* 고정 자르기(꼭대기의 55%)는 **밀도가 서로 다른 봉우리를 하나로 뭉갠다.** 그래서
   문턱을 손으로 고르는 대신 **두드러짐**(안장에서 낮은 쪽이 죽는다)으로 세고, 그
   문턱마저 **되뽑기**로 낸다. 이 자는 둘을 **나란히** 재서 고정 자르기가 지는 것을 본다. */
const tom = await page.evaluate(() => {
  const probe = window.__atlasTerrainProbe;
  if (typeof probe !== 'function') return null;
  let s = 12345;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const gauss = () => { const u = Math.max(1e-9, rnd()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const cl = (v) => Math.min(0.999, Math.max(0.001, v));
  const blob = (cx, cy, n, sd) => { const p = []; for (let i = 0; i < n; i += 1) p.push([cl(cx + gauss() * sd), cl(cy + gauss() * sd)]); return p; };
  const noise = (n) => { const p = []; for (let i = 0; i < n; i += 1) p.push([rnd(), rnd()]); return p; };
  return {
    /* 잡음 섞인 세 봉우리 — 둘 다 3개를 내야 한다. */
    noisy: probe([...blob(0.22, 0.24, 400, 0.045), ...blob(0.76, 0.28, 400, 0.045), ...blob(0.5, 0.8, 400, 0.045), ...noise(300)]),
    /* ★ **결정적 판** — 짙은 무리(700개) 옆에 옅은 무리(150개). 고정 자르기는 옅은 쪽을 못 본다. */
    unequal: probe([...blob(0.25, 0.5, 700, 0.05), ...blob(0.75, 0.5, 150, 0.05)]),
    one: probe(blob(0.5, 0.5, 1200, 0.05)),
    flat: probe(noise(1200)),
  };
});
if (!tom) bad.push('두드러짐으로 세는 창구가 없다');
else {
  console.log(`  ⑤ 두드러짐 — 잡음 낀 셋 ${tom.noisy.peaks}개(고정 ${tom.noisy.cutPeaks})`
    + ` · **짙은 무리 옆 옅은 무리 ${tom.unequal.peaks}개(고정 ${tom.unequal.cutPeaks})**`
    + ` · 하나 ${tom.one.peaks}(${tom.one.cutPeaks}) · 마구 섞으면 ${tom.flat.peaks}(${tom.flat.cutPeaks})`);
  console.log(`     문턱 — 잡음 낀 셋 ${tom.noisy.cut} (되뽑기 ${tom.noisy.runs}판 · α ${tom.noisy.alpha})`
    + ` · 두드러짐 ${JSON.stringify(tom.noisy.bars.slice(0, 4))}`);
  if (tom.noisy.peaks !== 3) bad.push(`잡음 낀 봉우리 셋을 ${tom.noisy.peaks}개로 센다`);
  if (tom.one.peaks !== 1) bad.push(`봉우리 하나를 ${tom.one.peaks}개로 센다`);
  if (tom.flat.peaks !== 1) bad.push(`마구 섞은 점을 ${tom.flat.peaks}개 봉우리로 센다 — 없는 봉우리를 만든다`);
  /* ★ 이게 이 대목의 핵심 — **고정 자르기가 져야** 상수를 버린 뜻이 있다. */
  if (tom.unequal.peaks !== 2) {
    bad.push(`짙은 무리 옆 옅은 무리를 ${tom.unequal.peaks}개로 센다 (2개여야 한다) — 두드러짐이 일을 안 한다`);
  }
  if (tom.unequal.cutPeaks !== 1) {
    bad.push(`고정 자르기가 옅은 무리를 ${tom.unequal.cutPeaks}개로 센다 — 원래 못 보던 판인데 지금은 본다(대조군이 죽었다)`);
  }
  /* 문턱이 **되뽑기에서 나온 값**인가 — 박아 둔 상수면 자료가 달라져도 안 움직인다. */
  if (!(tom.noisy.runs > 0)) bad.push('되뽑기 판 수가 안 실려 있다');
  if (!(tom.noisy.cut > 0 && Math.abs(tom.noisy.cut - tom.one.cut) > 1e-9)) {
    bad.push(`문턱이 자료를 안 본다 (잡음 낀 셋 ${tom.noisy.cut} · 하나 ${tom.one.cut}) — 박아 둔 상수다`);
  }
}
/* 화면이 **어디서 온 수인지** 적나 — 안 적으면 손으로 고른 값처럼 읽힌다. */
const saysCut = text.includes(`문턱 ${info?.cut}`) && text.includes(`${info?.runs}판`);
console.log(`  ⑤ 화면이 문턱·판 수를 적나 ${saysCut ? '○' : '✗'} (문턱 ${info?.cut} · ${info?.runs}판 · 옛 방식이면 ${info?.cutPeaks}개)`);
if (!saysCut) bad.push('화면이 두드러짐 문턱과 되뽑기 판 수를 안 적는다 — 봉우리 수가 손으로 고른 값처럼 읽힌다');

/* 끄면 도로 색이 산다 — 끄기가 안 되면 「켜 봤다」가 아니라 「돌이킬 수 없다」다. */
await page.click('#host [data-terrain]');
await page.waitForTimeout(250);
const back = await look();
console.log(`  ① 끄면 — 색기 ${back.sat} (켜기 전 ${before.sat})`);
if (Math.abs(back.sat - before.sat) > before.sat * 0.05) {
  bad.push(`껐는데 색기가 안 돌아온다 (${before.sat} → ${back.sat})`);
}
await browser.close();

if (bad.length) {
  console.log('[terrain] **선을 긋지 않고 높이를 그리는 데 실패했다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  memo-atlas.ts 의 densityField·contourAt·peaksAt 를 봐라.');
  process.exit(1);
}
console.log('[terrain] 밀도를 선으로 그리고, 켜면 색이 물러나고, 섞으면 평평해진다 — 경계는 안 긋는다');
