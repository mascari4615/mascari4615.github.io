#!/usr/bin/env node
/**
 * audit-atlas-howto — **화면이 자기 눈금을 설명하나** (TASK-KAR-233).
 *
 * 세어 보니 지도가 쓰는 눈금이 여덟인데(자리·색·크기·모양·테두리·밝기·흰 선·주황 점선)
 * 화면이 설명하는 건 범례의 **색 하나뿐**이었다. 나머지 일곱은 코드 주석에만 있었다.
 * 만든 사람은 다 알지만, 석 달 뒤의 나는 처음 보는 사람이다.
 *
 * 안내는 **복잡한 그림에서만** 값이 있고, 있을 땐 **글로 된 인라인**이 제일 빨랐다
 * (Stoiber 외 2022, 596명 — 동영상은 안내 없는 것과 같았다). 그래서 한 줄 띠다.
 *
 * 이 자가 보는 것:
 *  - 띠가 있고, 지금 배치에서 **쓰는 눈금을 다 적나**
 *  - **안 쓰는 눈금은 안 적나** (뼈대엔 크기·모양이 없다 — 적으면 거짓말)
 *  - 렌즈를 켜면 그 테두리 설명이 **따라 붙나**
 *  - 접으면 사라지고, **새로 열어도 접힌 채인가**
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
const ATLAS = atlasPath(HERE);

if (!fs.existsSync(ATLAS) || !fs.existsSync(BUNDLE)) {
  console.log('[howto] 지도나 번들이 없다 — 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[howto] playwright 가 없다 — 검사 건너뜀');
  process.exit(0);
}

const bundle = fs.readFileSync(BUNDLE, 'utf8');
const atlas = fs.readFileSync(ATLAS, 'utf8');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const errors = [];

async function open() {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/data/memo-atlas.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: atlas });
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
    /* **셸과 같은 길로 얹는다** — 셸은 `tabs[].build` 로만 그린다. 예전엔 여기서
         `render(h)` 를 직접 불렀는데, 그 바람에 위젯이 셸이 안 읽는 모양으로 등록해도
         자들은 전부 초록이었다(2026-08-21, 사람이 열어 보고서야 드러났다). */
      window.__reg['memo-atlas'].tabs[0].build(h);
  });
  await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), { timeout: 30000 });
  return page;
}

const read = (page) => page.evaluate(() => ({
  text: document.querySelector('#host .atlas-howto')?.textContent || '',
  keys: window.__atlasChannels || [],
}));

const bad = [];
const page = await open();
const first = await read(page);
console.log(`[howto] 뜻자리에서 적는 눈금 ${first.keys.length}가지: ${first.keys.join(' · ')}`);
for (const must of ['자리', '색', '크기', '모양']) {
  if (!first.keys.includes(must)) bad.push(`뜻자리인데 「${must}」 설명이 없다`);
}
/* 적은 눈금은 띠 글에도 실제로 보여야 한다 — 목록만 있고 글이 없으면 못 읽는다. */
for (const k of first.keys) if (!first.text.includes(k)) bad.push(`「${k}」 가 목록엔 있는데 화면 글엔 없다`);

/* 렌즈를 켜면 설명이 따라 붙나. */
await page.click('#host [data-more]');
await page.waitForTimeout(120);
await page.click('#host [data-buried]');
await page.waitForTimeout(200);
const withLens = await read(page);
console.log(`[howto] 묻힌 것을 켜면 → ${withLens.keys.join(' · ')}`);
if (!withLens.keys.includes('노란 테두리')) bad.push('렌즈를 켜도 그 테두리 설명이 안 붙는다');
await page.click('#host [data-buried]');
await page.waitForTimeout(150);

/* 뼈대에선 크기·모양이 없다 — 안 적어야 한다. */
await page.click('#host [data-layout="skeleton"]');
await page.waitForTimeout(250);
const sk = await read(page);
console.log(`[howto] 뼈대에서 → ${sk.keys.join(' · ')}`);
for (const never of ['크기', '모양', '색']) {
  if (sk.keys.includes(never)) bad.push(`뼈대엔 없는 「${never}」 를 설명한다 — 거짓말이다`);
}
if (!sk.keys.includes('마디') || !sk.keys.includes('이음')) bad.push('뼈대인데 마디·이음 설명이 없다');
await page.click('#host [data-layout="meaning"]');
await page.waitForTimeout(200);

/* 접으면 사라지고, 새로 열어도 접힌 채여야 한다. */
await page.click('#host .atlas-howto [data-howto-off]');
await page.waitForTimeout(150);
const folded = await read(page);
console.log(`[howto] 접으면 → ${folded.text.trim() || '(빈칸)'}`);
if (folded.text.includes('자리 =')) bad.push('접었는데 그대로 있다');
await page.close();

const again = await open();
const kept = await read(again);
console.log(`[howto] 새로 열면 → ${kept.text.trim().slice(0, 20) || '(빈칸)'}`);
if (kept.text.includes('자리 =')) bad.push('접었는데 새로 열면 도로 펴진다');
await browser.close();

if (errors.length) {
  console.log('[howto] 브라우저가 오류를 뱉었다:');
  for (const e of errors.slice(0, 3)) console.log('   ' + e);
  process.exit(1);
}
if (bad.length) {
  console.log('[howto] **화면이 자기 눈금을 제대로 설명 못 한다**');
  for (const x of bad) console.log('  - ' + x);
  process.exit(1);
}
console.log('[howto] 지금 쓰는 눈금만 적고, 접으면 기억한다');
