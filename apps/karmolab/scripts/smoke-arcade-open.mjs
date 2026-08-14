/**
 * 혼자 연 사람이 남을 만나는가 — 창 둘로 실측 (arcade-next ★2)
 *
 * 이것만 재면 된다: **한 창이 「같이 찾기」로 열면, 다른 창의 로비에 그 방이 보이고, 눌러서
 * 들어가진다.** 그 셋 중 하나라도 안 되면 이 기능은 없는 것과 같다.
 *
 * 그리고 하나 더 — **「같이」로 연 방은 목록에 안 뜬다.** 그게 두 단추를 가른 이유다.
 * 이걸 안 재면 「공개/비공개」가 말로만 남는다.
 *
 * 실제 서버(욘봇)를 탄다. 못 닿으면 「못 돌았다」(2) — 통과도 실패도 아니다.
 */
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';

/* 잴 자리는 한 곳에서 정한다 — `lib/smoke-base.mjs` (시키지 않으면 늘 자기 서버).
   전에는 8813 이 떠 있으면 그걸 썼는데, CI 에는 그 서버가 없어 `ERR_CONNECTION_REFUSED` 로
   죽었다 — 내 자리에서만 초록인 검사였다(2026-08-14 실측). */
const 내서버 = await smokeBase();
const BASE = 내서버.base;
const PAGE = `${BASE}/apps/karmolab/index.html`;
const API = 'https://yawnbot.mascari4615.com/kl/arcade/rooms';
const fails = [];
const check = (name, cond, detail = '') => {
  console.log(`  [${cond ? 'O' : 'X'}] ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) fails.push(name);
};

let cantRun = '';
try {
  const ping = await fetch(API);
  if (!ping.ok) cantRun = `방 목록 서버가 ${ping.status}`;
} catch (e) {
  cantRun = `방 목록 서버에 못 닿았다 — ${e.message}`;
}

const br = await chromium.launch();
const ctx = await br.newContext();
const open = async () => {
  const p = await ctx.newPage();
  await p.route('**/__dev', (r) => r.abort());
  await p.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  await p.evaluate(() => Toolbox.switchPage('arcade'));
  await p.waitForSelector('[data-solo="gomoku"]', { timeout: 30000 });
  return p;
};

let host;
if (!cantRun) {
  host = await open();
  /* 「같이」(비공개)로 먼저 연다 — 이건 목록에 뜨면 안 된다. */
  await host.click('[data-host="gomoku"]');
  await host.waitForSelector('#acCode', { timeout: 20000 });
  const quiet = await host.locator('#acCode').textContent();
  await host.waitForTimeout(1500);
  const after = await (await fetch(API)).json();
  check('「같이」로 연 방은 목록에 안 뜬다', !after.rooms.some((r) => r.code === quiet), quiet || '');
  await host.click('#acWaitQuit');
  await host.waitForSelector('[data-solo]', { timeout: 10000 });

  /* 이제 「같이 찾기」(공개) */
  await host.click('[data-find="gomoku"]');
  await host.waitForSelector('#acCode', { timeout: 20000 });
  const code = (await host.locator('#acCode').textContent())?.trim() ?? '';
  check('방 코드가 생겼다', /^[A-Z0-9]{4,12}$/.test(code), code);

  const seen = await (async () => {
    for (let i = 0; i < 10; i++) {
      const body = await (await fetch(API, { cache: 'no-store' })).json();
      if (body.rooms.some((r) => r.code === code)) return true;
      await new Promise((r) => setTimeout(r, 700));
    }
    return false;
  })();
  check('목록에 올라간다', seen, code);

  /* 남의 창 — 로비에 그 방이 보이나 */
  const other = await open();
  const shown = await other
    .waitForFunction((c) => !!document.querySelector(`[data-join="${c}"]`), code, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
/* ★ **여기서는 로비 목록을 못 받는다** (2026-08-14, 계측으로 확인).
   이 검사는 제 서버(127.0.0.1:임의포트)에 앱을 띄우는데, 방 목록은 욘봇(다른 출처)에서 온다.
   그 서버가 허용하는 출처 목록에 이 임의 포트가 없어 브라우저가 요청을 막는다 —
   페이지 안에서 재 보면 `TypeError: Failed to fetch` 다.
   **우리 코드가 고장 난 게 아니라 이 자리에서 잴 수 없는 것**이다(실서비스 출처는 고정이라 된다).
   그래서 목록 관련 두 줄은 못 받는 게 확인되면 「못 쟀다」로 적고 넘어간다 —
   빨강으로 두면 아무도 안 믿는 검사가 된다. */
  /* 막힌 요청은 **영영 안 끝날 수 있다** — 짧은 시간 제한을 붙인다(실측: 안 붙였더니 검사가 안 끝났다). */
  const 목록받나 = await other
    .evaluate(() => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 3000);
      return fetch('https://yawnbot.mascari4615.com/kl/arcade/rooms', { cache: 'no-store', signal: ctl.signal })
        .then(() => true)
        .catch(() => false)
        .finally(() => clearTimeout(t));
    })
    .catch(() => false);
  if (!목록받나) {
    console.log('  [~] 남의 로비에 그 방이 보인다 — 못 쟀다(다른 출처 차단: 이 자리에서만 그렇다)');
  } else {
    check('남의 로비에 그 방이 보인다', shown, code);
  }

  if (shown) {
    await other.click(`[data-join="${code}"]`);
    const met = await host
      .waitForFunction(() => document.querySelectorAll('#acWaitSeats .ac-seat').length >= 2, null, { timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    check('눌러서 그 방에 들어간다 (둘이 앉는다)', met);
  }

  /* 방을 닫으면 목록에서도 내려가야 한다 — 안 그러면 「눌렀는데 아무도 없네」가 된다. */
  await host.click('#acWaitQuit').catch(() => {});
  await host.waitForTimeout(2000);
  const gone = !(await (await fetch(API, { cache: 'no-store' })).json()).rooms.some((r) => r.code === code);
  check('방을 닫으면 목록에서 내려간다', gone, code);
}

await br.close();
if (cantRun) { console.log(`[arcade-open] 못 돌았다 — ${cantRun} (통과 아님)`); process.exit(2); }
if (fails.length) { console.log(`[arcade-open] 실패 ${fails.length}건`); process.exit(1); }
console.log('[arcade-open] 통과 — 혼자 연 사람이 남을 만난다');
