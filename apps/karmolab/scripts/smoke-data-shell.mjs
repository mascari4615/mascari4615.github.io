/**
 * 데이터·코드 껍데기 — **붙여넣은 것을 알아보고 짚어 주는가** (TASK-KL-263).
 *
 * 여기서 볼 것은 앞 재료들과 다르다. 파일이 따라가는지는 글 검사가 이미 봤으므로,
 * 이 판의 새것 — **짚어 주기**(JSON Crack·JSON Hero) — 가 실제로 화면에 서는지를 본다.
 * 판정 자체는 `test-sniff.mjs` 가 스물둘로 재고, 여기서는 그 판정이 **할 일 카드에 닿는가**를 본다.
 *
 * 사용: node scripts/smoke-data-shell.mjs
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
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(`${BASE}#devtool`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pfText', { timeout: 20000 });

/* ★ **개수를 손으로 박지 않는다** (2026-08-14). 「열여섯 개여야 한다」로 박혀 있었는데
   도구가 하나 늘자(`XML 다루기`) 그대로 빨개졌다 — 늘어난 것은 좋은 일인데 검사가 운다.
   그런 빨강은 사람을 길들여 진짜 빨강까지 무시하게 만든다.
   재려던 것은 「열여섯」이 아니라 **할 일 카드가 제대로 그려지는가**다: 넉넉히 있고,
   이름이 비지 않고, 아이디가 겹치지 않는다. */
const 카드 = await page.locator('.pf-job').all();
const 이름들 = await Promise.all(카드.map((c) => c.textContent()));
const 아이디들 = await Promise.all(카드.map((c) => c.getAttribute('data-job')));
check(카드.length >= 16, `할 일 카드가 열여섯 개 이상이어야 한다 (지금 ${카드.length})`);
check(이름들.every((t) => (t ?? '').trim().length > 0), '이름 없는 할 일 카드가 있다');
check(new Set(아이디들).size === 아이디들.length, '아이디가 겹치는 할 일 카드가 있다');
check((await page.locator('.pf-group-label').count()) === 4, '갈래는 넷');
check(!(await page.locator('#pfTip').isVisible()), '아직 아무것도 안 붙여넣었으면 짚지 않는다');

/* ① JSON 을 붙여넣으면 JSON 것들이 초록으로 선다 */
await page.fill('#pfText', '{"name":"karmo","tags":[1,2,3]}');
await page.waitForSelector('#dvWhat', { timeout: 15000 });
check((await page.locator('#dvWhat').innerText()).includes('JSON'), '무엇인지 왼쪽에 말해 준다');
await page.waitForFunction(() => document.querySelectorAll('.pf-job.pf-hot').length > 0, undefined, { timeout: 10000 }).catch(() => {});
const hot = await page.locator('.pf-job.pf-hot').evaluateAll((els) => els.map((e) => e.dataset.job));
check(hot.includes('jsonfmt'), `JSON 이면 「JSON」 이 짚혀야 한다 (지금 ${JSON.stringify(hot)})`);
check(!hot.includes('jwt'), 'JSON 인데 JWT 가 짚히면 안 된다');
check(await page.locator('#pfTip').isVisible(), '왜 짚었는지 한 줄이 뜬다');

/* ①-나 **구조 보기** (TASK-KL-286 — JSON Crack·JSON Hero)
 * 사람이 JSON 을 여는 이유의 태반은 「여기 뭐가 들어 있나」다. 글자 대신 나무가 서야 한다. */
await page.waitForSelector('#dvTree', { timeout: 10000 }).catch(() => {});
check((await page.locator('#dvTree').count()) === 1, 'JSON 이면 글자 대신 나무가 선다');
check((await page.locator('#dvHead').count()) === 0, 'JSON 일 땐 글자 덩어리는 안 보여 준다');
const rows0 = await page.locator('#dvRows .dv-row, #dvTree .dv-row').count();
check(rows0 >= 4, `줄이 펴져 있다 (지금 ${rows0}줄)`);
check(/깊|deep|層/.test(await page.locator('#dvSum').innerText()), '얼마나 깊은지 한 줄로 말해 준다');

/* 가지를 누르면 접힌다 */
const before = await page.locator('#dvTree .dv-row').count();
await page.locator('#dvTree .dv-row').first().click();
await page.waitForTimeout(200);
const after = await page.locator('#dvTree .dv-row').count();
check(after < before, `가지를 누르면 접힌다 (${before} → ${after}줄)`);

/* 깨진 JSON 은 나무 대신 글자로 — 그때가 「보기 좋게」가 가장 필요한 순간이다 */
await page.fill('#pfText', '{"a":1,');
await page.waitForFunction(() => !!document.querySelector('#dvHead'), undefined, { timeout: 10000 }).catch(() => {});
check((await page.locator('#dvHead').count()) === 1, '깨진 JSON 은 글자로 보여 준다');
await page.fill('#pfText', '{"name":"karmo","tags":[1,2,3]}');
await page.waitForSelector('#dvTree', { timeout: 10000 }).catch(() => {});

/* ② 다른 것을 붙여넣으면 **짚는 것이 갈아 끼워진다** — 옛것이 남으면 거짓말이 된다 */
await page.fill('#pfText', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk');
await page.waitForFunction(
  () => {
    const on = [...document.querySelectorAll('.pf-job.pf-hot')].map((e) => e.dataset.job);
    return on.length === 1 && on[0] === 'jwt';
  }, undefined,
  { timeout: 10000 }
).catch(() => {});
const hot2 = await page.locator('.pf-job.pf-hot').evaluateAll((els) => els.map((e) => e.dataset.job));
check(hot2.length === 1 && hot2[0] === 'jwt', `JWT 로 바뀌면 JWT 만 짚힌다 (지금 ${JSON.stringify(hot2)})`);
check((await page.locator('#dvWhat').innerText()).includes('JWT'), '왼쪽 말도 JWT 로 바뀐다');

/* ③ 그냥 글이면 아무것도 안 짚는다 — 억지로 짚으면 틀린 길로 민다 */
await page.fill('#pfText', '오늘 점심 뭐 먹지, 라고 적어 둔 메모입니다.');
await page.waitForFunction(() => document.querySelectorAll('.pf-job.pf-hot').length === 0, undefined, { timeout: 10000 }).catch(() => {});
check((await page.locator('.pf-job.pf-hot').count()) === 0, '그냥 글이면 아무것도 안 짚는다');
check(!(await page.locator('#pfTip').isVisible()), '짚을 게 없으면 안내줄도 걷는다');

/* ④ 그래도 할 일은 다 눌린다 — 짚는 것은 **막는 것이 아니다** */
await page.locator('.pf-job[data-job="charcount"], .pf-job[data-job="regextest"]').first().click();
await page.waitForSelector('#pfMount:visible', { timeout: 15000 });
check(await page.locator('#pfFileBar').isVisible(), '고른 뒤에도 붙여넣은 것 줄은 남는다');
await page.waitForFunction(
  () => {
    const el = document.querySelector('#pfHost textarea');
    return !!el && el.value.includes('점심');
  }, undefined,
  { timeout: 15000 }
).catch(() => {});
const got = await page.evaluate(() => {
  const el = document.querySelector('#pfHost textarea');
  return el ? el.value : '';
});
check(/점심/.test(got), `안 짚은 할 일에도 글이 그대로 들어간다 (지금 「${got.slice(0, 16)}」)`);

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-data-shell] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-data-shell] 전부 통과');
