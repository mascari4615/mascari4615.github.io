#!/usr/bin/env node
/**
 * audit-atlas-minimap. **당겨 들어가도 여기가 전체의 어디인지 아나** (TASK-KAR-233).
 *
 * 당겨 들어간 자리에 아무것도 없어 길을 잃는 걸 사막 안개(desert fog)라 부른다
 * (Jul & Furnas, UIST 1998). 우리 지도도 8배로 당기면 **화면 225칸 중 47칸(21%)이
 * 글 열 개도 안 되는 허허벌판**이었다. 그 자리에서 화면에 남는 단서가 하나도 없었다.
 *
 * 그래서 구석에 작은 지도를 두고 지금 보는 자리를 네모로 그린다. 이 자는 그게
 * **정말 맞는 네모인지** 본다. 있는 척만 하고 엉뚱한 데를 가리키면 없느니만 못하다:
 *  - 멀리서는 안 뜨고, 당기면 뜬다
 *  - 네모의 자리, 크기가 배율에서 계산한 값과 맞는다 (밀어 다녀도)
 *  - **글이 없는 자리(안개)에서도** 네모가 남는다. 거기가 이 자의 존재 이유다
 *  - 눌러서 건너뛸 수 있다
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
  console.log('[minimap] 지도나 번들이 없다. 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[minimap] playwright 가 없다. 검사 건너뜀');
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
const box = await (await page.$('#host .atlas-canvas')).boundingBox();

const bad = [];
const read = () => page.evaluate(() => ({
  mini: window.__atlasMinimap, scale: window.__atlasScale ?? 1, visible: window.__atlasVisible ?? 0,
  w: document.querySelector('#host .atlas-canvas').width,
  h: document.querySelector('#host .atlas-canvas').height,
}));

/* 멀리서는 안 떠야 한다. 전체가 이미 화면인데 또 전체를 그리면 자리만 먹는다. */
const far = await read();
console.log(`[minimap] 멀리(배율 ${far.scale.toFixed(2)}) → ${far.mini ? '떴다' : '안 떴다'}`);
if (far.mini) bad.push('멀리서도 작은 지도가 뜬다. 자리만 먹는다');

async function wheelIn(times) {
  for (let k = 0; k < times; k += 1) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -240);
  }
  await page.waitForTimeout(120);
}
async function dragBy(dx, dy) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(90);
}

await wheelIn(19);
const near = await read();
console.log(`[minimap] 당기고(배율 ${near.scale.toFixed(2)}) → ${near.mini ? '떴다' : '안 떴다(고장)'}`);
if (!near.mini) bad.push('당겨도 작은 지도가 안 뜬다');

/* **네모가 맞나. 뜻으로 잰다.** 배율, 여백을 자가 다시 계산하면 위젯 식을 베끼는
     꼴이라 같이 틀려도 모른다(처음에 그렇게 8.8% 를 고장으로 잘못 읽었다).
     대신 이렇게 본다: 네모 안에 든 글 수 == 지금 화면에 보이는 글 수.
     네모가 엉뚱한 데를 가리키면 두 수가 갈라진다. */
let fogSeen = 0; let fogWithMini = 0; let worst = 0;
if (near.mini) {
  const spots = [[0, 0], [420, 0], [-420, 0], [0, 300], [0, -300], [380, 280], [-380, -280], [520, -320]];
  for (const [dx, dy] of spots) {
    await page.keyboard.press('Home');
    await page.waitForTimeout(50);
    await wheelIn(19);
    await dragBy(dx, dy);
    const r = await page.evaluate(() => {
      const mini = window.__atlasMinimap;
      const cv = document.querySelector('#host .atlas-canvas');
      if (!mini) return { mini: null };
      const [, , W, H] = mini.box;
      const [lx, ly, lw, lh] = mini.rect;
      /* 네모를 지도 자리로 되돌린다. **-1..1 이라고 넘겨짚지 않는다** . 
         굽는 쪽이 테두리로 접기를 그만두면서 점이 자 밖으로도 나간다. */
      const b = window.__atlasBounds || { x0: -1, x1: 1, y0: -1, y1: 1 };
      const sx = b.x1 - b.x0; const sy = b.y1 - b.y0;
      const x0 = b.x0 + (lx / W) * sx; const x1 = b.x0 + ((lx + lw) / W) * sx;
      const y0 = b.y0 + (ly / H) * sy; const y1 = b.y0 + ((ly + lh) / H) * sy;
      const inRect = (window.__atlasPlaced || []).filter((q) => q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1).length;
      return { mini, inRect, visible: window.__atlasVisible ?? 0, scale: window.__atlasScale ?? 1, cw: cv.width };
    });
    if (!r.mini) { bad.push('밀고 다니면 작은 지도가 사라진다'); break; }
    const denom = Math.max(20, r.visible);
    const err = Math.abs(r.inRect - r.visible) / denom;
    worst = Math.max(worst, err);
    if (r.visible < 10) { fogSeen += 1; fogWithMini += 1; }
  }
  console.log(`[minimap] 네모 안 글 수 vs 화면 속 글 수. 어긋남 최대 ${(worst * 100).toFixed(1)}%, 안개 자리 ${fogSeen}곳 중 작은 지도 남은 곳 ${fogWithMini}`);
  if (worst > 0.1) bad.push(`네모가 가리키는 곳과 실제 화면이 다르다 (어긋남 ${(worst * 100).toFixed(1)}%)`);
  if (fogSeen && fogWithMini < fogSeen) bad.push('정작 안개 자리에서 작은 지도가 사라진다');

  /* 눌러서 건너뛰나. 안개에서 빠져나오는 길. */
  const before = await page.evaluate(() => [window.__atlasView?.x, window.__atlasView?.y]);
  const m = near.mini.box;
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
  await page.mouse.click(box.x + (m[0] + m[2] * 0.25) / dpr, box.y + (m[1] + m[3] * 0.25) / dpr);
  await untilSettled(page, () => page.evaluate(() => JSON.stringify([window.__atlasScale, window.__atlasVisible, window.__atlasPlaced?.length, window.__atlasLabelBoxes?.length, document.querySelector('#host')?.textContent?.length])));
  const moved = await page.evaluate(() => {
    const c = document.querySelector('#host .atlas-canvas');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, Math.floor(c.height / 2)).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 90) lit += 1;
    return lit;
  });
  const after = await page.evaluate(() => window.__atlasMinimap?.rect);
  const jumped = JSON.stringify(after) !== JSON.stringify(near.mini.rect);
  console.log(`[minimap] 눌러서 건너뛰기 → ${jumped ? '옮겨졌다' : '안 옮겨졌다(고장)'} (그려진 밝은 점 표본 ${moved})`);
  if (!jumped) bad.push('작은 지도를 눌러도 안 옮겨진다');
  void before;
}

await browser.close();
if (errors.length) {
  console.log('[minimap] 브라우저가 오류를 뱉었다:');
  for (const e of errors.slice(0, 3)) console.log('   ' + e);
  process.exit(1);
}
if (bad.length) {
  console.log('[minimap] **당기면 여기가 전체의 어디인지 모른다**');
  for (const x of bad) console.log('  - ' + x);
  process.exit(1);
}
console.log('[minimap] 당겨도 어디쯤인지 보이고, 눌러서 돌아올 수 있다');
