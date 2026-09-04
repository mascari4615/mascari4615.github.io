/**
 * 잘린 창이 스스로 다시 들어오는가 (같이 쓰기, 2026-08-29)
 *
 * 서버는 **침묵을 나감으로 판정한다**(30초). 그런데 화면만 보고 있는 사람도 침묵한다 . 
 * 잘린 뒤에는 `move` 가 `{moved:false}` 만 돌려주고, 흐르는 연결은 ping 으로 살아 있어
 * 다시 붙지도 않았다. 그 창의 커서는 **새로고침 전까지 남에게 안 보였다.**
 *
 * 서버 시험으로는 못 잡는다. 잘린 것도 사실이고 `moved:false` 도 사실이다 . 
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
import { WAIT } from './lib/waits.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');
const SITE_ROOT = path.resolve(APP_ROOT, '../..');
const YAWNBOT = path.resolve(SITE_ROOT, 'apps/discord-bots/apps/yawnbot');
const PROD_ORIGIN = 'https://yawnbot.mascari4615.com';

const failures = [];
const check = (name, condition, detail) => {
  if (!condition) failures.push(`${name}. ${detail}`);
};

function cantRun(why) {
  console.log(`[smoke-copresence] 못 돌았다. ${why}`);
  process.exit(2);
}

const dist = path.join(YAWNBOT, 'dist/src/bot/karmolab-api.js');
if (!existsSync(dist)) cantRun(`yawnbot 이 아직 안 지어졌다 (${dist} 없음). cd ${YAWNBOT} && npm run build`);
if (!existsSync(path.join(APP_ROOT, 'js/copresence.js'))) cantRun('카모랩이 아직 안 지어졌다. npm run build');

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
  // 라우트가 쓰는 것과 **같은 하나**를 든다. 다른 것을 들면 여기서 뺀 사람이 저기 남는다.
  rooms = require_(path.join(YAWNBOT, 'dist/src/services/karmolab-rooms.js')).getKarmolabRoomStore();
} catch (error) {
  cantRun(`yawnbot 빌드 산출물을 못 불렀다: ${error.message}`);
}

const apiSource = await readFile(dist, 'utf-8');
if (!apiSource.includes('/kl/room/')) cantRun('지어 둔 yawnbot 에 방 라우트가 없다 (낡은 산출물). npm run build 부터');

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
/* 서버가 아는 출처만 받아 준다(ALLOWED_ORIGINS). 아무 포트나 쓰면 요청이 통째로 버려지고
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
if (sitePort === 0) cantRun(`개발 포트(${ALLOWED_PORTS.join(', ')})가 전부 쓰이는 중이다. 핫리로드 서버를 끄고 다시`);
const PAGE = `http://127.0.0.1:${sitePort}/apps/karmolab/index.html`;

/* 기기 id 가 **선 위에 실제로 실리는지** 본다. 쿠키만으로도 여기서는 통과해 버리기 때문이다 . 
   브라우저가 제3자 쿠키를 막는 진짜 환경에서는 머리(헤더)와 주소(query)뿐이다. */
const wire = { header: false, stream: false, doc: false };

const browser = await chromium.launch();

/** 창 하나. UA 가 다르면 서버가 다른 사람으로 본다(같은 IP 라도 이름표가 갈린다). */
async function openWindow(userAgent) {
  const context = await browser.newContext({ userAgent });
  /* **창(context)** 에 건다. 탭에만 걸면 이 검사가 나중에 여는 탭들이 그대로
     운영 서버로 나간다(그래서 여기서 한 번 헤맸다: 새 탭이 로컬 방에 아예 안 들어왔다). */
  await context.addInitScript((origin) => {
    window.KARMOLAB_API_BASE = origin;
  }, apiOrigin);
  await context.route(`${PROD_ORIGIN}/**`, (route) => route.abort());
  const page = await context.newPage();
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(apiOrigin)) return;
    if (request.headers()['x-kl-device']) wire.header = true;
    if (url.includes('/stream?') && /[?&]dev=[a-z0-9]{16,32}/.test(url)) wire.stream = true;
    if (url.endsWith('/move') && /"dx":\s*[\d.]/.test(request.postData() ?? '')) wire.doc = true;
  });
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
const cursors = () => document.querySelectorAll('.kl-cursor').length;

try {
  const a = await openWindow(CHROME);
  const b = await openWindow(FIREFOX);

  // ① 남의 커서가 실제로 그려진다. 이게 안 되면 아래 검사는 전부 뜻이 없다.
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

  /* 여기서부터가 이 검사의 이유다. **마우스를 안 움직인다**. 잘린 창은 가만히 있어도
     스스로 돌아와야 한다(살아 있다고 말하는 주기 신호 + 없다는 답에 대한 재입장). */
  await b.page.waitForFunction(cursors, null, { timeout: 20000 }).catch(() => {});
  check('스스로 재입장', (await b.page.evaluate(cursors)) === 1, '잘린 뒤 20초가 지나도 A 커서가 안 돌아왔다 (재입장 없음)');
  /* 둘 다 돌아온다. 다만 주기 신호가 창마다 다른 순간에 울린다. A 가 보인다와
     둘 다 방에 있다를 같은 시각으로 묶으면 검사가 순서를 가정하는 것이 된다. */
  const deadline = Date.now() + 15000;
  while (rooms.members('home').length < 2 && Date.now() < deadline) await b.page.waitForTimeout(250);
  const after = rooms.members('home').length;
  check('서버 인원', after === 2, `재입장 뒤에도 방 인원이 ${after}명 (둘 다 스스로 안 돌아왔다)`);

  // ③ 창을 떠나면 이제 안 보인다가 반드시 나간다. 안 나가면 남의 화면에 멈춘 커서가 남는다.
  await a.page.mouse.move(400, 400);
  await b.page.waitForFunction(() => document.querySelector('.kl-cursor')?.dataset.active === '1', null, { timeout: 5000 }).catch(() => {});
  // 보낸 직후를 노린다: 보낼 것이 비어 있을 때 떠나도 신호가 나가야 한다(옛 코드는 안 나갔다).
  await a.page.waitForTimeout(400);
  await a.page.evaluate(() => window.dispatchEvent(new Event('pointerleave')));
  await b.page.waitForFunction(() => document.querySelector('.kl-cursor')?.dataset.active === '0', null, { timeout: 5000 }).catch(() => {});
  check('떠남 신호', await b.page.evaluate(() => document.querySelector('.kl-cursor')?.dataset.active === '0'), '창을 떠났는데 남의 화면에서 커서가 계속 활성이다');

  /* ④ 한 사람이 탭을 셋 열어도 그 사람은 하나 (change.copresence-hardening 2단계).
     같은 context = 같은 브라우저다. 탭끼리 대표를 뽑아 대표만 연결을 연다.
     인원 전체가 아니라 **A 쪽 사람 수**를 센다. 뒤에 있는 창은 안 보는 창이라
     스스로 조용해지고(설계), 그것까지 세면 검사가 남의 사정에 흔들린다. */
  const keyOf = (id) => id.split(':')[0];
  const keyA = keyOf(rooms.members('home')[0]?.id ?? '');
  const mine = () => rooms.members('home').filter((m) => keyOf(m.id) === keyA).length;
  check('기준', keyA !== '', 'A 의 이름표를 못 읽었다. 앞 단계가 이미 깨졌다');

  /* 새 탭은 **앞으로 꺼내 놓고** 기다린다. 뒤에 있는 탭은 브라우저가 한가한 틈을 안 주고,
     같이 쓰기는 그 틈에 실린다(`boot-late`). 앞에 안 꺼내면 아예 안 켜져서, 검사가
     대표 뽑기가 됐다가 아니라 아무 일도 안 일어났다를 초록으로 읽는다. */
  const openTab = async () => {
    const page = await a.context.newPage();
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    await page.bringToFront();
    await page.mouse.move(500, 500);
    await page.waitForFunction(() => !!window.KarmoCopresence, null, { timeout: 15000 });
    return page;
  };
  const t2 = await openTab();
  const t3 = await openTab();
  await t3.waitForTimeout(4000); // 대표 뽑기 한 바퀴(1초) + 여유
  /* 사람 수는 커서만의 이야기가 아니다. 접속자 수와 채팅 지금 여기도 같은 사람으로
     묶여야 한다 (change.identity-one). 탭 셋이 열려 있는 지금 재는 것이 가장 정직하다. */
  const onlineOf = (page) =>
    page.evaluate(async (origin) => {
      const res = await fetch(`${origin}/kl/presence`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'human' }),
      });
      return res.ok ? (await res.json()).online : -1;
    }, apiOrigin);
  const onlineFromTabs = [await onlineOf(a.page), await onlineOf(t2), await onlineOf(t3)];
  /* 지금 창은 둘(A 브라우저, B 브라우저)이고 A 는 탭이 셋이다. 탭마다 세던 시절이면 4 가 된다. */
  check('접속자는 사람 수', onlineFromTabs.every((n) => n === 2),
    `탭 셋에서 잰 접속자 수가 ${onlineFromTabs.join(', ')}. 브라우저 둘이니 전부 2 여야 한다 (탭을 세면 4 가 된다)`);

  check('탭 셋 = 한 사람', mine() === 1, `탭을 셋 열었더니 A 가 ${mine()}명이 됐다 (대표 뽑기가 안 섰다)`);
  await t2.close();
  await t3.close();

  /* ⑤ 기기 id 로 사람을 센다 (change.identity-one).
     같은 브라우저(같은 저장소)면 창을 따로 열어도 한 사람. 예전엔 IP+UA 가 사람이라
     크롬과 엣지를 같이 열면 두 명이 됐다. 여기서는 반대 방향을 잰다: **UA 가 달라도**
     기기 id 가 같으면 한 사람. */
  const other = await a.context.newPage();
  await other.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await other.bringToFront();
  await other.waitForFunction(() => !!window.KarmoId, null, { timeout: 15000 });
  const idA = await a.page.evaluate(() => window.KarmoId.deviceId());
  const idOther = await other.evaluate(() => window.KarmoId.deviceId());
  const idB = await b.page.evaluate(() => window.KarmoId.deviceId());
  check('같은 브라우저 = 같은 기기', idA === idOther, `같은 브라우저인데 기기 id 가 다르다 (${idA} vs ${idOther})`);
  check('다른 브라우저 = 다른 기기', idA !== idB, '다른 브라우저인데 기기 id 가 같다');
  check('기기 id 모양', /^[a-z0-9]{16,32}$/.test(String(idA)), `기기 id 가 서버가 아는 모양이 아니다: ${idA}`);
  await other.close();
  await a.page.bringToFront();

  /* 서버도 기기로 센다. **UA 와 IP 가 똑같은 다른 브라우저**를 하나 더 붙인다.
     옛 방식(IP+UA)이라면 이 사람은 A 와 같은 이름표를 받아 한 명으로 접혔다. */
  const twin = await openWindow(CHROME);
  await twin.page.bringToFront();
  await twin.page.mouse.move(150, 150);
  /* 셋째 사람이 방에 등록될 때까지. 고정 1.5초로 재다 바쁜 CI 에서 2종만 잡혀 빨갰다 (2026-09-03).
     재는 것은 셋으로 세나이지 몇 초 안에 세나가 아니다 */
  let keys = new Set();
  for (const done = Date.now() + 20000; Date.now() < done; ) {
    keys = new Set(rooms.members('home').map((m) => keyOf(m.id)));
    if (keys.size >= 3) break;
    await twin.page.waitForTimeout(250);   // 재움-의도: 다시 세기 전 틈
  }
  check('IP, UA 가 같아도 다른 사람', keys.size >= 3, `같은 IP, UA 의 다른 브라우저가 접혔다. 방의 사람 이름표 ${keys.size}종`);
  await twin.context.close();
  await a.page.bringToFront();

  /* ⑥ 커서를 꺼도 **관은 산다**. 지구본 동시관람, 함께 편집이 이 관을 같이 쓴다
     (1단계 계약 변경). 끈 뒤에도 방에 남아야 하고, 남의 커서만 안 그려야 한다. */
  await a.page.bringToFront();
  await a.page.mouse.move(360, 360);
  await a.page.waitForTimeout(500);
  await a.page.evaluate(() => window.KarmoCopresence.set(false));
  /* 끈 뒤에 방을 **한 번만 보면 안 된다**. 방 명부는 서버가 들고 있고, 끄는 순간과
     명부가 잠잠해지는 순간 사이에 틈이 있다. 고정 1.5초로 재던 2026-09-01 에 같은 판이
     한 번은 빨강, 한 번은 초록이었다. 잠잠해질 때까지 기다렸다가 잰다 */
  /* 5초로 끊고 **그 순간을 한 번 더 재던** 것이 CI 에서 빨갰다 (2026-09-04). 잠잠해지지 못한 채
     시간이 다 되면 마지막 한 번이 하필 0 일 수 있다. 재는 것은 **끝내 방에 남나**이므로,
     한 번이라도 1초 내리 남아 있었으면 통과로 본다. 영영 안 남으면 그대로 빨강 */
  let stayed = false;
  {
    const until = Date.now() + Math.max(WAIT, 5000);
    let stable = 0;
    while (Date.now() < until) {
      // 재움-의도: 잠잠해지기를 세는 자리. 이 250ms 자체가 재는 단위
      await a.page.waitForTimeout(250);
      stable = mine() === 1 ? stable + 1 : 0;
      if (stable >= 4) { stayed = true; break; }   // 1초 내리 그대로면 잠잠해진 것
    }
  }
  check('꺼도 방에 남는다', stayed || mine() === 1, '커서를 껐더니 방에서 나가 버렸다 (관까지 끈 것이다)');
  await b.page.bringToFront();
  await b.page.mouse.move(250, 250);
  await b.page.waitForTimeout(800);
  check('꺼면 안 그린다', (await a.page.evaluate(cursors)) === 0, '껐는데도 남의 커서가 그려진다');
  // 다시 켜 놓는다. 아래 검사들은 커서가 보이는 상태를 잰다.
  await a.page.evaluate(() => window.KarmoCopresence.set(true));
  await a.page.bringToFront();

  /* ⑦ 화면을 옮기면 방도 옮긴다. 셸은 주소를 `pushState` 로 바꾼다(해시가 아니다).
     예전엔 그 신호를 안 들어서 다른 도구를 보면서 옛 방 커서를 봤다. */
  await a.page.evaluate(() => history.pushState({}, '', '/t/qr/'));
  await a.page.waitForTimeout(1500);
  await a.page.mouse.move(210, 210);
  await a.page.waitForTimeout(600);
  check('주소가 바뀌면 방도', rooms.members('qr').length >= 1, 'pushState 로 도구를 열었는데 그 방에 아무도 없다 (옛 방에 남았다)');
  await a.page.evaluate(() => history.pushState({}, '', '/'));
  await a.page.waitForTimeout(1200);
  await a.page.mouse.move(230, 230);
  await a.page.waitForTimeout(600);

  /* ⑧ 내가 스크롤하면 남의 커서도 따라 앉는다. 글 기준 자리를 같이 보내기 때문이다.
     화면 기준 비율만 보내던 시절엔 내가 굴려도 남의 커서는 화면 같은 자리에 붙어 있었고,
     그건 서로 다른 문단을 가리키는 것이었다. */
  await b.page.bringToFront();
  await b.page.mouse.move(300, 420);
  await b.page.waitForTimeout(700);
  await a.page.bringToFront();
  const spotBefore = await a.page.evaluate(() => document.querySelector('.kl-cursor')?.style.transform ?? '');
  await a.page.evaluate(() => { document.documentElement.style.minHeight = '3000px'; window.scrollTo(0, 400); });
  await a.page.waitForTimeout(400);
  const spotAfter = await a.page.evaluate(() => document.querySelector('.kl-cursor')?.style.transform ?? '');
  check('스크롤하면 다시 앉힌다', spotBefore !== '' && spotBefore !== spotAfter, `내가 굴려도 남의 커서가 그 자리다 (${spotBefore} → ${spotAfter})`);
  check('글 기준 자리를 싣는다', wire.doc, '/move 에 dx 가 없다. 스크롤이 다르면 서로 다른 문단을 가리킨다');

  /* ⑨ 이름, 색은 **서버 한 곳**이 정한다. 화면이 자기 규칙으로 지으면 같은 사람이
     화면마다 다른 사람이 된다 (change.identity-one 3단계). */
  const whoAmI = await a.page.evaluate(async () => {
    await window.KarmoId.refresh();
    return window.KarmoId.me();
  });
  check('나를 안다', !!whoAmI && typeof whoAmI.name === 'string' && whoAmI.name.includes(' '), `내 이름표를 못 받았다: ${JSON.stringify(whoAmI)}`);
  check('내 색도 온다', !!whoAmI && /^#[0-9a-f]{6}$/i.test(String(whoAmI.color)), `색이 서버가 정한 모양이 아니다: ${whoAmI?.color}`);
  /* 색은 한 벌이다. 채팅에서 보이는 색과 커서 색이 다르면 같은 사람으로 안 읽힌다. */
  const cursorColor = await b.page.evaluate(() => document.querySelector('.kl-cursor-name')?.getAttribute('style') ?? '');
  check('색이 한 벌', cursorColor.includes(String(whoAmI?.color)), `커서 색과 이름표 색이 다르다 (${cursorColor} vs ${whoAmI?.color})`);

  check('로그인 상태도 안다', !!whoAmI && whoAmI.signedIn === false, '로그인 안 했는데 로그인으로 보인다');

  check('머리에 기기 id', wire.header, '우리 서버로 가는 요청에 X-KL-Device 가 안 실린다 (쿠키를 막은 브라우저에서 사람 수가 다시 창 수가 된다)');
  check('흐르는 연결에 기기 id', wire.stream, '방 연결 주소에 dev= 가 없다 (EventSource 는 머리를 못 단다)');

  await a.context.close();
  await b.context.close();
} catch (error) {
  failures.push(`검사가 도중에 죽었다. ${error.message}`);
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
console.log('[smoke-copresence] OK. 커서 그리기, 재입장, 떠남 신호, 탭 셋 = 한 사람, 꺼도 관은 산다, 주소↔방, 스크롤 따라감, 기기 id, 이름표 한 벌');
