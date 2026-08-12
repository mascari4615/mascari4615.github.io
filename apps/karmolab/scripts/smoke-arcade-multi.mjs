/**
 * 오락실이 진짜로 둘을 붙이는지 (TASK-KL-242)
 *
 * 창 하나만 보는 검사는 **둘이 안 붙어도 통과한다.** 혼자 도는 길은 그물망을 한 번도 안 타기
 * 때문에, `smoke-arcade.mjs` 가 전부 초록이어도 여럿이서는 죽어 있을 수 있다. 그래서 창을 둘
 * 띄워 실제로 방을 열고 들어가 본다.
 *
 * 보는 것:
 *   ① 「같이」를 누르면 방 코드가 뜬다
 *   ② 그 코드로 다른 창이 들어오면 **주인 화면에 사람이 둘로 보인다** (공개망을 거쳐, 우리 서버 없이)
 *   ③ 주인이 시작하면 **손님 화면에도 같은 판이 뜬다** (손님은 커널이 없다 — 받은 판을 그린다)
 *   ④ 손님이 고른 것이 **주인의 판에 반영된다** (수는 주인에게로, 판정은 한 곳에서만)
 *
 * **자동 묶음(audit:all)에는 일부러 안 넣었다.** 바깥 공개망(nostr 짝짓기)에 기대는 검사라
 * 망이 막힌 자리에서는 늘 빨갛다 — 늘 시끄러운 경보는 꺼진 경보와 같다. 연결 쪽을 건드렸으면
 * `npm run test:arcade:multi` 로 손수 돌린다.
 *
 * 방 이름은 **물음표 뒤**에 단다 — `#` 뒤는 셸이 어느 화면인지 적는 자리라 덮여 사라진다.
 *
 * 붙는 데 걸리는 시간은 들쭉날쭉하다(공개 릴레이). 못 붙으면 「못 돌았다」(2)로 끝낸다 —
 * 통과도 실패도 아니다. 둘을 같은 글자로 적으면 게이트가 죽은 것을 아무도 모른다.
 */
import { chromium } from 'playwright';
import { waitHydrated } from './lib/hydrated.mjs';

const BASE = process.env.ARCADE_BASE || 'http://127.0.0.1:8813';
const PAGE = `${BASE}/apps/karmolab/index.html`;
const CONNECT_MS = 60000;

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  [O] ${name}`);
  else {
    console.log(`  [X] ${name} — ${detail}`);
    failures.push(name);
  }
};

let cantRun = '';
const browser = await chromium.launch();

/** 오락실 화면까지 데려간다. 손님은 방 코드를 주소에 달고 들어간다. */
async function openArcade(ctx, hash = '') {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`창에서 터졌다 — ${e.message}`));
  await page.goto(PAGE + hash, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  await page.evaluate(() => Toolbox.switchPage('arcade'));
  return page;
}

let host;
let guest;
try {
  /* 창을 따로 두는 이유: 같은 창의 두 탭은 이름·저장한 값을 나눠 써서 남처럼 안 보인다. */
  host = await openArcade(await browser.newContext());
} catch (e) {
  cantRun = `dev 서버에 못 닿았다 — ${e.message}`;
}

if (!cantRun) {
  try {
    await waitHydrated(host, '[data-host="reflex"]', { timeout: 30000 });
  } catch (e) {
    cantRun = `오락실 화면이 안 떴다 — ${e.message}`;
  }
}

if (!cantRun) {
  console.log('[arcade-multi] 방 열기');
  await host.fill('#acName', '주인');
  await host.click('[data-host="reflex"]');
  await host.waitForSelector('#acCode', { timeout: 10000 });
  const code = (await host.locator('#acCode').textContent())?.trim() || '';
  check('방 코드가 뜬다', /^[A-Z2-9]{5}$/.test(code), `"${code}"`);

  const url = await host.locator('#acUrl').inputValue();
  check('들어올 링크가 나온다', url.includes('?r=' + code), url);

  if (!code) {
    cantRun = '방 코드가 없어 더 못 간다';
  } else {
    console.log('[arcade-multi] 들어가기 (공개망 짝짓기)');
    guest = await openArcade(await browser.newContext(), '?r=' + code);
    await waitHydrated(guest, '#acCode', { timeout: 30000 }).catch(() => {});

    /* 여기가 이 검사의 알맹이다 — 바깥 릴레이를 거쳐 서로를 찾는 자리. */
    try {
      await host.waitForFunction(
        () => document.querySelectorAll('#acWaitSeats .ac-seat').length >= 2,
        null,
        { timeout: CONNECT_MS }
      );
      check('주인 화면에 사람이 둘로 보인다', true);
    } catch (e) {
      cantRun = `공개망으로 못 붙었다 (${Math.round(CONNECT_MS / 1000)}초) — ${e.message.slice(0, 80)}`;
    }
  }
}

if (!cantRun && guest) {
  console.log('[arcade-multi] 한 판');
  await host.click('#acStart');

  try {
    await guest.waitForSelector('.ac-choice', { timeout: 20000 });
    check('손님 화면에도 같은 판이 뜬다', true);
  } catch (e) {
    check('손님 화면에도 같은 판이 뜬다', false, e.message.slice(0, 80));
  }

  /* 양쪽이 같은 문제를 보는가 — 씨앗이 하나라는 증거. 손님은 커널이 없으니 받은 것을 그린다. */
  const hostOrder = (await host.locator('#acOrder').textContent())?.trim();
  const guestOrder = (await guest.locator('#acOrder').textContent())?.trim();
  check('둘이 같은 문제를 본다', !!hostOrder && hostOrder === guestOrder, `주인="${hostOrder}" 손님="${guestOrder}"`);

  /* 손님이 고른 것이 주인의 판에 닿아야 한다 — 손은 주인에게로, 판정은 한 곳에서만. */
  const before = await host.locator('.ac-seat').allTextContents();
  await guest.locator('.ac-choice').first().click();
  try {
    await guest.waitForFunction(
      () => [...document.querySelectorAll('.ac-choice')].every((b) => b.disabled),
      null,
      { timeout: 15000 }
    );
    check('손님이 고르면 주인이 그 손을 받아 판을 닫는다', true, before.join('/'));
  } catch (e) {
    check('손님이 고르면 주인이 그 손을 받아 판을 닫는다', false, e.message.slice(0, 80));
  }
}

await browser.close();

if (cantRun) {
  console.log(`[arcade-multi] 못 돌았다 — ${cantRun} (통과 아님)`);
  process.exit(2);
}
if (failures.length) {
  console.log(`[arcade-multi] 실패 ${failures.length}건`);
  process.exit(1);
}
console.log('[arcade-multi] 둘이 붙었다 — 방 코드 · 짝짓기 · 같은 문제 · 손님의 손이 주인에게');
