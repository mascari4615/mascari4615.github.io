/**
 * 이상형 월드컵. 오락실 판을 **실제로 끝까지 돌려 본다** (change.arcade-absorbs-play 1)
 *
 * 왜 있나: 이 판은 붙인 조각이 많음(표 받기, 라운드, 대진, 결과, 지난 우승, 결과 그림). 규칙 검사
 * (`test:arcade`)는 봇이 이름뿐인 넷으로 도는 것만. 진짜 표를 받아 그림 두 장이 서고 사람이
 * 누르는 길은 여기서만
 *
 * 보는 것 (전부 실제 클릭):
 *  ① 판의 장(`/t/arcade/worldcup/`) 열림, 오락실이 그 판의 상세를 엶
 *  ② 처음 온 사람에게 고를 표 있음 (서버의 붙박이 표)
 *  ③ 8강 끝까지 눌러 우승자. 매 판 그림 둘이 서로 다름
 *  ④ 내가 고른 길과 지난 우승 남음
 *  ⑤ 도중에 페이지 스크립트 사망 0
 *
 * 사용:
 *   npm run test:worldcup
 *   URL=http://127.0.0.1:8813/apps/karmolab/index.html?play=worldcup#arcade node scripts/smoke-worldcup.mjs
 */
import { livePage } from './lib/live-url.mjs';
import { launchOrSkip } from './lib/browser.mjs';
import { WAIT } from './lib/waits.mjs';

const URL_TARGET = process.env.URL || livePage('/t/arcade/worldcup/');
const problems = [];
const browser = await launchOrSkip('smoke-worldcup');
if (!browser) process.exit(0);
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
const page = await context.newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));

/* 너무 자주 물어보면 서버가 문을 닫는다. 표를 받는 주소가 429 면 제품이 깨진 게 아니라 못 잰 것 */
let rateLimited = false;
page.on('response', (r) => { if (r.status() === 429) rateLimited = true; });

const res = await page.goto(URL_TARGET, { waitUntil: 'domcontentloaded', timeout: 45000 });
if (!res || res.status() !== 200) problems.push(`판의 장이 안 열린다 (http ${res && res.status()})`);

/* ① 오락실이 이 판의 상세를 엶. 혼자 버튼으로 판 열기 */
await page.waitForSelector('[data-solo="worldcup"]', { timeout: WAIT }).catch(() => {
  problems.push('오락실이 월드컵 상세를 안 연다 (혼자 버튼 없음)');
});
if (await page.locator('[data-solo="worldcup"]').count()) await page.locator('[data-solo="worldcup"]').first().click();

/* ② 고를 표. 붙박이 표는 서버에서 오므로 잠깐 대기 */
await page.waitForSelector('#acWcPacks button', { timeout: 20000 }).catch(() => {
  problems.push('고를 수 있는 표가 하나도 안 뜬다. 처음 온 사람에게 빈 화면이다');
});
const packCount = await page.locator('#acWcPacks button').count();
if (packCount > 0) {
  await page.locator('#acWcPacks button').first().click();
  await page.waitForSelector('#acWcStart', { state: 'visible', timeout: WAIT });
  const eight = page.locator('#acWcRounds button', { hasText: '8' });
  if (await eight.count()) await eight.first().click();
  await page.click('#acWcStart');
  await page.waitForSelector('#acWcPlay:not([hidden])', { timeout: 30000 }).catch(async () => {
    const why = await page.evaluate(() => ({
      picked: document.querySelector('#acWcPacks button[aria-pressed="true"]')?.textContent?.trim().slice(0, 20),
      text: (document.getElementById('acWcMsg')?.textContent || '').trim().slice(0, 60),
      rounds: [...document.querySelectorAll('#acWcRounds button')].map((b) => b.textContent.trim()).join(',')
    })).catch(() => null);
    problems.push(`시작을 눌렀는데 판이 안 열린다. ${JSON.stringify(why)}`);
  });
  await page.waitForSelector('#acWcA img', { timeout: 30000 }).catch(() => {});

  /* ③ 매 판 왼쪽. 판이 끝나거나 너무 오래 돌면 정지 */
  let clicks = 0;
  while (clicks < 200) {
    if (await page.locator('#acWcDone:not([hidden])').count()) break;
    if (!(await page.locator('#acWcPlay:not([hidden])').count())) break;
    const left = await page.locator('#acWcA img').getAttribute('src').catch(() => null);
    const right = await page.locator('#acWcB img').getAttribute('src').catch(() => null);
    if (!left || !right) {
      problems.push('고를 두 쪽 중 그림이 없는 쪽이 있다');
      break;
    }
    if (left === right) problems.push('양쪽에 같은 것이 올라왔다. 고를 수가 없는 판이다');
    await page.click('#acWcA');
    await page.waitForTimeout(80);
    clicks += 1;
  }

  /* ④ 우승자, 내가 고른 길, 지난 우승 */
  const finished = await page.locator('#acWcDone:not([hidden])').count();
  if (!finished && rateLimited) {
    console.log('[smoke-worldcup] CANNOT-RUN. 서버가 429(너무 잦은 요청)를 줘서 표를 못 받았다. 제품 판정 아님.');
    await browser.close();
    process.exit(0);
  }
  if (!finished) problems.push(`${clicks}번을 눌렀는데 판이 안 끝났다`);
  else {
    if (clicks !== 7) problems.push(`8강은 일곱 판인데 ${clicks}번 눌렀다`);
    const champion = (await page.locator('#acWcChamp b').innerText().catch(() => '')).trim();
    if (!champion) problems.push('우승자 칸이 비었다');
    if ((await page.locator('#acWcPath li').count()) === 0) problems.push('내가 고른 길이 한 줄도 안 남았다');
    const history = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('karmolab_worldcup_history') || '[]').length; } catch { return 0; }
    });
    if (history === 0) problems.push('지난 우승에 이번 판이 안 남았다');
    /* 결과 종이는 판이 끝나고 한 박자(커널의 쉬는 시간) 뒤에 뜬다. 바로 읽으면 빈 줄 */
    await page.waitForSelector('#acOver', { state: 'visible', timeout: 8000 }).catch(() => {});
    const over = (await page.locator('#acOverHead').innerText().catch(() => '')).trim();
    if (!over) problems.push('오락실 결과 종이가 안 떴다');
  }
} else if (rateLimited) {
  console.log('[smoke-worldcup] CANNOT-RUN. 서버가 429 를 줘서 표 목록을 못 받았다.');
  await browser.close();
  process.exit(0);
}

await browser.close();
if (problems.length) {
  console.error('[smoke-worldcup] 실패');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('[smoke-worldcup] 판의 장, 표 고르기, 8강 완주, 고른 길, 지난 우승, 결과 종이 OK');
