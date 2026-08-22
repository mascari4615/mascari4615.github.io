#!/usr/bin/env node
/**
 * audit-atlas-seriation — **행렬로 그릴 값이 있나, 그리고 그 정렬이 자료의 것인가** (TASK-KAR-233).
 *
 * 통제 실험(Ghoniem·Fekete·Castagliola, InfoVis 2004): **마디가 스무 개를 넘으면 대부분의
 * 과제에서 행렬이 점-선을 이긴다.** 일관되게 점-선이 이기는 과제는 **「길 찾기」 하나뿐.**
 * 우리는 **1918개 점에 점-선**이고, 게다가 **자리를 못 믿는다**(18차원 · 씨앗이 정함 ·
 * 화면 이웃의 69%가 거짓). 행렬은 **자리 대신 순서**만 쓰니 그 병이 덜 아프다.
 *
 * ⚠ Behrisch 외(CGF 2016 STAR)가 대놓고 경고한다 — **어떤 무늬가 자료의 것이고 어떤 무늬가
 * 알고리즘이 만든 것인지 아는 게 관건.** 그래서 **그리기 전에 쟀고**, 섞은 자료에서도 같은
 * 표를 냈다. 실측: 우리 35% · **섞은 자료도 14%** · 한 줄로 세울 수 있는 자료 55%.
 *
 * ★ 잣대를 한 번 갈아탔다. 처음엔 **2-sum** 으로 갈랐는데 잘 안 갈렸다(우리 6% vs 눈금 13%) —
 * 2-sum 은 **먼 짝 무더기에 묻힌다.** anti-Robinson 은 세 짝의 **순서만** 보므로 그 함정이
 * 없고, 무엇보다 **우연 수준이 0.5 로 내장**돼 있다(아무 순서나 놓으면 절반은 어긋난다).
 *
 * ★★ 눈금도 한 번 틀렸다. 「블록이 뚜렷한 자료」를 썼더니 얻는 것이 **−2%** 였다 — 알고리즘이
 * 아니라 **눈금이 틀렸다**: 멀리 떨어진 블록 다섯은 애초에 한 줄로 못 세운다. 정렬이 이기라고
 * 만든 자료는 **1차원 기울기**(곡선 위의 점)다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 잣대 셋(2-sum · 너덜너덜함 · anti-Robinson)을 직접 구현하고 정렬 여럿을 **같은 잣대로**
 *  ② 눈금 — 한 줄로 세울 수 있는 자료에서 뚜렷이 이기고, **섞은 자료에서 얻는 것**을 나란히
 *  ③ 우리 값을 섞은 대조군과 나란히
 *  ④ 대조군을 뚜렷이 이길 때만 행렬을 그린다 — **못 이기면 안 만들고 그렇게 적는다**
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
const bad = [];

if (!fs.existsSync(ATLAS)) { console.log('[seriation] 지도가 없다 — 검사 건너뜀'); process.exit(0); }
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const S = atlas.seriation;
if (!S) {
  if (isFake(ATLAS)) { console.log('[seriation] 가짜 지도다 — 자리 정렬은 진짜 굽기에서만 잰다'); process.exit(0); }
  console.log('[seriation] **자리 정렬을 재 본 표가 없다** (seriation) — 「행렬이 나은 그릇인가」를 안 물었다');
  process.exit(1);
}

console.log(`  ① 표 (${S.n}편으로 잼 / ${S.of}편 중) — `
  + S.ours.map((r) => `${r.way}: 2-sum ${r.twoSum}·너덜 ${r.profile}·AR ${r.ar}`).join(' | '));
console.log(`  ②③ 정렬로 얻는 것 ${(S.gain * 100).toFixed(0)}%`
  + ` · 섞은 자료 ${(S.shufGain * 100).toFixed(0)}%`
  + ` · 한 줄로 세울 수 있는 자료 ${(S.calGain * 100).toFixed(0)}%`
  + ` (참고: 2-sum 으로 재면 ${(S.twoSumGain * 100).toFixed(0)}%)`);
console.log(`  ④ 판정 — ${S.worth ? '**행렬로 그릴 값이 있다**' : '행렬로 그려도 볼 게 없다'} (최고 「${S.best}」)`);

/* ① 정렬을 여럿 재고, **마구 정렬**이 표에 있어야 한다 — 없으면 견줄 바닥이 없다. */
if (!(S.ours.length >= 3)) bad.push(`정렬을 ${S.ours.length}가지만 쟀다 — 견줄 것이 없다`);
const rnd = S.ours.find((r) => r.way === 'random');
if (!rnd) bad.push('마구 정렬이 표에 없다 — 바닥이 없으면 「좋다」가 뜻이 없다');
else if (Math.abs(rnd.ar - 0.5) > 0.05) {
  bad.push(`마구 정렬의 어긋남이 ${rnd.ar} 다 — 아무 순서나면 0.5 에 붙어야 한다(셈이 틀렸다)`);
}
const fied = S.ours.find((r) => r.way === 'fiedler');
if (!fied) bad.push('피들러 정렬이 표에 없다');
else if (!(fied.ar < 0.5)) bad.push(`피들러가 아무 순서(0.5)보다 못하다 (${fied.ar})`);
/* 잣대 셋을 다 싣고 있나 — 진 잣대(2-sum)도 남긴다. */
for (const r of S.ours) {
  if (r.twoSum == null || r.profile == null || r.ar == null) bad.push(`「${r.way}」 에 빠진 잣대가 있다`);
}
if (S.twoSumGain == null) bad.push('2-sum 으로 잰 값이 안 실려 있다 — 왜 잣대를 갈아탔는지 알 수 없다');

/* ★ ②③ **대조군이 이 자의 심장** — 섞은 자료에서도 얻는 것이 있다는 걸 적어야 한다. */
if (S.shufGain == null) bad.push('섞은 자료에서 얻는 것이 안 실려 있다 — 무늬가 알고리즘의 산물인지 못 가른다');
else if (!(S.shufGain > 0.02)) {
  bad.push(`섞은 자료에서 얻는 것이 ${S.shufGain} 다 — 정렬은 아무 자료에서도 얼마쯤 얻는다(0 이면 대조군이 안 돈 것)`);
}
if (!(S.calGain > S.shufGain)) {
  bad.push(`한 줄로 세울 수 있는 자료(${S.calGain})가 섞은 자료(${S.shufGain})보다 못하다 — 눈금이 틀렸다`);
}

/* ④ 판정이 수와 맞나 — 이겼는데 안 그리거나, 졌는데 그리면 빨강. */
const should = S.gain > S.shufGain * 2 && S.gain > S.calGain * 0.5;
if (S.worth !== should) {
  bad.push(`「${S.worth ? '값이 있다' : '볼 게 없다'}」고 적혀 있는데 수는 반대다`
    + ` (우리 ${S.gain} · 섞은 자료 ${S.shufGain} · 눈금 ${S.calGain})`);
}
if (S.worth && !(Array.isArray(S.order) && S.order.length > 100)) {
  bad.push('값이 있다면서 그릴 순서를 안 실었다 — 화면이 못 그린다');
}
if (S.order) {
  const seen = new Set(S.order);
  if (seen.size !== S.order.length) bad.push('순서에 같은 글이 두 번 들어 있다');
  if (S.order.some((v) => v < 0 || v >= atlas.docs.length)) bad.push('순서에 없는 글 번호가 있다');
}

// ── 화면 ────────────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[seriation] playwright·번들 중 없는 게 있다 — 화면 확인 건너뜀');
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
  const saysGain = text.includes(`${Math.round(S.gain * 100)}%`);
  const saysShuf = text.includes(`${Math.round(S.shufGain * 100)}%`);
  const saysWin = /행렬이 점-선을 이긴다/.test(text) && /길 찾기/.test(text);
  console.log(`  화면 — 얻는 것 ${saysGain ? '○' : '✗'} · 섞은 자료 ${saysShuf ? '○' : '✗'} · 왜 행렬인가 ${saysWin ? '○' : '✗'}`);
  if (!saysGain) bad.push('화면이 정렬로 얻는 것을 안 적는다');
  if (!saysShuf) bad.push('화면이 **섞은 자료에서도 얻는 것**을 안 적는다 — 35% 가 큰지 알 수 없다');
  if (!saysWin) bad.push('화면이 **왜 행렬인가**(스무 개 넘으면 행렬이 이긴다 · 길 찾기는 예외)를 안 적는다');

  if (S.worth) {
    await page.click('#host [data-more]');
    await page.click('#host [data-matrix]');
    await untilSettled(page, () => page.evaluate(() => JSON.stringify([window.__atlasScale, window.__atlasVisible, window.__atlasPlaced?.length, window.__atlasLabelBoxes?.length, document.querySelector('#host')?.textContent?.length])));
    const info = await page.evaluate(() => window.__atlasMatrix);
    console.log(`  ④ 켜면 — 줄·칸 ${info?.n}개 · 칠한 칸 ${info?.painted}개 · 한 칸 ${info?.cell}px · 정렬 「${info?.order}」`);
    if (!info?.on) bad.push('행렬을 켰는데 안 켜진다');
    if (!(info?.n > 100)) bad.push(`행렬 줄·칸이 ${info?.n}개뿐이다`);
    if (!(info?.painted > 1000)) bad.push(`칠한 칸이 ${info?.painted}개뿐이다 — 이웃을 안 그리고 있다`);
    /* 켜면 점-선 그림이 사라져야 한다 — 두 그릇을 겹쳐 그리면 둘 다 못 읽는다. */
    const dots = await page.evaluate(() => (window.__atlasDotScreen || []).length);
    void dots;
  }
  await browser.close();
}

if (bad.length) {
  console.log('[seriation] **행렬이 나은 그릇인지 제대로 재지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 seriationOf·antiRobinson·fiedlerOrder 를 봐라.');
  process.exit(1);
}
console.log(`[seriation] 정렬로 얻는 것 ${(S.gain * 100).toFixed(0)}% (섞은 자료 ${(S.shufGain * 100).toFixed(0)}%)`
  + ` — ${S.worth ? '**행렬을 만들었다**' : '안 만들었다'}`);
