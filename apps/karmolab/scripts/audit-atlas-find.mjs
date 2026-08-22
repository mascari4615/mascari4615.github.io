#!/usr/bin/env node
/**
 * audit-atlas-find — **찾아지나 · 닮은 글로 갈 수 있나**를 진짜 브라우저에서 본다.
 *
 * 점이 1516개인데 특정 글로 가는 길이 없었다(누를 수 있는 것 = 원본 열기 하나).
 * 찾는 칸과 「닮은 글」을 넣었으니, 그게 **정말 도는지**를 눈이 아니라 자로 잰다:
 *  - 치면 걸리나 · 없는 말엔 0 이라고 하나 · 걸린 것이 **화면 안으로 들어오나**
 *  - 점을 누르면 닮은 글이 뜨나 · 그걸 누르면 **그 글로 옮겨 가나**
 * 마지막 것이 핵심이다 — 목록만 뜨고 못 가면 그건 장식이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ATLAS = atlasPath(path.join(root, 'scripts'));
if (!fs.existsSync(ATLAS) || !fs.existsSync(path.join(root, 'js/widgets/memo-atlas.js'))) {
  console.log('[find] 지도나 번들이 없다 — 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[find] playwright 가 없다 — 검사 건너뜀');
  process.exit(0);
}
const script = fs.readFileSync(path.join(root, 'js/widgets/memo-atlas.js'), 'utf8');
const atlas = fs.readFileSync(ATLAS, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.endsWith('/data/memo-atlas.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: atlas });
  return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
});
await page.goto('http://localhost/');
await page.evaluate(() => { window.__reg = {}; window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {} }; });
await page.addScriptTag({ content: script });
await page.evaluate(() => { const h = document.createElement('div'); h.id = 'host'; h.style.width = '1200px'; h.style.height = '760px'; document.body.appendChild(h); /* **셸과 같은 길로 얹는다** — 셸은 `tabs[].build` 로만 그린다. 예전엔 여기서
         `render(h)` 를 직접 불렀는데, 그 바람에 위젯이 셸이 안 읽는 모양으로 등록해도
         자들은 전부 초록이었다(2026-08-21, 사람이 열어 보고서야 드러났다). */
      window.__reg['memo-atlas'].tabs[0].build(h); });
await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), { timeout: 30000 });

// 1) 찾기 — 있는 말은 걸려야 하고, 없는 말은 0 이어야 한다
let foundSome = false;
let falsePositive = false;
/* 찾을 말은 **지도에서 뽑는다** — 손으로 박아 두면 글이 바뀌는 날 검사가 거짓으로 빨개진다. */
const parsed = JSON.parse(atlas);
const sample = (parsed.docs.find((d) => d.title && d.title.length > 4) || {}).title || '';
const word = sample.split(/[\s—·]+/).filter((w) => w.length >= 2)[0] || sample.slice(0, 4);
for (const q of [word, '없을말zzq9']) {
  await page.fill('#host .atlas-find', q);
  await page.waitForTimeout(220);
  const r = await page.evaluate(() => ({ found: window.__atlasFound, visible: window.__atlasVisible, scale: window.__atlasScale, say: document.querySelector('#host .atlas-count')?.textContent }));
  console.log(`  찾기 "${q}" → 걸린 글 ${r.found} · 화면 속 점 ${r.visible} · 배율 ${Number(r.scale).toFixed(2)}`);
  if (q === word && r.found > 0 && r.visible > 0) foundSome = true;
  if (q !== word && r.found > 0) falsePositive = true;
}
await page.fill('#host .atlas-find', '');
await page.waitForTimeout(200);


// 2) 점을 눌러 「닮은 글」이 뜨나 + 눌러서 옮겨 가나
const cv = await page.$('#host .atlas-canvas'); const b = await cv.boundingBox();
let near = null;
for (let i = 0; i < 60 && !near; i += 1) {
  await page.mouse.click(b.x + 50 + i * 19, b.y + 90 + (i % 13) * 41);
  await page.waitForTimeout(35);
  near = await page.evaluate(() => {
    const el = document.querySelector('#host .atlas-near');
    return el ? { n: el.querySelectorAll('[data-goto]').length, first: el.querySelector('[data-goto]')?.textContent, title: document.querySelector('#host .atlas-card-title')?.textContent } : null;
  });
}
let moved = false;
console.log(near ? `  점 누름 → 「${near.title}」 · 닮은 글 ${near.n}개 · 첫째 「${near.first}」` : '점을 눌러도 닮은 글이 안 뜬다(고장)');

if (near) {
  const before = await page.evaluate(() => document.querySelector('#host .atlas-card-title')?.textContent);
  await page.click('#host .atlas-near [data-goto]');
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({ t: document.querySelector('#host .atlas-card-title')?.textContent, s: window.__atlasScale }));
  console.log(`  닮은 글 누름 → 「${before}」 → 「${after.t}」 · 배율 ${Number(after.s).toFixed(2)}`);
  moved = before !== after.t;
}
if (errs.length) { console.log('브라우저 오류:'); for (const e of errs.slice(0, 3)) console.log('  ' + e); }
await browser.close();
const bad = [];
if (errs.length) bad.push('브라우저가 오류를 뱉었다');
if (!near || !near.n) bad.push('점을 눌러도 닮은 글이 안 뜬다');
if (!moved) bad.push('닮은 글을 눌러도 그 글로 안 간다');
if (!foundSome) bad.push('있는 말로 쳤는데 아무것도 안 걸린다');
if (falsePositive) bad.push('없는 말로 쳤는데 뭔가 걸린다');
if (bad.length) {
  console.log('[find] **지도에서 못 찾는다**');
  for (const x of bad) console.log('  - ' + x);
  process.exit(1);
}
console.log('[find] 쳐서 찾고, 닮은 글로 건너간다');
