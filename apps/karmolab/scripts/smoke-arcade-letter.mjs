/**
 * 링크 하나가 판을 실어 나르는가 — 창 셋으로 왕복 (TASK-KL-264 D5)
 *
 * 창 없는 검사(`test:mail`)는 접었다 펴는 것만 본다. 여기서 보는 것은 **사람이 실제로 겪는
 * 왕복**이다: 한 수 두고 → 링크가 나오고 → 상대가 그 링크를 열면 *다음 자리*로 앉고 →
 * 한 수 두면 링크가 돌아오고 → 그걸 열면 두 수가 다 놓여 있다.
 *
 * 창을 셋 쓰는 이유: 링크를 여는 것이 곧 「받는 것」이라, 같은 창에서 열면 아무것도 안 재진다.
 */
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

/* ★ **dev 서버가 없으면 스스로 띄운다** (2026-08-14). 사람이 켜는 `npm run dev`(8813)만 보다가
   CI 에서는 늘 「못 돌림」이었다 — 그 서버를 CI 는 한 번도 안 켠다. 못 도는 검사는 없는 검사다. */
let 내서버 = null;
let BASE = process.env.ARCADE_BASE || 'http://127.0.0.1:8813';
if (!(await fetch(`${BASE}/apps/karmolab/index.html`).then((r) => r.ok).catch(() => false))) {
  내서버 = await serveRepo();
  BASE = 내서버.base;
}
const PAGE = `${BASE}/apps/karmolab/index.html`;
const fails = [];
const check = (name, cond, detail = '') => {
  console.log(`  [${cond ? 'O' : 'X'}] ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) fails.push(name);
};

let cantRun = '';
const br = await chromium.launch();
const ctx = await br.newContext();
const open = async (url) => {
  const p = await ctx.newPage();
  await p.route('**/__dev', (r) => r.abort());
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  return p;
};

let a;
try {
  a = await open(PAGE);
  await a.evaluate(() => Toolbox.switchPage('arcade'));
  await a.waitForSelector('[data-letter="gomoku"]', { timeout: 30000 });
} catch (e) {
  cantRun = `오락실이 안 떴다 — ${e.message.slice(0, 60)}`;
}

if (!cantRun) {
  await a.click('[data-letter="gomoku"]');
  await a.waitForSelector('.ac-cell', { timeout: 20000 });
  check('편지 줄이 뜬다', await a.locator('#acLetter').isVisible());

  await a.locator('.ac-cell').nth(40).click();
  await a.waitForTimeout(600);
  const link1 = await a.locator('#acLetterUrl').inputValue();
  check('한 수 두면 링크가 나온다', link1.includes('?m='), link1.slice(0, 40));
  check('링크가 주소로 쓸 만큼 짧다', link1.length < 400, `${link1.length}자`);

  const b = await open(link1);
  await b.waitForTimeout(1500);
  const s1 = await b.evaluate(() => ({
    seat: window.__arcade?.mySeat,
    game: window.__arcade?.game,
    stones: (window.__arcade?.state?.board || []).filter((v) => v !== 0).length
  }));
  check('받은 사람이 다음 자리로 앉는다', s1.seat === 1, JSON.stringify(s1));
  check('내가 둔 수가 판에 있다', s1.stones === 1, JSON.stringify(s1));

  await b.locator('.ac-cell').nth(0).click();
  await b.waitForTimeout(600);
  const link2 = await b.locator('#acLetterUrl').inputValue();
  check('상대가 두면 링크가 돌아온다', link2.includes('?m=') && link2 !== link1);

  const c = await open(link2);
  await c.waitForTimeout(1500);
  const s2 = await c.evaluate(() => ({
    seat: window.__arcade?.mySeat,
    stones: (window.__arcade?.state?.board || []).filter((v) => v !== 0).length
  }));
  check('되받으면 다시 내 차례다', s2.seat === 0, JSON.stringify(s2));
  check('두 수가 다 놓여 있다', s2.stones === 2, JSON.stringify(s2));
}

await br.close();
if (내서버) await 내서버.close();
if (cantRun) { console.log(`[arcade-letter] 못 돌았다 — ${cantRun} (통과 아님)`); process.exit(2); }
if (fails.length) { console.log(`[arcade-letter] 실패 ${fails.length}건`); process.exit(1); }
console.log('[arcade-letter] 통과 — 링크 한 줄이 판을 실어 나른다');
