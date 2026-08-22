#!/usr/bin/env node
/**
 * audit-atlas-touch — **폰에서 손가락으로 지도를 움직일 수 있나** (TASK-KAR-233).
 *
 * 폰에서 지도를 불러오는 길은 고쳐 놨는데, **불러온 다음이 없었다** — 폰 흉내로 재 보니
 * 손가락으로 밀어도 자세가 **한 픽셀도 안 변했다.** 듣는 입력이 마우스뿐이었고,
 * `touch-action` 이 `auto` 라 손가락을 대면 브라우저가 페이지를 대신 스크롤했다.
 *
 * 고친 뒤 이 자가 본다 — **손가락으로**:
 *  - 하나로 밀면 자세가 바뀌나
 *  - 둘을 벌리면 배율이 오르나 (집기)
 *  - 캔버스가 브라우저에게 「이 자리는 내가 쓴다」고 말하나 (touch-action: none)
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
  console.log('[touch] 지도나 번들이 없다 — 검사 건너뜀');
  process.exit(0);
}
let chromium; let devices;
try { ({ chromium, devices } = await import('playwright')); } catch {
  console.log('[touch] playwright 가 없다 — 검사 건너뜀');
  process.exit(0);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], hasTouch: true });
const page = await ctx.newPage();
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
  h.id = 'host'; h.style.width = '380px'; h.style.height = '600px';
  document.body.appendChild(h);
  /* **셸과 같은 길로 얹는다** — 셸은 `tabs[].build` 로만 그린다. 예전엔 여기서
         `render(h)` 를 직접 불렀는데, 그 바람에 위젯이 셸이 안 읽는 모양으로 등록해도
         자들은 전부 초록이었다(2026-08-21, 사람이 열어 보고서야 드러났다). */
      window.__reg['memo-atlas'].tabs[0].build(h);
});
await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), { timeout: 30000 });

const bad = [];
const state = () => page.evaluate(() => window.__atlasControl.state());
const box = await (await page.$('#host .atlas-canvas')).boundingBox();

/* 브라우저에게 이 자리를 넘겨받았나. */
const ta = await page.evaluate(() => getComputedStyle(document.querySelector('#host .atlas-canvas')).touchAction);
console.log(`[touch] touch-action = ${ta}`);
if (ta !== 'none') bad.push(`touch-action 이 ${ta} — 손가락을 대면 브라우저가 페이지를 스크롤한다`);

/** 손가락 하나로 민다. */
async function swipe(dx, dy) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.evaluate(([x, y, ex, ey]) => {
    const cv = document.querySelector('#host .atlas-canvas');
    const mk = (type, px, py) => new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py,
    });
    cv.dispatchEvent(mk('pointerdown', x, y));
    cv.dispatchEvent(mk('pointermove', (x + ex) / 2, (y + ey) / 2));
    cv.dispatchEvent(mk('pointermove', ex, ey));
    cv.dispatchEvent(mk('pointerup', ex, ey));
  }, [cx, cy, cx + dx, cy + dy]);
  await page.waitForTimeout(120);
}

const before = await state();
await swipe(-120, -60);
const after = await state();
console.log(`[touch] 한 손가락으로 밀기 → x ${before.x.toFixed(0)}→${after.x.toFixed(0)} · y ${before.y.toFixed(0)}→${after.y.toFixed(0)}`);
if (Math.abs(after.x - before.x) < 20 || Math.abs(after.y - before.y) < 10) bad.push('손가락으로 밀어도 지도가 안 움직인다');

/* 두 손가락으로 벌린다 — 집기. */
const zoomBefore = (await state()).scale;
await page.evaluate(([x, y]) => {
  const cv = document.querySelector('#host .atlas-canvas');
  const mk = (type, id, px, py) => new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: px, clientY: py,
  });
  cv.dispatchEvent(mk('pointerdown', 1, x - 40, y));
  cv.dispatchEvent(mk('pointerdown', 2, x + 40, y));
  for (let k = 1; k <= 4; k += 1) {
    cv.dispatchEvent(mk('pointermove', 1, x - 40 - k * 25, y));
    cv.dispatchEvent(mk('pointermove', 2, x + 40 + k * 25, y));
  }
  cv.dispatchEvent(mk('pointerup', 1, x - 140, y));
  cv.dispatchEvent(mk('pointerup', 2, x + 140, y));
}, [box.x + box.width / 2, box.y + box.height / 2]);
await page.waitForTimeout(150);
const zoomAfter = (await state()).scale;
console.log(`[touch] 두 손가락으로 벌리기 → 배율 ${zoomBefore.toFixed(2)} → ${zoomAfter.toFixed(2)}`);
if (zoomAfter <= zoomBefore * 1.2) bad.push('두 손가락으로 벌려도 안 당겨진다');

await browser.close();
if (errors.length) {
  console.log('[touch] 브라우저가 오류를 뱉었다:');
  for (const e of errors.slice(0, 3)) console.log('   ' + e);
  process.exit(1);
}
if (bad.length) {
  console.log('[touch] **폰에서는 지도를 못 만진다**');
  for (const x of bad) console.log('  - ' + x);
  console.log('  포인터 이벤트(pointerdown/move/up)로 받고 캔버스에 touch-action: none 을 줘라.');
  process.exit(1);
}
console.log('[touch] 손가락 하나로 밀고 둘로 당긴다');
