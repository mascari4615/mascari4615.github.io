#!/usr/bin/env node
/**
 * audit-atlas-delta. **굽은 2차원으로 도망갈 수 있나** (TASK-KAR-233).
 *
 * 앞 바퀴에서 우리 자료가 **약 18차원**임을 쟀다. 평평한 2차원이 모자란다는 뜻이고, 바로
 * 나오는 대안이 **굽은 2차원**(쌍곡, 푸앵카레). 자리가 지수적으로 많아 2차원 푸앵카레가
 * 100차원 유클리드와 맞먹는다는 보고가 있다(Nickel & Kiela, NIPS 2017).
 *
 * ⚠ 그런데 그건 **나무처럼 뻗은 자료에만** 듣는다. 그 논문 리뷰에 텍스트 코퍼스는 여러
 * 계보가 동시에 있어 2차원에 다 못 담는다가 그대로 적혀 있다. 그래서 **쓰기 전에 잰다** . 
 * 우리 습관 그대로 고치기 전에 재기. 그리고 **아니라고 나오면 안 만드는 것도 통과다.**
 *
 * ★ **재 봤고, 아니다.** δ_rel 평균 **0.0586** 인데 **우리와 같은 축 384개짜리 순수 잡음이
 * 0.0258** 이다. 잡음보다도 **2.3배 덜** 나무 같다. 굽은 2차원으로 옮겨도 소용없다.
 *
 * ★★ **가는 길에 함정을 하나 잡았다.** 축을 마구 섞은 대조군이 **더 작게**(0.0265) 나왔다.
 * 고차원에서 상관을 없애면 거리가 서로 비슷해지고, 그러면 네 점의 거리합 차이가 줄어
 * δ 가 작아진다. **나무 같아진 게 아니라 잴 것이 사라진 것**이다. 그래서 잡음 기준선을
 * 남의 집 20차원이 아니라 **우리 축 수에서** 다시 쟀다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 그롬프 곱 4점 규칙을 직접 구현하고 δ_rel = 2δ/지름 으로 정규화, **최대와 평균 둘 다**
 *  ② 눈금. 나무, 격자, 구면, 난수가 **알려진 순서대로** 나온다
 *  ③ 우리 값을 **섞은 대조군**과 나란히 적는다
 *  ④ 화면이 굽은 2차원이 도움이 될 자료인가를 적고, **아니면 아니라고 말한다**
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

/* ── ② 눈금은 **지도가 없어도 돈다**. 자가 스스로 δ 를 셀 줄 알아야 한다 ─────── */
function deltaHyp(n, d, trials, seed = 99) {
  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  let mx = 0; let sum = 0; let cnt = 0; let diam = 0;
  for (let t = 0; t < trials; t += 1) {
    const x = Math.floor(rnd() * n); const y = Math.floor(rnd() * n);
    const z = Math.floor(rnd() * n); const w = Math.floor(rnd() * n);
    if (x === y || x === z || x === w || y === z || y === w || z === w) continue;
    const s1 = d(x, y) + d(z, w); const s2 = d(x, z) + d(y, w); const s3 = d(x, w) + d(y, z);
    const a = Math.max(s1, s2, s3);
    const b = Math.max(Math.min(s1, s2), Math.min(Math.max(s1, s2), s3));
    const v = (a - b) / 2;
    if (v > mx) mx = v;
    sum += v; cnt += 1;
    const dm = Math.max(d(x, y), d(x, z), d(x, w), d(y, z), d(y, w), d(z, w));
    if (dm > diam) diam = dm;
  }
  return { relMean: diam > 0 ? (2 * (sum / cnt)) / diam : 0, relMax: diam > 0 ? (2 * mx) / diam : 0 };
}
{
  /* 나무는 정의상 0-쌍곡. 여기서 0 이 안 나오면 셈이 틀렸다. */
  const depth = 9; const N = (1 << depth) - 1;
  const par = (i) => (i - 1) >> 1;
  const dep = (i) => Math.floor(Math.log2(i + 1));
  const dTree = (a, b) => { let x = a; let y = b; let s = 0; while (x !== y) { if (dep(x) >= dep(y)) { x = par(x); s += 1; } else { y = par(y); s += 1; } } return s; };
  const tree = deltaHyp(N, dTree, 20000);
  const side = 40;
  const dGrid = (a, b) => Math.abs((a % side) - (b % side)) + Math.abs(Math.floor(a / side) - Math.floor(b / side));
  const grid = deltaHyp(side * side, dGrid, 20000);
  console.log(`  ② 눈금(자가 직접). 나무 ${tree.relMean.toFixed(4)}, 격자 ${grid.relMean.toFixed(4)}`);
  if (tree.relMean > 0.001) bad.push(`나무의 δ_rel 이 ${tree.relMean.toFixed(4)} 다. 나무는 정의상 0 이어야 한다(셈이 틀렸다)`);
  if (!(grid.relMean > tree.relMean * 5)) bad.push(`격자(${grid.relMean.toFixed(4)})가 나무(${tree.relMean.toFixed(4)})보다 뚜렷이 크지 않다`);
}

if (!fs.existsSync(ATLAS)) { console.log('[delta] 지도가 없다. 실린 값 확인 건너뜀'); process.exit(bad.length ? 1 : 0); }
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const D = atlas.delta;
if (!D) {
  if (isFake(ATLAS)) { console.log('[delta] 가짜 지도다. 나무 같은 정도는 진짜 굽기에서만 잰다'); process.exit(0); }
  console.log('[delta] **나무 같은 정도가 안 실려 있다** (delta). 굽은 2차원이 맞는 처방인지 안 물었다');
  process.exit(1);
}

console.log(`  ① 우리 자료. δ_rel 평균 ${D.ours.relMean}, 최대 ${D.ours.relMax} (4점 ${D.ours.trials}번)`);
console.log('  ② 눈금. ' + D.calibration.map((c) => `${c.shape} ${c.relMean}`).join(', '));
console.log(`  ③ 대조군. 축을 섞으면 ${D.shuffled.relMean}, 우리 축 ${D.dim}개짜리 순수 잡음 ${D.matched}`);
console.log(`  ④ 판정. 나무와 잡음 사이 ${(D.where * 100).toFixed(0)}% 자리`
  + ` = ${D.treeLike ? '굽은 2차원이 도움이 될 자료다' : '**굽은 2차원으로 옮겨도 소용없다**'}`);

/* ① 최대와 평균을 **둘 다**. 최대만 보면 이상치 네 점 하나에 끌려간다. */
if (!(D.ours.relMean > 0) || !(D.ours.relMax > 0)) bad.push('δ_rel 평균과 최대 중 빠진 것이 있다');
if (!(D.ours.relMax > D.ours.relMean)) bad.push(`최대(${D.ours.relMax})가 평균(${D.ours.relMean})보다 크지 않다. 셈이 이상하다`);
if (!(D.ours.trials > 10000)) bad.push(`4점을 ${D.ours.trials}번만 뽑았다. 어림이 못 미덥다`);

/* ② 눈금이 알려진 순서대로. 나무가 가장 작아야 한다. */
const cal = Object.fromEntries(D.calibration.map((c) => [c.shape, c.relMean]));
if (!(cal['나무'] <= 0.001)) bad.push(`실린 눈금에서 나무의 δ_rel 이 ${cal['나무']} 다. 0 이어야 한다`);
if (!(cal['격자'] > cal['나무'])) bad.push('격자가 나무보다 나무 같다고 나온다. 눈금이 뒤집혔다');
if (!(cal['구면'] > cal['나무'])) bad.push('구면이 나무보다 나무 같다고 나온다. 눈금이 뒤집혔다');

/* ★ ③ **우리 축 수에서 잰 잡음 기준선**이 있어야 한다. 이게 이번 바퀴의 핵심 교정이다. */
const matched = D.calibration.find((c) => c.matched);
if (!matched) {
  bad.push('우리 축 수에서 잰 잡음 기준선이 없다. 거리 집중 때문에 δ_rel 이 작아지는 것을 못 가른다');
} else if (Math.abs(matched.relMean - (D.matched ?? -1)) > 1e-6) {
  bad.push(`실린 잡음 기준선 ${D.matched} 이 눈금표의 ${matched.relMean} 과 다르다`);
}
/* 판정이 수와 맞나. 잡음보다 크면 나무 아님이어야 한다. */
if (D.matched != null) {
  const should = D.ours.relMean < D.matched;
  if (D.treeLike !== should) {
    bad.push(`${D.treeLike ? '나무 같다' : '나무 아니다'}고 적혀 있는데 수는 반대다`
      + ` (우리 ${D.ours.relMean} vs 같은 축 수 잡음 ${D.matched})`);
  }
}
const now = atlas.docs.filter((d) => d.xy).length;
if (D.n && Math.abs(now - D.n) > Math.max(50, now * 0.05)) bad.push(`글 ${D.n}편에서 쟀는데 지금은 ${now}편이다. 다시 재라`);

// ── ④ 화면 ──────────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[delta] playwright, 번들 중 없는 게 있다. 화면 확인 건너뜀');
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
  const saysD = text.includes(String(D.ours.relMean));
  const saysNoise = D.matched != null && text.includes(String(D.matched));
  const saysWhy = /잴 것이 없어서/.test(text);
  const saysVerdict = D.treeLike ? /도움이 될 자료다/.test(text) : /소용없다/.test(text);
  console.log(`  ④ 화면. δ ${saysD ? '○' : '✗'}, 같은 축 수 잡음 ${saysNoise ? '○' : '✗'}`
    + `, 함정 설명 ${saysWhy ? '○' : '✗'}, 판정 ${saysVerdict ? '○' : '✗'}`);
  if (!saysD) bad.push('화면이 우리 δ_rel 을 안 적는다');
  if (!saysNoise) bad.push('화면이 **우리 축 수에서 잰 잡음 기준선**을 안 적는다. 0.0586 이 큰지 작은지 알 수 없다');
  if (!saysWhy) bad.push('화면이 **거리 집중 함정**을 안 적는다. 섞으면 더 작아지는 것을 보고 오독하게 된다');
  if (!saysVerdict) bad.push('화면이 굽은 2차원이 도움이 되나의 답을 안 적는다. 다음 사람이 같은 것을 또 해 본다');
  await browser.close();
}

if (bad.length) {
  console.log('[delta] **나무 같은 정도를 제대로 재지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 deltaHyp, deltaOf, deltaCalibration 을 봐라.');
  process.exit(1);
}
console.log(`[delta] δ_rel ${D.ours.relMean}. 나무 0 과 같은 축 수 잡음 ${D.matched} 사이에서 재고,`
  + ` ${D.treeLike ? '간다' : '**안 간다**'}고 화면이 적는다`);
