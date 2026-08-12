/**
 * 파비콘 만들기 — 크기와 ico 규격을 확인한다 (TASK-KL-088)
 *
 * ico 는 머리말을 손으로 엮는다. 숫자 하나만 틀려도 **오류 없이** 안 열리는 파일이 나온다.
 * 브라우저는 ico 를 그림으로 열어 주므로, 만든 것을 되열어 크기를 재면 진짜인지 갈린다.
 *
 * PNG 쪽은 「몇 픽셀로 나왔나」가 전부다 — 크기가 틀리면 탭에서 뭉개진다.
 *
 * 사용: node scripts/test-favicon.mjs
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
await page.addScriptTag({ content: read('js/widgets/tools/favicon.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['favicon'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  await window.__karmoWaitDrawn(host);
  // 색이 뚜렷한 시험 로고
  const cv = document.createElement('canvas');
  cv.width = 400; cv.height = 400;
  const c = cv.getContext('2d');
  c.fillStyle = '#e02040';
  c.fillRect(0, 0, 400, 400);
  const src = await new Promise((r) => cv.toBlob(r, 'image/png'));

  const dt = new DataTransfer();
  dt.items.add(new File([src], 'logo.png', { type: 'image/png' }));
  const input = await window.__karmoWaitIn(host, '#fvFile');
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));

  const wait = (test, ms, why) =>
    new Promise((res, rej) => {
      const t0 = Date.now();
      const k = () => {
        if (test()) return res();
        if (Date.now() - t0 > ms) return rej(new Error(why + ' / 안내: ' + host.querySelector('#fvStatus').textContent));
        setTimeout(k, 70);
      };
      k();
    });
  await wait(() => host.querySelector('#fvEditor').style.display !== 'none', 10000, '그림을 읽지 못했다');

  // ico 만 받기 — 결과를 가로챈다
  let ico = null;
  const orig = URL.createObjectURL;
  URL.createObjectURL = (b) => { if (b && b.type === 'image/x-icon') ico = b; return orig(b); };
  host.querySelector('#fvIco').click();
  await wait(() => ico !== null, 15000, 'ico 가 만들어지지 않았다');
  URL.createObjectURL = orig;

  // 규격 확인: 머리말 + 담긴 장 수
  const bytes = new Uint8Array(await ico.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const reserved = view.getUint16(0, true);
  const type = view.getUint16(2, true);
  const count = view.getUint16(4, true);

  // 브라우저가 실제로 여는지 — 규격이 틀리면 여기서 크기가 0 이 된다
  const opened = await new Promise((r) => {
    const im = new Image();
    im.onload = () => r([im.naturalWidth, im.naturalHeight]);
    im.onerror = () => r([0, 0]);
    im.src = orig(ico);
  });

  // 미리보기 크기가 규격대로인지
  const shown = [...host.querySelectorAll('#fvPreview canvas')].map((x) => x.width);

  return {
    ok:
      reserved === 0 &&
      type === 1 &&
      count === 3 &&
      opened[0] > 0 &&
      shown.includes(16) &&
      shown.includes(32) &&
      shown.includes(180),
    why: `ico 머리말 ${reserved}/${type}/${count}장 · 브라우저가 연 크기 ${opened.join('x')} · 미리보기 ${shown.join(',')}`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-favicon] 파비콘/ico 가 제대로 만들어지지 않는다');
  process.exit(1);
}
console.log('[test-favicon] ico 가 규격에 맞고 브라우저가 실제로 여는 것까지 확인');
