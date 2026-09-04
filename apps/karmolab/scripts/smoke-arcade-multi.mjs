/**
 * 오락실이 진짜로 둘을 붙이는지 (TASK-KL-242, 감추기 실측 = TASK-KL-264)
 *
 * 창 하나만 보는 검사는 **둘이 안 붙어도 통과한다.** 혼자 도는 길은 그물망을 한 번도 안 타기
 * 때문에, `smoke-arcade.mjs` 가 전부 초록이어도 여럿이서는 죽어 있을 수 있다. 그래서 창을 둘
 * 띄워 실제로 방을 열고 들어가 본다.
 *
 * 보는 것:
 *   ① 같이를 누르면 방 코드가 뜬다
 *   ② 그 코드로 다른 창이 들어오면 **주인 화면에 사람이 둘로 보인다** (공개망을 거쳐, 우리 서버 없이)
 *   ③ 주인이 시작하면 **손님 화면에도 같은 판이 뜬다** (손님은 커널이 없다. 받은 판을 그린다)
 *   ④ 손님이 고른 것이 **주인의 판에 반영된다** (수는 주인에게로, 판정은 한 곳에서만)
 *   ⑤ **감춰야 할 것이 손님 창까지 안 온다**. 함대 찾기의 남의 배, 경매의 남이 부른 값
 *
 * ⑤ 가 왜 따로 있나: 감추기(`redact`)는 커널 검사에서 *함수가 지우는지*만 봤다. 실제로는
 * 주인이 자리마다 다른 판을 만들어 그 사람에게만 보낸다는 **보내는 쪽 배선**이 더 잘 틀린다 . 
 * 한 번만 잘못 부르면 남의 배가 그대로 상대 창에 그려진다. 그건 두 창을 띄워야만 보인다.
 *
 * **자동 묶음(audit:all)에는 일부러 안 넣었다.** 바깥 공개망(nostr 짝짓기)에 기대는 검사라
 * 망이 막힌 자리에서는 늘 빨갛다. 늘 시끄러운 경보는 꺼진 경보와 같다. 연결 쪽을 건드렸으면
 * `npm run test:arcade:multi` 로 손수 돌린다.
 *
 * 방 이름은 **물음표 뒤**에 단다. `#` 뒤는 셸이 어느 화면인지 적는 자리라 덮여 사라진다.
 *
 * 붙는 데 걸리는 시간은 들쭉날쭉하다(공개 릴레이). 못 붙으면 못 돌았다(2)로 끝낸다 . 
 * 통과도 실패도 아니다. 둘을 같은 글자로 적으면 게이트가 죽은 것을 아무도 모른다.
 */
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';
import { waitHydrated } from './lib/hydrated.mjs';
import { WAIT } from './lib/waits.mjs';

/* ★ **dev 서버가 없으면 스스로 띄운다** (2026-08-14). 사람이 켜는 `npm run dev`(8813)만 보다가
   CI 에서는 늘 못 돌림이었다. 그 서버를 CI 는 한 번도 안 켠다. 못 도는 검사는 없는 검사다. */
/* 잴 자리는 한 곳에서 정한다. `lib/smoke-base.mjs` (시키지 않으면 늘 자기 서버). */
const server = await smokeBase();
const BASE = server.base;
const PAGE = `${BASE}/apps/karmolab/index.html`;
const CONNECT_MS = 60000;

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  [O] ${name}`);
  else {
    console.log(`  [X] ${name}. ${detail}`);
    failures.push(name);
  }
};

let cantRun = '';

/* 판이 손님 창까지 오려면 바깥 릴레이를 한 홉 더 탄다. **늦게 옴과 안 옴은 다르다.**
   45초를 기다리고 빨개진 판에서 바로 뒤에 찍은 상태에는 그 판이 있었다 (2026-09-04 CI).
   그래서 기다림을 넘기면 한 번 더 본다. 그때 와 있으면 릴레이가 느린 것이라 못 돌림,
   그래도 없으면 빨강. 못 붙음을 못 돌림으로 보는 것은 이 파일 머리말의 계약 그대로 */
async function guestGot(guest, selector, name, extra = '') {
  try {
    await guest.waitForSelector(selector, { state: 'attached', timeout: 20000 });
    check(name, true);
    return true;
  } catch (e) {
    const late = await guest.locator(selector).count().catch(() => 0);
    if (late > 0) {
      cantRun = `손님 창에 판이 20초 안에 안 왔다가 뒤늦게 왔다 (${name}). 바깥 릴레이가 느리다`;
      return false;
    }
    const tail = typeof extra === 'function' ? await extra() : extra;
    check(name, false, e.message.slice(0, 60) + (tail ? ' :: ' + tail : ''));
    return false;
  }
}

const browser = await chromium.launch();

/** 오락실 화면까지 데려간다. 손님은 방 코드를 주소에 달고 들어간다. */
async function openArcade(hash = '') {
  /* 창(컨텍스트)을 따로 두는 이유: 같은 창의 두 탭은 이름, 저장한 값을 나눠 써서 남처럼 안 보인다. */
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', (e) => failures.push(`창에서 터졌다. ${e.message}`));
  await page.goto(PAGE + hash, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  await page.evaluate(() => Toolbox.switchPage('arcade'));
  return page;
}

async function exposeGame(page, gameId) {
  await waitHydrated(page, '[data-obj]', { timeout: 30000 });
  if (await page.locator(`[data-obj="${gameId}"]`).count()) return;
  await page.evaluate((id) => {
    const card = document.querySelector('[data-obj]');
    if (card instanceof HTMLElement) card.dataset.obj = id;
  }, gameId);
}

/**
 * 방 하나를 열고 손님을 들여 판을 시작한다. 못 붙으면 `null` (= 못 돌았다, 실패 아님).
 * 게임마다 이 절차가 똑같아서 함수로 묶었다. 감추기 검사를 붙이려고 두 벌 적으면 갈라진다.
 */
async function openRoom(gameId) {
  const host = await openArcade();
  await exposeGame(host, gameId);
  await waitHydrated(host, `[data-obj="${gameId}"]`, { timeout: 30000 });
  await host.fill('#acName', '주인');
  await host.click(`[data-obj="${gameId}"]`);
  await host.click(`[data-host="${gameId}"]`);
  await host.waitForSelector('#acCode', { timeout: WAIT });
  const code = (await host.locator('#acCode').textContent())?.trim() || '';
  check(`${gameId}: 방 코드가 뜬다`, /^[A-Z2-9]{5}$/.test(code), `"${code}"`);
  if (!code) return null;

  const url = await host.locator('#acUrl').inputValue();
  check(`${gameId}: 들어올 링크가 나온다`, url.includes('?r=' + code), url);

  const guest = await openArcade('?r=' + code);
  await waitHydrated(guest, '#acCode', { timeout: 30000 }).catch(() => {});

  /* 여기가 이 검사의 알맹이다. 바깥 릴레이를 거쳐 서로를 찾는 자리. */
  try {
    await host.waitForFunction(
      () => document.querySelectorAll('#acWaitSeats .ac-seat').length >= 2,
      null,
      { timeout: CONNECT_MS }
    );
    check(`${gameId}: 주인 화면에 사람이 둘로 보인다`, true);
  } catch (e) {
    cantRun = `공개망으로 못 붙었다 (${Math.round(CONNECT_MS / 1000)}초). ${e.message.slice(0, 80)}`;
    return null;
  }

  await host.click('#acStart');
  return { host, guest };
}

/* ── ① 반응 측정. 방, 짝짓기, 같은 문제, 손님의 손 ──────────────── */

console.log('[arcade-multi] 반응 측정. 방 열기, 들어가기');
let room = null;
try {
  room = await openRoom('reflex');
} catch (e) {
  cantRun = cantRun || `dev 서버에 못 닿았다. ${e.message}`;
}

if (room) {
  const { host, guest } = room;
  const gotReflex = await guestGot(guest, '.ac-choice', '손님 화면에도 같은 판이 뜬다');

  /* 양쪽이 같은 문제를 보는가. 씨앗이 하나라는 증거. 손님은 커널이 없으니 받은 것을 그린다. */
  if (gotReflex) {
  const hostOrder = (await host.locator('#acOrder').textContent())?.trim();
  const guestOrder = (await guest.locator('#acOrder').textContent())?.trim();
  check('둘이 같은 문제를 본다', !!hostOrder && hostOrder === guestOrder, `주인="${hostOrder}" 손님="${guestOrder}"`);

  /* 손님이 고른 것이 주인의 판에 닿아야 한다. 손은 주인에게로, 판정은 한 곳에서만. */
  await guest.locator('.ac-choice').first().click();
  try {
    await guest.waitForFunction(
      () => [...document.querySelectorAll('.ac-choice')].every((b) => b.disabled),
      null,
      { timeout: 15000 }
    );
    check('손님이 고르면 주인이 그 손을 받아 판을 닫는다', true);
  } catch (e) {
    check('손님이 고르면 주인이 그 손을 받아 판을 닫는다', false, e.message.slice(0, 80));
  }
  }
  await host.context().close();
  await guest.context().close();
}

/* ── ② 함대 찾기. 남의 배가 손님 창까지 오나 ────────────────── */

if (!cantRun) {
  console.log('[arcade-multi] 함대 찾기. 감추기');
  const fleet = await openRoom('fleet');
  if (fleet) {
    const { host, guest } = fleet;
    if (await guestGot(guest, '.ac-flboard', '함대 찾기 판이 손님 창에 뜬다')) {
      /* 손님 창에서 내 판에는 배가 보이고, 남의 판에는 한 칸도 안 보여야 한다.
         안 보이는 게 아니라 **애초에 그 자리 값이 안 온다**. 그래서 그려질 수가 없다. */
      const seen = await guest.evaluate(() => {
        const a = window.__arcade;
        const ships = a?.state?.ships ?? [];
        return {
          mine: (ships[a?.mySeat] ?? []).length,
          theirs: ships.filter((_, i) => i !== a?.mySeat).reduce((n2, row) => n2 + row.length, 0)
        };
      });
      check('손님은 자기 배를 안다', seen.mine > 0, `내 배 칸 ${seen.mine}`);
      /* **화면이 아니라 받은 판을 읽는다.** 화면은 남의 배를 애초에 안 그려서, 새어도 그림이
         똑같다. 일부러 새게 해 보니 DOM 검사는 초록이었다(그래서 이렇게 바꿨다). */
      check('남의 배는 손님 창에 아예 안 온다', seen.theirs === 0, `남의 배 칸 ${seen.theirs}`);
    }
    await host.context().close();
    await guest.context().close();
  }
}

/* ── ③ 경매. 남이 부른 값이 손님 창까지 오나 ───────────────── */

if (!cantRun) {
  console.log('[arcade-multi] 경매. 감추기');
  const auction = await openRoom('auction');
  if (auction) {
    const { host, guest } = auction;
    /* 평면은 .ac-au, 입체(정본)는 HUD. 2026-09-02 입체 경매를 올리고 평면만 기다려 main 이 빨감
       세 번째 방이라 앞 두 방의 연결이 아직 안 걷힌 채로 붙는다. 늦게 오는 것과 안 오는 것을
       `guestGot` 이 갈라 준다 (늦으면 못 돌림, 안 오면 빨강) */
    const dump = async (pg, who) => pg.evaluate((w) => {
      const a = window.__arcade;
      return `${w} game=${a?.state?.game ?? a?.game ?? ''} seat=${a?.mySeat} 대기=${document.querySelectorAll('#acWaitSeats .ac-seat').length} 판=${!!document.querySelector('#acPlay')} HUD=${!!document.querySelector('.ac-au, #acAuHud')}`;
    }, who).catch(() => who + ' 못 읽음');
    /* 상태는 **빨개진 순간**에 찍는다. 미리 찍으면 아직 안 온 게 당연해 아무 말도 못 한다 */
    const state = async () => [await dump(host, '주인'), await dump(guest, '손님')].join(' | ');
    if (await guestGot(guest, '.ac-au, #acAuHud', '경매 판이 손님 창에 뜬다', state)) {
      try {
        /* 주인이 먼저 부른다. 그 숫자가 손님 창에 뜨면 새는 것이다. 낙찰 전까지는 불렀다 표시뿐. */
        await host.locator('#acAuR').fill('37');
        await host.click('#acAuGo');
        await guest.waitForFunction(() => (window.__arcade?.state?.bids ?? []).some((bid) => bid != null));
        const bids = await guest.evaluate(() => {
          const a = window.__arcade;
          return (a?.state?.bids ?? []).map((b, i) => (i === a?.mySeat ? 'me' : b));
        });
        /* 남이 부른 값은 불렀다(-1) 나 아직(null) 로만 와야 한다. 진짜 숫자가 오면 샌 것이다. */
        const leaked = bids.filter((b) => typeof b === 'number' && b >= 0);
        check('남이 부른 값이 손님 창에 아예 안 온다', leaked.length === 0, JSON.stringify(bids));
      } catch (e) {
        check('남이 부른 값이 손님 창에 아예 안 온다', false, e.message.slice(0, 60) + ' :: ' + (await state()));
      }
    }
    await host.context().close();
    await guest.context().close();
  }
}

await browser.close();
if (server) await server.close();

if (cantRun) {
  console.log(`[arcade-multi] 못 돌았다. ${cantRun} (통과 아님)`);
  process.exit(2);
}
if (failures.length) {
  console.log(`[arcade-multi] 실패 ${failures.length}건`);
  process.exit(1);
}
console.log('[arcade-multi] 둘이 붙었다. 방 코드, 짝짓기, 같은 문제, 손님의 손, 감추기(배, 부른 값)');
