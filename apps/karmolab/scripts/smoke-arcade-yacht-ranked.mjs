/** 야추 등급전의 서버 명단을 2~4개 브라우저 창의 실제 P2P 좌석으로 잇는 통합 스모크. */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { smokeBase } from './lib/smoke-base.mjs';

const requestedPlayers = Number(process.argv[2] ?? 0);
if (requestedPlayers === 0) {
  for (const players of [2, 3, 4]) {
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), String(players)], { stdio: 'inherit', env: process.env });
    if (run.status !== 0) process.exit(run.status ?? 1);
  }
  console.log('[arcade-yacht-ranked] 2인, 3인, 4인 시나리오 모두 통과');
  process.exit(0);
}
if (![2, 3, 4].includes(requestedPlayers)) throw new Error('참가자는 2명, 3명 또는 4명이어야 한다');

const server = await smokeBase();
const pageUrl = `${server.base}/apps/karmolab/index.html`;
const ids = Array.from({ length: requestedPlayers }, (_, index) => `rank-${String.fromCharCode(97 + index)}`);
const code = `Y${requestedPlayers}${Date.now().toString(36).toUpperCase().slice(-6)}`;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const failures = [];
const consoleErrors = [];
const contexts = [];
let pages = [];
const reports = new Map();

try {
  pages = await Promise.all(ids.map(async (id, seat) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    contexts.push(context);
    await context.route('**/kl/arcade/rating/me*', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ signedIn: true, rating: 1500, games: 0, wins: 0 })
    }));
    await context.route('**/kl/arcade/queue/count/**', (route) => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ beginner: 0, upper: 0 })
    }));
    await context.route('**/kl/arcade/queue', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'matched', code, you: id, rival: ids[seat === 0 ? 1 : 0],
        host: seat === 0, room: 'beginner', opponent: '등급전 상대', ids, seat
      })
    }));
    await context.route('**/kl/arcade/tape', (route) => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ id: 'ranked-yacht-tape' })
    }));
    await context.route('**/kl/arcade/report', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      reports.set(id, body);
      const applied = reports.size === ids.length;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          applied,
          waiting: ids.length - reports.size,
          result: applied ? ids.map((account, rank) => ({ id: account, after: 1550 - rank * 10, delta: 50 - rank * 10 })) : undefined
        })
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => failures.push(`${id}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`${id}: ${message.text()}`);
    });
    await page.route('**/__dev', (route) => route.abort());
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
    await page.evaluate(() => Toolbox.switchPage('arcade'));
    await page.waitForSelector('[data-obj="yacht"]', { timeout: 20000 });
    await page.fill('#acName', `선수${seat + 1}`);
    await page.click('[data-obj="yacht"]');
    await page.click('[data-rank="yacht"]');
    return page;
  }));

  await Promise.all(pages.map((page) => page.waitForSelector('.ac-yctable', { timeout: 90000 })));
  const states = await Promise.all(pages.map((page) => page.evaluate(() => ({
    seats: window.__arcade?.state?.sheet?.length ?? 0,
    mySeat: window.__arcade?.mySeat ?? -1
  }))));
  const expectedSeats = Array.from({ length: requestedPlayers }, (_, seat) => seat).join(',');
  const ok = states.every((state) => state.seats === requestedPlayers) &&
    states.map((state) => state.mySeat).sort((a, b) => a - b).join(',') === expectedSeats;
  if (!ok) failures.push(`${requestedPlayers}개 창의 좌석이 다르다: ${JSON.stringify(states)}`);
  else console.log(`  [O] ${requestedPlayers}개 창 모두 같은 야추 판과 고유 좌석을 받는다`);

  const pagesBySeat = new Map(states.map((state, index) => [state.mySeat, pages[index]]));
  const cats = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'fourkind', 'fullhouse', 'sstraight', 'lstraight', 'yacht'];
  for (const cat of cats) {
    for (let seat = 0; seat < ids.length; seat++) {
      const player = pagesBySeat.get(seat);
      if (!player) throw new Error(`${seat}번 좌석 창이 없다`);
      await player.waitForFunction(
        ({ seat: expected, cat: category }) => window.__arcade?.state?.turn === expected && window.__arcade?.state?.sheet?.[expected]?.[category] === null,
        { seat, cat },
        { timeout: 15000 }
      );
      await player.evaluate((category) => window.__arcade?.tap?.({ kind: 'write', cat: category }), cat);
      await pagesBySeat.get(0).waitForFunction(
        ({ seat: expected, cat: category }) => window.__arcade?.state?.sheet?.[expected]?.[category] !== null,
        { seat, cat },
        { timeout: 15000 }
      );
    }
  }
  await Promise.all(pages.map((page) => page.waitForSelector('#acOver', { state: 'visible', timeout: 30000 })));
  await pages[0].waitForFunction(() => document.querySelector('#acOver')?.textContent?.trim().length > 0, null, { timeout: 10000 });
  const deadline = Date.now() + 20000;
  while (reports.size < ids.length && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  const words = [...reports.values()].map((body) => JSON.stringify(body.placements));
  const completed = reports.size === ids.length && new Set(words).size === 1 &&
    Array.isArray([...reports.values()][0]?.placements) && [...reports.values()][0].placements.flat().length === ids.length;
  if (!completed) failures.push(`전원 결과 보고가 다르다: ${JSON.stringify([...reports.entries()])}`);
  else console.log(`  [O] ${requestedPlayers}개 창이 판을 완주하고 같은 순위를 보고한다`);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  const diagnostics = await Promise.all(pages.map(async (page, seat) => page.evaluate(() => ({
    wait: document.querySelector('#acWaitStatus')?.textContent ?? '',
    waitSeats: document.querySelectorAll('#acWaitSeats .ac-seat').length,
    waitVisible: getComputedStyle(document.querySelector('#acWait')).display !== 'none',
    playVisible: getComputedStyle(document.querySelector('#acPlay')).display !== 'none',
    game: window.__arcade?.gameId ?? '',
    mySeat: window.__arcade?.mySeat ?? -1
  })).then((state) => ({ seat, ...state })).catch((failure) => ({ seat, error: String(failure) }))));
  failures.push(`창 상태: ${JSON.stringify(diagnostics)}`);
  if (consoleErrors.length) failures.push(`콘솔 오류 ${consoleErrors.length}건, 처음 8건: ${consoleErrors.slice(0, 8).join(' | ')}`);
} finally {
  await Promise.all(contexts.map((context) => context.close().catch(() => {})));
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`[arcade-yacht-ranked] 실패 ${failures.length}건\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`[arcade-yacht-ranked] 통과. ${requestedPlayers}인 매칭, P2P 좌석, 판 완주, 전원 결과 합의`);
