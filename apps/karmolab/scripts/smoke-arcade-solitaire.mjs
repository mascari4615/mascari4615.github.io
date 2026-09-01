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
  await page.evaluate(() => Toolbox.switchPage('arcade'));
  await page.waitForSelector('[data-obj="solitaire"]', { timeout: 15000 });
  await page.click('[data-obj="solitaire"]');
  await page.click('[data-solo="solitaire"]');
  await page.waitForSelector('.ac-sol', { timeout: 15000 });
  await page.waitForTimeout(1200);

  const cols = await page.evaluate(() => document.querySelectorAll('.ac-sol-col').length);
  check('일곱 열이 뜬다', cols === 7, `${cols}열`);
  const cards = await page.evaluate(() => document.querySelectorAll('.ac-sol-cell').length);
  check('스물여덟 장이 깔린다', cards === 28, `${cards}장`);
  const found = await page.evaluate(() => document.querySelectorAll('.ac-sol-found .ac-sol-slot').length);
  check('쌓는 자리 넷', found === 4, `${found}개`);

  await page.click('#acSolStock', { force: true });
  await page.waitForTimeout(600);
  const waste = await page.evaluate(() => !!document.querySelector('#acSolWaste .ac-sol-card'));
  check('더미를 누르면 뽑은 자리에 카드', waste);

  /* 무르기. 혼자 하는 놀이라 열려 있어야 한다 */
  const undoOn = await page.evaluate(() => {
    const e = document.getElementById('acUndo');
    return !!e && getComputedStyle(e).display !== 'none';
  });
  check('무르기가 열린다', undoOn);
  if (undoOn) {
    await page.click('#acUndo', { force: true });
    await page.waitForTimeout(700);
    const back = await page.evaluate(() => (document.querySelector('#acSolNote')?.textContent || '').includes('0 수'));
    check('무르면 그 수가 되돌아온다', back);
  }

  /* 못 놓는 자리. 뒤집힌 카드를 누르면 까닭을 말한다 */
  const downCard = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('.ac-sol-cell')].find((e) => e.querySelector('.ac-back'));
    if (!cell) return false;
    cell.click();
    return true;
  });
  if (downCard) {
    await page.waitForTimeout(400);
    const said = await page.evaluate(() => (document.querySelector('#acSolNote')?.textContent || '').trim());
    check('못 드는 카드는 까닭을 말한다', /뒤집힌|face down|裏/.test(said), said);
  }

  await page.click('#acSolHint', { force: true });
  await page.waitForTimeout(500);
  const hint = await page.evaluate(() => (document.querySelector('#acSolNote')?.textContent || '').trim());
  check('한 수 짚어 준다', hint.length > 0 && !/장 올림/.test(hint), hint);
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
