/**
 * 사진 크기 맞추기가 기준을 진짜로 맞추는지 확인한다 (TASK-KL-088)
 *
 * 「줄였다」는 쉽다. 이 도구의 약속은 **준 기준 아래로 떨어뜨린다**이므로 그걸 재야 한다.
 *
 *  ① 긴 변 맞추기: 큰 사진을 640 으로 → 긴 변이 정확히 640, 비율 유지
 *  ② 용량 맞추기: 1MB 기준 → 결과가 1MB 이하
 *  ③ 원본보다 키우지 않기: 작은 사진에 4000px 를 걸어도 커지지 않는가
 *     — 「줄이려고 눌렀는데 커졌다」가 이 도구에서 가장 나쁜 결과다
 *
 * 사용: node scripts/test-imgresize.mjs
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
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; }, ensureScript: async () => {} };
});
await page.addScriptTag({ content: read('js/widgets/tools/imgresize.js') });

const out = await page.evaluate(async () => {
  const tool = window.__reg['imgresize'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  await window.__karmoWaitDrawn(host);
  /** 잘 안 눌리는(용량 큰) 사진을 만든다 — 매끈한 그림은 몇 KB 라 용량 시험이 안 된다 */
  const makePhoto = async (w, h) => {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const im = ctx.createImageData(w, h);
    for (let i = 0; i < im.data.length; i += 4) {
      im.data[i] = Math.random() * 255;
      im.data[i + 1] = Math.random() * 255;
      im.data[i + 2] = Math.random() * 255;
      im.data[i + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    const b = await new Promise((r) => cv.toBlob(r, 'image/png'));
    return new File([b], '사진.png', { type: 'image/png' });
  };

  const feed = async (file) => {
    const input = await window.__karmoWaitIn(host, '#irFile');
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    for (let i = 0; i < 100 && !/맞추기를 누르세요/.test(host.querySelector('#irStatus').textContent); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const runAndMeasure = async () => {
    host.querySelector('#irRun').click();
    for (let i = 0; i < 300 && host.querySelector('#irPreview').style.display === 'none'; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const blob = await (await fetch(host.querySelector('#irPreview').src)).blob();
    const bmp = await createImageBitmap(blob);
    return { bytes: blob.size, w: bmp.width, h: bmp.height };
  };

  // ① 긴 변 맞추기
  const big = await makePhoto(1600, 900);
  await feed(big);
  host.querySelector('[data-side="640"]').click();
  const side = await runAndMeasure();
  const sideOk = side.w === 640 && side.h === 360;

  // ② 용량 맞추기 (1MB)
  host.querySelector('#irMode [data-mode="bytes"]').click();
  host.querySelector('#irBytes').value = '1';
  host.querySelector('#irBytes').dispatchEvent(new Event('input'));
  host.querySelector('#irPreview').style.display = 'none';
  const bytes = await runAndMeasure();
  const bytesOk = bytes.bytes <= 1024 * 1024;

  // ③ 작은 사진 + 큰 목표 → 안 커져야 한다
  const small = await makePhoto(200, 150);
  await feed(small);
  host.querySelector('#irMode [data-mode="side"]').click();
  host.querySelector('#irSide').value = '4000';
  host.querySelector('#irSide').dispatchEvent(new Event('input'));
  host.querySelector('#irPreview').style.display = 'none';
  const noUp = await runAndMeasure();
  const noUpOk = noUp.w === 200 && noUp.h === 150;

  return {
    ok: sideOk && bytesOk && noUpOk,
    why:
      `긴 변 640 → ${side.w}x${side.h} ${sideOk ? '✓' : '✗'} · ` +
      `1MB 기준 → ${(bytes.bytes / 1048576).toFixed(2)}MB ${bytesOk ? '✓' : '✗'} · ` +
      `작은 사진에 4000px → ${noUp.w}x${noUp.h} (안 커져야) ${noUpOk ? '✓' : '✗'}`
  };
});

await browser.close();

console.log(`${out.ok ? '  OK' : '  X '} ${out.why}`);
if (!out.ok) {
  console.error('[test-imgresize] 기준을 못 맞췄거나, 줄이랬는데 키웠다');
  process.exit(1);
}
console.log('[test-imgresize] 긴 변·용량 기준을 맞추고 원본보다 키우지 않는 것까지 확인');
