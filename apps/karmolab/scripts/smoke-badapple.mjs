/**
 * 굽는 화면이 실제로 도는지 브라우저에서 끝까지 태운다 (TASK-KL-131).
 *
 * 「빌드 통과」는 화면이 산다는 증거가 아니다. 이 검사는 진짜 영상 파일을 넣고,
 * 글자판에 그림이 나오고, 시간이 지나면 그림이 **바뀌고**, 덮는 층에도 칠해지는지 본다.
 * (안 바뀌는지까지 보는 이유: 첫 장만 그리고 멈춰도 화면은 멀쩡해 보인다.)
 *
 * 영상은 **브라우저가 그 자리에서 만든다** — 네모 하나가 움직이는 걸 찍는다.
 * 파일을 저장소에 넣지도, ffmpeg 을 깔라고 요구하지도 않는다. 검사가 아무 데서나 돈다.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripJekyll } from './lib/serve-static.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end('nope');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  /* ★ **진짜 사이트가 안 내보내는 것을 내보내면 안 된다** (2026-08-16, 실측). 이 서버는 파일을
     날것 그대로 보냈다 — 그래서 Jekyll 앞머리(`---` 세 줄)가 **글자로** 먼저 나가고, 파서는
     거기서 `<body>` 를 열어 버린다. 그러면 뒤따르는 `<meta>` 가 전부 머리 밖으로 밀려
     브라우저가 「CSP 가 head 밖에서 왔다 — 무시한다」고 말한다. 우리 화면 잘못이 아니라
     **검사가 만든 상태**다(다른 검사들은 이미 `stripJekyll` 을 쓴다). 같은 것을 쓴다. */
  if (path.extname(file) === '.html') {
    res.end(stripJekyll(fs.readFileSync(file, 'utf8')));
    return;
  }
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

await page.goto(`${base}/apps/karmolab/badapple/`);

// ── 검사용 영상을 화면 안에서 만든다 (흰 배경에 검은 네모가 가로지른다) ──
await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(15);
  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  recorder.ondataavailable = (event) => chunks.push(event.data);
  recorder.start();

  await new Promise((resolve) => {
    let frame = 0;
    const draw = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 160, 120);
      ctx.fillStyle = '#000';
      ctx.fillRect(10 + frame * 3, 30, 50, 60);
      frame += 1;
      if (frame < 30) setTimeout(draw, 66);
      else resolve();
    };
    draw();
  });

  recorder.stop();
  await new Promise((resolve) => (recorder.onstop = resolve));

  const file = new File(chunks, 'probe.webm', { type: 'video/webm' });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const input = document.getElementById('baFile');
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});

/* ★ **못 트는 자리에서는 「못 잼」으로 물러난다** (2026-08-14). CI 에서 이 기다림이 60초를
   넘겨 검사가 통째로 죽었다(내 자리에서는 통과). 여기서 만든 영상은 `video/webm` 인데,
   러너의 브라우저 빌드가 그 코덱을 못 틀면 **영영 「재생 중」이 안 된다** — 그건 우리 코드가
   고장 난 게 아니라 이 자리에서 잴 수 없는 것이다. 그걸 빨강으로 읽으면 아무도 안 믿게 된다. */
/* ★ **말로 상태를 읽지 않는다** (2026-08-16, 실측). 여기는 「재생 중」이라는 **한국어**를 찾고
   있었다 — 실주소는 영어 판이라 「Playing — 64×48 · 27 frames · 15 fps」가 떠 있었고,
   재생이 되고 있는데도 60초를 기다리다 빨개졌다(빨강 줄 안에 그 증거가 그대로 적혀 있었다).
   이제 제품이 `data-state="playing"` 을 함께 남긴다 — 그것을 먼저 본다.
   실주소는 다음 배포 전까지 옛 판이므로, 그동안은 **말이 아닌 모양**(`가로×세로` + fps 숫자)으로
   본다. 어느 말로 쓰든 그 모양은 같다. */
const 재생됨 = await page
  .waitForFunction(
    () => {
      const el = document.getElementById('baStatus');
      if (!el) return false;
      if (el.dataset.state === 'playing') return true;
      return /[0-9]+×[0-9]+/.test(el.textContent || '') && /[0-9]+\s*(fps|장|コマ)/.test(el.textContent || '');
    },
    undefined,
    { timeout: 60000 }
  )
  .then(() => true)
  .catch(() => false);
if (!재생됨) {
  const 틀수있나 = await page.evaluate(() => {
    const v = document.createElement('video');
    return { webm: v.canPlayType('video/webm'), 상태: document.getElementById('baStatus')?.textContent ?? '' };
  });
  if (!틀수있나.webm) {
    console.log(`[smoke-badapple] 못 돌았다 — 이 브라우저가 webm 을 못 튼다 (상태: ${틀수있나.상태})`);
    await browser.close();
    process.exit(2); /* 2 = 못 돌림. 이 저장소 규약 */
  }
  console.error(`[smoke-badapple] 60초 안에 재생이 안 시작됐다 (상태: ${틀수있나.상태})`);
  await browser.close();
  process.exit(1);
}

// 한 순간만 집으면 안 된다 — 영상 첫 장이 비어 있는 건 정상이고(녹화 시작 직후 검은 화면),
// 그걸 「안 그려졌다」로 읽으면 멀쩡한 걸 빨강이라 우긴다. 한 바퀴 도는 동안 훑어서
// 「어느 시점엔가 그려졌나」와 「도중에 바뀌었나」를 본다. 두 표면도 같은 시각에 읽는다.
const report = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const canvas = () => document.querySelector('canvas[aria-hidden="true"]');
  const countPainted = (element) => {
    if (!element) return 0;
    const data = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
    return painted;
  };

  const seen = [];
  for (let i = 0; i < 12; i++) {
    const text = document.getElementById('baText').textContent;
    seen.push({ text, lit: (text.match(/█/g) ?? []).length, painted: countPainted(canvas()) });
    await sleep(120);
  }

  const distinct = new Set(seen.map((s) => s.text)).size;
  return {
    status: document.getElementById('baStatus').textContent,
    lines: Math.max(...seen.map((s) => s.text.split('\n').length)),
    litMax: Math.max(...seen.map((s) => s.lit)),
    distinctFrames: distinct,
    overlay: Boolean(canvas()),
    overlayPaintedMax: Math.max(...seen.map((s) => s.painted))
  };
});

await browser.close();
server.close();

const fail = [];
if (report.lines < 40) fail.push(`글자판 줄 수가 적다 (${report.lines})`);
if (report.litMax < 50) fail.push(`글자판에 켜진 칸이 끝내 안 나왔다 (${report.litMax})`);
if (report.distinctFrames < 2) fail.push('훑는 동안 그림이 한 번도 안 바뀌었다 — 첫 장만 그리고 멈췄다');
if (!report.overlay) fail.push('덮는 층이 안 생겼다');
if (report.overlayPaintedMax < 100) fail.push(`덮는 층에 그려진 게 없다 (${report.overlayPaintedMax})`);
if (errors.length) fail.push(`화면 오류 ${errors.length}건: ${errors.slice(0, 3).join(' / ')}`);

console.log(JSON.stringify(report, null, 2));
if (fail.length) {
  console.log(`RED:\n- ${fail.join('\n- ')}`);
  process.exit(1);
}
console.log('GREEN — 굽기·재생·두 표면 동시 그리기 전부 확인');
