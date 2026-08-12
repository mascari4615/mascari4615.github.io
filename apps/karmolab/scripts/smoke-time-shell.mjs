/**
 * 때 화면 검사 (TASK-KL-267) — 한 줄 적으면 그 순간의 얼굴이 다 서는가.
 *
 * 말 → 순간 옮기기는 `test-when.mjs` 가 서른셋으로 잰다. 여기서 볼 것은 **화면의 약속**:
 *   - 한 줄이면 얼굴 여섯이 **한꺼번에** 뜬다(전엔 탭 일곱 번에 같은 날짜 일곱 번)
 *   - 도시가 **일하는 시간인지 색으로** 갈린다
 *   - 못 알아들으면 **못 알아들었다고 말한다**(엉뚱한 날짜를 내밀지 않는다)
 *
 * 사용: node scripts/smoke-time-shell.mjs
 */
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

const frozen = process.env.URL ? null : await serveRepo();
const BASE = process.env.URL || `${frozen.base}/apps/karmolab/index.html`;

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, timezoneId: 'Asia/Seoul' });
await page.goto(`${BASE}#time`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pfText', { timeout: 20000 });

check(/오후/.test(await page.inputValue('#pfText')), '처음부터 예시가 적혀 있다');
check((await page.locator('.pf-job').count()) === 12, '할 일 카드가 열둘');
await page.waitForSelector('#tmFaces', { timeout: 15000 });

/* ① 한 줄이면 얼굴 여섯이 한꺼번에 */
check((await page.locator('#tmFaces .tm-face').count()) === 6, '얼굴 여섯이 한꺼번에 뜬다');
check((await page.locator('#tmCities .tm-city').count()) === 5, '도시 다섯이 한 줄씩');

/* ② 못 박은 날짜를 넣고 값이 맞는지 */
await page.fill('#pfText', '2026-09-01 오후 3시');
await page.waitForFunction(
  () => /2026-09-01/.test(document.querySelector('.tm-face[data-face="날짜"] strong')?.textContent || ''),
  { timeout: 10000 }
).catch(() => {});
const face = (k) => page.locator(`.tm-face[data-face="${k}"] strong`).innerText();
check(/2026-09-01 \(화\)/.test(await face('날짜')), `요일까지 나온다 (지금 ${await face('날짜')})`);
check((await face('시각')) === '15:00', `오후 3시는 15:00 (지금 ${await face('시각')})`);
check(/2026년 36주차/.test(await face('주차')), `주차 (지금 ${await face('주차')})`);
check(/^\d{10}$/.test(await face('유닉스 초')), '유닉스 초가 열 자리');

/* ③ 도시가 일하는 시간인지로 갈린다 — 한국 15시면 뉴욕은 새벽이다 */
const seoulClass = await page.locator('#tmCities .tm-city').first().getAttribute('class');
check(/tm-ok/.test(seoulClass), `서울 15시는 일하는 때 (지금 ${seoulClass})`);
const ny = await page.locator('#tmCities .tm-city').nth(3).getAttribute('class');
check(/tm-bad|tm-meh/.test(ny), `같은 순간에 뉴욕은 편한 때가 아니다 (지금 ${ny})`);

/* ④ 못 알아들으면 **엉뚱한 날짜를 내밀지 않는다** */
await page.fill('#pfText', '안녕하세요 반갑습니다');
await page.waitForFunction(() => !!document.querySelector('#tmNone'), { timeout: 10000 }).catch(() => {});
check((await page.locator('#tmNone').count()) === 1, '못 알아들으면 그렇다고 말한다');
check((await page.locator('#tmFaces').count()) === 0, '못 알아들었으면 얼굴을 안 그린다');

/* ⑤ 다시 알아듣는 것을 적으면 되살아난다 */
await page.fill('#pfText', '3주 뒤');
await page.waitForSelector('#tmFaces', { timeout: 10000 });
check((await page.locator('#tmFaces .tm-face').count()) === 6, '다시 적으면 되살아난다');
check(/D-2[01]/.test(await face('D-Day')), `3주 뒤는 D-21 언저리 (지금 ${await face('D-Day')})`);

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-time-shell] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-time-shell] 전부 통과');
