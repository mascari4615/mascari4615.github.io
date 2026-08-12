/**
 * 영상에서 사진 뽑기를 진짜 영상으로 확인한다 (TASK-KL-088)
 *
 * 조용한 고장은 하나다: **여러 장을 뽑았는데 전부 같은 장면**.
 * 시간 이동이 끝나기 전에 그리면 그렇게 되는데, 장수도 맞고 파일도 나오고 오류도 안 난다.
 * 그래서 뽑은 장들의 색을 실제로 재서 **서로 다른 장면이 몇 가지인지** 센다.
 *
 * 크기도 함께 본다 — 원본 해상도로 나와야 이 도구를 쓸 이유가 있다(캡처와의 차이).
 *
 * 사용: node scripts/test-video2img.mjs
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
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; }, ensureScript: () => Promise.resolve() };
});
await page.addScriptTag({ content: read('js/widgets/tools/video2img.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['video2img'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  const W = 160, H = 120;
  const makeVideo = () =>
    new Promise((resolve) => {
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      const rec = new MediaRecorder(cv.captureStream(20), { mimeType: 'video/webm' });
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      let i = 0;
      rec.start();
      const tick = () => {
        // 장면마다 색이 확실히 다르게 — 같은 장면이 반복되면 바로 드러나도록
        ctx.fillStyle = `hsl(${(i * 40) % 360} 85% 50%)`;
        ctx.fillRect(0, 0, W, H);
        i++;
        if (i > 60) { rec.stop(); return; }
        setTimeout(tick, 50);
      };
      tick();
    });

  const file = new File([await makeVideo()], 'test.webm', { type: 'video/webm' });
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  const input = await window.__karmoWaitIn(host, '#viFile');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));

  const wait = (test, ms, why) =>
    new Promise((res, rej) => {
      const t0 = Date.now();
      const k = () => {
        if (test()) return res();
        if (Date.now() - t0 > ms) return rej(new Error(why + ' / 안내: ' + host.querySelector('#viStatus').textContent));
        setTimeout(k, 60);
      };
      k();
    });

  const video = host.querySelector('#viVideo');
  await wait(() => video.readyState >= 1 && video.duration > 0, 10000, '영상을 열지 못했다');

  host.querySelector('#viFormat').value = 'image/png';
  host.querySelector('#viEvery').value = '5'; // 0.5초마다
  host.querySelector('#viEvery').dispatchEvent(new Event('input'));
  host.querySelector('#viEvery2').click();

  await wait(() => host.querySelector('#viGrid').querySelectorAll('img').length > 3, 40000, '사진이 뽑히지 않았다');
  await wait(() => host.querySelector('#viStatus').textContent.includes('뽑았어요'), 40000, '뽑기가 끝나지 않았다');

  const imgs = [...host.querySelector('#viGrid').querySelectorAll('img')];
  const colors = [];
  let naturalW = 0;
  for (const im of imgs) {
    await new Promise((r) => { if (im.complete && im.naturalWidth) return r(); im.onload = r; im.onerror = r; });
    naturalW = im.naturalWidth;
    const cv = document.createElement('canvas');
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const c = cv.getContext('2d');
    c.drawImage(im, 0, 0);
    const d = c.getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data;
    colors.push(`${d[0]},${d[1]},${d[2]}`);
  }
  const distinct = [...new Set(colors)];

  return {
    ok: imgs.length >= 4 && distinct.length >= Math.min(4, imgs.length) && naturalW === W,
    why: `${imgs.length}장 · 서로 다른 장면 ${distinct.length}가지 · 크기 ${naturalW}px (원본 ${W}px 이어야 함)`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-video2img] 사진 뽑기가 제대로 돌지 않는다');
  process.exit(1);
}
console.log('[test-video2img] 장면마다 다른 사진이 원본 크기로 나오는 것까지 확인');
