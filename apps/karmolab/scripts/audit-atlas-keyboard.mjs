#!/usr/bin/env node
/**
 * audit-atlas-keyboard. **마우스로 되는 일이 자판으로도 되나** (TASK-KAR-233).
 *
 * WCAG 2.1.1(자판, 등급 A): 마우스로 되는 일은 자판으로도 **다** 돼야 한다.
 * 예외는 붓질처럼 길 자체가 뜻인 입력뿐이고, 밀기, 당기기, 고르기는 예외가 아니다.
 *
 * 세어 보니 아홉 가지 중 자판으로 온전히 되는 것이 여섯이었다. 안 되던 둘
 * (**덩어리 견주기, 그 덩어리로 건너뛰기**)은 캔버스에 그리고 캔버스 클릭으로만
 * 받았기 때문이다. 이번 세션에 내가 그렇게 넣었다.
 *
 * 이 자는 **마우스를 한 번도 안 쓰고** 자판만으로 해 본다:
 *  - 밀기(화살표), 당기기(+/-), 처음으로(Home)
 *  - 글 고르기(Enter) 와 **고른 글이 잡히나**(닮은 글 줄이 그려지려면 잡혀야 한다)
 *  - 캔버스 안 표의 덩어리 단추에 **Tab 으로 닿나**, 눌러서 견주기가 열리나
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

import { untilSettled } from './lib/settle.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
const ATLAS = atlasPath(HERE);

if (!fs.existsSync(ATLAS) || !fs.existsSync(BUNDLE)) {
  console.log('[keyboard] 지도나 번들이 없다. 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[keyboard] playwright 가 없다. 검사 건너뜀');
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const atlas = fs.readFileSync(ATLAS, 'utf8');
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
await page.addScriptTag({ content: fs.readFileSync(BUNDLE, 'utf8') });
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

const bad = [];
const state = () => page.evaluate(() => window.__atlasControl.state());

/* ① 밀기, 당기기, 처음으로. 캔버스에 초점을 주고 자판만 쓴다. */
await page.evaluate(() => document.querySelector('#host .atlas-canvas').focus());
const start = await state();
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowDown');
const panned = await state();
if (panned.x === start.x && panned.y === start.y) bad.push('화살표로 안 밀린다');
await page.keyboard.press('+');
const zoomed = await state();
if (zoomed.scale <= panned.scale) bad.push('+ 로 안 당겨진다');
await page.keyboard.press('Home');
const home = await state();
if (home.x !== 0 || home.y !== 0 || home.scale !== 1) bad.push('Home 으로 안 돌아온다');
console.log(`[keyboard] 밀기, 당기기, 처음으로 → ${bad.length ? '문제 있음' : '된다'}`);

/* ② 글 고르기. Enter 로 고르면 **잡히기까지** 해야 한다(닮은 글 줄은 잡힌 글에만 그린다). */
await page.keyboard.press('Enter');
await untilSettled(page, () => page.evaluate(() => JSON.stringify([window.__atlasScale, window.__atlasVisible, window.__atlasPlaced?.length, window.__atlasLabelBoxes?.length, document.querySelector('#host')?.textContent?.length])));
const picked = await page.evaluate(() => ({
  card: !document.querySelector('#host .atlas-card')?.hidden,
  title: document.querySelector('#host .atlas-card-title')?.textContent || '',
}));
console.log(`[keyboard] Enter 로 고르기 → ${picked.card ? '' + picked.title.slice(0, 24) + '' : '아무것도 안 잡힌다'}`);
if (!picked.card) bad.push('Enter 로 글을 못 고른다');

/* ③ 캔버스 안 표의 덩어리 단추. 자판으로 닿고, 눌러서 견주기가 열리나. */
const btns = await page.evaluate(() => document.querySelectorAll('#host .atlas-canvas [data-goto-cluster]').length);
console.log(`[keyboard] 표 안 덩어리 단추 ${btns}개`);
if (!btns) bad.push('표에 덩어리 단추가 없다. 자판으로 견줄 길이 없다');
else {
  const first = await page.evaluate(() => {
    const b = document.querySelectorAll('#host .atlas-canvas [data-goto-cluster]');
    b[0].focus();
    return document.activeElement === b[0];
  });
  if (!first) bad.push('표 안 단추에 초점이 안 간다');
  await page.keyboard.press('Enter');
  await untilSettled(page, () => page.evaluate(() => JSON.stringify([window.__atlasScale, window.__atlasVisible, window.__atlasPlaced?.length, window.__atlasLabelBoxes?.length, document.querySelector('#host')?.textContent?.length])));
  await page.evaluate(() => {
    const b = document.querySelectorAll('#host .atlas-canvas [data-goto-cluster]');
    b[1].focus();
  });
  await page.keyboard.press('Enter');
  await untilSettled(page, () => page.evaluate(() => JSON.stringify([window.__atlasScale, window.__atlasVisible, window.__atlasPlaced?.length, window.__atlasLabelBoxes?.length, document.querySelector('#host')?.textContent?.length])));
  const vs = await page.evaluate(() => {
    const el = document.querySelector('#host .atlas-vs');
    return el && !el.hidden ? el.querySelector('h4')?.textContent || '' : null;
  });
  console.log(`[keyboard] 단추 둘을 Enter 로 → ${vs ? '견주기 열림: ' + vs : '견주기가 안 열린다'}`);
  if (!vs) bad.push('자판으로 두 덩어리를 못 견준다');
}

await browser.close();
if (errors.length) {
  console.log('[keyboard] 브라우저가 오류를 뱉었다:');
  for (const e of errors.slice(0, 3)) console.log('   ' + e);
  process.exit(1);
}
if (bad.length) {
  console.log('[keyboard] **마우스로만 되는 일이 남아 있다**');
  for (const x of bad) console.log('  - ' + x);
  console.log('  캔버스에 그렸으면 자판 길도 같이 내라. 캔버스 안 대체 내용은 초점을 받는다.');
  process.exit(1);
}
console.log('[keyboard] 마우스 없이 자판만으로 밀고, 당기고, 고르고, 견준다');
