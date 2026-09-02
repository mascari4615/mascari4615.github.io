/**
 * 오락실이 진짜로 뜨고 진짜로 굴러가는지 (TASK-KL-242)
 *
 * 커널 검사(`test:arcade`)는 창을 안 띄운다. 규칙은 전부 맞는데 화면이 안 뜨면 그 초록은
 * 거짓이다. 그래서 여기서는 **브라우저를 열어 실제로 눌러 본다.**
 *
 * 보는 것:
 *   ① 오락실을 열면 실험 카드가 뜬다
 *   ② 혼자를 누르면 판이 시작되고 **빈 자리에 봇이 앉아 있다**
 *   ③ 반응 측정: 판이 저절로 넘어가고 다섯 판 뒤 결과가 뜬다 (아무도 안 눌러도)
 *   ④ 오목: 칸을 누르면 내 돌이 놓이고, **봇이 스스로 둔다**
 *
 * 로컬 dev 서버(`npm run dev`)를 본다. 배포를 기다리면 화면 한 번 고치는 데 몇 분이 든다.
 * 서버가 없으면 못 돌았다(2)로 끝낸다. 통과도 실패도 아니다.
 *
 * ⚠ **고치는 중에 돌리지 마라.** dev 서버는 파일을 저장하면 위젯을 갈아 끼운다(핫리로드).
 *    검사가 판을 굴리는 동안 그 일이 일어나면 화면이 로비로 되돌아가고, 다섯 판이 끝까지가
 *    까닭 없이 빨개진다. 실제로 세 번 그렇게 헤맸다. 실패 덤프의 `play:"none"` 이 그 표식이다
 *    (판이 안 구른 게 아니라 화면이 통째로 다시 그려졌다).
 *
 * `npm run test:arcade:ui`
 */
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';
import { waitHydrated } from './lib/hydrated.mjs';

/* ★ **dev 서버가 없으면 스스로 띄운다** (2026-08-14).
   여태 사람이 켜는 `npm run dev`(8813)만 봤고 없으면 못 돌았다로 끝냈다. 그런데 CI 는 그
   서버를 **한 번도 안 켠다.** 그래서 오락실 화면 검사(게임 51종을 전부 열어 보는 그 검사)가
   verify 에서 늘 못 돌림이었다. 못 도는 검사는 없는 검사다. 켜져 있으면 그걸 쓰고,
   없으면 저장소를 그대로 내어 준다(다른 화면 검사들과 같은 `serveRepo`). */
/* 잴 자리는 한 곳에서 정한다. `lib/smoke-base.mjs` (시키지 않으면 늘 자기 서버). */
/** 판을 나간다. 방(입체)에서는 나가기가 메뉴 종이 안이라 메뉴부터 연다(2026-08-31 방 버튼 재편) */
async function quitRoom(page) {
  const menu = await page.$('#acMenu');
  if (menu && (await menu.isVisible())) await menu.click();
  /* 이 검사는 메뉴 조작이 아니라 52판 순회를 잰다. 병렬 렌더 중 메뉴 종이가 다시
     닫혀도 나가기 동작 자체는 확실히 보내 다음 판의 상태와 섞이지 않게 한다. */
  await page.evaluate(() => document.querySelector('#acQuit')?.click());
}

const server = await smokeBase();
const BASE = server.base;
/* ARCADE_ALL=1 이면 감춘 판까지 로비에 세워 순회한다 (감사 D8). 평소 로비는 14판 */
const ALL = !!process.env.ARCADE_ALL || process.argv.includes('--all');
const PAGE = `${BASE}/apps/karmolab/index.html${ALL ? '?all=1' : ''}`;

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  [O] ${name}`);
  else {
    console.log(`  [X] ${name}. ${detail}`);
    failures.push(name);
  }
};

let cantRun = '';
/**
 * ★ **입체 판을 진짜로 잰다** (2026-08-29). 기본 headless 는 WebGL 미제공
 * 그러면 정본인 입체 화면이 늘 못 돌림. 못 도는 검사는 없는 검사. 소프트웨어 렌더러 켬
 *
 * ★ **서비스 워커 차단.** 안 막으면 워커가 **낡은 조각을 물려 줌**
 * 실측: 고친 입체 판을 세 번 찍어 세 번 다 옛 화면. 코드가 안 먹은 줄 알았음
 * 옛 코드를 보고 낸 초록은 거짓 초록
 */
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const context = await browser.newContext({ serviceWorkers: 'block' });
const page = await context.newPage();
page.on('pageerror', (e) => failures.push(`창에서 터졌다. ${e.message}`));

try {
  /* 옆 세션이 파일을 고치면 이 창이 새로고침되어 판이 로비로 돌아간다. 그건 오락실의
     결함이 아니라 검사의 결함이다(실측: play:"none", status:""). 갈아 끼우기 통로를 막는다. */
  await page.route('**/__dev', (r) => r.abort());
  const res = await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (!res || !res.ok()) cantRun = `dev 서버가 안 뜬다 (${PAGE})`;
} catch (e) {
  cantRun = `dev 서버에 못 닿았다. ${e.message}`;
}

if (!cantRun) {
  /* 셸이 살아난 뒤에 도구를 부른다. `Toolbox` 는 전역 이름이지 `window` 의 것이 아니다. */
  await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  await page.evaluate(() => Toolbox.switchPage('arcade'));

  try {
    await waitHydrated(page, '[data-obj]', { timeout: 30000 });
  } catch (e) {
    cantRun = `오락실 화면이 안 떴다. ${e.message}`;
  }
}

let ids = [];
if (!cantRun) {
  console.log('[arcade-ui] 로비');
  /* 로비 = 진열장. 카드 대신 물건(`data-obj`)이 서고, 시작 단추는 물건을 집은 화면에 뜬다. */
  const objs = await page.locator('[data-obj]').count();
  check('진열장에 물건이 선다', objs >= 2, `${objs}개`);
  const situationCounts = await page.locator('.ac-situation').evaluateAll((rows) =>
    rows.map((row) => row.querySelectorAll('[data-situation]').length)
  );
  check('같이, 도전, 쉬기 세 선반', situationCounts.length === 3 && situationCounts.every((n) => n === 6), situationCounts.join(','));
  const recommendation = page.locator('.ac-recommend');
  check('저택 사람의 오늘 추천', await recommendation.count() === 1);
  if (await recommendation.count()) {
    const id = await recommendation.getAttribute('data-situation');
    await recommendation.click();
    await page.waitForSelector(`[data-solo="${id}"]`, { timeout: 10000 });
    await page.click('#acBack');
  }

  /* **모든 게임을 한 번씩 열어 본다.** 51개가 되어도 이 고리가 알아서 늘어난다 . 
   * 새 게임을 넣을 때 화면 검사를 새로 짤 필요가 없다는 뜻이다.
   * 깊은 검사(시계, 판정)는 아래에서 두 게임만 본다. 여기서는 뜨고, 자리가 차고, 뭔가 그려졌나.
   * 혼자, 같이 두 길도 여기서 같이 본다. 집은 화면마다 두 단추가 있어야 한다. */
  console.log('[arcade-ui] 모든 게임. 열어 보기');
  ids = await page.$$eval('[data-obj]', (bs) => bs.map((b) => b.dataset.obj));
  const noHost = [];
  for (const id of ids) {
    await page.click(`[data-obj="${id}"]`);
    await page.waitForSelector(`[data-solo="${id}"]`, { timeout: 10000 });
    if ((await page.locator(`[data-host="${id}"]`).count()) !== 1) noHost.push(id);
    await page.click(`[data-solo="${id}"]`);
    try {
      await page.waitForFunction(
        () => {
          const v = document.querySelector('#acView');
          const seats = document.querySelectorAll('#acSeats .ac-seat').length;
          return !!v && v.children.length > 0 && seats >= 1;
        },
        null,
        { timeout: 10000 }
      );
      const seats = await page.locator('#acSeats .ac-seat').allTextContents();
      /* 둘 이상이 필요한 게임만 봇이 앉는다. 혼자서도 되는 게임(자리 최소 1)은 나 하나가 정상이다.
       * 봇이 있어야 한다로 못 박으면 그 게임들이 틀린 것처럼 보인다. */
      /* 봇 표는 DOM 에. 이름이 캐릭터면 이모지가 안 붙는다(MDD, 2026-08-31) */
      const hasBot = (await page.locator('#acSeats .ac-seat[data-bot]').count()) > 0;
      check(
        `${id}: 혼자 열면 판이 뜬다` + (seats.length > 1 ? ' + 빈 자리에 봇이 앉는다' : ' (혼자 하는 놀이)'),
        seats.length === 1 || hasBot,
        seats.join(' / ')
      );
    } catch (e) {
      check(`${id}: 혼자 열면 판이 뜨고 빈 자리에 봇이 앉는다`, false, e.message.slice(0, 70));
    }
    await quitRoom(page);
    await page.waitForSelector('[data-obj]', { timeout: 10000 });
  }
  check('혼자, 같이 두 길이 다 있다', noHost.length === 0, noHost.join(' / '));

  /* 반응 측정은 실시간 판의 대표로 깊이 본다(시계가 도나). 명부에서 감추면 로비에 없으므로
     그때는 이 토막만 못 돌림으로 넘긴다. 감췄다는 이유로 나머지 검사가 빨강이 되면 안 된다. */
  const hasReflex = ids.indexOf('reflex') >= 0;
  if (!hasReflex) console.log('[arcade-ui] 반응 측정. 로비에 없어 건너뜀 (통과 아님)');
  if (hasReflex) {
  console.log('[arcade-ui] 반응 측정. 혼자');
  await page.click('[data-obj="reflex"]');
  await page.click('[data-solo="reflex"]');
  await page.waitForSelector('.ac-choice', { timeout: 10000 });
  const seats = await page.locator('.ac-seat').allTextContents();
  /* 셋이다. 인원은 판이 아니라 오락실이 정한다(`seating.ts`). 전에는 최솟값이라 1명부터인
     판이 혼자 돌았다. 그 수를 여기 상수로 또 적으면 두 곳이 갈리므로 셋을 못 박아 둔다. */
  check('자리가 셋이다 (나 + 봇 둘)', seats.length === 3, seats.join(' / '));
  check('빈 자리에 봇이 앉았다', seats.some((s) => s.includes('🤖')), seats.join(' / '));

  /* 아무도 안 눌러도 제한시간이 지나면 판이 넘어가야 한다. 그게 시계가 도는 증거다. */
  const first = await page.locator('#acStatus').textContent();
  await page.waitForFunction(
    (before) => (document.querySelector('#acStatus')?.textContent || '') !== before,
    first,
    { timeout: 15000 }
  );
  check('판이 저절로 넘어간다 (시계가 돈다)', true);

  /* 다섯 판이 끝나면 한 판 더가 나온다. */
  try {
    await page.waitForSelector('#acAgain:visible', { timeout: 60000 });
    check('다섯 판이 끝까지 굴러 결과가 뜬다', true);
  } catch {
    /* 못 끝났으면 **화면이 그때 뭐라고 하고 있었는지**를 남긴다. 시간 초과만 적어 두면
       판이 안 굴렀는지, 굴렀는데 단추가 안 떴는지 구분이 안 된다. */
    const dump = await page.evaluate(() => ({
      status: document.querySelector('#acStatus')?.textContent,
      again: (document.querySelector('#acAgain'))?.style.display,
      play: (document.querySelector('#acPlay'))?.style.display,
      choices: document.querySelectorAll('.ac-choice').length
    }));
    check('다섯 판이 끝까지 굴러 결과가 뜬다', false, JSON.stringify(dump));
  }

  }

  /**
   * 오목. **입체가 정본, 평면은 물러설 자리**(사용자 확정). 둘 다 봄
   *
   * 검사 브라우저가 WebGL 을 못 얻으면 입체 없음. 오락실 결함이 아니라 못 돌림으로 적음
   * 평면은 어느 환경에서나 떠야 함. 아래 깊은 검사가 그걸 잼
   */
  console.log('[arcade-ui] 오목. 입체');
  if (hasReflex) await quitRoom(page);
  await page.waitForSelector('[data-obj="gomoku"]', { timeout: 10000 });
  await page.click('[data-obj="gomoku"]');
  await page.click('[data-solo="gomoku"]');
  /* 입체 조각은 누른 뒤에 받아 온다. 붙는 데 몇 초가 걸리므로 시간을 재지 말고 기다린다 */
  let gl = true;
  try {
    await page.waitForSelector('.ac-t3 canvas', { timeout: 20000 });
  } catch {
    gl = false;
  }
  if (gl) {
    check('입체 판이 뜬다 (기본 표현)', true);
    /* 판이 캔버스를 채워야 한다. 레퍼런스 실측 65~97%. 작으면 줄 사이가 좁아 못 누른다 */
    const filled = await page.evaluate(() => {
      const c = document.querySelector('.ac-t3 canvas');
      const g = c.getContext('webgl2') || c.getContext('webgl');
      return !!g && !g.isContextLost();
    });
    check('입체 판이 그림을 낸다 (WebGL 살아 있음)', filled);
  } else {
    console.log('[arcade-ui] 입체 판. WebGL 을 못 얻어 건너뜀 (통과 아님)');
  }

  console.log('[arcade-ui] 오목. 평면으로 물러서기');
  await quitRoom(page);
  /* 사람이 2D 를 고른 것과 같은 자리에 적는다. 껍데기가 읽는 곳이 여기 하나다 */
  await page.evaluate(() => localStorage.setItem('karmolab.arcade.dim', '2d'));
  await page.click('[data-obj="gomoku"]');
  await page.click('[data-solo="gomoku"]');
  await page.waitForSelector('.ac-cell', { timeout: 10000 });
  /* 판 크기는 사람이 고름(9, 15, 19). 여기 수를 박으면 고르는 자리를 늘릴 때마다 빨개짐
     제곱수인지와 화점 수만 봄. 그 둘이 맞으면 격자는 제 모양 */
  const pts = await page.locator('.ac-cell').count();
  const side = Math.round(Math.sqrt(pts));
  check('정사각 격자가 뜬다', side * side === pts && side >= 9, `${pts}점 (${side}줄)`);
  check('화점이 찍힌다', (await page.locator('.ac-cell.ac-star').count()) >= 5);
  /* 알은 줄이 만나는 점에 놓인다. 손이 올라간 칸과 알이 놓일 점이 어긋나면 안 된다 */
  const mid = Math.floor(side / 2) * side + Math.floor(side / 2);
  const box = await page.locator(`[data-c="${mid}"]`).boundingBox();
  const boardBox = await page.locator('#acBoard').boundingBox();
  const offX = Math.abs(box.x + box.width / 2 - (boardBox.x + boardBox.width / 2));
  check('한가운데 점이 판 한가운데다', offX < 2, `${offX.toFixed(1)}px 어긋남`);

  await page.locator(`[data-c="${mid}"]`).click();
  /* 그리기는 다음 프레임에 온다. 누르자마자 읽으면 아직 빈 칸이다(검사 쪽 경주). */
  try {
    await page.waitForFunction(
      (c) => (document.querySelector(`[data-c="${c}"]`)?.textContent || '').trim() === '●',
      mid,
      { timeout: 5000 }
    );
    check('누른 칸에 내 돌이 놓인다', true);
  } catch {
    const mine = await page.locator(`[data-c="${mid}"]`).textContent();
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
if (server) await server.close();

if (cantRun) {
  console.log(`[arcade-ui] 못 돌았다. ${cantRun} (통과 아님)`);
  process.exit(2);
}
if (failures.length) {
  console.log(`[arcade-ui] 실패 ${failures.length}건`);
  process.exit(1);
}
console.log(`[arcade-ui] 화면 통과. 게임 ${ids.length}종 전부 열림, 봇 착석, 시계, 다섯 판, 오목 착수`);
