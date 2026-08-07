/**
 * 붙여넣기로 사진이 실제로 들어가는지 확인한다 (TASK-KL-088)
 *
 * 이 기능은 **안 되어도 아무 표시가 없다** — 붙여넣어도 그냥 조용하다.
 * 실제로 한 번은 import 만 들어가고 연결이 빠진 채로 코드가 멀쩡해 보였다.
 * 그래서 붙여넣기 사건을 실제로 쏘고 목록이 늘어나는지 본다.
 *
 * 글자를 적는 중에는 가로채면 안 된다는 것도 함께 잰다 — 그게 더 나쁜 고장이다.
 *
 * 사용: node scripts/test-paste.mjs
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
await page.addScriptTag({ content: read('js/widgets/tools/imgmerge.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['imgmerge'];
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  const solid = (c) =>
    new Promise((r) => {
      const cv = document.createElement('canvas');
      cv.width = 40; cv.height = 40;
      const x = cv.getContext('2d');
      x.fillStyle = c;
      x.fillRect(0, 0, 40, 40);
      cv.toBlob(r, 'image/png');
    });

  const paste = (file) => {
    const dt = new DataTransfer();
    dt.items.add(file);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  };

  const listCount = () => host.querySelector('#imList').children.length;

  paste(new File([await solid('#ff0000')], 'a.png', { type: 'image/png' }));
  await new Promise((r) => setTimeout(r, 500));
  const afterPaste = listCount();

  // 글자를 적는 중에는 가로채면 안 된다
  const input = host.querySelector('#imBg');
  input.focus();
  paste(new File([await solid('#00ff00')], 'b.png', { type: 'image/png' }));
  await new Promise((r) => setTimeout(r, 400));
  const afterTyping = listCount();
  input.blur();

  return {
    ok: afterPaste === 1 && afterTyping === 1,
    why: `붙여넣기 뒤 ${afterPaste}장 (1이어야 함) · 입력칸에 있을 때 ${afterTyping}장 (안 늘어야 함)`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-paste] 붙여넣기가 제대로 돌지 않는다');
  process.exit(1);
}
console.log('[test-paste] 붙여넣기가 들어가고, 글자 적는 중에는 안 가로채는 것 확인');
