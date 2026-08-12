/**
 * 사진 이어 붙이기가 순서와 내용을 지키는지 확인한다 (TASK-KL-088)
 *
 * 조용히 어긋나는 자리:
 *  ① 순서가 뒤바뀜 — 크기는 맞아서 눈치채기 어렵다
 *  ② 한 장이 빠지고 그 자리가 배경색으로 남음 — 파일은 멀쩡하다
 *  ③ 폭이 다를 때 한쪽으로 쏠려 계단이 됨
 *
 * 그래서 **색이 다른 사진 세 장**을 넣고, 결과에서 위·가운데·아래 색을 읽어 순서를 확인한다.
 * 폭이 다른 장을 섞어 가운데 정렬까지 본다.
 *
 * 사용: node scripts/test-imgmerge.mjs
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
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; } };
});
await page.addScriptTag({ content: read('js/widgets/tools/imgmerge.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['imgmerge'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  const solid = (w, h, color) =>
    new Promise((r) => {
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const c = cv.getContext('2d');
      c.fillStyle = color;
      c.fillRect(0, 0, w, h);
      cv.toBlob(r, 'image/png');
    });

  // 폭이 서로 다르다 — 가운데 정렬이 도는지 함께 본다
  const files = [
    new File([await solid(200, 100, '#ff0000')], '1.png', { type: 'image/png' }),
    new File([await solid(100, 100, '#00ff00')], '2.png', { type: 'image/png' }),
    new File([await solid(200, 100, '#0000ff')], '3.png', { type: 'image/png' })
  ];
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  const input = await window.__karmoWaitIn(host, '#imFile');
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));

  const wait = (test, ms, why) =>
    new Promise((res, rej) => {
      const t0 = Date.now();
      const k = () => {
        if (test()) return res();
        if (Date.now() - t0 > ms) return rej(new Error(why + ' / 안내: ' + host.querySelector('#imStatus').textContent));
        setTimeout(k, 70);
      };
      k();
    });

  await wait(() => host.querySelector('#imList').children.length === 3, 10000, '사진이 들어가지 않았다');

  // 원본 그대로 이어 붙인다 (크기 맞추기를 끄면 가운데 정렬이 드러난다)
  host.querySelector('#imFit').value = 'none';
  host.querySelector('#imFit').dispatchEvent(new Event('change'));

  let out = null;
  const orig = URL.createObjectURL;
  URL.createObjectURL = (b) => { if (b && b.type === 'image/png') out = b; return orig(b); };
  host.querySelector('#imRun').click();
  await wait(() => out !== null, 15000, '이어 붙이기가 끝나지 않았다');
  URL.createObjectURL = orig;

  const img = await new Promise((r) => {
    const im = new Image();
    im.onload = () => r(im);
    im.onerror = () => r(null);
    im.src = orig(out);
  });
  if (!img) return { ok: false, why: '결과 그림을 열지 못했다' };

  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const c = cv.getContext('2d');
  c.drawImage(img, 0, 0);
  const at = (x, y) => {
    const d = c.getImageData(x, y, 1, 1).data;
    return `${d[0]},${d[1]},${d[2]}`;
  };

  const mid = Math.floor(cv.width / 2);
  const top = at(mid, 40);
  const center = at(mid, 140);
  const bottom = at(mid, 240);
  // 좁은 두 번째 장이 가운데 정렬됐다면, 그 줄의 왼쪽 끝은 배경(흰색)이어야 한다
  const leftOfNarrow = at(4, 140);

  return {
    ok:
      cv.width === 200 &&
      cv.height === 300 &&
      top === '255,0,0' &&
      center === '0,255,0' &&
      bottom === '0,0,255' &&
      leftOfNarrow === '255,255,255',
    why: `크기 ${cv.width}x${cv.height} (200x300) · 위/가운데/아래 ${top} / ${center} / ${bottom} · 좁은 장 왼쪽 ${leftOfNarrow} (배경이어야 함)`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-imgmerge] 사진 이어 붙이기가 순서나 자리를 지키지 못한다');
  process.exit(1);
}
console.log('[test-imgmerge] 순서대로 이어지고 좁은 장이 가운데 오는 것까지 확인');
