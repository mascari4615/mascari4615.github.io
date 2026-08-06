/**
 * 글자 카드가 긴 글을 잘라먹지 않는지 확인한다 (TASK-KL-088)
 *
 * 약속은 하나다 — **긴 글도 안 잘린다**. 그런데 잘려도 그림은 멀쩡히 나온다.
 * 그래서 짧은 글과 아주 긴 글을 넣어 ① 글자 크기가 실제로 줄어드는지
 * ② 그려진 내용이 세로로 넘치지 않는지(맨 위·맨 아래 여백에 잉크가 없는지) 잰다.
 *
 * 사용: node scripts/test-text2img.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route('**/*', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' })
);
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; } };
});
await page.addScriptTag({ content: read('js/widgets/tools/text2img.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['text2img'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  const set = (text) => {
    host.querySelector('#tiText').value = text;
    host.querySelector('#tiText').dispatchEvent(new Event('input'));
    return host.querySelector('#tiStats').textContent;
  };
  const fontOf = (s) => Number((s.match(/글자 크기(\d+)px/) || [])[1] || 0);

  const shortStats = set('짧은 글.');
  const shortFont = fontOf(shortStats);

  const long = '이것은 아주 긴 문장입니다. '.repeat(30);
  const longStats = set(long);
  const longFont = fontOf(longStats);

  // 그려진 잉크가 위아래 여백을 넘지 않는지 — 넘치면 잘린 것이다
  const canvas = host.querySelector('#tiCanvas');
  const ctx = canvas.getContext('2d');
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const rowHasInk = (y) => {
    for (let x = 0; x < canvas.width; x += 3) {
      const i = (y * canvas.width + x) * 4;
      // 배경보다 밝은 글자색을 찾는다 (어두운 테마 기준)
      if (d[i] > 180 && d[i + 1] > 180) return true;
    }
    return false;
  };
  const topClear = !rowHasInk(4) && !rowHasInk(12);
  const bottomClear = !rowHasInk(canvas.height - 5) && !rowHasInk(canvas.height - 13);

  return {
    ok: longFont < shortFont && longFont > 10 && topClear && bottomClear,
    why: `짧은 글 ${shortFont}px → 긴 글 ${longFont}px (줄어야 함) · 위 여백 깨끗 ${topClear} · 아래 여백 깨끗 ${bottomClear}`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-text2img] 글자 카드가 긴 글을 제대로 담지 못한다');
  process.exit(1);
}
console.log('[test-text2img] 긴 글에서 크기를 줄여 잘리지 않는 것까지 확인');
