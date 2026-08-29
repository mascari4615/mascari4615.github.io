/**
 * 편 갈라. 창을 열어 실측 (TASK-KL-264 E1)
 *
 * 창 없는 검사(`test:teams`)는 셈만 본다. 여기서 보는 것은 **화면이 편으로 보이는가**다:
 * 넷이 앉고, 이웃이 서로 다른 편이고, 결과가 개인이 아니라 편으로 뜨는가.
 */
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';

/* ★ **dev 서버가 없으면 스스로 띄운다** (2026-08-14). 사람이 켜는 `npm run dev`(8813)만 보다가
   CI 에서는 늘 못 돌림이었다. 그 서버를 CI 는 한 번도 안 켠다. 못 도는 검사는 없는 검사다. */
/* 잴 자리는 한 곳에서 정한다. `lib/smoke-base.mjs` (시키지 않으면 늘 자기 서버). */
const server = await smokeBase();
const BASE = server.base;
const PAGE = `${BASE}/apps/karmolab/index.html`;
const fails = [];
const check = (name, cond, detail = '') => {
  console.log(`  [${cond ? 'O' : 'X'}] ${name}${cond || !detail ? '' : '. ' + detail}`);
  if (!cond) fails.push(name);
};

let cantRun = '';
/* ★ **평면으로 잰다** (2026-08-29). 입체가 정본이 된 뒤로, 판을 열면 평면이 잠깐 떴다가
   입체로 갈린다. 그 사이에 칸을 누르면 `element was detached from the DOM` 으로 60초를 헤맨다.
   여기서 재려는 것은 그림이 아니라 편지가 오가나이므로, 사람이 2D 를 고른 것과 같은 자리에 적는다.
   ★ **서비스 워커도 막는다.** 안 막으면 워커가 낡은 조각을 물려 주고 검사가 옛 코드를 본다. */
const br = await chromium.launch();
const ctx = await br.newContext({ serviceWorkers: 'block' });
await ctx.addInitScript(() => { try { localStorage.setItem('karmolab.arcade.dim', '2d'); } catch { /* 못 적어도 돈다 */ } });
const p = await ctx.newPage();
p.setDefaultTimeout(60000);
try {
  await p.route('**/__dev', (r) => r.abort());
  const res = await p.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!res || !res.ok()) cantRun = `dev 서버가 안 뜬다 (${PAGE})`;
} catch (e) {
  cantRun = `dev 서버에 못 닿았다. ${e.message}`;
}

if (!cantRun) {
  await p.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 60000 });
  await p.evaluate(() => Toolbox.switchPage('arcade'));
  /* 진열장에는 단추가 없다. 물건을 집어야 편 갈라가 선다. 넷 이상 앉는 놀이로 확인한다. */
  /* 이름을 하나 박지 않는다. 그 판을 감추는 날 검사가 빨개진다(반응 측정으로 박아 뒀다가
     실제로 그랬다. 2026-08-29). 로비에 선 것들을 차례로 집어 편 갈라가 있는 첫 판을 쓴다. */
  await p.waitForSelector('[data-obj]', { timeout: 60000 });
  const ids = await p.$$eval('[data-obj]', (bs) => bs.map((b) => b.dataset.obj));
  let id = '';
  for (const cand of ids) {
    await p.click(`[data-obj="${cand}"]`);
    await p.waitForSelector(`[data-solo="${cand}"]`, { timeout: 60000 });
    if (await p.locator(`[data-team="${cand}"]`).count()) { id = cand; break; }
    await p.click('#acBack');
    await p.waitForSelector('[data-obj]', { timeout: 60000 });
  }
  if (!id) {
    console.log('[arcade-teams] 못 돌았다. 로비에 넷 이상 앉는 놀이가 없다 (통과 아님)');
    await br.close();
    await server.close();
    process.exit(2);
  }
  await p.click(`[data-team="${id}"]`);
  await p.waitForFunction(() => document.querySelector('#acIntro')?.style.display === 'none', null, { timeout: 45000 });
  await p.waitForTimeout(800);

  const seats = await p.locator('#acSeats .ac-seat').allTextContents();
  check('넷이 앉는다', seats.length === 4, JSON.stringify(seats));
  const blue = await p.locator('.ac-seat.ac-team0').count();
  const red = await p.locator('.ac-seat.ac-team1').count();
  check('둘씩 갈린다', blue === 2 && red === 2, `청 ${blue}, 홍 ${red}`);
  /* 이웃이 같은 편이면 차례가 도는 놀이에서 한 편이 연달아 둔다. */
  check('이웃한 자리는 서로 다른 편', /청/.test(seats[0] || '') && /홍/.test(seats[1] || ''), JSON.stringify(seats));

  /**
   * 저절로 끝나는 것은 **시계가 도는 놀이**뿐. 차례가 도는 놀이는 내 자리가 두기를 기다림
   * 아무도 안 누르면 영원히 안 끝남. 빨강으로 적으면 거짓 빨강
   * 여기서 재는 것은 편이 갈리나. 위 세 줄이 이미 쟀음
   */
  const live = await p.evaluate(() => window.__arcade?.realtime === true);
  let done = false;
  if (live) {
    done = await p.waitForFunction(() => window.__arcade?.finished, null, { timeout: 180000 }).then(() => true).catch(() => false);
    check('판이 끝난다', done);
  } else {
    console.log(`  [,] 판이 끝나는 것까지는 못 쟀다. ${id} 은 차례가 도는 놀이라 사람이 둬야 끝난다 (통과 아님)`);
  }
  if (done) {
    await p.waitForTimeout(700);
    const head = await p.locator('#acOverHead').textContent();
    const rows = await p.locator('.ac-overrow').allTextContents();
    check('결과가 편으로 뜬다', /편/.test(head || ''), head || '');
    check('결과 줄이 둘이다 (개인 넷이 아니라)', rows.length === 2, JSON.stringify(rows));
  }
}

await br.close();
if (server) await server.close();
if (cantRun) { console.log(`[arcade-teams] 못 돌았다. ${cantRun} (통과 아님)`); process.exit(2); }
if (fails.length) { console.log(`[arcade-teams] 실패 ${fails.length}건`); process.exit(1); }
console.log('[arcade-teams] 통과. 화면이 편으로 보인다');
