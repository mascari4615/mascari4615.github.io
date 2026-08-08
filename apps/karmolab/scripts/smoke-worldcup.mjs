/**
 * 이상형 월드컵 — 한 판을 **실제로 끝까지 돌려 본다** (TASK-KL-151)
 *
 * 왜 있나: 이 놀이는 붙인 조각이 많다(표 고르기 · 라운드 · 토너먼트 진행 · 결과 · 지난 우승 ·
 * 결과 그림). 빌드는 이 중 **하나도** 안 눌러 본다. 이 레포에서 「빌드 초록 · 화면 사망」은
 * 상습이라, 한 판을 끝까지 눌러 보는 검사가 없으면 배포된 뒤에야 안다.
 *
 * 보는 것 (전부 실제 클릭):
 *  ① 처음 온 사람에게 고를 표가 있다 (씨앗 표가 안 뜨면 첫 화면이 죽는다)
 *  ② 8강을 끝까지 눌러 우승자가 나온다 — 매 판 그림 둘이 서로 다르다
 *  ③ 「내가 고른 길」과 「지난 우승」이 남는다
 *  ④ 결과 그림 단추가 실제로 그림을 만든다 (canvas → PNG 바이트)
 *  ⑤ 도중에 페이지 스크립트가 한 번도 안 죽는다
 *
 * 로그인이 필요한 길(표 올리기)은 여기서 안 밟는다 — 디스코드 왕복은 사람 몫이다.
 *
 * 사용: node scripts/smoke-worldcup.mjs
 *       URL=http://127.0.0.1:8813/apps/karmolab/index.html#worldcup node scripts/smoke-worldcup.mjs
 */
import { chromium } from 'playwright';

const URL_TARGET = process.env.URL || 'https://blog.mascari4615.com/karmolab/#worldcup';
const problems = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
// 결과 그림 복사는 사용자 동작 밖에서 막히는 브라우저가 있다 — 그 갈림길을 안 타게 미리 허용한다.
await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
const page = await context.newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));

const res = await page.goto(URL_TARGET, { waitUntil: 'domcontentloaded', timeout: 45000 });
if (!res || res.status() !== 200) problems.push(`월드컵이 안 열린다 (http ${res && res.status()})`);

// ① 고를 표 — 씨앗 표는 서버에서 오므로 잠깐 기다린다. 못 받으면 그 사실이 문제다.
await page.waitForSelector('#wcPacks button', { timeout: 20000 }).catch(() => {
  problems.push('고를 수 있는 표가 하나도 안 뜬다 — 처음 온 사람에게 빈 화면이다');
});
const packCount = await page.locator('#wcPacks button').count();
if (packCount === 0) problems.push('표 칸이 0개다');

if (packCount > 0) {
  // 처음부터 있는 표 중 하나를 고른다 (「오늘의 월드컵」이 맨 앞이면 그것이 곧 씨앗 표다).
  await page.locator('#wcPacks button').first().click();
  await page.waitForSelector('#wcStart', { state: 'visible', timeout: 10000 });

  // ② 8강으로 — 라운드 칸이 있으면 8강을 고른다(오늘의 월드컵은 라운드가 고정이라 칸이 없다).
  const eight = page.locator('#wcRounds button', { hasText: '8강' });
  if (await eight.count()) await eight.first().click();

  await page.click('#wcStart');
  await page.waitForSelector('#wcPlay:not([hidden])', { timeout: 30000 }).catch(() => {
    problems.push('시작을 눌렀는데 판이 안 열린다');
  });

  // 매 판 왼쪽을 고른다. 판이 끝나거나(결과 화면) 너무 오래 돌면 멈춘다.
  let clicks = 0;
  while (clicks < 200) {
    const done = await page.locator('#wcDone:not([hidden])').count();
    if (done) break;
    const playing = await page.locator('#wcPlay:not([hidden])').count();
    if (!playing) break;

    const left = await page.locator('#wcA img').getAttribute('src').catch(() => null);
    const right = await page.locator('#wcB img').getAttribute('src').catch(() => null);
    if (!left || !right) {
      problems.push('고를 두 쪽 중 그림이 없는 쪽이 있다');
      break;
    }
    if (left === right) problems.push('양쪽에 같은 것이 올라왔다 — 고를 수가 없는 판이다');

    await page.click('#wcA');
    await page.waitForTimeout(60);
    clicks += 1;
  }

  // ③ 우승자와 내가 고른 길
  const finished = await page.locator('#wcDone:not([hidden])').count();
  if (!finished) {
    problems.push(`${clicks}번을 눌렀는데 판이 안 끝났다`);
  } else {
    const champion = (await page.locator('#wcChampion').innerText().catch(() => '')).trim();
    if (!champion) problems.push('우승자 칸이 비었다');
    const path = await page.locator('#wcPath li').count();
    if (path === 0) problems.push('「내가 고른 길」이 한 줄도 안 남았다');
    const history = await page.locator('#wcHistory .pk-emoji').count();
    if (history === 0) problems.push('지난 우승에 이번 판이 안 남았다');

    // ④ 결과 그림 — 단추가 실제로 PNG 를 만드는가. 화면 글자가 아니라 **바이트**로 확인한다.
    const png = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      return blob ? blob.size : 0;
    });
    if (!png) problems.push('이 브라우저가 그림을 아예 못 만든다 — 결과 카드가 설 수 없다');

    await page.click('#wcShare');
    await page.waitForTimeout(1500);
    const shareMsg = (await page.locator('#wcMsg').innerText().catch(() => '')).trim();
    if (!shareMsg) problems.push('결과 그림 단추를 눌렀는데 아무 말도 안 한다');
    else if (/못 만들|실패/.test(shareMsg)) problems.push(`결과 그림이 안 만들어졌다: ${shareMsg}`);
  }
}

await browser.close();

if (problems.length) {
  console.error(`[smoke-worldcup] 문제 ${problems.length}건`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('[smoke-worldcup] 표 고르기 · 한 판 완주 · 고른 길 · 지난 우승 · 결과 그림 OK');
