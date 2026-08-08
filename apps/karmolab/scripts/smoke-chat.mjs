/**
 * 채팅창이 진짜로 둘을 잇는지 (TASK-KL-149)
 *
 * 서버 시험(`yawnbot/src/bot/karmolab-chat-api.test.ts`)은 HTTP 로만 찔러 본다 — 거기서는
 * **화면이 없다.** 창 하나만 보는 검사도 마찬가지로 못 잡는 것이 있다: 껍데기가 안 붙었거나,
 * 흐르는 연결을 화면이 안 듣거나, 남의 줄이 그려지지 않아도 통과한다.
 * 그래서 창을 **둘** 띄우고, 한쪽에서 친 말이 다른 쪽 화면에 실제로 나타나는지 본다.
 *
 * 붙이는 방법: 앱은 `https://yawnbot.mascari4615.com` 을 부르도록 박혀 있다(`src/account.ts`).
 * 그 주소로 가는 요청만 **여기서 띄운 진짜 서버**로 돌린다 — 대역폭도 흐름도 실제와 같다.
 * 서버는 흉내가 아니라 yawnbot 이 배포하는 그 코드(`dist/`)를 그대로 쓴다.
 *
 * 못 돌 때는 「못 돌았다」(2)로 끝낸다 — 통과도 실패도 아니다. 둘을 같은 글자로 적으면
 * 게이트가 죽은 것을 아무도 모른다.
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
  console.log(`[smoke-chat] 못 돌았다 — ${why}`);
  process.exit(2);
}

const dist = path.join(YAWNBOT, 'dist/src/bot/karmolab-api.js');
if (!existsSync(dist)) cantRun(`yawnbot 이 아직 안 지어졌다 (${dist} 없음) — cd ${YAWNBOT} && npm run build`);
if (!existsSync(path.join(APP_ROOT, 'js/widgets/chat.js'))) cantRun('카모랩이 아직 안 지어졌다 — npm run build');

/* **yawnbot 이 있는 자리에서** 부른다 — 라이브러리는 위 폴더(`apps/discord-bots/node_modules`)에
 * 얹혀 있어서, 여기(카모랩)를 기준으로 찾으면 못 찾는다. */
const require_ = createRequire(dist);
let registerKarmolabApi;
let express;
let stores;
try {
  express = require_('express');
  ({ registerKarmolabApi } = require_(dist));
  stores = {
    accounts: require_(path.join(YAWNBOT, 'dist/src/services/karmolab-accounts.js')),
    traces: require_(path.join(YAWNBOT, 'dist/src/services/karmolab-traces.js')),
    plays: require_(path.join(YAWNBOT, 'dist/src/services/karmolab-plays.js')),
    chat: require_(path.join(YAWNBOT, 'dist/src/services/karmolab-chat.js')),
  };
} catch (error) {
  cantRun(`yawnbot 빌드 산출물을 못 불렀다: ${error.message}`);
}

/* 지어 둔 것이 **낡았을 수** 있다 — 옛 산출물로 검사하면 고친 것이 안 들어간 채 초록이 뜬다.
 * 채팅 라우트가 실제로 그 안에 있는지부터 확인한다. */
const apiSource = await readFile(dist, 'utf-8');
if (!apiSource.includes('/kl/chat/stream')) cantRun('지어 둔 yawnbot 에 채팅 라우트가 없다 (낡은 산출물) — npm run build 부터');

const tmp = await mkdtemp(path.join(tmpdir(), 'kl149-smoke-'));
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

/** 사이트를 그대로 내주는 자리. 앱이 절대 경로(`/apps/karmolab/...`)를 쓰므로 뿌리부터 내준다. */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const site = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://x');
  const file = path.join(SITE_ROOT, decodeURIComponent(url.pathname));
  // 머리를 **읽고 나서** 단다 — 먼저 달면 없는 파일일 때 404 를 못 적는다(머리가 이미 나갔다).
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
/* 아무 포트나 쓰면 안 된다 — 서버가 **아는 출처만** 받아 준다(`karmolab-api.ts` 의 ALLOWED_ORIGINS).
 * 목록에 없는 포트로 띄우면 브라우저가 요청을 통째로 버리고, 화면은 그냥 조용히 빈 창이 된다.
 * 실제로 여기서 한 번 헤맸다. 그래서 허용된 개발 포트 중 비어 있는 것을 골라 쓴다. */
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
const siteOrigin = `http://127.0.0.1:${sitePort}`;
const PAGE = `${siteOrigin}/apps/karmolab/index.html`;

const browser = await chromium.launch();

/** 창 하나 — 각자 다른 브라우저인 척해야 서버가 **다른 사람**으로 본다(이름표가 갈린다). */
async function openWindow(userAgent) {
  const context = await browser.newContext({ userAgent });
  const page = await context.newPage();

  /* 서버 주소를 갈아 끼운다.
   *
   * 요청을 가로채 주소만 바꾸는 방법은 못 쓴다 — 브라우저가 `https` → `http` 로 바꾸는 것을
   * 막는다. 그래서 앱이 **주소를 읽는 자리**에서 바꾼다: 계정 스크립트가 자기 객체를 창에
   * 얹는 순간을 붙잡아 그 안의 주소만 바꿔치기한다. 앱 코드는 한 글자도 안 고친다. */
  await page.addInitScript((origin) => {
    let held;
    Object.defineProperty(window, 'KarmoAccount', {
      configurable: true,
      get: () => held,
      set: (value) => {
        if (value) value.apiBase = origin;
        held = value;
      },
    });
  }, apiOrigin);
  // 운영 서버로 새는 요청이 있으면 검사가 진짜 사이트를 건드리게 된다 — 막아 둔다.
  await page.route(`${PROD_ORIGIN}/**`, (route) => route.abort());
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';

try {
  const a = await openWindow(CHROME);
  const b = await openWindow(FIREFOX);

  // ① 껍데기가 어느 화면에서든 붙는다 (도구를 안 열어도).
  await a.page.waitForSelector('#klChatDock', { timeout: 15000 });
  check('상주', await b.page.locator('#klChatDock').isVisible(), '두 번째 창에 채팅 단추가 없다');

  // ② 열면 오늘의 이름표가 있다 — 이게 없으면 익명 규칙 자체가 안 붙은 것이다.
  await a.page.click('#klChatDock');
  await b.page.click('#klChatDock');
  await a.page.waitForSelector('#klChatMe .klchat-who', { timeout: 10000 });
  const nameA = (await a.page.locator('#klChatMe .klchat-who').textContent())?.trim() ?? '';
  const nameB = (await b.page.locator('#klChatMe .klchat-who').textContent())?.trim() ?? '';
  check('이름표', /\S+\s\S+/.test(nameA), `이름표가 「색 동물」 모양이 아니다: ${JSON.stringify(nameA)}`);
  check('이름표', nameA !== nameB, `다른 사람인데 이름이 같다 (${nameA})`);

  // ③ 「지금 여기」가 둘을 센다 — 흐르는 연결이 양쪽 다 붙었다는 증거다.
  await a.page.waitForFunction(() => document.querySelector('#klChatHere')?.textContent === '2명', null, { timeout: 10000 });
  check('사람 수', true, '');

  // ④ 한쪽이 친 말이 다른 쪽 화면에 뜬다 — 이 검사의 핵심.
  const word = `안녕 ${Date.now().toString(36)}`;
  await a.page.fill('#klChatInput', word);
  const started = Date.now();
  await a.page.press('#klChatInput', 'Enter');
  await b.page.waitForSelector(`#klChatLog .klchat-line:has-text("${word}")`, { timeout: 5000 });
  const took = Date.now() - started;
  check('실시간', took < 2000, `건너가는 데 ${took}ms 걸렸다`);

  // 남의 줄에는 **그 사람 이름이 그 사람 색으로** 붙는다.
  const line = b.page.locator('#klChatLog .klchat-line').last();
  check('이름 붙음', (await line.locator('.klchat-who').count()) > 0, '남의 줄에 이름이 안 붙었다');
  check('보낸 사람', (await line.locator('.klchat-who').textContent())?.trim() === nameA, '남의 줄 이름이 보낸 사람과 다르다');

  // ⑤ 보내고 나면 입력칸이 비워진다 (안 비면 같은 말을 두 번 보내게 된다).
  check('입력칸', (await a.page.inputValue('#klChatInput')) === '', '보낸 뒤에도 입력칸에 글자가 남아 있다');

  // ⑥ 연달아 치면 막고, **왜 막혔는지가 화면에 뜬다** — 조용히 안 보내지는 게 제일 나쁘다.
  await a.page.fill('#klChatInput', '연달아');
  await a.page.press('#klChatInput', 'Enter');
  await a.page.waitForFunction(() => (document.querySelector('#klChatStatus')?.textContent || '').length > 0, null, { timeout: 5000 });
  const status = (await a.page.locator('#klChatStatus').textContent()) ?? '';
  check('막힌 이유', /천천히|기다|쉬/.test(status), `막혔는데 이유가 안 보인다: ${JSON.stringify(status)}`);

  // ⑦ 닫아 두면 새 줄이 안 읽음으로 쌓인다 — 켜 두고 딴짓하는 자리라 이게 없으면 아무도 안 본다.
  await b.page.click('#klChatClose');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await a.page.fill('#klChatInput', '닫은 사이에 온 말');
  await a.page.press('#klChatInput', 'Enter');
  await b.page.waitForFunction(
    () => {
      const badge = document.querySelector('#klChatUnread');
      return badge && badge.style.display !== 'none' && Number(badge.textContent) > 0;
    },
    null,
    { timeout: 5000 },
  );
  check('안 읽음', true, '');

  // ⑧ 화면이 통째로 죽지 않았다 — 인라인 스크립트가 깨지면 여기서만 드러난다.
  const errors = [];
  a.page.on('pageerror', (error) => errors.push(String(error)));
  await a.page.reload({ waitUntil: 'domcontentloaded' });
  await a.page.waitForSelector('#klChatDock', { timeout: 15000 });
  check('오류 없음', errors.length === 0, `콘솔 오류: ${errors.join(' / ')}`);

  await a.context.close();
  await b.context.close();
} catch (error) {
  failures.push(`검사 도중 멈췄다 — ${error.message}`);
} finally {
  await browser.close();
  api.close();
  site.close();
  await rm(tmp, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('[smoke-chat] 실패:');
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}
console.log('[smoke-chat] 창 둘이 같은 방에서 실시간으로 말이 오간다 · 이름표·안 읽음·도배 막기 전부 화면에서 확인');
