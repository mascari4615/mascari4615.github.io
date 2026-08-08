/**
 * 도감 — 도구를 쓰면 칸이 채워지는가 (TASK-KL-196 A)
 *
 * 왜 화면 검사인가: 도감의 값은 **다른 곳에서 찍힌 도장**을 읽어 나온다(도구를 열 때
 * `account.ts` 가 찍는다). 그 두 자리가 어긋나면 단위 시험은 초록인데 도감만 영원히 0칸이다.
 * 그래서 실제로 도구를 열고, 도감으로 가서, 칸이 늘었는지 본다.
 *
 * 서버는 끊고 본다 — 로그인 안 한 사람에게도 도감이 있어야 한다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-collection.mjs
 */
import { chromium } from 'playwright';

const URL_TARGET = process.env.URL || 'https://blog.mascari4615.com/karmolab/';
const problems = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await context.route('**/kl/**', (route) => route.abort());
const page = await context.newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));

const open = async (hash) => {
  await page.goto(`${URL_TARGET}#${hash}`, { waitUntil: 'networkidle', timeout: 30000 });
};

// ① 빈 브라우저 — 칸은 다 있고 찍힌 것은 도감 자신뿐이어야 한다.
await open('collection');
await page.waitForSelector('.cl-grid .cl-cell', { timeout: 15000 });
const cells = await page.locator('.cl-grid .cl-cell').count();
if (cells < 50) problems.push(`도감 칸이 ${cells}개다 (도구가 100개 넘는데)`);
const on0 = await page.locator('.cl-cell.is-on').count();
if (on0 > 3) problems.push(`아무것도 안 썼는데 ${on0}칸이 찍혀 있다`);

// ② 도구를 하나 연다 → 도감으로 돌아오면 그 칸이 찍혀 있어야 한다.
await open('charcount');
await page.waitForTimeout(1200); // 도장은 도구가 뜬 뒤에 찍힌다
await open('collection');
await page.waitForSelector('.cl-grid .cl-cell', { timeout: 15000 });
const stamped = await page.locator('.cl-cell[data-tool="charcount"].is-on').count();
if (stamped !== 1) problems.push('도구를 열었는데 그 칸에 도장이 안 찍혔다 (charcount)');
const on1 = await page.locator('.cl-cell.is-on').count();
if (on1 <= on0) problems.push(`도구를 열었는데 찍힌 칸이 안 늘었다 (${on0} → ${on1})`);

// ③ 세는 줄이 실제 칸 수와 맞는가 — 두 곳이 다른 말을 하면 둘 다 못 믿는다.
const counted = Number((await page.locator('.cl-count b').innerText()).trim());
if (counted !== on1) problems.push(`머리글은 ${counted}칸이라는데 찍힌 칸은 ${on1}개다`);

// ④ 로그인 안 한 사람에게는 「이 브라우저에만」이라고 말해야 한다.
if (!(await page.locator('.cl-note').count())) problems.push('로그인 안 했는데 이 브라우저에만 남는다는 말이 없다');

/* ⑤ 칸을 누르면 그 도구로 간다 — 도감이 목록 구실도 해야 한다.
   「charcount 로 갔나」로는 못 본다: 도구를 열면 주소·화면 id 가 **묶음 이름**이 된다
   (`charcount` → `#text`). 그래서 「도감에서 벗어났나」로 본다 (KL-191 에서 두 번 헛짚었다). */
await page.locator('.cl-cell[data-tool="charcount"]').click();
await page.waitForTimeout(700);
if (/#collection/.test(page.url()) || !/#/.test(page.url())) {
  problems.push(`칸을 눌렀는데 도감에 그대로 있다 (${page.url()})`);
}

await browser.close();

if (problems.length) {
  console.error('❌ 도감\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(`✅ 도감 — 칸 ${cells}개 · 도구 열면 도장 찍힘(${on0}→${on1}) · 머리글 일치 · 칸 누르면 이동 (서버 끊고)`);
