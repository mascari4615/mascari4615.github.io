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

for (const g of GAMES) {
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
    await page.waitForTimeout(3500);
    const info = await page.evaluate(() => {
      const view = document.querySelector('#acView');
      const txt = (view?.textContent || '').trim().replace(/\s+/g, ' ');
      return { btns: document.querySelectorAll('#acView button').length, len: txt.length };
    });
    check(`${g}: 화면이 그려진다`, info.len > 6, `글자 ${info.len}자`);
    check(`${g}: 누를 것이 있다`, info.btns > 0, `${info.btns}개`);
    check(`${g}: 안 터진다`, boom.length === 0, boom[0] || '');
  } catch (e) {
    check(`${g}: 열린다`, false, String(e).slice(0, 90));
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
console.log(`[arcade-cards] 통과. 카드 갈래 ${GAMES.length}판이 로비에 뜨고 열리고 눌린다`);
