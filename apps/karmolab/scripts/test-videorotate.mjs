/**
 * 영상 돌리기가 진짜로 돌리는지 확인한다 (TASK-KL-088)
 *
 * 「돌렸다」는 눈으로 봐야 알 것 같지만, 표식을 하나 박아 두면 기계도 잴 수 있다.
 * 왼쪽 위에만 빨간 네모가 있는 영상을 만들어 오른쪽으로 90도 돌리면, 그 네모는
 * **오른쪽 위**로 가야 한다. 안 돌았으면 그대로 왼쪽 위에 있다.
 *
 *  ① 90도 돌리면 표식이 오른쪽 위로 가는가
 *  ② 그때 가로세로가 바뀌는가 (안 바꾸면 찌그러지거나 잘린다)
 *  ③ 좌우 뒤집기는 표식을 오른쪽으로 보내는가
 *
 * 사용: node scripts/test-videorotate.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveAppAssets } from './lib/widget-harness.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await serveAppAssets(page, root);
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; }, ensureScript: async () => {} };
});
await page.addScriptTag({ content: read('js/widgets/tools/videorotate.js') });

const out = await page.evaluate(async () => {
  const tool = window.__reg['videorotate'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  await window.__karmoWaitDrawn(host);
  // 가로 320 × 세로 180, 왼쪽 위에만 빨간 표식이 있는 영상을 만든다
  const src = document.createElement('canvas');
  src.width = 320; src.height = 180;
  const sc = src.getContext('2d');
  const paintFrame = () => {
    sc.fillStyle = '#ffffff'; sc.fillRect(0, 0, 320, 180);
    sc.fillStyle = '#ff0000'; sc.fillRect(10, 10, 60, 40);
  };
  paintFrame();
  const stream = src.captureStream(30);
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((r) => { rec.onstop = () => r(new Blob(chunks, { type: 'video/webm' })); });
  rec.start();
  for (let i = 0; i < 20; i++) { paintFrame(); await new Promise((r) => setTimeout(r, 50)); }
  rec.stop();
  const clip = await done;

  const input = await window.__karmoWaitIn(host, '#vrFile');
  const dt = new DataTransfer();
  dt.items.add(new File([clip], '시험.webm', { type: 'video/webm' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  for (let i = 0; i < 100 && !/맞으면 담으세요/.test(host.querySelector('#vrStatus').textContent); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!/맞으면 담으세요/.test(host.querySelector('#vrStatus').textContent)) {
    return { ok: false, why: '영상을 못 읽었다: ' + host.querySelector('#vrStatus').textContent };
  }

  const canvas = host.querySelector('#vrCanvas');
  /** 빨간 표식이 어느 구석에 있는지 찾는다 */
  const cornerOfMark = () => {
    const ctx = canvas.getContext('2d');
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (d[i] > 180 && d[i + 1] < 90 && d[i + 2] < 90) { sx += x; sy += y; n++; }
      }
    }
    if (!n) return '없음';
    return (sy / n < canvas.height / 2 ? '위' : '아래') + (sx / n < canvas.width / 2 ? '왼쪽' : '오른쪽');
  };
  const turnTo = (deg) => {
    host.querySelector(`#vrTurns [data-turn="${deg}"]`).click();
  };

  const before = { corner: cornerOfMark(), size: `${canvas.width}x${canvas.height}` };
  turnTo(90);
  const after90 = { corner: cornerOfMark(), size: `${canvas.width}x${canvas.height}` };
  turnTo(0);
  host.querySelector('#vrFlipH').checked = true;
  host.querySelector('#vrFlipH').dispatchEvent(new Event('change'));
  const flipped = cornerOfMark();

  return {
    ok:
      before.corner === '위왼쪽' && before.size === '320x180' &&
      after90.corner === '위오른쪽' && after90.size === '180x320' &&
      flipped === '위오른쪽',
    why:
      `그대로 ${before.corner}/${before.size} · ` +
      `90도 ${after90.corner}/${after90.size} (위오른쪽·180x320 이어야) · ` +
      `좌우뒤집기 ${flipped} (위오른쪽 이어야)`
  };
});

await browser.close();

console.log(`${out.ok ? '  OK' : '  X '} ${out.why}`);
if (!out.ok) {
  console.error('[test-videorotate] 안 돌았거나, 돌리고도 가로세로를 안 바꿨다');
  process.exit(1);
}
console.log('[test-videorotate] 표식이 실제로 옮겨가고 가로세로도 바뀌는 것까지 확인');
