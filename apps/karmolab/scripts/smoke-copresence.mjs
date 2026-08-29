/**
 * 잘린 창이 스스로 다시 들어오는가 (같이 쓰기 · 2026-08-29)
 *
 * 서버는 **침묵을 나감으로 판정한다**(30초). 그런데 화면만 보고 있는 사람도 침묵한다 —
 * 잘린 뒤에는 `move` 가 `{moved:false}` 만 돌려주고, 흐르는 연결은 ping 으로 살아 있어
 * 다시 붙지도 않았다. 그 창의 커서는 **새로고침 전까지 남에게 안 보였다.**
 *
 * 서버 시험으로는 못 잡는다. 잘린 것도 사실이고 `moved:false` 도 사실이다 —
 * 빠진 것은 **브라우저가 그 답을 보고 다시 들어가는 일**이라서, 창을 띄워야 재현된다.
 *
 * 30초를 기다리지 않는다. 서버 방에서 그 사람을 **직접 빼서** 잘린 상황을 만든다.
 * 기다림은 검사가 아니라 지연이다.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');
const SITE_ROOT = path.resolve(APP_ROOT, '../..');
const YAWNBOT = path.resolve(SITE_ROOT, 'apps/discord-bots/apps/yawnbot');
const PROD_ORIGIN = 'https://yawnbot.mascari4615.com';

const failures = [];
const check = (name, condition, detail) => {
  if (!condition) failures.push(`${name} — ${detail}`);
};

function cantRun(why) {
  console.log(`[smoke-copresence] 못 돌았다 — ${why}`);
  process.exit(2);
}

const dist = path.join(YAWNBOT, 'dist/src/bot/karmolab-api.js');
if (!existsSync(dist)) cantRun(`yawnbot 이 아직 안 지어졌다 (${dist} 없음) — cd ${YAWNBOT} && npm run build`);
if (!existsSync(path.join(APP_ROOT, 'js/copresence.js'))) cantRun('카모랩이 아직 안 지어졌다 — npm run build');

const require_ = createRequire(dist);
let registerKarmolabApi;
let express;
let stores;
let rooms;
try {
  express = require_('express');
  ({ registerKarmolabApi } = require_(dist));
  stores = {
    accounts: require_(path.join(YAWNBOT, 'dist/src/services/karmolab-accounts.js')),
    traces: require_(path.join(YAWNBOT, 'dist/src/services/karmolab-traces.js')),
    plays: require_(path.join(YAWNBOT, 'dist/src/services/karmolab-plays.js')),
    chat: require_(path.join(YAWNBOT, 'dist/src/services/karmolab-chat.js')),
  };
  // 라우트가 쓰는 것과 **같은 하나**를 든다 — 다른 것을 들면 여기서 뺀 사람이 저기 남는다.
  rooms = require_(path.join(YAWNBOT, 'dist/src/services/karmolab-rooms.js')).getKarmolabRoomStore();
} catch (error) {
  cantRun(`yawnbot 빌드 산출물을 못 불렀다: ${error.message}`);
}

const apiSource = await readFile(dist, 'utf-8');
if (!apiSource.includes('/kl/room/')) cantRun('지어 둔 yawnbot 에 방 라우트가 없다 (낡은 산출물) — npm run build 부터');

const tmp = await mkdtemp(path.join(tmpdir(), 'kl-copresence-'));
const app = express();
app.use(express.json());
registerKarmolabApi(
  app,
  new stores.accounts.KarmolabAccountStore(path.join(tmp, 'accounts.json')),
  new stores.traces.KarmolabTraceStore(path.join(tmp, 'traces.json')),
  undefined,
  new stores.plays.KarmolabPlayStore(path.join(tmp, 'plays.json')),
  new stores.chat.KarmolabChatStore(path.join(tmp, 'chat.json')),
);
const api = app.listen(0, '127.0.0.1');
await new Promise((resolve) => api.once('listening', resolve));
const apiOrigin = `http://127.0.0.1:${api.address().port}`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const site = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://x');
  const file = path.join(SITE_ROOT, decodeURIComponent(url.pathname));
  let body;
  try {
    body = await readFile(file);
  } catch {
    response.writeHead(404).end('no');
    return;
  }
  response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  response.end(body);
});
/* 서버가 아는 출처만 받아 준다(ALLOWED_ORIGINS) — 아무 포트나 쓰면 요청이 통째로 버려지고
   화면은 조용히 빈 창이 된다. */
const ALLOWED_PORTS = [8813, 8899, 4000];
let sitePort = 0;
for (const candidate of ALLOWED_PORTS) {
  const ok = await new Promise((resolve) => {
    site.once('error', () => resolve(false));
    site.listen(candidate, '127.0.0.1', () => resolve(true));
  });
  if (ok) {
    sitePort = candidate;
    break;
  }
}
if (sitePort === 0) cantRun(`개발 포트(${ALLOWED_PORTS.join('·')})가 전부 쓰이는 중이다 — 핫리로드 서버를 끄고 다시`);
const PAGE = `http://127.0.0.1:${sitePort}/apps/karmolab/index.html`;

const browser = await chromium.launch();

/** 창 하나 — UA 가 다르면 서버가 다른 사람으로 본다(같은 IP 라도 이름표가 갈린다). */
async function openWindow(userAgent) {
  const context = await browser.newContext({ userAgent });
  const page = await context.newPage();
  // 같이 쓰기는 이 손잡이로 붙을 곳을 정한다(운영 코드에 있는 길이다).
  await page.addInitScript((origin) => {
    window.KARMOLAB_API_BASE = origin;
  }, apiOrigin);
  await page.route(`${PROD_ORIGIN}/**`, (route) => route.abort());
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
const cursors = () => document.querySelectorAll('.kl-cursor').length;

try {
  const a = await openWindow(CHROME);
  const b = await openWindow(FIREFOX);

  // ① 남의 커서가 실제로 그려진다 — 이게 안 되면 아래 검사는 전부 뜻이 없다.
  await a.page.mouse.move(300, 300);
  await a.page.mouse.move(320, 310);
  await b.page.waitForFunction(cursors, null, { timeout: 15000 }).catch(() => {});
  check('커서 그리기', (await b.page.evaluate(cursors)) === 1, 'B 화면에 A 커서가 안 그려졌다');

  // ② 잘렸다 → 스스로 다시 들어온다. (30초 침묵 대신 서버에서 직접 뺀다)
  const before = rooms.members('home').map((m) => m.id);
  check('방 인원', before.length === 2, `방에 둘이 있어야 하는데 ${before.length}명 (${before.join(', ')})`);
  for (const id of before) rooms.leave('home', id);
  await b.page.waitForFunction(() => document.querySelectorAll('.kl-cursor').length === 0, null, { timeout: 5000 }).catch(() => {});
  check('잘림 반영', (await b.page.evaluate(cursors)) === 0, '서버에서 뺐는데 B 화면에 커서가 남아 있다');

  /* 여기서부터가 이 검사의 이유다. **마우스를 안 움직인다** — 잘린 창은 가만히 있어도
     스스로 돌아와야 한다(살아 있다고 말하는 주기 신호 + 「없다」는 답에 대한 재입장). */
  await b.page.waitForFunction(cursors, null, { timeout: 20000 }).catch(() => {});
  check('스스로 재입장', (await b.page.evaluate(cursors)) === 1, '잘린 뒤 20초가 지나도 A 커서가 안 돌아왔다 (재입장 없음)');
  /* 둘 다 돌아온다 — 다만 주기 신호가 창마다 다른 순간에 울린다. 「A 가 보인다」와
     「둘 다 방에 있다」를 같은 시각으로 묶으면 검사가 순서를 가정하는 것이 된다. */
  const deadline = Date.now() + 15000;
  while (rooms.members('home').length < 2 && Date.now() < deadline) await b.page.waitForTimeout(250);
  const after = rooms.members('home').length;
  check('서버 인원', after === 2, `재입장 뒤에도 방 인원이 ${after}명 (둘 다 스스로 안 돌아왔다)`);

  // ③ 창을 떠나면 「이제 안 보인다」가 반드시 나간다 — 안 나가면 남의 화면에 멈춘 커서가 남는다.
  await a.page.mouse.move(400, 400);
  await b.page.waitForFunction(() => document.querySelector('.kl-cursor')?.dataset.active === '1', null, { timeout: 5000 }).catch(() => {});
  // 보낸 직후를 노린다: 보낼 것이 비어 있을 때 떠나도 신호가 나가야 한다(옛 코드는 안 나갔다).
  await a.page.waitForTimeout(400);
  await a.page.evaluate(() => window.dispatchEvent(new Event('pointerleave')));
  await b.page.waitForFunction(() => document.querySelector('.kl-cursor')?.dataset.active === '0', null, { timeout: 5000 }).catch(() => {});
  check('떠남 신호', await b.page.evaluate(() => document.querySelector('.kl-cursor')?.dataset.active === '0'), '창을 떠났는데 남의 화면에서 커서가 계속 활성이다');

  await a.context.close();
  await b.context.close();
} catch (error) {
  failures.push(`검사가 도중에 죽었다 — ${error.message}`);
} finally {
  await browser.close();
  api.close();
  site.close();
  await rm(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`[smoke-copresence] 실패 ${failures.length}건`);
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}
console.log('[smoke-copresence] OK — 커서 그리기 · 잘린 뒤 스스로 재입장 · 떠남 신호');
