/**
 * 「부하가 곧 화면」이 진짜인지 (TASK-KL-131 ③).
 *
 * 이 화면은 주장이 세다 — 선이 그림을 옮겨 그린 게 아니라 **기계가 실제로 바빴던 값**이라고
 * 말한다. 그러니 확인도 거기에 맞춰야 한다: 시킨 값과 되잰 값이 같이 오르내리는지를 본다.
 * 「선이 그려졌다」만 보면, 그림을 그냥 옮겨 그려도 통과한다.
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

// 화면이 내놓는 값을 그대로 받아 적는다 — 화면 안에서 채점하면 채점도 같이 틀릴 수 있다.
const samples = [];
await page.exposeFunction('__recordSample', (intent, measured) => samples.push({ intent, measured }));

// 배포된 주소(`/badapple/load/`)는 Jekyll 이 만든다. 여기서는 파일을 그대로 내주므로 파일명으로 연다.
await page.goto(`${base}/apps/karmolab/badapple/load.html`);
await page.waitForSelector('#blReadout', { timeout: 10000 });
await page.evaluate(() => {
  const readout = document.getElementById('blReadout');
  new MutationObserver(() => {
    const match = readout.textContent.match(/시킨 값 (\d+)% · 실제 (\d+)%/);
    if (match) window.__recordSample(Number(match[1]) / 100, Number(match[2]) / 100);
  }).observe(readout, { childList: true, characterData: true, subtree: true });
});

await page.click('#blStart');
// 한 조각이 220ms — 24조각쯤 모으려면 6초 남짓. 실루엣이 오르내리는 구간이 들어갈 만큼은 된다.
await page.waitForFunction(() => true, { timeout: 1000 }).catch(() => {});
await new Promise((resolve) => setTimeout(resolve, 8000));
await page.click('#blStop');

const drawn = await page.evaluate(() => {
  const canvas = document.getElementById('blGraph');
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let painted = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
  return painted;
});

await browser.close();
server.close();

function correlation(a, b) {
  const n = a.length;
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / n;
  const ma = mean(a);
  const mb = mean(b);
  let top = 0;
  let la = 0;
  let lb = 0;
  for (let i = 0; i < n; i++) {
    top += (a[i] - ma) * (b[i] - mb);
    la += (a[i] - ma) ** 2;
    lb += (b[i] - mb) ** 2;
  }
  return la === 0 || lb === 0 ? 0 : top / Math.sqrt(la * lb);
}

const intents = samples.map((s) => s.intent);
const measured = samples.map((s) => s.measured);
const spread = intents.length ? Math.max(...intents) - Math.min(...intents) : 0;
const r = intents.length > 4 ? correlation(intents, measured) : 0;

const report = {
  samples: samples.length,
  intentSpread: Number(spread.toFixed(3)),
  correlation: Number(r.toFixed(3)),
  graphPainted: drawn
};

const fail = [];
if (report.samples < 10) fail.push(`잰 값이 너무 적다 (${report.samples})`);
if (report.intentSpread < 0.2) fail.push(`시킨 값이 거의 안 변했다 — 그림이 안 흐르고 있다 (${report.intentSpread})`);
if (!(report.correlation > 0.7)) fail.push(`실제 부하가 그림을 안 따라간다 (${report.correlation})`);
if (report.graphPainted < 1000) fail.push(`그래프가 안 그려졌다 (${report.graphPainted})`);
if (errors.length) fail.push(`화면 오류 ${errors.length}건: ${errors.slice(0, 2).join(' / ')}`);

console.log(JSON.stringify(report, null, 2));
if (fail.length) {
  console.log(`RED:\n- ${fail.join('\n- ')}`);
  process.exit(1);
}
console.log('GREEN — 실제로 바빴던 값이 그림을 따라 오르내렸다');
