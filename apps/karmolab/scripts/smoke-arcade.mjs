/**
 * 오락실이 진짜로 뜨고 진짜로 굴러가는지 (TASK-KL-242)
 *
 * 커널 검사(`test:arcade`)는 창을 안 띄운다 — 규칙은 전부 맞는데 화면이 안 뜨면 그 초록은
 * 거짓이다. 그래서 여기서는 **브라우저를 열어 실제로 눌러 본다.**
 *
 * 보는 것:
 *   ① 오락실을 열면 실험 카드가 뜬다
 *   ② 「혼자」를 누르면 판이 시작되고 **빈 자리에 봇이 앉아 있다**
 *   ③ 반응 측정: 판이 저절로 넘어가고 다섯 판 뒤 결과가 뜬다 (아무도 안 눌러도)
 *   ④ 오목: 칸을 누르면 내 돌이 놓이고, **봇이 스스로 둔다**
 *
 * 로컬 dev 서버(`npm run dev`)를 본다 — 배포를 기다리면 화면 한 번 고치는 데 몇 분이 든다.
 * 서버가 없으면 「못 돌았다」(2)로 끝낸다. 통과도 실패도 아니다.
 *
 * `npm run test:arcade:ui`
 */
import { chromium } from 'playwright';
import { waitHydrated } from './lib/hydrated.mjs';

const BASE = process.env.ARCADE_BASE || 'http://127.0.0.1:8813';
const PAGE = `${BASE}/apps/karmolab/index.html`;

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  [O] ${name}`);
  else {
    console.log(`  [X] ${name} — ${detail}`);
    failures.push(name);
  }
};

let cantRun = '';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => failures.push(`창에서 터졌다 — ${e.message}`));

try {
  const res = await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (!res || !res.ok()) cantRun = `dev 서버가 안 뜬다 (${PAGE})`;
} catch (e) {
  cantRun = `dev 서버에 못 닿았다 — ${e.message}`;
}

if (!cantRun) {
  /* 셸이 살아난 뒤에 도구를 부른다 — `Toolbox` 는 전역 이름이지 `window` 의 것이 아니다. */
  await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  await page.evaluate(() => Toolbox.switchPage('arcade'));

  try {
    await waitHydrated(page, '[data-solo="reflex"]', { timeout: 30000 });
  } catch (e) {
    cantRun = `오락실 화면이 안 떴다 — ${e.message}`;
  }
}

if (!cantRun) {
  console.log('[arcade-ui] 로비');
  const cards = await page.locator('.ac-card').count();
  check('실험 카드가 뜬다', cards >= 2, `${cards}장`);
  check('혼자·같이 두 길이 다 있다', (await page.locator('[data-host]').count()) === cards);

  console.log('[arcade-ui] 반응 측정 — 혼자');
  await page.click('[data-solo="reflex"]');
  await page.waitForSelector('.ac-choice', { timeout: 10000 });
  const seats = await page.locator('.ac-seat').allTextContents();
  check('자리가 둘이다 (나 + 봇)', seats.length === 2, seats.join(' / '));
  check('빈 자리에 봇이 앉았다', seats.some((s) => s.includes('🤖')), seats.join(' / '));

  /* 아무도 안 눌러도 제한시간이 지나면 판이 넘어가야 한다 — 그게 시계가 도는 증거다. */
  const first = await page.locator('#acStatus').textContent();
  await page.waitForFunction(
    (before) => (document.querySelector('#acStatus')?.textContent || '') !== before,
    first,
    { timeout: 15000 }
  );
  check('판이 저절로 넘어간다 (시계가 돈다)', true);

  /* 다섯 판이 끝나면 「한 판 더」가 나온다. */
  try {
    await page.waitForSelector('#acAgain:visible', { timeout: 60000 });
    check('다섯 판이 끝까지 굴러 결과가 뜬다', true);
  } catch (e) {
    check('다섯 판이 끝까지 굴러 결과가 뜬다', false, e.message);
  }

  console.log('[arcade-ui] 오목 — 혼자');
  await page.click('#acQuit');
  await page.waitForSelector('[data-solo="gomoku"]', { timeout: 10000 });
  await page.click('[data-solo="gomoku"]');
  await page.waitForSelector('.ac-cell', { timeout: 10000 });
  check('아홉 칸 판이 뜬다', (await page.locator('.ac-cell').count()) === 81);

  await page.locator('.ac-cell').nth(40).click();
  /* 그리기는 다음 프레임에 온다 — 누르자마자 읽으면 아직 빈 칸이다(검사 쪽 경주). */
  try {
    await page.waitForFunction(
      () => (document.querySelectorAll('.ac-cell')[40]?.textContent || '').trim() === '●',
      null,
      { timeout: 5000 }
    );
    check('누른 칸에 내 돌이 놓인다', true);
  } catch {
    const mine = await page.locator('.ac-cell').nth(40).textContent();
    check('누른 칸에 내 돌이 놓인다', false, `"${mine}"`);
  }

  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll('.ac-cell')].filter((c) => (c.textContent || '').trim() === '○').length === 1,
      null,
      { timeout: 15000 }
    );
    check('봇이 스스로 둔다', true);
  } catch (e) {
    check('봇이 스스로 둔다', false, e.message);
  }
}

await browser.close();

if (cantRun) {
  console.log(`[arcade-ui] 못 돌았다 — ${cantRun} (통과 아님)`);
  process.exit(2);
}
if (failures.length) {
  console.log(`[arcade-ui] 실패 ${failures.length}건`);
  process.exit(1);
}
console.log('[arcade-ui] 화면 통과 — 로비 · 봇 착석 · 시계 · 다섯 판 · 오목 착수');
