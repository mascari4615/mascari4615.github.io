/**
 * 영상 자르기 위젯을 진짜 영상으로 끝까지 돌려 본다 (TASK-KL-088)
 *
 * 이 도구는 구간을 **실제로 재생하며 담는다**. 그래서 조용히 어긋날 자리가 둘이다:
 *  ① 시작 지점으로 옮기기 전에 담기 시작하면 엉뚱한 데서 시작된다
 *  ② 끝 지점에서 멈추지 못하면 영상 끝까지 담긴다
 * 둘 다 오류가 안 난다 — 파일은 나오고, 내용만 틀린다.
 *
 * 그래서 결과의 **길이**를 재서 고른 구간과 맞는지 본다. 길이가 맞아야 시작·끝 둘 다 맞은 것이다.
 *
 * 사용: node scripts/test-videotrim.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
/*
 * ★ `/apps/karmolab/js/**` 요청은 **디스크의 진짜 산출물**로 돌려준다 (2026-08-12).
 *   위젯의 build() 는 말 묶음(i18n)을 받아 온 **뒤에** 그린다. 그 loader 는 묶음이 실렸는지까지
 *   보고 안 실렸으면 reject 하므로, 껍데기 HTML 을 돌려주면 그리기가 영영 안 일어나고
 *   `#vtFile` 이 null 이라 「Cannot set properties of null」로 죽는다 — 검사가 굶긴 것이다.
 *   (자매 검사 test-video2gif.mjs · smoke-core-parity.mjs 와 같은 처방.)
 */
await page.route('**/*', (route) => {
  const url = new URL(route.request().url());
  const rel = url.pathname.replace(/^\/apps\/karmolab\//, '');
  const onDisk = rel !== url.pathname ? path.join(root, rel) : null;
  if (onDisk && fs.existsSync(onDisk)) {
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: fs.readFileSync(onDisk)
    });
  }
  return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
});
await page.goto('http://localhost/');

await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; } };
  /* 러너 브라우저 취향(영어)에 따라 받아오는 묶음이 바뀌지 않게 언어를 못 박는다. */
  window.__KARMO_LOCALE = 'ko';
});
await page.addScriptTag({ content: read('js/widgets/tools/videotrim.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['videotrim'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  // 4초짜리 시험 영상 (소리 없이 화면만 — 담기 경로는 동일하다)
  const makeVideo = () =>
    new Promise((resolve) => {
      const cv = document.createElement('canvas');
      cv.width = 160; cv.height = 120;
      const ctx = cv.getContext('2d');
      const rec = new MediaRecorder(cv.captureStream(20), { mimeType: 'video/webm' });
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      let i = 0;
      rec.start();
      const tick = () => {
        ctx.fillStyle = `hsl(${(i * 12) % 360} 80% 50%)`;
        ctx.fillRect(0, 0, 160, 120);
        i++;
        if (i > 80) { rec.stop(); return; }
        setTimeout(tick, 50);
      };
      tick();
    });

  const file = new File([await makeVideo()], 'test.webm', { type: 'video/webm' });
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  /* build() 는 말 묶음을 받아 온 뒤에 그린다 — 그려질 때까지 기다린다(sleep 아님). */
  const waitEl = async (sel, ms = 8000) => {
    const until = Date.now() + ms;
    for (;;) {
      const found = host.querySelector(sel);
      if (found) return found;
      if (Date.now() > until) throw new Error(`${sel} 이 ${ms}ms 안에 안 그려졌다 — build() 가 기다리는 말 묶음이 안 온다`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };

  const input = await waitEl('#vtFile');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));

  const wait = (test, ms, why) =>
    new Promise((res, rej) => {
      const t0 = Date.now();
      const k = () => {
        if (test()) return res();
        if (Date.now() - t0 > ms) return rej(new Error(why));
        setTimeout(k, 60);
      };
      k();
    });

  const video = host.querySelector('#vtVideo');
  await wait(() => video.readyState >= 1 && video.duration > 0, 8000, '영상을 열지 못했다');
  const duration = video.duration;

  // 가운데 1초쯤만 남기도록 손잡이를 옮긴다
  const startRatio = 0.3, endRatio = 0.55;
  host.querySelector('#vtStart').value = String(Math.round(startRatio * 1000));
  host.querySelector('#vtStart').dispatchEvent(new Event('input'));
  host.querySelector('#vtEnd').value = String(Math.round(endRatio * 1000));
  host.querySelector('#vtEnd').dispatchEvent(new Event('input'));
  const wanted = (endRatio - startRatio) * duration;

  host.querySelector('#vtRun').click();
  const preview = host.querySelector('#vtPreview');
  await wait(() => preview.src && preview.src.startsWith('blob:'), 40000, '자른 결과가 나오지 않았다');

  // 담긴 길이를 잰다. MediaRecorder 결과는 길이 정보가 비어 있을 수 있어,
  // 끝으로 한 번 몰아 준 뒤 읽는다(널리 쓰이는 방법).
  const measured = await new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      if (v.duration === Infinity || Number.isNaN(v.duration)) {
        v.currentTime = 1e6;
        v.ontimeupdate = () => { v.ontimeupdate = null; resolve(v.duration); };
      } else resolve(v.duration);
    };
    v.onerror = () => resolve(-1);
    v.src = preview.src;
  });

  const off = Math.abs(measured - wanted);
  return {
    ok: measured > 0 && off < Math.max(0.5, wanted * 0.35),
    why: `원본 ${duration.toFixed(1)}초 · 고른 구간 ${wanted.toFixed(1)}초 · 담긴 길이 ${measured.toFixed(1)}초 (차이 ${off.toFixed(2)}초)`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-videotrim] 자른 구간이 고른 구간과 맞지 않는다');
  process.exit(1);
}
console.log('[test-videotrim] 고른 구간만큼 잘라 내는 것까지 확인');
