/**
 * 홈 화면 스위치가 진짜로 켜지는지 (TASK-KL-131 ②).
 *
 * 굽는 화면은 내가 만든 칸들 위에서 돌았다. 그건 「우리 화면에서 된다」의 증거가 아니다 —
 * 진짜 홈에는 내가 심어 둔 칸이 하나도 없고, 무엇을 액정으로 쓸지는 화면을 재서 스스로 골라야 한다.
 * 그게 되는지는 진짜 홈을 열어 봐야만 안다.
 *
 * 보는 것: ① 덮는 층이 생기고 실제로 칠해지나 ② 탭 제목이 그림을 따라 바뀌나
 * ③ 끄면 흔적 없이 되돌아가나 (장난이 사이트를 망가뜨리면 안 된다).
 */
import { chromium } from 'playwright';
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

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(`${base}/apps/karmolab/?badapple`);
await page.waitForSelector('canvas[aria-hidden="true"]', { timeout: 15000 });

const report = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const canvas = () => document.querySelector('canvas[aria-hidden="true"]');
  const painted = () => {
    const element = canvas();
    if (!element) return 0;
    const data = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count += 1;
    return count;
  };

  const seenPainted = [];
  const seenTitles = new Set();
  for (let i = 0; i < 10; i++) {
    seenPainted.push(painted());
    seenTitles.add(document.title);
    await sleep(120);
  }

  // 끄고 나면 흔적이 남으면 안 된다.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await sleep(200);

  return {
    paintedMax: Math.max(...seenPainted),
    distinctTitles: seenTitles.size,
    // 켜져 있는 동안 표식이 붙는다 — 끄면 사라져야 한다.
    markAfterStop: document.documentElement.getAttribute('data-badapple'),
    canvasAfterStop: Boolean(canvas())
  };
});

await browser.close();
server.close();

const fail = [];
if (report.paintedMax < 500) fail.push(`진짜 홈에서 액정으로 쓸 것을 못 찾았다 (칠해진 픽셀 ${report.paintedMax})`);
if (report.distinctTitles < 2) fail.push(`탭 제목이 그림을 안 따라간다 (${report.distinctTitles}종)`);
if (report.markAfterStop) fail.push('껐는데 표식이 남았다');
if (report.canvasAfterStop) fail.push('껐는데 덮는 층이 안 치워졌다');
if (errors.length) fail.push(`화면 오류 ${errors.length}건: ${errors.slice(0, 2).join(' / ')}`);

console.log(JSON.stringify(report, null, 2));
if (fail.length) {
  console.log(`RED:\n- ${fail.join('\n- ')}`);
  process.exit(1);
}
console.log('GREEN — 진짜 홈에서 스스로 액정을 찾아 그리고, 끄면 흔적 없이 사라진다');
