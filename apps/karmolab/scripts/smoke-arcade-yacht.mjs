/**
 * 야추 화면 스모크 (change.arcade-redesign, 2026-08-31)
 *
 * `smoke-arcade.mjs` 는 51판 순회와 오목 담당. 야추는 손 모델과 점수표와 굴리기 버튼이
 * 자주 바뀌어 회귀가 잦음(사용자 지적 두 번: 아무것도 안 되던 것, 표 높이가 차례마다 달라진 것)
 * 그래서 야추만 따로. 방 UI 를 만지는 다른 세션과 파일이 안 겹치는 자리이기도 함
 *
 * WebGL 은 소프트웨어 렌더러로(기본 headless 는 3D 를 못 줌). 못 얻으면 CANNOT-RUN(2)
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

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
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
  /* 기록과 방은 이 창의 것이라 지운다. 앞 판의 기록이 남으면 결과 줄이 달라진다 */
  await page.evaluate(() => {
    try {
      localStorage.removeItem('karmolab.arcade.yacht.stats');
      localStorage.removeItem('karmolab.arcade.yacht.pin');
      localStorage.setItem('karmolab.arcade.scene', 'bar');
    } catch {
      /* 못 지워도 검사는 돈다 */
    }
  });
  await page.evaluate(() => Toolbox.switchPage('arcade'));
  await page.waitForSelector('[data-obj="yacht"]', { timeout: 10000 });
  await page.click('[data-obj="yacht"]');
  check('야추 상세에 등급전 문이 있다', await page.locator('[data-rank="yacht"]').isVisible());
  await page.click('[data-solo="yacht"]');

  let gl = true;
  try {
    await page.waitForSelector('.ac-t3bar canvas', { timeout: 25000 });
  } catch {
    gl = false;
  }
  if (!gl) {
    cantRun = 'WebGL 을 못 얻어 야추 입체 방이 안 섰다';
  } else {
    await page.waitForFunction(() => {
      const roll = document.querySelector('#acYcRoll');
      return !!roll && !roll.disabled && document.querySelectorAll('.ac-yctable tbody tr').length === 15;
    }, null, { timeout: 10000 });
    check('입체 방이 뜬다', true);

    /* 점수표는 늘 보인다(레퍼런스 넷 다 한 화면). 열두 칸 + 위 합, 덤, 합계 */
    const rows = await page.evaluate(() => document.querySelectorAll('.ac-yctable tbody tr').length);
    check('점수표가 늘 보인다 (15줄)', rows === 15, `${rows}줄`);

    /* 행 높이가 차례와 무관하게 같다(사용자 지적 두 번) */
    const hs = await page.evaluate(() => [...document.querySelectorAll('.ac-yctable tr')].map((r) => Math.round(r.getBoundingClientRect().height)));
    check('점수표 행 높이가 고르다', hs.length > 0 && new Set(hs).size === 1, hs.join(','));

    /* 굴리기 버튼이 남은 횟수를 말한다 */
    const btn = await page.evaluate(() => document.querySelector('#acYcRoll')?.textContent || '');
    check('굴리기 버튼이 남은 횟수를 말한다', /\/\s*3/.test(btn), btn || '버튼 없음');

    await page.click('#acYcRoll');
    await page.waitForFunction(() => {
      const roll = document.querySelector('#acYcRoll');
      return window.__arcade?.state?.rolled === 2 && !!roll && !roll.disabled && !/굴리는 중|rolling/i.test(roll.textContent ?? '');
    }, null, { timeout: 10000 });
    const rolled2 = await page.evaluate(() => window.__arcade?.state?.rolled);
    check('한 번 더 굴리면 횟수가 오른다', rolled2 === 2, String(rolled2));
    await page.click('#acYcRoll');
    await page.waitForFunction(() => {
      const hud = document.querySelector('.ac-ychudsub')?.textContent ?? '';
      return /3\s*\/\s*3/.test(hud) && !!document.querySelector('.ac-yccell:not([disabled])');
    }, null, { timeout: 10000 });
    const btn3 = await page.evaluate(() => document.querySelector('.ac-ychudsub')?.textContent || '');
    check('세 번째 굴림까지 실제로 간다', /3\s*\/\s*3/.test(btn3), btn3 || '횟수 없음');

    /* 굴린 다섯은 전부 손에 들어온다(손 모델). 점수표 머리의 주사위가 다섯 개 */
    const dice = await page.evaluate(() => document.querySelectorAll('.ac-ychead .ac-die').length);
    check('점수표 머리에 주사위 다섯', dice === 5, `${dice}개`);

    /* 적으면 그 칸이 굳는다 */
    const before = await page.evaluate(() => document.querySelectorAll('.ac-ycdone').length);
    await page.click('.ac-yccell');
    /* 시간으로 기다리면 게이트 통짜에서 밀려 흔들린다(2026-08-31 실측: 단독은 통과, 동시는 실패).
       칸이 굳는 것을 조건으로 기다린다 */
    const wrote = await page.waitForFunction((n) => document.querySelectorAll('.ac-ycdone').length > n, before, { timeout: 10000 })
      .then(() => true).catch(() => false);
    const after = await page.evaluate(() => document.querySelectorAll('.ac-ycdone').length);
    check('적으면 칸이 굳는다', wrote, `${before} -> ${after}`);

    /* 남의 차례가 되면 내 칸 버튼이 사라진다(남의 차례에 못 적는다) */
    const leftTurn = await page.waitForFunction(() => document.querySelectorAll('.ac-yccell').length === 0, null, { timeout: 10000 })
      .then(() => true).catch(() => false);
    const cells = await page.evaluate(() => document.querySelectorAll('.ac-yccell').length);
    check('남의 차례에는 적는 칸이 없다', leftTurn, `${cells}개`);
  }
}

await browser.close();
if (server) await server.close();

if (cantRun) {
  console.log(`[arcade-yacht] 못 돌았다. ${cantRun} (통과 아님)`);
  process.exit(2);
}
if (failures.length) {
  console.log(`[arcade-yacht] 실패 ${failures.length}건`);
  process.exit(1);
}
console.log('[arcade-yacht] 통과. 방, 점수표, 굴리기 버튼, 손 모델, 적기');
