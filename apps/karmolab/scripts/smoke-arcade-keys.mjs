/**
 * 마우스 없이 논다 — 키로 51개를 (arcade-next ★1)
 *
 * 규약을 51개에 나눠 주지 않았다. 화면들은 이미 `<button>` 으로 판을 그리므로, 껍데기가
 * **그 단추들 위를 화살표로 옮기고 엔터로 누른다.** 게임 화면은 이 사실을 모른다.
 *
 * 여기서 재는 것:
 *   ① 판이 서면 무대에 **초점**이 온다 (어디를 눌러야 하는지 화면이 말해 준다)
 *   ② 화살표가 짚는 자리를 옮긴다 — 격자면 2차원으로
 *   ③ 엔터가 **진짜로 둔다** (판이 바뀐다)
 *   ④ 키로 놀 수 있는 놀이가 몇 개인가 — 그림판만 쓰는 놀이는 손이 그대로 마우스다
 */
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';

/* 잴 자리는 한 곳에서 정한다 — `lib/smoke-base.mjs` (시키지 않으면 늘 자기 서버).
   전에는 8813 이 떠 있으면 그걸 썼는데, CI 에는 그 서버가 없어 `ERR_CONNECTION_REFUSED` 로
   죽었다 — 내 자리에서만 초록인 검사였다(2026-08-14 실측). */
const 내서버 = await smokeBase();
const BASE = 내서버.base;
const PAGE = `${BASE}/apps/karmolab/index.html`;
const fails = [];
const check = (name, cond, detail = '') => {
  console.log(`  [${cond ? 'O' : 'X'}] ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) fails.push(name);
};

let cantRun = '';
const br = await chromium.launch();
const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
try {
  await p.route('**/__dev', (r) => r.abort());
  const res = await p.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (!res || !res.ok()) cantRun = `dev 서버가 안 뜬다 (${PAGE})`;
} catch (e) {
  cantRun = `dev 서버에 못 닿았다 — ${e.message}`;
}

const openGame = async (id) => {
  await p.click(`[data-solo="${id}"]`);
  await p.waitForFunction(() => document.querySelector('#acIntro')?.style.display === 'none', null, { timeout: 20000 });
  await p.waitForTimeout(150);
};

if (!cantRun) {
  /* 찬 러너는 셸이 늦게 뜬다 — 다른 오락실 검사들과 같은 60초로 맞춘다(그 값으로 CI 초록을 봤다).
     느린 레인 첫 판이 여기 30초에서 섰다(2026-08-14 실측). */
  await p.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 60000 });
  await p.evaluate(() => Toolbox.switchPage('arcade'));
  await p.waitForSelector('[data-solo="gomoku"]', { timeout: 30000 });

  await openGame('gomoku');
  check('판이 서면 무대에 초점이 온다', (await p.evaluate(() => document.activeElement?.id)) === 'acStage');

  /* 첫 화살표는 「고르기 시작」이라 0번에 들어간다 — 그다음부터 움직인다.
     오른쪽 4 → 3번 칸, 아래 4 → 3 + 9*4 = 39번. 9칸짜리 격자라는 것을 CSS 에서 읽는다. */
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight']) await p.keyboard.press(k);
  const row0 = await p.evaluate(() => [...document.querySelectorAll('.ac-cell')].findIndex((e) => e.classList.contains('ac-key')));
  check('화살표가 옆으로 옮긴다', row0 === 3, `${row0}번`);
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown']) await p.keyboard.press(k);
  const down = await p.evaluate(() => [...document.querySelectorAll('.ac-cell')].findIndex((e) => e.classList.contains('ac-key')));
  check('아래위는 한 줄만큼 뛴다 (격자를 안다)', down === 39, `${down}번 (9칸 격자면 39)`);

  await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
  const put = await p.evaluate(() => (document.querySelectorAll('.ac-cell')[39]?.textContent || '').trim());
  check('엔터가 진짜로 둔다', put === '●', `"${put}"`);

  await p.click('#acQuit');
  await p.waitForSelector('[data-solo]', { timeout: 10000 });

  /* 몇 개나 키로 놀 수 있나. 그림판만 쓰는 놀이는 손이 그대로 마우스다 — 거기까지 키로 하려면
     게임마다 뜻이 달라(어디로 얼마나?) 규약이 깨진다. 그래서 수를 적어 두고 지켜본다. */
  const ids = await p.$$eval('[data-solo]', (bs) => bs.map((b) => b.dataset.solo));
  let keyable = 0;
  const mouseOnly = [];
  for (const id of ids) {
    await openGame(id);
    const n = await p.evaluate(() =>
      [...document.querySelectorAll('#acView button:not([disabled]),#acView [role="button"]')].filter((e) => e.offsetParent !== null).length
    );
    if (n > 0) keyable += 1;
    else mouseOnly.push(id);
    await p.click('#acQuit');
    await p.waitForSelector('[data-solo]', { timeout: 10000 });
  }
  check(`키로 놀 수 있는 놀이가 ${keyable}/${ids.length}`, keyable >= ids.length * 0.7,
    `마우스만: ${mouseOnly.join(' ')}`);
  console.log(`  · 마우스만 쓰는 놀이 ${mouseOnly.length}개 — ${mouseOnly.join(' ')}`);
}

await br.close();
if (cantRun) { console.log(`[arcade-keys] 못 돌았다 — ${cantRun} (통과 아님)`); process.exit(2); }
if (fails.length) { console.log(`[arcade-keys] 실패 ${fails.length}건`); process.exit(1); }
console.log('[arcade-keys] 통과 — 마우스 없이 둔다');
