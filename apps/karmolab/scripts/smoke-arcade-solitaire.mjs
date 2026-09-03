/**
 * 솔리테어 화면 스모크 (change.arcade-cards)
 *
 * 재는 것 여섯
 *  1. 일곱 열이 뜨고 스물여덟 장이 깔림
 *  2. 쌓는 자리 넷
 *  3. 더미를 누르면 뽑은 자리에 카드가 생김
 *  4. 무르기가 그 수를 되돌림
 *  5. 못 놓는 자리를 누르면 왜 안 되는지 말함
 *  6. 한 수 짚어 주기가 답을 냄
 */
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';

const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  [O] ${name}`);
  else {
    console.log(`  [X] ${name}. ${detail}`);
    failures.push(name);
  }
};

const server = await smokeBase();
const PAGE = `${server.base}/apps/karmolab/index.html`;
let cantRun = '';

const browser = await chromium.launch();
const context = await browser.newContext({ serviceWorkers: 'block' });
const page = await context.newPage();
page.on('pageerror', (e) => failures.push(`창에서 터졌다. ${e.message}`));

try {
  await page.route('**/__dev', (r) => r.abort());
  const res = await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (!res || !res.ok()) cantRun = `dev 서버가 안 뜬다 (${PAGE})`;
} catch (e) {
  cantRun = `dev 서버에 못 닿았다. ${e.message}`;
}

if (!cantRun) {
  await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  /* 평면을 잰다. 입체가 기본이라 안 내려놓으면 `.ac-sol` 이 아예 없다(2026-09-01 실측) */
  await page.evaluate(() => {
    try {
      localStorage.setItem('karmolab.arcade.dim', '2d');
    } catch {
      /* 못 써도 검사는 돈다 */
    }
  });
  await page.evaluate(() => Toolbox.switchPage('arcade'));
  await page.waitForSelector('[data-obj="solitaire"]', { timeout: 15000 });
  await page.click('[data-obj="solitaire"]');
  await page.click('[data-solo="solitaire"]');
  await page.waitForSelector('.ac-sol', { timeout: 15000 });

  /* 시계. 레퍼런스 셋이 머리에 둔다. 안 흐르면 멈춘 판처럼 보인다 */
  const clock1 = await page.evaluate(() => document.querySelector('#acSolNote')?.textContent ?? '');
  /* 재움-의도: 초 단위 시계가 실제 시간의 흐름 뒤에도 바뀌는지를 잰다. */
  await page.waitForTimeout(2200);
  const clock2 = await page.evaluate(() => document.querySelector('#acSolNote')?.textContent ?? '');
  check('시계가 흐른다', /\d\d:\d\d/.test(clock1) && clock1 !== clock2, `${clock1} -> ${clock2}`);

  const cols = await page.evaluate(() => document.querySelectorAll('.ac-sol-col').length);
  check('일곱 열이 뜬다', cols === 7, `${cols}열`);
  const cards = await page.evaluate(() => document.querySelectorAll('.ac-sol-cell').length);
  check('스물여덟 장이 깔린다', cards === 28, `${cards}장`);
  const found = await page.evaluate(() => document.querySelectorAll('.ac-sol-found .ac-sol-slot').length);
  check('쌓는 자리 넷', found === 4, `${found}개`);

  await page.click('#acSolStock', { force: true });
  await page.waitForSelector('#acSolWaste .ac-sol-card', { timeout: 3000 });
  const waste = await page.evaluate(() => !!document.querySelector('#acSolWaste .ac-sol-card'));
  check('더미를 누르면 뽑은 자리에 카드', waste);

  /* 무르기. 혼자 하는 놀이라 열려 있어야 한다 */
  const undoOn = await page.evaluate(() => {
    const e = document.getElementById('acUndo');
    return !!e && getComputedStyle(e).display !== 'none';
  });
  check('무르기가 열린다', undoOn);

  /* **사람처럼 누르기**. `.click()` 으로 부르면 가려진 버튼도 눌려 초록이 남
     2026-09-01 실측: 판을 다 쓰게 한 뒤 `#acView` 가 버튼줄을 덮어 진짜 클릭이 안 닿음 */
  const stockBefore = await page.evaluate(() => document.querySelector('#acSolStock small')?.textContent ?? '');
  await page.click('#acUndo');
  await page.waitForFunction((before) => {
    const stock = document.querySelector('#acSolStock small')?.textContent ?? '';
    return stock !== before && !document.querySelector('#acSolWaste .ac-sol-card');
  }, stockBefore, { timeout: 3000 });
  const stockAfter = await page.evaluate(() => document.querySelector('#acSolStock small')?.textContent ?? '');
  const wasteGone = await page.evaluate(() => !document.querySelector('#acSolWaste .ac-sol-card'));
  check('무르기가 뽑은 수를 되돌린다', stockBefore !== stockAfter && wasteGone, `더미 ${stockBefore} -> ${stockAfter}`);

  /* 버튼줄이 판에 안 가린다. 위 클릭이 닿았다는 것과 같은 말이지만 자리를 따로 잰다 */
  const barOk = await page.evaluate(() => {
    const e = document.getElementById('acUndo');
    if (!e) return false;
    const b = e.getBoundingClientRect();
    if (b.width < 4) return true;
    const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return !!top && (top === e || e.contains(top));
  });
  check('버튼줄이 판에 안 가린다', barOk);

  /* 다시 뽑아 놓는다. 아래 검사가 뽑은 카드를 본다 */
  await page.click('#acSolStock', { force: true });
  await page.waitForSelector('#acSolWaste .ac-sol-card', { timeout: 3000 });

  /* 두 번 누르면 쌓는 자리로. 레퍼런스 넷 다 있는 손놀림 */
  await page.evaluate(() => {
    const state = window.__arcade?.state;
    if (!state) return;
    state.stock = state.stock.filter((c) => c !== 0);
    state.waste = [0];
    state.foundation = state.foundation.map((pile) => pile.filter((c) => c !== 0));
    state.tableau = state.tableau.map((pile) => {
      const cards = pile.cards.filter((c) => c !== 0);
      return { ...pile, cards, up: Math.min(pile.up, cards.length) };
    });
    window.__arcade.refresh();
  });
  await page.waitForFunction(() => document.querySelector('#acSolWaste .ac-sol-card b')?.textContent === 'A');
  const foundBefore = await page.locator('.ac-sol-found .ac-sol-card').count();
  /* 첫 click이 든 카드 상태를 다시 그려 노드를 바꾸므로 Playwright의 두 click 합성 대신,
     브라우저가 최종적으로 내는 dblclick 이벤트를 같은 표적에 보낸다. */
  await page.dispatchEvent('#acSolWaste', 'dblclick');
  const doubleMoved = await page.waitForFunction((before) => document.querySelectorAll('.ac-sol-found .ac-sol-card').length > before, foundBefore, { timeout: 3000 })
    .then(() => true).catch(() => false);
  check('두 번 누르면 쌓는 자리로 간다', doubleMoved, String(foundBefore));

  /* 못 놓는 자리. 뒤집힌 카드를 누르면 까닭을 말한다 */
  const downCard = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('.ac-sol-cell')].find((e) => e.querySelector('.ac-back'));
    if (!cell) return false;
    cell.click();
    return true;
  });
  if (downCard) {
    await page.waitForFunction(() => /뒤집힌|face down|裏/.test(document.querySelector('#acSolNote')?.textContent ?? ''), null, { timeout: 2000 });
    const said = await page.evaluate(() => (document.querySelector('#acSolNote')?.textContent || '').trim());
    check('못 드는 카드는 까닭을 말한다', /뒤집힌|face down|裏/.test(said), said);
  }

  const noteBeforeHint = await page.evaluate(() => document.querySelector('#acSolNote')?.textContent ?? '');
  await page.click('#acSolHint', { force: true });
  await page.waitForFunction((before) => {
    const note = (document.querySelector('#acSolNote')?.textContent ?? '').trim();
    return note.length > 0 && note !== before && !/장 올림/.test(note);
  }, noteBeforeHint, { timeout: 3000 });
  const hint = await page.evaluate(() => (document.querySelector('#acSolNote')?.textContent || '').trim());
  check('한 수 짚어 준다', hint.length > 0 && !/장 올림/.test(hint), hint);

  /* 승리 직전 상태. 실제 Match가 다음 step에서 outcome을 내고 화면이 연출을 붙이는지 잰다 */
  await page.evaluate(() => {
    const state = window.__arcade?.state;
    state.stock = [];
    state.waste = [];
    state.tableau = Array.from({ length: 7 }, () => ({ cards: [], up: 0 }));
    state.foundation = Array.from({ length: 4 }, (_, suit) => Array.from({ length: 13 }, (_, rank) => suit * 13 + rank));
    window.__arcade?.tap({ kind: 'draw' });
  });
  await page.waitForFunction(() => window.__arcade?.finished === true, undefined, { timeout: 3000 });
  const flatWin = await page.evaluate(() => ({
    won: document.querySelector('.ac-sol-found')?.classList.contains('ac-won'),
    animated: [...document.querySelectorAll('.ac-sol-found .ac-found .ac-sol-card')].filter((el) => getComputedStyle(el).animationName !== 'none').length,
    visible: getComputedStyle(document.querySelector('#acOver')).backdropFilter === 'none'
  }));
  check('평면 승리는 쌓는 자리 넷을 눈앞에서 뛰게 한다', flatWin.won && flatWin.animated === 4 && flatWin.visible, JSON.stringify(flatWin));

  /* 입체도 선다. 모든 놀이가 2D 와 3D 를 다 갖춘다(`features/play.md`) */
  await page.evaluate(() => {
    try {
      localStorage.setItem('karmolab.arcade.dim', '3d');
    } catch {
      /* 못 써도 검사는 돈다 */
    }
  });
  await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  await page.evaluate(() => Toolbox.switchPage('arcade'));
  await page.waitForSelector('[data-obj="solitaire"]', { timeout: 20000 });
  await page.click('[data-obj="solitaire"]');
  await page.click('[data-solo="solitaire"]');
  const got3d = await page.waitForSelector('#acT3 canvas', { timeout: 25000 }).then(() => true).catch(() => false);
  check('입체도 뜬다', got3d);
  if (got3d) {
    await page.waitForFunction(() => /52/.test(document.querySelector('#acSol3d')?.textContent ?? ''), null, { timeout: 5000 });
    const bar = await page.evaluate(() => (document.querySelector('#acSol3d')?.textContent || '').trim());
    check('입체에도 진도 줄이 있다', /52/.test(bar), bar);
    const full = await page.evaluate(() => document.querySelector('#acPlay')?.classList.contains('ac-roomfill'));
    check('입체가 콘텐츠 칸을 채운다', !!full);
    await page.evaluate(() => {
      const state = window.__arcade?.state;
      state.stock = [];
      state.waste = [];
      state.tableau = Array.from({ length: 7 }, () => ({ cards: [], up: 0 }));
      state.foundation = Array.from({ length: 4 }, (_, suit) => Array.from({ length: 13 }, (_, rank) => suit * 13 + rank));
      window.__arcade?.tap({ kind: 'draw' });
    });
    // 전체 gate 동시 브라우저 부하 (늦은 3D 렌더 tick 허용)
    // 고정 sleep 없음 (종료와 축하 상태에 15초 상한)
    await page.waitForFunction(() => window.__arcade?.finished === true && window.__bjMeasure?.().celebrations === 1, undefined, { timeout: 15000 });
    /* 재움-의도: 끝난 뒤에도 도는 여러 렌더 틱에 축하가 중복되지 않는지 쌓아 본다 */
    await page.waitForTimeout(500);
    const roomWin = await page.evaluate(() => ({
      celebrations: window.__bjMeasure?.().celebrations,
      visible: getComputedStyle(document.querySelector('#acOver')).backdropFilter === 'none'
    }));
    check('입체 승리는 카드 점프를 눈앞에서 한 번만 시작한다', roomWin.celebrations === 1 && roomWin.visible, JSON.stringify(roomWin));
  }
}

await browser.close();
if (server) await server.close();

if (cantRun) {
  console.log(`[arcade-solitaire] 못 돌았다. ${cantRun} (통과 아님)`);
  process.exit(2);
}
if (failures.length) {
  console.log(`[arcade-solitaire] 실패 ${failures.length}건`);
  process.exit(1);
}
console.log('[arcade-solitaire] 통과. 일곱 열, 뽑기, 무르기, 까닭, 힌트');
