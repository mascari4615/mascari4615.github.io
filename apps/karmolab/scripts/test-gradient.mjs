/**
 * 그라데이션의 「가운데가 안 죽는다」가 진짜인지 확인한다 (TASK-KL-088)
 *
 * 이 도구의 주장은 하나다 — 그냥 섞으면 가운데가 탁해지고, 눈에 맞춰 섞으면 안 그렇다.
 * 주장을 화면에 적기는 쉽고, 계산이 틀려도 그림은 그럴듯하게 나온다.
 *
 * 그래서 파랑↔노랑의 **가운데 색 밝기**를 재서, 눈에 맞춘 쪽이 실제로 더 밝은지 본다.
 * (그냥 섞으면 중간이 어둡고 탁해진다. 이것이 이 도구가 존재하는 이유다.)
 *
 * 사용: node scripts/test-gradient.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveAppAssets } from './lib/widget-harness.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
await serveAppAssets(page, root);
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; }, copyText: () => Promise.resolve() };
});
await page.addScriptTag({ content: read('js/widgets/tools/gradient.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['gradient'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);
  await window.__karmoWaitDrawn(host);
  const set = (from, to) => {
    host.querySelector('#grFrom').value = from;
    host.querySelector('#grFrom').dispatchEvent(new Event('input'));
    host.querySelector('#grTo').value = to;
    host.querySelector('#grTo').dispatchEvent(new Event('input'));
  };

  // 파랑 ↔ 노랑 — 그냥 섞으면 가운데가 회색으로 죽는 대표적인 조합
  set('#0000ff', '#ffff00');
  const msg = host.querySelector('#grStatus').textContent;

  // 안내에 적힌 두 가운데 색을 꺼내 밝기를 잰다
  const hexes = msg.match(/#[0-9a-f]{6}/gi) || [];
  if (hexes.length < 2) return { ok: false, why: '가운데 색을 안내에서 찾지 못했다: ' + msg };
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const plain = lum(hexes[0]);
  const perceptual = lum(hexes[1]);

  // CSS 가 실제로 만들어지는지
  const css = host.querySelector('#grCss').value;
  host.querySelector('#grSmooth').checked = true;
  host.querySelector('#grSmooth').dispatchEvent(new Event('change'));
  const smooth = host.querySelector('#grCss').value;
  const moreStops = (smooth.match(/#[0-9a-f]{6}/gi) || []).length > (css.match(/#[0-9a-f]{6}/gi) || []).length;

  return {
    ok: perceptual > plain * 1.3 && css.startsWith('background:') && css.includes('linear-gradient') && moreStops,
    why: `가운데 밝기 그냥 ${plain.toFixed(3)} → 눈에 맞춤 ${perceptual.toFixed(3)} (1.3배 이상 밝아야 함) · CSS ${css.slice(0, 28)}… · 단계 늘어남 ${moreStops}`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-gradient] 그라데이션 섞기가 주장대로 돌지 않는다');
  process.exit(1);
}
console.log('[test-gradient] 눈에 맞춘 섞기가 실제로 가운데를 살리는 것까지 확인');
