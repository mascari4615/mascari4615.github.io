/**
 * 설치한 앱이 **인터넷 없이도 열리는가** (TASK-KL-191 축8)
 *
 * 도구 160개는 전부 브라우저 안에서 돈다. 그런데 받아 둔 것이 첫 화면 한 장뿐이라, 설치한
 * 앱에서 도구 주소로 바로 들어가면(바로가기·지난 화면) 브라우저의 「인터넷 없음」이 떴다 —
 * **일할 수 있는데 껍데기가 없어서** 못 연 것이다.
 *
 * 여기서는 진짜로 회선을 끊고 본다:
 *   ① 첫 화면이 열린다
 *   ② 도구 주소로 바로 들어가도 열리고, **그 도구가** 열린다 (홈으로 떨어지지 않는다)
 *   ③ 무엇이 안 되는지 화면이 말한다
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-offline-app.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/* 실제 주소 규약(`/karmolab/...`)을 그대로 내주는 작은 서버를 띄운다.
 *
 * 브라우저 요청을 가로채 주소를 바꿔치는 방법으로는 이 검사를 못 한다 — 회선을 끊는 순간
 * 그 가로채기 자체가 멈춰서, 서비스 워커가 일하기도 전에 30초를 기다리다 죽는다(실측).
 * 검사할 것은 **워커가 껍데기를 내주는가**지 가로채기가 아니다. */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = url.pathname;
  if (rel.startsWith('/karmolab/t/')) rel = '/apps/karmolab/index.html';       // 도구 상세 = 셸 한 장
  else if (rel === '/karmolab/' || rel === '/karmolab') rel = '/apps/karmolab/index.html';
  else if (rel.startsWith('/karmolab/')) rel = rel.replace('/karmolab/', '/apps/karmolab/');
  const file = path.join(ROOT, '..', '..', rel.replace(/^\//, ''));
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 420, height: 860 } });
const page = await context.newPage();

await page.goto(`${origin}/karmolab/`, { waitUntil: 'networkidle', timeout: 30000 });
// 워커가 껍데기를 담을 때까지 기다린다 — 담기 전에 끊으면 이 검사는 워커가 아니라 운을 잰다.
await page
  .waitForFunction(async () => {
    if (!navigator.serviceWorker?.controller) return false;
    const cache = await caches.open((await caches.keys()).find((k) => k.startsWith('karmolab-')) ?? 'x');
    return Boolean(await cache.match('/karmolab/'));
  }, { timeout: 30000 })
  .catch(() => problems.push('서비스 워커가 껍데기를 안 담았다 — 이 검사는 여기서부터 의미가 없다'));

if (!problems.length) {
  await context.setOffline(true);

  // ① 첫 화면
  const home = await page.goto(`${origin}/karmolab/`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
  if (!home) problems.push('끊긴 상태에서 첫 화면이 안 열린다');
  else if (!(await page.locator('#tool-pages').count())) problems.push('첫 화면은 왔는데 앱이 안 그려졌다');

  // ③ 무엇이 안 되는지 말한다
  await page.waitForSelector('#kl-offline-note', { timeout: 8000 }).catch(async () => {
    const online = await page.evaluate(() => navigator.onLine);
    problems.push(`끊겼는데 아무 말도 없다 — 사람은 고장으로 읽고 창을 닫는다 (navigator.onLine=${online})`);
  });

  // ② 도구 주소로 바로 — 껍데기를 받아 그 도구를 연다
  const deep = await page
    .goto(`${origin}/karmolab/t/charcount/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    .catch(() => null);
  if (!deep) {
    problems.push('끊긴 상태에서 도구 주소로 못 들어간다 (브라우저 「인터넷 없음」)');
  } else {
    /* 도구가 묶음 안에 있으면 열리는 화면은 **묶음 이름**이다 (글자수 세기 → `page-text`).
     * 그러니 「그 도구인가」가 아니라 **「홈으로 떨어지지 않았나」**를 본다 —
     * 오프라인 껍데기가 하는 일은 「가려던 곳으로 데려다주는 것」이다. */
    const active = await page
      .waitForFunction(() => document.querySelector('.tool-page.active')?.id ?? null, { timeout: 15000 })
      .then((h) => h.jsonValue())
      .catch(() => null);
    if (!active) problems.push('도구 주소로 들어왔는데 아무 화면도 안 열렸다');
    else if (active === 'page-home') problems.push('도구 주소로 들어왔는데 홈으로 떨어졌다');
    else console.log(`   도구 주소 → ${active} (글자수 세기는 「글」 묶음 탭이다)`);
  }
}

await browser.close();
server.close();

if (problems.length) {
  console.error('❌ 인터넷 없이 열기:');
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}
console.log('✅ 끊겨도 첫 화면·도구 주소 둘 다 열리고, 무엇이 쉬는지 화면이 말한다');
