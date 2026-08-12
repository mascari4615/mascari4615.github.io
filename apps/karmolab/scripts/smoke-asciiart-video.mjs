/**
 * 아스키 아트 도구가 **영상**을 받아 글자로 트는지 (TASK-KL-244).
 *
 * 단위 시험은 격자와 바이트만 본다 — 그 층이 다 초록이어도 도구는 죽어 있을 수 있다.
 * (파일 종류를 안 갈라 이미지 경로로 새거나, 캔버스를 안 띄우거나, 굽는 중 예외가 조용히
 * 삼켜지거나.) 그래서 여기서는 진짜 브라우저에서 진짜 영상 파일을 넣고 본다:
 *   ① 영상을 넣으면 영상 조작판이 열리는가
 *   ② 구우면 글자판이 실제로 칠해지는가 (빈 캔버스가 아닌가)
 *   ③ 트는 동안 그림이 **바뀌는가** (한 장에 멈춰 있지 않은가)
 *   ④ 색을 켜면 회색이 아닌 색이 실제로 들어가는가
 *   ⑤ GIF 로 뽑으면 GIF 바이트가 나오는가
 *
 * 영상 파일은 저장소에 안 둔다 — 그 자리에서 만든다(캔버스 → MediaRecorder). 남의 영상을
 * 담지 않는다는 이 묶음의 규칙이 시험에도 그대로 걸린다.
 */
import { launchOrSkip } from './lib/browser.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end('nope');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// 브라우저가 없는 자리(배포 앞단)에서는 빨강 대신 「못 돈다」를 남기고 비킨다 — `lib/browser.mjs` 머리말.
const browser = await launchOrSkip('asciiart-video', { args: ['--autoplay-policy=no-user-gesture-required'] });
if (!browser) {
  server.close();
  process.exit(0);
}
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(`${base}/apps/karmolab/`);
await page.waitForFunction(() => typeof Toolbox !== 'undefined' && typeof Toolbox.switchPage === 'function', {
  timeout: 20000
});
await page.evaluate(() => Toolbox.switchPage('asciiart'));
await page.waitForFunction(
  () => {
    if (document.getElementById('aaVideoBox')) return true;
    Toolbox.switchPage('asciiart');
    return false;
  },
  { timeout: 20000, polling: 500 }
);

const report = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);

  /** 그 자리에서 만드는 영상 — 도는 막대가 있어야 「그림이 바뀌는가」를 잴 수 있다. */
  async function makeVideo(seconds = 2) {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(20);
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start();
    const started = performance.now();
    await new Promise((done) => {
      const draw = () => {
        const t = (performance.now() - started) / 1000;
        ctx.fillStyle = '#101018';
        ctx.fillRect(0, 0, 160, 120);
        ctx.save();
        ctx.translate(80, 60);
        ctx.rotate(t * 3);
        ctx.fillStyle = '#ff3b6b';
        ctx.fillRect(-46, -9, 92, 18);
        ctx.fillStyle = '#2fd3a5';
        ctx.fillRect(-9, -46, 18, 92);
        ctx.restore();
        if (t >= seconds) {
          recorder.stop();
          done();
          return;
        }
        requestAnimationFrame(draw);
      };
      draw();
    });
    await new Promise((r) => (recorder.onstop = r));
    return new File(chunks, 'spin.webm', { type: 'video/webm' });
  }

  const file = await makeVideo(2);
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const input = $('aaFile');
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // 영상 정보가 읽힐 때까지
  for (let i = 0; i < 60 && $('aaVideoBox').hidden; i++) await sleep(100);
  const videoBoxOpen = !$('aaVideoBox').hidden;

  // 색을 켜고, 짧게(1초) 굽는다
  $('aaColor').checked = true;
  $('aaSpan').value = '1';
  $('aaFps').value = '10';
  $('aaBake').click();

  const canvas = $('aaCanvas');
  for (let i = 0; i < 200 && canvas.hidden; i++) await sleep(100);
  const canvasShown = !canvas.hidden;

  // 칠해졌나 + 트는 동안 바뀌나 + 진짜 색인가
  const ctx = canvas.getContext('2d');
  const shots = [];
  let colored = 0;
  for (let i = 0; i < 8; i++) {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    let sum = 0;
    for (let p = 0; p < data.length; p += 4 * 37) {
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      if (r + g + b > 40) ink += 1;
      // 회색이면 세 채널이 거의 같다 — 차이가 크면 진짜 색이 들어간 것
      if (Math.max(r, g, b) - Math.min(r, g, b) > 30) colored += 1;
      sum = (sum * 31 + r + g * 3 + b * 7) % 2147483647;
    }
    shots.push({ ink, sum });
    await sleep(140);
  }

  const text = document.getElementById('aaOut');
  const status = document.getElementById('aaStatus').textContent;

  // GIF 로 뽑는다
  let gifBytes = 0;
  let gifHeader = '';
  const originalCreate = URL.createObjectURL;
  const grabbed = [];
  URL.createObjectURL = (blob) => {
    grabbed.push(blob);
    return originalCreate.call(URL, blob);
  };
  const clickBlocked = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {};
  $('aaGif').click();
  for (let i = 0; i < 300 && !grabbed.some((b) => b.type === 'image/gif'); i++) await sleep(100);
  // 파일로 내보내는 길이 하나 더 있다 — 구운 그대로의 `.bab`. 머리 네 글자가 규약이다.
  $('aaBab').click();
  const babBlob = grabbed.find((b) => b.type === 'application/octet-stream');
  const babHeader = babBlob ? new TextDecoder().decode(new Uint8Array(await babBlob.slice(0, 4).arrayBuffer())) : '';

  const gif = grabbed.find((b) => b.type === 'image/gif');
  if (gif) {
    gifBytes = gif.size;
    gifHeader = new TextDecoder().decode(new Uint8Array(await gif.slice(0, 6).arrayBuffer()));
  }
  HTMLAnchorElement.prototype.click = clickBlocked;
  URL.createObjectURL = originalCreate;

  return {
    videoBoxOpen,
    canvasShown,
    textHidden: text.hidden,
    canvasSize: `${canvas.width}x${canvas.height}`,
    inks: shots.map((s) => s.ink),
    distinct: new Set(shots.map((s) => s.sum)).size,
    colored,
    status,
    gifBytes,
    gifHeader,
    babBytes: babBlob ? babBlob.size : 0,
    babHeader
  };
});

await browser.close();
server.close();

const fail = [];
if (!report.videoBoxOpen) fail.push('영상을 넣었는데 영상 조작판이 안 열렸다');
if (!report.canvasShown) fail.push('구웠는데 글자판(캔버스)이 안 보인다');
if (!report.textHidden) fail.push('영상 모드인데 이미지용 <pre> 가 그대로 남아 있다');
if (Math.max(0, ...report.inks) === 0) fail.push('글자판이 통째로 비었다 — 아무것도 안 그려졌다');
if (report.distinct < 2) fail.push(`트는 동안 그림이 안 바뀐다 (서로 다른 장 ${report.distinct}개)`);
if (report.colored === 0) fail.push('색을 켰는데 회색만 나온다');
if (report.babHeader !== 'BAB1') fail.push(`.bab 로 안 뽑힌다 (머리 ${JSON.stringify(report.babHeader)})`);
if (report.gifHeader !== 'GIF89a') fail.push(`GIF 로 안 뽑힌다 (머리 ${JSON.stringify(report.gifHeader)})`);
if (errors.length) fail.push(`화면에서 오류가 났다: ${errors.slice(0, 2).join(' | ')}`);

console.log('[asciiart-video]', JSON.stringify(report, null, 1));
if (fail.length) {
  for (const line of fail) console.error('[asciiart-video] ' + line);
  process.exit(1);
}
console.log('[asciiart-video] 영상 → 글자 재생 → GIF 까지 돈다');
