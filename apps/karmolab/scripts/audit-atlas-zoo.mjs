#!/usr/bin/env node
/**
 * audit-atlas-zoo. **우리가 적는 수는 몇 개인가** (TASK-KAR-233).
 *
 * 근거: *Metric Design != Metric Behavior* (arXiv 2507.02225, 2025). 자료 96종에 투영
 * 300개씩(기법 40종) 얹어 재 보니 DR 품질 잣대는 **설계 의도가 실제 거동을 못 맞혔다** . 
 * 가장 큰 무리에 국소, 덩어리, 전역이 뒤섞여 있었다. 위험은 이렇게 적혀 있다:
 * 상관 높은 잣대를 여럿 대면 **그 성질만 최적화한 기법 쪽으로 평가가 기운다.**
 *
 * ★ 우리에게 그대로 걸린다. 화면에 수를 아홉 개 적으면서 **그게 아홉 개인지 하나인지**
 * 재 본 적이 없다. 수를 많이 적는 게 정직해 보이지만, 같은 말을 아홉 번 하면 한 번이다.
 *
 * 합격선(재기 **전에** 정본 문서에 박아 뒀다):
 *  ① 판 40개 이상, 잣대 8개 이상
 *  ② **심은 대조군 둘**. 같은 잣대를 절반 표본으로 두 번 잰 **쌍둥이**는 반드시 같은 무리,
 *     판마다 뽑은 **무작위 수**는 **혼자 무리를 이뤄야** 한다. 어긋나면 셈이 틀린 것이다
 *     (문턱은 손으로 안 고른다. 판 순서를 섞어 200번 낸 최대 |ρ| 의 95분위를 쓴다.
 *      판이 40개면 순위상관 표준오차가 0.16 이라, 손으로 박은 0.2 는 상시 빨강이 된다)
 *  ③ 무리는 팔꿈치로 자르고, **같은 말 하는 쌍**(|ρ| ≥ 0.9)을 화면에 그대로 적는다
 *  ④ 우리 수가 전부 한 무리로 뭉치면 **여럿 댄 척했지만 하나였다**고 적는다. 그것도 결과다
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

if (!fs.existsSync(ATLAS)) { console.log('[zoo] 지도가 없다. 검사 건너뜀'); process.exit(0); }
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const Z = atlas.zoo;
if (!Z) {
  if (isFake(ATLAS)) { console.log('[zoo] 가짜 지도다. 잣대 중복은 진짜 굽기에서만 잰다'); process.exit(0); }
  console.log('[zoo] **잣대끼리 얼마나 같은 말을 하는지 재 본 표가 없다** (zoo)');
  console.log('  `npm run atlas -- --잣대` 로 한 번 재야 한다');
  console.log('  안 잰 것은 통과도 실패도 아니다. 지도를 그 자리 없이 구웠을 뿐이다 (2026-09-01).');
  process.exit(2);
}

const L = (k) => (Z.label && Z.label[k]) || k;
/* 심은 대조군이 낀 쌍은 겹침 수에서 뺀다. 쌍둥이는 겹치라고 넣은 것이다. */
const isCtl = (k) => k === 'noise' || k === 'keep10b';
const dupReal = Z.dup.filter((d) => !isCtl(d.a) && !isCtl(d.b));
console.log(`  ① 판 ${Z.runs}개(글 ${Z.n}편, ${Z.dim}차원) 위에서 잣대 ${Z.names.length}개`);
console.log(`  ② 심은 대조군. 쌍둥이 ρ ${Z.twin.rho} (같은 무리 ${Z.twin.same ? '○' : '✗'})`
  + `, 무작위 수 최대 |ρ| ${Z.noiseCtl.max} vs ${L(Z.noiseCtl.with)}`
  + ` (섞어 만든 밴드 ${Z.noiseCtl.limit}, 혼자 무리 ${Z.noiseCtl.alone ? '○' : '✗'})`);
console.log('  ③ 무리. ' + Z.clusters.map((c) => `[${c.members.map(L).join(', ')}]→${L(c.rep)}`).join(' '));
console.log(`  ④ **우리 잣대 ${Z.real}개는 사실 ${Z.eff}개**, 같은 말 하는 쌍 ${dupReal.length}개`
  + (dupReal.length ? ` (첫째 ${L(dupReal[0].a)}↔${L(dupReal[0].b)} ρ ${dupReal[0].rho})` : ''));

/* ── ① 폭이 있어야 상관이 뜻을 가진다 ───────────────────────────────── */
if (!(Z.runs >= 40)) bad.push(`판이 ${Z.runs}개뿐이다. 사전 등록은 40개 이상이다`);
if (!(Z.real >= 8)) bad.push(`잣대가 ${Z.real}개뿐이다. 사전 등록은 8개 이상이다`);
if (!(Z.n >= 200)) bad.push(`글이 ${Z.n}편뿐이다. 이웃 잣대가 포화한다`);

/* ── ② ★ 심은 대조군. 이 자의 심장 ──────────────────────────────────
   쌍둥이가 갈리거나 무작위 수가 붙으면, 아래 사실 몇 개는 발견이 아니라 셈 오류다. */
if (!Z.twin || Z.twin.same !== true) {
  bad.push(`**쌍둥이가 같은 무리에 안 들었다** (${L(Z.twin?.a)} ↔ ${L(Z.twin?.b)} ρ ${Z.twin?.rho})`
    + '. 같은 잣대를 표본만 달리해 잰 것이라 반드시 같은 무리여야 한다. 군집, 상관 셈이 틀렸다');
}
if (!(Math.abs(Z.twin?.rho ?? 0) >= 0.8)) {
  bad.push(`쌍둥이 ρ 가 ${Z.twin?.rho} 다. 같은 잣대인데 이만큼 갈리면 잣대 자체가 표본에 흔들린다`);
}
if (Z.noiseCtl?.alone !== true) {
  bad.push('**무작위 수가 혼자 무리를 못 이뤘다**. 심은 잡음이 잣대에 붙었다는 뜻이라 셈이 틀렸다');
}
if (!(Z.noiseCtl && Z.noiseCtl.max <= Z.noiseCtl.limit)) {
  bad.push(`**무작위 수가 ${L(Z.noiseCtl?.with)} 와 |ρ| ${Z.noiseCtl?.max} 로 붙었다**`
    + ` (섞어 만든 밴드 ${Z.noiseCtl?.limit}). 우연으로 설명되는 폭을 넘었다`);
}
if (!(Z.noiseCtl?.boots >= 100)) bad.push('밴드를 만든 섞기 횟수가 없거나 너무 적다. 문턱을 손으로 박은 셈이다');
const sane = Z.twin?.same === true && Z.noiseCtl?.alone === true
  && (Z.noiseCtl?.max ?? 1) <= (Z.noiseCtl?.limit ?? 0);
if (Z.sane !== sane) bad.push('셈이 선다 판정이 대조군 둘과 어긋난다');

/* ── ③ 무리, 중복 표가 서로 맞나 (수를 지어내지 않았나) ───────────────── */
const M = Z.names.length;
if (!(Array.isArray(Z.rho) && Z.rho.length === M * M)) bad.push('상관 행렬 크기가 잣대 수와 안 맞는다');
else {
  const at = (a, b) => Z.rho[Z.names.indexOf(a) * M + Z.names.indexOf(b)];
  const should = [];
  for (let i = 0; i < M; i += 1) {
    for (let j = i + 1; j < M; j += 1) {
      if (Math.abs(Z.rho[i * M + j]) >= Z.dupAt) should.push(`${Z.names[i]}|${Z.names[j]}`);
    }
  }
  const got = new Set(Z.dup.map((d) => `${d.a}|${d.b}`));
  const missing = should.filter((k) => !got.has(k));
  if (missing.length) bad.push(`행렬엔 |ρ| ≥ ${Z.dupAt} 인데 **중복 목록에서 빠진 쌍**이 있다: ${missing.join(', ')}`);
  for (const d of Z.dup) {
    if (Math.abs(at(d.a, d.b)) < Z.dupAt) bad.push(`중복이라 적힌 ${d.a}↔${d.b} 가 행렬에선 ρ ${at(d.a, d.b)} 다`);
  }
  for (let i = 0; i < M; i += 1) if (Math.abs(Z.rho[i * M + i] - 1) > 1e-9) bad.push('제 자신과의 상관이 1이 아니다');
}
const seen = Z.clusters.flatMap((c) => c.members);
if (seen.length !== M || new Set(seen).size !== M) bad.push('무리가 잣대를 빠짐없이 한 번씩 담고 있지 않다');
for (const c of Z.clusters) if (!c.members.includes(c.rep)) bad.push(`무리 대표 ${c.rep} 가 그 무리 안에 없다`);
const realNames = Z.names.filter((k) => k !== 'noise' && k !== 'keep10b');
const ofCluster = new Map();
Z.clusters.forEach((c, ci) => c.members.forEach((m) => ofCluster.set(m, ci)));
const effCalc = new Set(realNames.map((k) => ofCluster.get(k))).size;
if (Z.eff !== effCalc) bad.push(`사실 ${Z.eff}개라 적혀 있는데 무리로 세면 ${effCalc}개다`);
if (!(Z.eff >= 1 && Z.eff <= Z.real)) bad.push(`효과적 개수 ${Z.eff} 가 1~${Z.real} 밖이다`);

// ── ④ 화면 ──────────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[zoo] playwright, 번들 중 없는 게 있다. 화면 확인 건너뜀');
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
  const saysEff = text.includes(`사실 ${Z.eff}개`);
  const saysDup = text.includes(`쌍이 ${dupReal.length}개`);
  const saysTwin = text.includes(String(Z.twin.rho));
  const saysNoise = text.includes(String(Z.noiseCtl.max));
  console.log(`  ⑤ 화면. 효과적 개수 ${saysEff ? '○' : '✗'}, 겹치는 쌍 ${saysDup ? '○' : '✗'}`
    + `, 쌍둥이 ${saysTwin ? '○' : '✗'}, 무작위 수 ${saysNoise ? '○' : '✗'}`);
  if (!saysEff) bad.push('화면이 **우리 잣대 N개는 사실 M개**를 안 적는다. 수를 여럿 적는 척만 하게 된다');
  if (!saysDup) bad.push('화면이 **같은 말 하는 쌍의 수**를 안 적는다');
  if (!saysTwin) bad.push('화면이 **심은 쌍둥이**를 안 적는다. 셈이 서는지 보여 줄 수 없다');
  if (!saysNoise) bad.push('화면이 **심은 무작위 수**를 안 적는다. 잡음이 안 붙었다는 증거가 없다');
  await browser.close();
}

if (bad.length) {
  console.log('[zoo] **잣대 중복을 제대로 재지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 metricZoo 를 봐라.');
  process.exit(1);
}
console.log(`[zoo] 잣대 ${Z.real}개는 사실 ${Z.eff}개, 겹치는 쌍 ${dupReal.length}개`
  + `, 심은 대조군 둘 통과(쌍둥이 ${Z.twin.rho} 같은 무리, 무작위 수 최대 ${Z.noiseCtl.max})`);
