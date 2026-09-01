/** 야추 등급전의 서버 명단을 네 브라우저 창의 실제 P2P 좌석으로 잇는 통합 스모크. */
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';

const server = await smokeBase();
const pageUrl = `${server.base}/apps/karmolab/index.html`;
const ids = ['rank-a', 'rank-b', 'rank-c', 'rank-d'];
const code = 'Y4RANK';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const failures = [];
const consoleErrors = [];
const contexts = [];
let pages = [];

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
  const ok = states.every((state) => state.seats === 4) &&
    states.map((state) => state.mySeat).sort((a, b) => a - b).join(',') === '0,1,2,3';
  if (!ok) failures.push(`네 창의 좌석이 다르다: ${JSON.stringify(states)}`);
  else console.log('  [O] 네 창 모두 같은 4인 야추 판과 고유 좌석을 받는다');
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
console.log('[arcade-yacht-ranked] 통과. 4인 매칭 응답, P2P 명단 동기화, 좌석 배정');
