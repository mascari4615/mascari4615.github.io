/**
 * 편 갈라 — 창을 열어 실측 (TASK-KL-264 E1)
 *
 * 창 없는 검사(`test:teams`)는 셈만 본다. 여기서 보는 것은 **화면이 편으로 보이는가**다:
 * 넷이 앉고, 이웃이 서로 다른 편이고, 결과가 개인이 아니라 편으로 뜨는가.
 */
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';

/* ★ **dev 서버가 없으면 스스로 띄운다** (2026-08-14). 사람이 켜는 `npm run dev`(8813)만 보다가
   CI 에서는 늘 「못 돌림」이었다 — 그 서버를 CI 는 한 번도 안 켠다. 못 도는 검사는 없는 검사다. */
/* 잴 자리는 한 곳에서 정한다 — `lib/smoke-base.mjs` (시키지 않으면 늘 자기 서버). */
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
const p = await (await br.newContext()).newPage();
p.setDefaultTimeout(60000);
try {
  await p.route('**/__dev', (r) => r.abort());
  const res = await p.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!res || !res.ok()) cantRun = `dev 서버가 안 뜬다 (${PAGE})`;
} catch (e) {
  cantRun = `dev 서버에 못 닿았다 — ${e.message}`;
}

if (!cantRun) {
  await p.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 60000 });
  await p.evaluate(() => Toolbox.switchPage('arcade'));
  await p.waitForSelector('[data-team]', { timeout: 60000 });
  const many = await p.locator('[data-team]').count();
  check('편 갈라 되는 놀이가 여럿이다', many >= 10, `${many}개`);

  const id = await p.locator('[data-team]').first().getAttribute('data-team');
  await p.click(`[data-team="${id}"]`);
  await p.waitForFunction(() => document.querySelector('#acIntro')?.style.display === 'none', null, { timeout: 45000 });
  await p.waitForTimeout(800);

  const seats = await p.locator('#acSeats .ac-seat').allTextContents();
  check('넷이 앉는다', seats.length === 4, JSON.stringify(seats));
  const blue = await p.locator('.ac-seat.ac-team0').count();
  const red = await p.locator('.ac-seat.ac-team1').count();
  check('둘씩 갈린다', blue === 2 && red === 2, `청 ${blue} · 홍 ${red}`);
  /* 이웃이 같은 편이면 차례가 도는 놀이에서 한 편이 연달아 둔다. */
  check('이웃한 자리는 서로 다른 편', /청/.test(seats[0] || '') && /홍/.test(seats[1] || ''), JSON.stringify(seats));

  const done = await p.waitForFunction(() => window.__arcade?.finished, null, { timeout: 180000 }).then(() => true).catch(() => false);
  check('판이 끝난다', done);
  if (done) {
    await p.waitForTimeout(700);
    const head = await p.locator('#acOverHead').textContent();
    const rows = await p.locator('.ac-overrow').allTextContents();
    check('결과가 편으로 뜬다', /편/.test(head || ''), head || '');
    check('결과 줄이 둘이다 (개인 넷이 아니라)', rows.length === 2, JSON.stringify(rows));
  }
}

await br.close();
if (내서버) await 내서버.close();
if (cantRun) { console.log(`[arcade-teams] 못 돌았다 — ${cantRun} (통과 아님)`); process.exit(2); }
if (fails.length) { console.log(`[arcade-teams] 실패 ${fails.length}건`); process.exit(1); }
console.log('[arcade-teams] 통과 — 화면이 편으로 보인다');
