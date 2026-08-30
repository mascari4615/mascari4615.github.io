/**
 * 편집, 형식 변환이 약속대로 바꾸는가 (TASK-KL-280).
 *
 * 이 도구는 이번에 속을 공용 것(`loadImage`, `toCanvas`, `encode`)으로 갈아 끼웠다.
 * 겉보기는 같아야 하므로, **바꾼 결과의 성질**을 재서 못 박는다:
 *   ① 긴 변이 준 기준 아래로 내려가고 비율이 유지된다
 *   ② 원본보다 키우지 않는다
 *   ③ PNG 로 뽑으면 **투명이 살아 있고**, JPG 로 뽑으면 **흰 바탕**이 깔린다
 *      (JPG 는 투명을 못 담아 그냥 두면 검게 나온다. [[TASK-KL-272]] 와 같은 자리)
 *
 * 사용: node scripts/test-imgbatch.mjs
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
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; }, ensureScript: async () => {}, copyText() {} };
  window.Mdd = new Proxy({}, { get: () => () => {} });
  /* 결과는 화면에 링크로 안 남고 곧바로 내려받아진다. 만들어진 blob 을 여기서 주워 둔다
   * (도구를 고치지 않고 결과를 재는 유일한 자리다). */
  window.__blobs = [];
  const realCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => {
    if (b instanceof Blob) window.__blobs.push(b);
    return realCreate(b);
  };
});
await page.addScriptTag({ content: read('js/widgets/tools/imgbatch.js') });

const out = await page.evaluate(async () => {
  const tool = window.__reg['imgbatch'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);
  await window.__karmoWaitDrawn(host);

  /** 왼쪽 위는 투명, 오른쪽 아래만 빨강인 그림 */
  const madeFile = await (async (w, h) => {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(w / 2, h / 2, w / 2, h / 2);
    const b = await new Promise((r) => cv.toBlob(r, 'image/png'));
    return new File([b], '그림.png', { type: 'image/png' });
  })(400, 200);

  const run = async (format, max) => {
    const input = await window.__karmoWaitIn(host, '#ibFile');
    const dt = new DataTransfer();
    dt.items.add(madeFile);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 200));
    host.querySelector('#ibFormat').value = format;
    const maxEl = host.querySelector('#ibMax');
    maxEl.value = String(max);
    maxEl.dispatchEvent(new Event('input'));
    window.__blobs.length = 0;
    host.querySelector('#ibRun').click();
    /* 바뀐 그림은 **줄을 눌러야** 파일이 된다(그때 blob 주소가 생긴다). 사람이 하는 그대로 한다. */
    for (let i = 0; i < 200; i += 1) {
      const row = host.querySelector('#ibList [data-name]');
      if (row) {
        window.__blobs.length = 0;
        row.click();
        for (let k = 0; k < 50; k += 1) {
          const got = [...window.__blobs].reverse().find((b) => b.type === format);
          if (got) return got;
          await new Promise((r) => setTimeout(r, 60));
        }
        return null;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  };

  const pixelOf = async (blob) => {
    const bmp = await createImageBitmap(blob);
    const cv = document.createElement('canvas');
    cv.width = bmp.width; cv.height = bmp.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(3, 3, 1, 1).data;
    return { w: bmp.width, h: bmp.height, rgba: [d[0], d[1], d[2], d[3]] };
  };

  const png = await run('image/png', 200);
  const pngPx = png ? await pixelOf(png) : null;
  const jpg = await run('image/jpeg', 200);
  const jpgPx = jpg ? await pixelOf(jpg) : null;
  const big = await run('image/png', 4000);
  const bigPx = big ? await pixelOf(big) : null;

  return { ok: true, pngPx, jpgPx, bigPx };
});

await browser.close();

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};

check(!!out.pngPx, 'PNG 로 뽑힌다');
check(out.pngPx && out.pngPx.w === 200 && out.pngPx.h === 100, `긴 변 200, 비율 유지 (지금 ${out.pngPx?.w}x${out.pngPx?.h})`);
check(out.pngPx && out.pngPx.rgba[3] === 0, `PNG 는 투명이 살아 있다 (지금 알파 ${out.pngPx?.rgba[3]})`);
check(out.jpgPx && out.jpgPx.rgba[0] > 200 && out.jpgPx.rgba[2] > 200, `JPG 는 흰 바탕 (지금 rgb(${out.jpgPx?.rgba.slice(0, 3)}))`);
check(out.bigPx && out.bigPx.w === 400, `기준이 커도 원본보다 키우지 않는다 (지금 ${out.bigPx?.w})`);

process.stdout.write('\n');
if (failures.length) {
  console.error(`[test-imgbatch] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-imgbatch] 크기, 비율, 투명/흰바탕까지 확인');
