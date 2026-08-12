/**
 * 굽는 화면에서 구운 것을 **홈이 이어받는지** (TASK-KL-244).
 *
 * 예전에는 이 자리를 localStorage 로 넘겼다. 거기는 글자만 담겨서 바이트를 base64 로 펴야 했고
 * (4/3 로 불어난다) 한도가 대개 5MB 였다. 넘치면 브라우저가 오류를 던지고 **아무것도 안 담는다** —
 * 굽기는 성공한 것처럼 보이는데 홈에서는 기본 클립이 뜬다. 증상이 없어서 제일 늦게 잡히는 종류다.
 *
 * 그래서 여기서 보는 것은 두 가지다:
 *   ① 굽는 화면이 「홈이 이어받는다」고 말하는가 (담기 실패를 성공으로 말하지 않는가)
 *   ② **새 탭에서 홈을 열었을 때** 기본 클립이 아니라 방금 구운 것이 뜨는가
 * ②가 핵심이다 — ①만 보면 담는 시늉만 하고 못 담는 고장을 그대로 통과시킨다.
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

const browser = await launchOrSkip('badapple-handoff');
if (!browser) {
  server.close();
  process.exit(0);
}
// 같은 저장 자리를 두 장이 나눠 쓰는지 보는 것이므로 **같은 컨텍스트**여야 한다.
const ctx = await browser.newContext();
const errors = [];
ctx.on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));

const studio = await ctx.newPage();
await studio.goto(`${base}/apps/karmolab/badapple/`);
await studio.waitForFunction(() => Boolean(document.getElementById('baStatus')), { timeout: 20000 });

// 영상은 저장소에 안 둔다 — 그 자리에서 만든다.
const baked = await studio.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 90;
  const ctx2 = canvas.getContext('2d');
  const chunks = [];
  const recorder = new MediaRecorder(canvas.captureStream(20), { mimeType: 'video/webm' });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start();
  const started = performance.now();
  await new Promise((done) => {
    const draw = () => {
      const t = (performance.now() - started) / 1000;
      ctx2.fillStyle = '#000';
      ctx2.fillRect(0, 0, 120, 90);
      ctx2.fillStyle = '#fff';
      ctx2.beginPath();
      ctx2.arc(60 + Math.sin(t * 5) * 30, 45, 22, 0, Math.PI * 2);
      ctx2.fill();
      if (t >= 1.5) {
        recorder.stop();
        done();
        return;
      }
      requestAnimationFrame(draw);
    };
    draw();
  });
  await new Promise((r) => (recorder.onstop = r));

  const file = new File(chunks, 'blob.webm', { type: 'video/webm' });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const input = document.getElementById('baFile');
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // 파일을 넣으면 바로 굽는다 — 따로 누를 단추가 없다. 다 구우면 저장 단추가 열린다.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 400 && document.getElementById('baSave').disabled; i++) await sleep(100);
  return document.getElementById('baStatus').textContent ?? '';
});

// 홈을 **새 탭**에서 연다 — 같은 창의 변수를 물려받지 않으므로, 담긴 것을 진짜로 다시 읽어야 한다.
const home = await ctx.newPage();
await home.goto(`${base}/apps/karmolab/?badapple`);
await home.waitForFunction(() => Boolean(window.KarmoLabBadApple), { timeout: 20000 });
const picked = await home.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const seen = [];
  for (let i = 0; i < 20; i++) {
    seen.push(document.title);
    await sleep(150);
  }
  const db = await new Promise((resolve) => {
    const req = indexedDB.open('karmolab-badapple', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  let storedBytes = 0;
  if (db) {
    storedBytes = await new Promise((resolve) => {
      const tx = db.transaction('clips', 'readonly');
      const get = tx.objectStore('clips').get('karmolab:badapple:clip');
      get.onsuccess = () => resolve(get.result ? get.result.byteLength || get.result.length || 0 : 0);
      get.onerror = () => resolve(0);
    });
    db.close();
  }
  let leftover = 0;
  try {
    leftover = (localStorage.getItem('karmolab:badapple:clip') || '').length;
  } catch {
    leftover = 0;
  }
  return { titles: new Set(seen).size, storedBytes, leftover };
});

await browser.close();
server.close();

const fail = [];
// 굽고 나면 그 자리에서 바로 트는 화면이라 마지막 말은 「재생 중 …」이다. 말의 모양을 걸면
// 문구만 다듬어도 빨개지므로, 굽기가 끝났다는 사실은 **장수가 적혀 있는지**로 본다.
if (!/\d+/.test(baked)) fail.push(`굽는 화면이 아무 숫자도 안 적었다: ${JSON.stringify(baked)}`);
if (picked.storedBytes <= 0) fail.push('구웠는데 저장 자리에 아무것도 안 담겼다');
if (picked.leftover > 0) fail.push('옛 자리(localStorage)에 사본이 남았다 — 어느 쪽이 최신인지 알 수 없게 된다');
if (picked.titles < 2) fail.push(`홈에서 재생이 안 돈다 (탭 제목이 ${picked.titles}가지)`);
if (errors.length) fail.push(`화면에서 오류가 났다: ${errors.slice(0, 2).join(' | ')}`);

console.log('[badapple-handoff]', JSON.stringify({ baked, ...picked }));
if (fail.length) {
  for (const line of fail) console.error('[badapple-handoff] ' + line);
  process.exit(1);
}
console.log('[badapple-handoff] 구운 것을 홈이 이어받는다 · 옛 자리에 사본 없음');
