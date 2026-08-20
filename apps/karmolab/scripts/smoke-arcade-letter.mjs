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
import { smokeBase } from './lib/smoke-base.mjs';

/* ★ **dev 서버가 없으면 스스로 띄운다** (2026-08-14). 사람이 켜는 `npm run dev`(8813)만 보다가
   CI 에서는 늘 「못 돌림」이었다 — 그 서버를 CI 는 한 번도 안 켠다. 못 도는 검사는 없는 검사다. */
/* 잴 자리는 한 곳에서 정한다 — `lib/smoke-base.mjs` (시키지 않으면 늘 자기 서버). */
const server = await smokeBase();
const BASE = server.base;
const PAGE = `${BASE}/apps/karmolab/index.html`;
const fails = [];
const check = (name, cond, detail = '') => {
  console.log(`  [${cond ? 'O' : 'X'}] ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) fails.push(name);
};

let cantRun = '';
const br = await chromium.launch();
const ctx = await br.newContext();
/* ★ **찬 러너는 느리다** (2026-08-14). 이 검사를 묶음(gates)에 넣자마자 CI 에서 32초에 섰다 —
   내 자리에서는 7초다. 오락실 화면 검사가 앞서 같은 병을 겪고 60초로 늘렸다(2026-08-13).
   못 기다려서 나는 거짓 빨강이 기다림보다 비싸다. */
ctx.setDefaultTimeout(60000);
/* ★ **계측** (2026-08-14). 편지 링크 창에서 `Toolbox` 가 60초 안에 안 뜬다 —
   CI 에서만 그렇고 내 자리에서는 7초다. 「도구 장이 저장소에 없어서 404」라는 가설을
   세우고 그 장을 숨긴 채 돌려 봤는데 **그대로 통과했다** — 가설이 틀렸다.
   그래서 추측을 그만두고, 그 창이 무엇을 못 받고 무엇을 던지는지 적어 둔다. */
const open = async (url) => {
  const p = await ctx.newPage();
  const badResponses = [];
  const sent = [];
  p.on('response', (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().slice(0, 90)}`); });
  p.on('pageerror', (e) => sent.push(String(e.message).slice(0, 120)));
  p.on('console', (m) => { if (m.type() === 'error') sent.push(`console: ${m.text().slice(0, 120)}`); });
  await p.route('**/__dev', (r) => r.abort());
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  try {
    await p.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 60000 });
  } catch (e) {
    console.error(`[DEBUG-7e21] 셸이 안 떴다: ${url.slice(0, 120)}`);
    console.error(`[DEBUG-7e21] 400 이상 응답 ${badResponses.length}개:`);
    badResponses.slice(0, 12).forEach((l) => console.error(`  · ${l}`));
    console.error(`[DEBUG-7e21] 던진 것 ${sent.length}개:`);
    sent.slice(0, 12).forEach((l) => console.error(`  · ${l}`));
    console.error(`[DEBUG-7e21] Toolbox=${await p.evaluate(() => typeof Toolbox).catch(() => '못 물어봄')}`);
    throw e;
  }
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
  await a.waitForSelector('.ac-cell', { timeout: 45000 });
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
if (server) await server.close();
if (cantRun) { console.log(`[arcade-letter] 못 돌았다 — ${cantRun} (통과 아님)`); process.exit(2); }
if (fails.length) { console.log(`[arcade-letter] 실패 ${fails.length}건`); process.exit(1); }
console.log('[arcade-letter] 통과 — 링크 한 줄이 판을 실어 나른다');
