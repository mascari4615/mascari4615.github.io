#!/usr/bin/env node
/**
 * audit-atlas-a11y. **접근성 짧은 목록에서 우리가 빠뜨린 셋** (TASK-KAR-233).
 *
 * Chartability(Elavsky, EuroVis 2022)는 접근성을 **검사 가능한 물음**으로 만든다.
 * 짧은 목록 열넷에 우리를 대 보니 여덟은 이미 있었고(대비 자, 자판 자, 읽는 법 띠, 낭독기 표, 
 * 제목, 애니메이션 없음), **셋이 빠져 있었다.** 이 자가 그 셋을 잰다:
 *
 *  ① **글자 12px 이상**. 캔버스에 `10 * dpr px` 로 박아 두고 있었다
 *  ② **오가는 수고**. 자판으로는 화면 가운데 글 하나만 고를 수 있었다(옆 글로 가려면 마우스)
 *  ③ **사용자 글자 크기 존중**. px 로 박으면 브라우저에서 키워도 캔버스는 그대로다
 *
 * 셋 다 있으면 좋은 것이 아니라 **없으면 못 쓰는 사람이 생기는 것**이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

import { untilSettled } from './lib/settle.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
if (!fs.existsSync(ATLAS) || !fs.existsSync(BUNDLE)) {
  console.log('[a11y] 지도나 번들이 없다. 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[a11y] playwright 가 없다. 검사 건너뜀');
  process.exit(0);
}

const MIN_PX = 12;
const atlas = fs.readFileSync(ATLAS, 'utf8');
const bundle = fs.readFileSync(BUNDLE, 'utf8');
const bad = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

async function open(rootFont) {
  const page = await ctx.newPage();
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/data/memo-atlas.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: atlas });
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
  });
  await page.goto('http://localhost/');
  if (rootFont) await page.evaluate((px) => { document.documentElement.style.fontSize = px; }, rootFont);
  await page.evaluate(() => {
    window.__reg = {};
    window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {} };
  });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    const h = document.createElement('div');
    h.id = 'host'; h.style.width = '1200px'; h.style.height = '760px';
    document.body.appendChild(h);
    window.__reg['memo-atlas'].tabs[0].build(h);
  });
  await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), undefined, { timeout: 30000 });
  return page;
}

// ── ① 글자 크기 ──────────────────────────────────────────────────────
const page = await open(null);
/* 배율을 올리면 이름표, 칸 이름까지 그려진다. 작은 글자는 거기서 나온다. */
await page.evaluate(() => { window.__atlasControl?.zoom(6, 600, 380); window.__atlasControl?.draw(); });
await untilSettled(page, () => page.evaluate(() => window.__atlasFonts || []));
const fonts = await page.evaluate(() => window.__atlasFonts || []);
console.log(`  ① 캔버스가 쓴 글자 크기: ${fonts.join(', ')}px (바닥 ${MIN_PX})`);
if (!fonts.length) bad.push('캔버스가 쓴 글자 크기를 못 읽었다 (__atlasFonts)');
else if (Math.min(...fonts) < MIN_PX) bad.push(`가장 작은 글자가 ${Math.min(...fonts)}px. ${MIN_PX}px 미만은 읽기 어렵다`);

// ── ② 자판으로 글에서 글로 ───────────────────────────────────────────
await page.focus('#host .atlas-canvas');
await page.keyboard.press('Enter');
await page.waitForTimeout(120);
const seen = [];
for (let i = 0; i < 3; i += 1) {
  await page.keyboard.press(']');
  await page.waitForTimeout(140);
  /* ★ **제목이 아니라 id 로 센다**. 이 지도엔 제목까지 같은 글이 넷 있어서, 제목으로
     세면 서로 다른 글이 같은 글로 보인다(그것 때문에 이 자가 한 번 헛빨개졌다). */
  seen.push(await page.evaluate(() => {
    const el = document.querySelector('#host .atlas-card-title');
    return el ? (el.getAttribute('data-doc-id') || el.textContent || '') : '';
  }));
}
const uniq = [...new Set(seen.filter(Boolean))];
console.log('  ② 세 번의 결과: ' + JSON.stringify(seen.map((t) => t.slice(-28))));
console.log(`  ② 대괄호 세 번 → 고른 글 ${uniq.length}가지: ${uniq.map((t) => t.slice(-20)).join(' → ')}`);
if (uniq.length < 3) bad.push(`자판으로 글에서 글로 못 옮겨 다닌다 (세 번 눌러 ${uniq.length}가지). 마우스 없이는 옆 글로 갈 길이 없다`);
/* 되돌아가기도 되는지. 한 방향만 되면 반쪽이다. */
await page.keyboard.press('[');
await untilSettled(page, () => page.evaluate(() => document.querySelector('#host .atlas-card-title')?.getAttribute('data-doc-id') || ''));
const back = await page.evaluate(() => {
  const el = document.querySelector('#host .atlas-card-title');
  return el ? (el.getAttribute('data-doc-id') || el.textContent || '') : '';
});
console.log(`  ② 되돌아가기 → ${back.slice(-24)}`);
if (!back || back === seen[seen.length - 1]) bad.push('앞으로만 가고 되돌아오지 못한다');
await page.close();

// ── ③ 사용자 글자 크기 존중 ──────────────────────────────────────────
const big = await open('32px');
await big.evaluate(() => { window.__atlasControl?.zoom(6, 600, 380); window.__atlasControl?.draw(); });
await untilSettled(big, () => big.evaluate(() => window.__atlasFonts || []));
const bigFonts = await big.evaluate(() => window.__atlasFonts || []);
await big.close();
const grew = bigFonts.length && fonts.length && Math.max(...bigFonts) > Math.max(...fonts) * 1.5;
console.log(`  ③ 브라우저 글자를 두 배(32px)로 → 캔버스 글자 ${bigFonts.join(', ')}px`);
if (!grew) bad.push('사용자가 글자를 키워도 캔버스 글자가 안 커진다. px 로 박아 뒀다');

await browser.close();

if (bad.length) {
  console.log('[a11y] **접근성 짧은 목록에서 빠진 것이 있다**');
  for (const x of bad) console.log('  - ' + x);
  console.log('  캔버스 글자는 rem 을 따르고 12px 바닥을 두게, 자판은 글에서 글로 가게 고쳐라.');
  process.exit(1);
}
console.log(`[a11y] 글자 ${Math.min(...fonts)}px 이상, 자판으로 글에서 글로, 사용자가 키우면 따라 커진다`);
