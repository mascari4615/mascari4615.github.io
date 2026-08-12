/**
 * 영상 → GIF 위젯을 진짜 영상으로 끝까지 돌려 본다 (TASK-KL-088)
 *
 * 압축기만 따로 확인해서는(`test-gif.mjs`) 부족하다. 이 도구의 위험한 자리는 압축이 아니라
 * **영상에서 화면을 한 장씩 꺼내는 부분**이다 — 시간 이동이 끝나기를 기다리지 않고 그리면
 * 같은 장면만 반복해 담기거나 아예 검은 화면이 나오는데, 오류는 하나도 안 난다(무음 실패).
 *
 * 그래서 브라우저 안에서 시험용 영상을 직접 만들고, 위젯 코드를 그대로 태워
 * 결과 GIF 가 ① 열리고 ② 크기가 맞고 ③ **장면이 실제로 바뀌는지** 본다.
 * ③ 이 없으면 「돌아가는 것처럼 보이는 고장」을 못 잡는다.
 *
 * 사용: node scripts/test-video2gif.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
// about:blank 에서는 장을 번호로 꺼내는 기능(ImageDecoder)이 없다 — 안전한 출처에서만 열린다.
// 네트워크는 쓰지 않고, localhost 요청을 가로채 빈 문서를 돌려준다.
/*
 * ★ `/apps/karmolab/js/**` 요청은 **디스크의 진짜 산출물**로 돌려준다 (2026-08-12).
 *   위젯의 build() 는 이제 말 묶음(i18n)을 받아 온 **뒤에** 그린다. 그 loader 는 묶음이
 *   `window.__KARMO_I18N` 에 실렸는지까지 보고 안 실렸으면 reject 한다(조용한 누락 금지).
 *   껍데기 HTML 을 돌려주면 그리기가 영영 안 일어나고, 검사는 `#vgFile` 이 null 이라
 *   「Cannot set properties of null」로 죽는다 — 제품이 아니라 검사가 굶긴 것이다.
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

// 위젯은 Toolbox 에 자기를 등록한다. 진짜 Toolbox 대신 등록만 받아 두는 가짜를 놓고,
// 위젯이 만든 화면을 우리가 직접 조작한다 = 위젯 코드 그대로를 시험한다.
await page.evaluate(() => {
  window.__registered = {};
  window.Toolbox = {
    register: (tool) => {
      window.__registered[tool.id] = tool;
    },
    trackUse: () => {},
    mountTool: () => true
  };
  /* 러너 브라우저 취향(영어)에 따라 받아오는 묶음이 바뀌지 않게 언어를 못 박는다. */
  window.__KARMO_LOCALE = 'ko';
});
await page.addScriptTag({ content: read('js/widgets/tools/gifenc.js') });
await page.addScriptTag({ content: read('js/widgets/tools/video2gif.js') });

const result = await page.evaluate(async () => {
  const tool = window.__registered['video2gif'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  // 장면이 뚜렷하게 바뀌는 시험용 영상을 만든다 — 배경색이 빨강 → 초록 → 파랑 으로 넘어간다.
  const makeVideo = () =>
    new Promise((resolve, reject) => {
      const cv = document.createElement('canvas');
      cv.width = 120;
      cv.height = 90;
      const ctx = cv.getContext('2d');
      const stream = cv.captureStream(20);
      const chunks = [];
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      rec.onerror = () => reject(new Error('녹화 실패'));
      const colors = ['#e02020', '#20c020', '#2040e0'];
      let i = 0;
      rec.start();
      const tick = () => {
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(0, 0, cv.width, cv.height);
        i++;
        if (i > 12) {
          rec.stop();
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    });

  const blob = await makeVideo();
  const file = new File([blob], 'test.webm', { type: 'video/webm' });

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  /* build() 는 말 묶음을 받아 온 뒤에 그린다 — 그려질 때까지 기다린다(sleep 아님). */
  const waitEl = async (sel, ms = 8000) => {
    const until = Date.now() + ms;
    for (;;) {
      const el = host.querySelector(sel);
      if (el) return el;
      if (Date.now() > until) throw new Error(`${sel} 이 ${ms}ms 안에 안 그려졌다 — build() 가 기다리는 말 묶음이 안 온다`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };

  const input = await waitEl('#vgFile');
  const video = host.querySelector('#vgVideo');

  // 위젯이 파일을 받는 길 그대로 태운다
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));

  const waitFor = (test, ms, why) =>
    new Promise((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        if (test()) return resolve();
        if (Date.now() - t0 > ms) return reject(new Error(why));
        setTimeout(tick, 60);
      };
      tick();
    });

  await waitFor(() => video.readyState >= 1 && video.duration > 0, 8000, '영상을 열지 못했다');
  const duration = video.duration;

  // 작고 빠르게: 가로 120, 초당 8장, 구간은 영상 전체
  host.querySelector('#vgWidth').value = '120';
  host.querySelector('#vgWidth').dispatchEvent(new Event('input'));
  host.querySelector('#vgFps').value = '8';
  host.querySelector('#vgFps').dispatchEvent(new Event('input'));

  host.querySelector('#vgRun').click();
  const preview = host.querySelector('#vgPreview');
  await waitFor(() => preview.src && preview.src.startsWith('blob:'), 30000, 'GIF 가 만들어지지 않았다');
  await waitFor(() => preview.complete && preview.naturalWidth > 0, 8000, '만든 GIF 를 브라우저가 열지 못했다');

  // 장면이 진짜 바뀌는지 확인한다.
  // 주의: <img> 를 캔버스에 그려 재면 안 된다 — 브라우저가 움직이는 그림을 언제 다음 장으로
  // 넘길지는 화면 노출·탭 상태에 달려 있어, 멀쩡한 GIF 도 「안 바뀜」으로 나온다(실제로 겪었다).
  // 그래서 장을 **번호로 직접 꺼내** 비교한다.
  const bytes = await (await fetch(preview.src)).arrayBuffer();
  const dec = new ImageDecoder({ data: bytes, type: 'image/gif' });
  await dec.tracks.ready; // 이걸 안 기다리면 장 목록이 아직 비어 있다
  await dec.completed;
  const total = dec.tracks.selectedTrack.frameCount;

  const centerOf = async (index) => {
    const { image } = await dec.decode({ frameIndex: index });
    const cv = document.createElement('canvas');
    cv.width = image.displayWidth;
    cv.height = image.displayHeight;
    const c = cv.getContext('2d');
    c.drawImage(image, 0, 0);
    const d = c.getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data;
    return [d[0], d[1], d[2]];
  };

  // 두 장만 콕 집어 비교하면 안 된다 — 시험 영상의 색이 세 장 주기로 돌아서, 하필 0번과 3번을
  // 고르면 멀쩡한 GIF 도 「안 바뀜」이 된다(실제로 그렇게 짰다가 헛다리를 짚었다).
  // 그러니 **전체 장을 훑어 서로 다른 색이 몇 가지 나오는지** 센다.
  const seen = [];
  for (let i = 0; i < total; i++) seen.push((await centerOf(i)).join(','));
  const distinct = [...new Set(seen)];

  return {
    ok: preview.naturalWidth === 120 && total > 3 && distinct.length >= 3,
    why: `영상 ${duration.toFixed(1)}초 · GIF ${preview.naturalWidth}x${preview.naturalHeight} · ${total}장 · 서로 다른 장면 ${distinct.length}가지 (3가지 이상이어야 함)`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-video2gif] 영상 → GIF 흐름이 제대로 돌지 않는다');
  process.exit(1);
}
console.log('[test-video2gif] 실제 영상으로 GIF 를 만들고 장면이 바뀌는 것까지 확인');
