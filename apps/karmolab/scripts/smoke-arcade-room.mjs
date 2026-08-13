/**
 * 방을 든 채 게임을 갈아탄다 — 두 창으로 실측 (TASK-KL-264 D3)
 *
 * 이건 창 하나로는 못 잰다. 「방이 유지되나」는 **손님 쪽 창이 따라오는가**로만 확인되고,
 * 손님 창은 주인이 보낸 것만 본다. 그래서 창을 둘 연다.
 *
 * 보는 것:
 *   ① 주인이 방을 열고 손님이 링크로 들어오면 둘 다 같은 판을 본다
 *   ② 판이 끝나면 주인에게 「다른 게임」이 뜬다 (손님에게는 안 뜬다)
 *   ③ 주인이 그걸 누르면 **방은 그대로**고 손님 화면엔 「고르는 중」이 뜬다
 *   ④ 주인이 다른 게임을 고르면 손님이 **그 게임으로 따라온다** — 링크를 다시 안 보냈는데도
 *   ⑤ 자리가 둘뿐인 판에 셋째가 들어오면 **구경꾼**이 된다 (자리 -1 · 눌러도 판이 안 바뀐다)
 *
 * 그물망(trystero/nostr)을 실제로 탄다 — 붙는 데 몇 초 걸린다. 못 붙으면 「못 돌았다」(2)다.
 */
import { chromium } from 'playwright';

const BASE = process.env.ARCADE_BASE || 'http://127.0.0.1:8813';
const PAGE = `${BASE}/apps/karmolab/index.html`;
const fails = [];
const check = (name, cond, detail = '') => {
  console.log(`  [${cond ? 'O' : 'X'}] ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) fails.push(name);
};

const br = await chromium.launch();
const ctx = await br.newContext();
const open = async () => {
  const p = await ctx.newPage();
  await p.route('**/__dev', (r) => r.abort());
  await p.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  await p.evaluate(() => Toolbox.switchPage('arcade'));
  return p;
};

let cantRun = '';
const host = await open();
await host.waitForSelector('[data-host="reflex"]', { timeout: 20000 });
await host.click('[data-host="reflex"]');
const link = await host.locator('#acUrl').inputValue();
check('초대 링크가 생겼다', /\?r=/.test(link), link);

const guest = await ctx.newPage();
await guest.route('**/__dev', (r) => r.abort());
await guest.goto(link, { waitUntil: 'domcontentloaded', timeout: 20000 });
await guest.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });

/* 둘이 붙을 때까지 — 그물망은 즉시가 아니다. */
const paired = await host
  .waitForFunction(() => document.querySelectorAll('#acWaitSeats .ac-seat').length >= 2, null, { timeout: 60000 })
  .then(() => true)
  .catch(() => false);
if (!paired) cantRun = '두 창이 안 붙었다 (그물망)';

if (!cantRun) {
  check('주인 화면에 둘이 앉았다', true);
  await host.click('#acStart');
  const followed = await guest
    .waitForFunction(() => window.__arcade?.game === 'reflex', null, { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  check('손님이 같은 판을 본다', followed, String(await guest.evaluate(() => window.__arcade?.game)));

  /* 판이 끝날 때까지 아무도 안 눌러도 된다 — 반응 측정은 제한시간으로 넘어간다. */
  await host.waitForFunction(() => window.__arcade?.finished, null, { timeout: 120000 });
  await host.waitForTimeout(500);
  check('주인에게 「다른 게임」이 뜬다', (await host.locator('#acSwap').isVisible()), '');
  check('손님에게는 안 뜬다', !(await guest.locator('#acSwap').isVisible()), '');

  await host.click('#acSwap');
  await host.waitForTimeout(800);
  check('방 유지 띠가 로비에 선다', (await host.locator('#acRoom').isVisible()));
  const told = await guest.locator('#acOverHead').textContent();
  check('손님에게 「고르는 중」이 뜬다', (told || '').includes('⏳'), told || '(빈칸)');

  /* 다른 게임을 고른다 — 링크를 다시 안 보냈는데 손님이 따라와야 한다. */
  await host.click('[data-host="nunchi"]');
  const swapped = await guest
    .waitForFunction(() => window.__arcade?.game === 'nunchi', null, { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  check('손님이 새 게임으로 따라온다', swapped, String(await guest.evaluate(() => window.__arcade?.game)));
}

/* ── 구경 (TASK-KL-264 D2) ─────────────────────────────────────────
   자리가 둘뿐인 판(오목)에 셋째가 들어오면 그 사람은 구경꾼이어야 한다.
   전에는 셋째가 **아무것도 못 하는 빈 화면** 앞에 앉아 있었다. */
if (!cantRun) {
  console.log('[arcade-room] 구경');
  await host.click('#acSwap').catch(() => {});
  await host.waitForTimeout(600);
  const watcher = await ctx.newPage();
  await watcher.route('**/__dev', (r) => r.abort());
  await watcher.goto(link, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await watcher.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  await host.waitForTimeout(5000);
  await host.click('[data-host="gomoku"]');
  const saw = await watcher
    .waitForFunction(() => window.__arcade?.game === 'gomoku', null, { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  check('셋째 창도 판을 본다', saw, String(await watcher.evaluate(() => window.__arcade?.game)));
  if (saw) {
    /* **누가 구경꾼인지는 미리 못 정한다** — 자리를 나눠 주는 것은 주인이고, 들어온 차례가
       그물망에서 늘 같지는 않다. 그래서 「셋째 창」이 아니라 「둘 중 하나」로 본다. */
    const seats = await Promise.all([guest, watcher].map((p) => p.evaluate(() => window.__arcade?.mySeat)));
    const outs = [guest, watcher].filter((_, i) => seats[i] === -1);
    check('둘 중 하나만 자리가 없다 (-1)', outs.length === 1, JSON.stringify(seats));
    if (outs.length === 1) {
      const w = outs[0];
      check('구경 중이라고 적힌다', (await w.locator('.ac-seat.ac-watch').count()) === 1);
      /* 눌러도 판이 안 바뀌어야 한다 — 구경꾼의 손은 나가기 전에 멈춘다. */
      const before = JSON.stringify(await w.evaluate(() => window.__arcade?.state));
      await w.locator('.ac-cell').nth(40).click().catch(() => {});
      await w.waitForTimeout(1500);
      const after = JSON.stringify(await w.evaluate(() => window.__arcade?.state));
      check('구경꾼이 눌러도 판이 안 바뀐다', before === after);
    }
  }
}

await br.close();
if (cantRun) { console.log(`[arcade-room] 못 돌았다 — ${cantRun} (통과 아님)`); process.exit(2); }
if (fails.length) { console.log(`[arcade-room] 실패 ${fails.length}건`); process.exit(1); }
console.log('[arcade-room] 통과 — 방을 든 채 게임을 갈아탔고 손님이 따라왔다');
