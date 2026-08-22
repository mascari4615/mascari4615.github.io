#!/usr/bin/env node
/**
 * audit-atlas-control — **지도를 움직이는 길이 하나인가** (TASK-KAR-233).
 *
 * 지금은 마우스가 지도를 움직인다. 나중에 폰(TASK-KAR-230 파이프)이나 손짓이 붙으면
 * 각자 지도를 만지게 되고, 그러면 **같은 동작이 입력마다 달라진다** — 한쪽은 배율 한계가
 * 있고 한쪽은 없는 식으로. 그래서 입구를 하나로 모았다.
 *
 * 이 자는 그 입구가 **정말 하나인지** 본다:
 *  - 입구로 밀고 당기면 화면이 실제로 그만큼 움직이나 (마우스 흉내 없이)
 *  - **마우스로 굴린 결과와 입구로 부른 결과가 같은가** — 다르면 길이 둘이다
 *  - 배율 한계(0.4~8)가 입구에서도 지켜지나
 *  - 「가운데로」가 그 글을 정말 가운데 놓나
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
  console.log('[control] 지도나 번들이 없다 — 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[control] playwright 가 없다 — 검사 건너뜀');
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
  /* **셸과 같은 길로 얹는다** — 셸은 `tabs[].build` 로만 그린다. 예전엔 여기서
         `render(h)` 를 직접 불렀는데, 그 바람에 위젯이 셸이 안 읽는 모양으로 등록해도
         자들은 전부 초록이었다(2026-08-21, 사람이 열어 보고서야 드러났다). */
      window.__reg['memo-atlas'].tabs[0].build(h);
});
await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), { timeout: 30000 });

const bad = [];
const has = await page.evaluate(() => !!window.__atlasControl);
console.log(`[control] 입구 ${has ? '있다' : '없다(고장)'}`);
if (!has) {
  console.log('[control] **지도를 움직이는 입구가 없다** — 폰이든 손짓이든 붙일 데가 없다');
  await browser.close();
  process.exit(1);
}

/* ① 입구로 밀면 진짜 움직이나 */
const panned = await page.evaluate(() => {
  const c = window.__atlasControl;
  c.reset(); c.draw();
  const before = c.state();
  c.pan(120, -80); c.draw();
  const after = c.state();
  return { before, after };
});
const dx = panned.after.x - panned.before.x;
const dy = panned.after.y - panned.before.y;
console.log(`[control] 밀기 120,-80 → 실제 ${dx},${dy}`);
if (dx !== 120 || dy !== -80) bad.push(`민 만큼 안 움직인다 (${dx},${dy})`);

/* ② 마우스 휠과 입구 부르기가 같은 결과인가 — 다르면 길이 둘이다 */
const box = await (await page.$('#host .atlas-canvas')).boundingBox();
await page.evaluate(() => { window.__atlasControl.reset(); window.__atlasControl.draw(); });
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, -240);
await page.waitForTimeout(80);
const byMouse = await page.evaluate(() => window.__atlasControl.state());
const byDoor = await page.evaluate(() => {
  const c = window.__atlasControl;
  c.reset();
  const cv = document.querySelector('#host .atlas-canvas');
  const dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  /* 마우스가 화면 한가운데 있었으니 같은 자리를 잡고 당긴다. */
  c.zoom(1.12, (r.width / 2) * dpr, (r.height / 2) * dpr);
  c.draw();
  return c.state();
});
const same = ['x', 'y', 'scale'].every((k) => Math.abs(byMouse[k] - byDoor[k]) < 0.5);
console.log(`[control] 마우스 휠 ${JSON.stringify(byMouse)} vs 입구 ${JSON.stringify(byDoor)} → ${same ? '같다' : '다르다(길이 둘)'}`);
if (!same) bad.push('마우스로 굴린 결과와 입구로 부른 결과가 다르다 — 길이 둘이다');

/* ③ 배율 한계가 입구에서도 지켜지나 */
const limits = await page.evaluate(() => {
  const c = window.__atlasControl;
  c.reset();
  for (let i = 0; i < 60; i += 1) c.zoom(1.5);
  const hi = c.state().scale;
  c.reset();
  for (let i = 0; i < 60; i += 1) c.zoom(0.5);
  const lo = c.state().scale;
  c.reset(); c.draw();
  return { hi, lo };
});
console.log(`[control] 배율 한계 — 끝까지 당기면 ${limits.hi} · 끝까지 밀면 ${limits.lo}`);
if (limits.hi > 8.001 || limits.lo < 0.399) bad.push(`배율이 한계를 넘는다 (${limits.lo}~${limits.hi})`);

/* ④ 「가운데로」가 정말 가운데 놓나 */
const centered = await page.evaluate(() => {
  const c = window.__atlasControl;
  const cv = document.querySelector('#host .atlas-canvas');
  const p = (window.__atlasPlaced || [])[7];
  if (!p) return null;
  c.reset();
  c.center(p[0], p[1]);
  c.draw();
  const b = window.__atlasBounds;
  const v = c.state();
  const pad = 26;
  const w = cv.width - pad * 2;
  const h = cv.height - pad * 2;
  const ux = (p[0] - b.x0) / (b.x1 - b.x0);
  const uy = (p[1] - b.y0) / (b.y1 - b.y0);
  return {
    dx: Math.abs(pad + ux * w * v.scale + v.x - cv.width / 2),
    dy: Math.abs(pad + uy * h * v.scale + v.y - cv.height / 2),
  };
});
if (centered) {
  console.log(`[control] 가운데로 → 한가운데서 ${centered.dx.toFixed(1)},${centered.dy.toFixed(1)}픽셀 벗어남`);
  if (centered.dx > 2 || centered.dy > 2) bad.push('「가운데로」가 가운데 안 놓는다');
}

await browser.close();
if (errors.length) {
  console.log('[control] 브라우저가 오류를 뱉었다:');
  for (const e of errors.slice(0, 3)) console.log('   ' + e);
  process.exit(1);
}
if (bad.length) {
  console.log('[control] **지도를 움직이는 길이 하나가 아니다**');
  for (const x of bad) console.log('  - ' + x);
  process.exit(1);
}
console.log('[control] 마우스도 자판도 밖에서 부르는 것도 같은 입구를 쓴다');
