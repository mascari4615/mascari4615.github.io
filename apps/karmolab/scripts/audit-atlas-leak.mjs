#!/usr/bin/env node
/**
 * audit-atlas-leak — **이 파일을 남에게 주면 무엇이 드러나나** (TASK-KAR-233).
 *
 * 임베딩 역변환은 32토큰 입력의 **92%** 를 그대로 복원한다(Morris 외 EMNLP 2023, BLEU 97.3).
 * 재현 연구(arXiv 2507.07700)가 못 박은 대목: **짝거리·저차원 투영 같은 파생 정보도 취약하다.**
 * 우리 산출물이 정확히 그 파생 정보다 — 좌표 + 문서마다 이웃 여덟 + 덩어리 이름.
 *
 * 지도 파일은 공개 레포에 안 담긴다(gitignore + 비공개 출신 자). 하지만 **다른 기계에서
 * 보려고 옮기는 순간** 그게 함께 나간다. 계약에 privacy gate 를 걸어 두고도 **「무엇이
 * 새는가」는 한 번도 안 쟀다.** 그래서 잰다.
 *
 * ★ **재 봤고, 가려도 소용없었다.** 제목을 15% 가려 놓고 가리지 않은 이웃만으로 갈래를
 * 맞히니 **80.3%** 적중(흔한 갈래 찍기 22.0% · 이웃 섞기 21.7% → **우연의 3.65배**).
 * 그리고 **이웃 목록을 아예 빼고 좌표만 줘도 72.5%** — 목록을 빼는 것만으로는 못 막는다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 제목 가린 글의 갈래를 **이웃의 공개 정보만으로** 맞히는 시늉 — 적중률 vs 우연 수준
 *  ② 우연 수준을 **두 겹**으로 (흔한 갈래 찍기 · 이웃 목록 섞기)
 *  ③ 이웃 목록을 빼도 **좌표만으로** 얼마나 맞히나 — 가리개의 실효를 잰다
 *  ④ 화면이 「가리는 것으로 안전해지지 않는다」를 적는다
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

if (!fs.existsSync(ATLAS)) { console.log('[leak] 지도가 없다 — 검사 건너뜀'); process.exit(0); }
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const L = atlas.leak;
if (!L) {
  if (isFake(ATLAS)) { console.log('[leak] 가짜 지도다 — 공개 위험은 진짜 굽기에서만 잰다'); process.exit(0); }
  console.log('[leak] **공개 위험이 안 실려 있다** (leak) — privacy gate 를 걸어 두고 무엇이 새는지 안 쟀다');
  process.exit(1);
}

console.log(`  ① 제목 ${Math.round(L.maskRate * 100)}% 가림 — 가린 글 ${L.masked}편 중 ${L.guessed}편을 맞혀 봤다`
  + ` → **${(L.rate * 100).toFixed(1)}% 적중**`);
console.log(`  ② 우연 수준 — 흔한 갈래 찍기 ${(L.commonRate * 100).toFixed(1)}%`
  + ` · 이웃을 마구 섞으면 ${(L.shuffledRate * 100).toFixed(1)}% → 우연의 ${L.lift}배`);
console.log(`  ③ 이웃 목록을 빼고 **좌표만** 줘도 ${(L.xyRate * 100).toFixed(1)}% (${L.xyGuessed}편)`);

/* ① 시늉이 실제로 돌았나 — 아무것도 안 맞혔으면 잰 게 아니다. */
if (!(L.masked > 50)) bad.push(`가린 글이 ${L.masked}편뿐이다 — 표본이 너무 작다`);
if (!(L.guessed > L.masked * 0.5)) bad.push(`가린 ${L.masked}편 중 ${L.guessed}편만 맞혀 봤다 — 대부분이 이웃을 못 찾았다`);

/* ★ ② **대조군이 살아 있나** — 이웃을 섞어도 잘 맞히면 이 잣대는 아무것도 안 재고 있다. */
if (L.shuffledRate == null) bad.push('이웃을 섞은 대조군이 안 실려 있다');
else if (L.shuffledRate > L.rate * 0.7) {
  bad.push(`이웃을 마구 섞어도 ${(L.shuffledRate * 100).toFixed(1)}% 맞힌다 (진짜 ${(L.rate * 100).toFixed(1)}%)`
    + ' — 이 잣대는 이웃을 안 보고 있다');
}
if (L.commonRate == null) bad.push('흔한 갈래를 찍는 우연 수준이 안 실려 있다');
/* 두 우연 수준이 서로 크게 다르면 셈이 이상하다 — 둘 다 「이웃을 안 본 답」이다. */
if (L.commonRate != null && L.shuffledRate != null && Math.abs(L.commonRate - L.shuffledRate) > 0.15) {
  bad.push(`우연 수준 둘이 크게 다르다 (찍기 ${L.commonRate} · 섞기 ${L.shuffledRate}) — 하나가 잘못 잡혔다`);
}

/* ③ 좌표만으로도 새는가 — 이 값이 없으면 「목록을 빼면 된다」는 착각을 못 막는다. */
if (L.xyRate == null) bad.push('좌표만 줬을 때가 안 실려 있다 — 「이웃 목록만 빼면 안전하다」를 못 반증한다');

/* ★ **이 자의 핵심** — 새는 것이 우연보다 뚜렷하면 화면이 그렇게 말해야 한다. */
const leaks = L.rate > Math.max(L.commonRate, L.shuffledRate) * 1.5;
console.log(`  ④ 판정 — ${leaks ? '**가려도 드러난다**' : '가리면 우연 수준으로 떨어진다'}`);

// ── ④ 화면 ──────────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[leak] playwright·번들 중 없는 게 있다 — 화면 확인 건너뜀');
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
  const text = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
  const saysRate = text.includes(`${Math.round(L.rate * 100)}%`);
  const saysChance = text.includes(`${Math.round(L.commonRate * 100)}%`);
  const saysXy = text.includes(`${Math.round(L.xyRate * 100)}%`);
  const saysVerdict = /가리는 것으로 안전해지지 않는다/.test(text);
  console.log(`  ④ 화면 — 적중률 ${saysRate ? '○' : '✗'} · 우연 수준 ${saysChance ? '○' : '✗'}`
    + ` · 좌표만 ${saysXy ? '○' : '✗'} · 판정 ${saysVerdict ? '○' : '✗'}`);
  if (!saysRate) bad.push('화면이 적중률을 안 적는다');
  if (!saysChance) bad.push('화면이 **우연 수준**을 안 적는다 — 80% 가 큰지 알 수 없다');
  if (!saysXy) bad.push('화면이 **좌표만 줬을 때**를 안 적는다 — 「목록만 빼면 된다」는 착각이 남는다');
  if (leaks && !saysVerdict) {
    bad.push('가려도 드러나는데 화면이 **「가리는 것으로 안전해지지 않는다」**를 안 적는다');
  }
  await browser.close();
}

if (bad.length) {
  console.log('[leak] **무엇이 새는지 제대로 재지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 leakOf 를 봐라.');
  process.exit(1);
}
console.log(`[leak] 제목을 가려도 ${(L.rate * 100).toFixed(0)}% 드러난다 (우연 ${(L.commonRate * 100).toFixed(0)}%)`
  + ` · 좌표만 줘도 ${(L.xyRate * 100).toFixed(0)}% — 화면이 그렇게 적는다`);
