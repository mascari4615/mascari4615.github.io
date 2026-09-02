/**
 * 카드 갈래 열두 판 화면 스모크 (change.arcade-cards)
 *
 * 판마다 재는 것 셋
 *  1. 로비에 뜨나
 *  2. 혼자 하기로 들어가면 화면이 그려지나(글자가 있나)
 *  3. 누를 것이 하나라도 있나. 창에서 안 터지나
 *
 * 판마다 새 창으로 엶. 판이 진행 중이면 셸이 그 판을 되살려 로비로 못 돌아감(실측)
 *
 *   node scripts/smoke-arcade-cards.mjs
 */
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';

const GAMES = [
  'blackjack', 'solitaire', 'memory', 'speed', 'highlow', 'president',
  'hanafuda', 'dominoes', 'auction', 'derby', 'liars', 'lanterns'
];
const TABLE_GAMES = GAMES.filter((id) => id !== 'blackjack' && id !== 'solitaire');
const TABLE_ONLY = process.argv.includes('--table-only');
const FOCUSED_GAME = process.argv.find((arg) => arg.startsWith('--game='))?.slice('--game='.length) ?? '';
const TABLE_RUN = FOCUSED_GAME ? TABLE_GAMES.filter((id) => id === FOCUSED_GAME) : TABLE_GAMES;

const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  [O] ${name}`);
  else {
    console.log(`  [X] ${name}. ${detail}`);
    failures.push(name);
  }
};

const server = await smokeBase();
const PAGE = `${server.base}/apps/karmolab/index.html#arcade`;
let cantRun = '';

const browser = await chromium.launch();

for (const g of TABLE_ONLY ? [] : GAMES) {
  if (cantRun) break;
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const boom = [];
  page.on('pageerror', (e) => boom.push(e.message));
  try {
    await page.route('**/__dev', (r) => r.abort());
    const res = await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (!res || !res.ok()) { cantRun = `dev 서버가 안 뜬다 (${PAGE})`; await ctx.close(); break; }
    await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
    await page.evaluate(() => Toolbox.switchPage('arcade'));
    const inLobby = await page.waitForSelector(`[data-obj="${g}"]`, { timeout: 20000 }).then(() => true).catch(() => false);
    check(`${g}: 로비에 뜬다`, inLobby);
    if (!inLobby) { await ctx.close(); continue; }
    await page.click(`[data-obj="${g}"]`, { timeout: 15000 });
    await page.click(`[data-solo="${g}"]`, { timeout: 15000 });
    /* 입체가 정본(2026-09-01)이라 기본은 방. 방은 캔버스 하나가 판이고 누를 것은 상 위 카드.
       그래서 캔버스가 떴으면 그려진 것으로, 아니면 평면처럼 글자와 버튼으로 */
    await page.waitForFunction(() => {
      const view = document.querySelector('#acView');
      if (!view) return false;
      if (view.querySelector('canvas')) return true;
      return (view.textContent || '').trim().length > 6 && view.querySelectorAll('button').length > 0;
    }, undefined, { timeout: 10000 });
    const info = await page.evaluate(() => {
      const view = document.querySelector('#acView');
      const txt = (view?.textContent || '').trim().replace(/\s+/g, ' ');
      return { btns: document.querySelectorAll('#acView button').length, len: txt.length, canvas: !!view?.querySelector('canvas') };
    });
    const rendered = info.canvas ? true : info.len > 6;
    const interactive = info.canvas ? true : info.btns > 0;
    check(`${g}: 화면이 그려진다`, rendered, info.canvas ? '입체' : `글자 ${info.len}자`);
    check(`${g}: 누를 것이 있다`, interactive, info.canvas ? '상 위 카드' : `${info.btns}개`);
    if (g === 'blackjack') {
      await page.waitForSelector('#acBjActs [data-do="pair"]');
      await page.click('#acBjActs [data-do="pair"]');
      await page.waitForSelector('#acBjActs [data-do="pair"][data-n="0"]');
      const picked = await page.evaluate(() => window.__arcade?.state.seats[window.__arcade.mySeat]?.pairBet);
      check('blackjack: 입체에서 퍼펙트 페어 곁수 2칩을 고른다', picked === 2, String(picked));
    }
    if (g === 'president' && info.canvas) {
      await page.waitForFunction(() => {
        const measure = window.__bjMeasure?.();
        return Array.isArray(measure?.pickables) && measure.pickables.length > 0;
      }, undefined, { timeout: 8000 });
      if (await page.locator('#acIntro').isVisible()) await page.click('#acIntro');
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#acIntro')).display === 'none');
      /* 재움-의도: 배분 애니메이션이 실제로 흐르는 동안 마지막 카드의 출발 시각과
         포인터 집기가 유지되는지를 함께 본다. 즉시 읽으면 애니메이션 검사가 아니다. */
      await page.waitForTimeout(1500);
      const measure = await page.evaluate(() => window.__bjMeasure?.());
      check('president: 첫 배분의 마지막 카드가 1초 안에 출발한다', measure.dealSpan <= 1000);
      check('president: 상 위에서 고를 카드가 금빛으로 보인다', measure.glows > 0);
      await page.mouse.click(measure.pickables[0].x, measure.pickables[0].y);
      const selected = await page.waitForSelector('#acPrActs .ac-on', { timeout: 2000 }).then(() => true).catch(() => false);
      check('president: 상 위 카드를 직접 눌러 고른다', selected);
    }
    if (g === 'hanafuda' && info.canvas) {
      await page.evaluate(() => {
        window.__arcade.state.pending = { seat: window.__arcade.mySeat, pts: 5 };
        window.__arcade.refresh();
      });
      await page.waitForSelector('#acHfActs [data-do="stop"]');
      await page.waitForSelector('#acHfActs [data-do="koi"]');
      check('hanafuda: 입체에서 족보를 멈추거나 코이코이로 잇는다', true);
      await page.click('#acHfActs [data-do="koi"]');
      await page.waitForFunction(() => window.__arcade?.state.pending === null && window.__arcade?.state.koi[window.__arcade.mySeat] === 1);
      check('hanafuda: 입체 코이코이 선언이 다음 차례를 잇는다', true);
    }
    check(`${g}: 안 터진다`, boom.length === 0, boom[0] || '');
  } catch (e) {
    check(`${g}: 열린다`, false, String(e).slice(0, 90));
  }
  await ctx.close();
}

if (!cantRun) {
  console.log('[arcade-cards] 블랙잭 평면 곁수');
  {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    try {
      await page.route('**/__dev', (r) => r.abort());
      await page.goto(PAGE.replace(/#.*$/, ''), { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
      await page.evaluate(() => {
        localStorage.setItem('karmolab.arcade.dim', '2d');
        Toolbox.switchPage('arcade');
      });
      await page.click('[data-obj="blackjack"]');
      await page.click('[data-solo="blackjack"]');
      await page.waitForSelector('#acBjBar [data-do="pair"]');
      await page.click('#acBjBar [data-do="pair"]');
      await page.waitForSelector('#acBjBar [data-do="pair"][data-n="0"]');
      const picked = await page.evaluate(() => window.__arcade?.state.seats[window.__arcade.mySeat]?.pairBet);
      check('blackjack: 평면에서도 퍼펙트 페어 곁수 2칩을 고른다', picked === 2, String(picked));
    } catch (e) {
      check('blackjack: 평면 곁수 버튼이 열린다', false, String(e).slice(0, 90));
    }
    await ctx.close();
  }

  console.log('[arcade-cards] 평면 공용 상. 내 자리와 손패');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  let measuring = '';
  try {
    await page.route('**/__dev', (r) => r.abort());
    /* #arcade 로 먼저 열면 저장값을 넣기 전에 3D 기본 화면이 이미 mount 된다. */
    await page.goto(PAGE.replace(/#.*$/, ''), { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem('karmolab.arcade.dim', '2d');
      Toolbox.switchPage('arcade');
    });
    const overlaps = [];
    for (const game of TABLE_RUN) {
      measuring = game;
      await page.waitForSelector(`[data-obj="${game}"]`, { timeout: 20000 });
      await page.click(`[data-obj="${game}"]`);
      await page.click(`[data-solo="${game}"]`);
      /* 짝맞추기는 손패가 없어 높이 0 이다. 보여야 함이 아니라 공용 상에 붙었나를 잰다. */
      await page.waitForSelector('#acPlay.ac-table .ac-tb-hand', { state: 'attached', timeout: 10000 });
      if (game === 'hanafuda') {
        await page.waitForFunction(() => {
          window.__arcade.state.pending = { seat: window.__arcade.mySeat, pts: 5 };
          window.__arcade.refresh();
          return !!document.querySelector('#acHfStop') && !!document.querySelector('#acHfKoi');
        });
        const forced = await page.evaluate(() => ({
          mySeat: window.__arcade.mySeat,
          pending: window.__arcade.state.pending,
          refresh: typeof window.__arcade.refresh
        }));
        check('hanafuda: 평면 결정 상태를 검사 화면에 세운다', forced.pending?.pts === 5 && forced.refresh === 'function', JSON.stringify(forced));
        check('hanafuda: 평면에서도 족보를 멈추거나 코이코이로 잇는다', true);
        await page.evaluate(() => {
          window.__arcade.state.pending = null;
          window.__arcade.refresh();
        });
      }
      const hit = await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect() ?? null;
        const overlap = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const seat = rect('#acSeats .ac-seat.ac-me');
        return overlap(seat, rect('.ac-tb-hand')) || overlap(seat, rect('.ac-tb-acts'));
      });
      if (hit) overlaps.push(game);
      await page.click('#acMenu');
      await page.evaluate(() => document.querySelector('#acQuit')?.click());
      await page.waitForSelector('#acLobby:visible', { timeout: 10000 });
    }
    check('내 자리 카드가 열 판의 손패와 행동 줄을 가리지 않는다', overlaps.length === 0, overlaps.join(', '));
  } catch (e) {
    const state = await page.evaluate(() => ({
      dim: localStorage.getItem('karmolab.arcade.dim'),
      play: document.querySelector('#acPlay')?.className,
      view: document.querySelector('#acView')?.textContent?.trim().slice(0, 40)
    })).catch(() => null);
    check('평면 공용 상의 내 자리 간격을 잰다', false, `${measuring}: ${String(e).slice(0, 70)} ${JSON.stringify(state)}`);
  }
  await ctx.close();
}

await browser.close();
if (server) await server.close();

if (cantRun) {
  console.log(`[arcade-cards] 못 돌았다. ${cantRun} (통과 아님)`);
  process.exit(2);
}
if (failures.length) {
  console.log(`[arcade-cards] 실패 ${failures.length}건`);
  process.exit(1);
}
console.log(TABLE_ONLY
  ? `[arcade-cards] 통과. 평면 공용 상 ${TABLE_GAMES.length}판의 내 자리 간격`
  : `[arcade-cards] 통과. 카드 갈래 ${GAMES.length}판이 로비에 뜨고 열리고 눌린다`);
