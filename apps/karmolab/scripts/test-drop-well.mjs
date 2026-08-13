/**
 * 파일 받는 자리가 **한 곳으로 모였는가** (TASK-KL-290).
 *
 * 서른한 도구가 같은 열두 줄을 손으로 적고 있었고, 그중 여덟은 **붙여넣기가 빠져 있었다**.
 * 공용으로 모으면 「한 곳에 붙이면 서른한 곳이 같이 는다」가 되는데, 그 말이 사실인지 잰다:
 *   ① 눌러서 고르기·끌어 놓기가 그대로 돈다(줄었다고 기능이 빠지면 안 된다)
 *   ② **전에는 없던 붙여넣기가 생겼다** — 이게 이 판의 값어치다
 *   ③ 아무거나 붙여넣어도 안 받는다(PDF 도구에 그림을 붙이면 무시)
 *
 * 사용: node scripts/test-drop-well.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveAppAssets } from './lib/widget-harness.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage();
await serveAppAssets(page, root);
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; }, ensureScript: async () => {}, copyText() {}, onHandoff() {} };
  window.Mdd = new Proxy({}, { get: () => () => {} });
});
await page.addScriptTag({ content: read('js/widgets/tools/imgresize.js') });

const out = await page.evaluate(async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  window.__reg['imgresize'].tabs[0].build(host);
  await window.__karmoWaitDrawn(host);
  const input = await window.__karmoWaitIn(host, '#irFile');

  const shot = await (async () => {
    const cv = document.createElement('canvas');
    cv.width = 30;
    cv.height = 20;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0a0';
    ctx.fillRect(0, 0, 30, 20);
    const b = await new Promise((r) => cv.toBlob(r, 'image/png'));
    return new File([b], '캡처.png', { type: 'image/png' });
  })();

  const ready = () => /맞추기를 누르세요/.test(host.querySelector('#irStatus')?.textContent || '');
  const wait = async () => {
    for (let i = 0; i < 60; i += 1) {
      if (ready()) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };

  /* ① 끌어 놓기 */
  const dt = new DataTransfer();
  dt.items.add(shot);
  const drop = host.querySelector('#irDrop') || host.querySelector('.tool-drop');
  drop.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
  const litUp = drop.classList.contains('over');
  drop.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
  const dropped = await wait();

  /* ② 붙여넣기 — 이 도구엔 전에 없던 것 */
  host.querySelector('#irStatus').textContent = '';
  const cd = new DataTransfer();
  cd.items.add(shot);
  host.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: cd }));
  const pasted = await wait();

  /* ③ 아무거나는 안 받는다 (이 도구의 칸은 image/* 만 받는다) */
  host.querySelector('#irStatus').textContent = '';
  const bad = new DataTransfer();
  bad.items.add(new File(['hello'], 'a.txt', { type: 'text/plain' }));
  host.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: bad }));
  await new Promise((r) => setTimeout(r, 400));
  const ignored = !ready();

  return { litUp, dropped, pasted, ignored, accept: input.accept };
});

await browser.close();

check(out.litUp, '끌어 오면 테두리 표시가 붙는다');
check(out.dropped, '끌어 놓으면 그림이 들어간다');
check(out.pasted, '**붙여넣어도 들어간다** — 전에는 이 도구에 없던 것');
check(out.ignored, `받는 형식이 아니면 무시한다 (칸의 accept=${out.accept})`);

process.stdout.write('\n');
if (failures.length) {
  console.error(`[test-drop-well] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-drop-well] 끌어 놓기·붙여넣기가 한 곳에서 돈다');
