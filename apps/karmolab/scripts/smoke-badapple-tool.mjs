/**
 * 도구가 **자기 방식으로** 한 조각을 그리는지 (TASK-KL-131 ②).
 *
 * 지금까지 확인한 것은 덮는 층 하나가 화면 전체를 대신 그리는 것이었다. 그건 아무도 신고
 * 안 해도 돌아가게 하는 바닥이지, 「도구들이 나눠 그린다」의 증거가 아니다.
 *
 * 그래서 여기서는 진짜 도구(아스키 아트)를 열고, 그 도구의 **출력 자리**가 재생 그림으로
 * 채워지는지 본다. 그리고 두 가지를 더 본다:
 *   - 도구가 자기 문자 세트를 쓰는가 (남이 정해 준 글자가 아니라)
 *   - 재생을 끄면 도구가 원래 모습으로 돌아가는가
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

// 재생을 켠 채로 홈을 연 뒤, 그 안에서 도구를 띄운다.
await page.goto(`${base}/apps/karmolab/?badapple`);
await page.waitForFunction(() => Boolean(window.KarmoLabBadApple), { timeout: 15000 });
// 도구를 여는 것은 `switchPage` 다 (`open` 은 없다 — 한 번 헛짚었다).
// 그리고 `window.Toolbox` 로는 안 잡힌다: 선언 방식 때문에 창(window)에 얹히지 않고
// 전역 이름으로만 산다. 그래서 이름으로 직접 부른다 — 여기서 두 번째로 헛짚었다.
await page.waitForFunction(() => typeof Toolbox !== 'undefined' && typeof Toolbox.switchPage === 'function', {
  timeout: 15000
});
// 도구는 부를 때 비로소 받아진다 — 처음 한 번은 아직 등록 전이라 화면이 안 바뀐다.
// 받아진 뒤 다시 불러야 열린다 (여기서 세 번째로 헛짚었다).
await page.evaluate(() => Toolbox.switchPage('asciiart'));
await page.waitForFunction(
  () => {
    if (document.getElementById('aaOut')) return true;
    Toolbox.switchPage('asciiart');
    return false;
  },
  { timeout: 20000, polling: 500 }
);

const report = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const read = () => document.getElementById('aaOut').textContent ?? '';
  // 「원래대로」의 기준을 **재생 중 화면**으로 잡으면 안 된다 — 도구를 열 때 이미 재생이 돌고
  // 있어서, 그때 읽은 것은 그림 한 장이지 도구의 원래 모습이 아니다. 도구가 스스로 두는
  // 안내 문구가 기준이다.
  const seen = new Set();
  let widest = 0;
  for (let i = 0; i < 10; i++) {
    const text = read();
    seen.add(text);
    widest = Math.max(widest, ...text.split('\n').map((line) => line.length));
    await sleep(130);
  }
  const during = read();

  // 도구의 문자 세트를 바꿔 보고, 그림이 **그 글자로** 바뀌는지 본다.
  const select = document.getElementById('aaRamp');
  select.value = 'block';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(400);
  const blockChars = read();

  // 끄면 원래 모습으로.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await sleep(300);
  const after = read();

  return {
    lines: during.split('\n').length,
    widest,
    distinct: seen.size,
    usesOwnRamp: blockChars.includes('█'),
    restored: after.includes('이미지를 넣으면'),
    restoredText: after.slice(0, 24)
  };
});

await browser.close();
server.close();

const fail = [];
if (report.lines < 8) fail.push(`도구 출력이 그림으로 안 찼다 (${report.lines}줄)`);
if (report.widest < 20) fail.push(`한 줄이 너무 짧다 (${report.widest}자)`);
if (report.distinct < 2) fail.push('훑는 동안 한 번도 안 바뀌었다 — 첫 장만 그리고 멈췄다');
if (!report.usesOwnRamp) fail.push('도구가 자기 문자 세트를 안 썼다');
if (!report.restored) fail.push(`껐는데 도구가 제 안내 문구로 안 돌아왔다 (${report.restoredText})`);
if (errors.length) fail.push(`화면 오류 ${errors.length}건: ${errors.slice(0, 2).join(' / ')}`);

console.log(JSON.stringify(report, null, 2));
if (fail.length) {
  console.log(`RED:\n- ${fail.join('\n- ')}`);
  process.exit(1);
}
console.log('GREEN — 도구가 자기 문자 세트로 그리고, 끄면 원래대로 돌아온다');
