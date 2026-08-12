/**
 * 체크 상자를 손가락으로 누를 수 있는지 확인한다 (TASK-KL-088)
 *
 * 체크 상자는 그 자체가 13px 이다. 감싼 이름표가 자라 주지 않으면 누를 곳이 22px 밖에 안 되고,
 * 폰에서 자꾸 빗나간다. 눈으로는 멀쩡해 보여서 아무도 신고하지 않는 종류의 문제다.
 *
 * 도구마다 인라인 스타일로 짜여 있어 공용 CSS 한 곳에서 잡았는데, 그 규칙이 실제로 먹는지는
 * 재 봐야 안다 — 인라인 스타일이 이기면 아무 일도 안 일어난다.
 *
 * 사용: node scripts/test-taptarget.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveAppAssets } from './lib/widget-harness.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// 실제로 22px 이었던 넉 장 + 대조로 잘 되던 것 하나
const TOOLS = ['textdiff', 'uuidgen', 'hashgen', 'asciiart', 'textredact'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 800 } }); // 폰 폭
await serveAppAssets(page, root);
await page.goto('http://localhost/');
await page.addStyleTag({ content: read('css/tools.css') });
await page.evaluate(() => {
  window.__reg = {};
  // 도구들이 부르는 말풍선 — 여기서는 아무 일도 안 하면 된다
  window.Mdd = { linePreset() {}, line() {}, say() {} };
  window.Toolbox = {
    register: (t) => { window.__reg[t.id] = t; },
    trackUse() {}, copyText() {}, showToast() {}, mountTool() { return true; },
    ensureScript: async () => {}
  };
});
for (const id of TOOLS) {
  try {
    await page.addScriptTag({ content: read(`js/widgets/tools/${id}.js`) });
  } catch {
    await page.addScriptTag({ content: read(`js/widgets/${id}.js`) });
  }
}

const out = await page.evaluate((tools) => {
  const small = [];
  let checked = 0;
  for (const id of tools) {
    const tool = window.__reg[id];
    if (!tool) return { ok: false, why: `${id} 위젯이 등록되지 않았다` };
    const host = document.createElement('div');
    host.className = 'tool-page';
    document.body.appendChild(host);
    try { tool.tabs[0].build(host); } catch (e) { return { ok: false, why: id + " 화면을 못 만들었다: " + e.message }; }
    for (const el of host.querySelectorAll('input[type=checkbox], input[type=radio]')) {
      const box = (el.closest('label') || el).getBoundingClientRect();
      if (!box.width) continue;
      checked++;
      if (Math.min(box.width, box.height) < 32) {
        small.push(`${id} ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
  }
  return {
    ok: checked > 0 && small.length === 0,
    why: checked === 0 ? '잰 것이 하나도 없다 — 검사가 헛돌고 있다: ' + small.join(' / ') : `${checked}개 잼 · 32px 미만 ${small.length ? small.join(' , ') : '없음'}`
  };
}, TOOLS);

await browser.close();

console.log(`${out.ok ? '  OK' : '  X '} ${out.why}`);
if (!out.ok) {
  console.error('[test-taptarget] 체크 상자를 누를 곳이 손가락보다 작다');
  process.exit(1);
}
console.log('[test-taptarget] 폰 폭에서 체크 상자 누를 곳이 모두 32px 이상인 것까지 확인');
