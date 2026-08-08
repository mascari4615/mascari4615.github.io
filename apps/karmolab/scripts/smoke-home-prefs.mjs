/**
 * 나만의 첫 화면 — 꾸민 것이 실제로 남는가 (TASK-KL-196 H)
 *
 * 왜 화면 검사인가: 이 기능은 **DOM 을 다시 배치하는 것**이라, 저장은 멀쩡한데 화면만 그대로인
 * 길이 여럿이다(블록 이름표가 빠지거나, 조각이 안 오거나). 실제로 눌러서 순서가 바뀌는지,
 * 새로고침 뒤에도 그런지 본다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-home-prefs.mjs
 */
import { chromium } from 'playwright';

const URL_TARGET = process.env.URL || 'https://blog.mascari4615.com/karmolab/';
const problems = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
await context.route('**/kl/**', (route) => route.abort());
const page = await context.newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));

const blocks = () => page.$$eval('#page-home [data-block]', (nodes) => nodes.map((n) => n.dataset.block));

await page.goto(`${URL_TARGET}#home`, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForSelector('.hp-open', { timeout: 15000 });

// ① 기본 차림 — 블록 넷이 정해진 순서로 있다.
const first = await blocks();
if (first.length < 4) problems.push(`첫 화면 블록이 ${first.length}개다 (넷이어야 한다)`);

// ② 꾸미기를 열고 「오늘의 판」을 내린다 → 화면 순서가 실제로 바뀐다.
await page.click('.hp-open');
await page.waitForSelector('.hp-panel', { timeout: 8000 });
await page.click('.hp-list li[data-id="today"] [data-down]');
await page.waitForTimeout(200);
const moved = await blocks();
if (moved[0] === 'today') problems.push(`아래로 내렸는데 「오늘의 판」이 그대로 맨 위다 (${moved.join(',')})`);

// ③ 감추기 → 그 블록이 화면에서 사라진다.
await page.uncheck('.hp-list li[data-id="pulse"] input[type="checkbox"]');
await page.waitForTimeout(200);
if (await page.locator('#homePulse').isVisible()) problems.push('감췄는데 방문 수가 그대로 보인다');

// ④ 이름 — 지으면 인사가 뜨고, 지우면 그 줄이 아예 없다.
await page.fill('.hp-name input', '카르모');
await page.waitForTimeout(200);
if (!/어서 와요, 카르모/.test(await page.locator('.landing-hero').innerText())) {
  problems.push('이름을 지었는데 인사가 안 뜬다');
}

// ⑤ 새로고침해도 남는다 — 이게 안 되면 꾸민 보람이 없다.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.hp-open', { timeout: 15000 });
await page.waitForTimeout(400);
const after = await blocks();
if (after[0] === 'today') problems.push('새로고침하니 순서가 처음으로 돌아갔다');
if (await page.locator('#homePulse').isVisible()) problems.push('새로고침하니 감춘 블록이 다시 보인다');
if (!/카르모/.test(await page.locator('.landing-hero').innerText())) problems.push('새로고침하니 이름이 사라졌다');

// ⑥ 되돌리기 — 처음 차림으로.
await page.click('.hp-open');
await page.click('.hp-reset');
await page.waitForTimeout(250);
const reset = await blocks();
if (reset[0] !== first[0]) problems.push(`되돌렸는데 첫 블록이 다르다 (${reset[0]} ≠ ${first[0]})`);
if (await page.locator('.landing-hi').count()) problems.push('되돌렸는데 인사가 남아 있다');

await browser.close();

if (problems.length) {
  console.error('❌ 나만의 첫 화면\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('✅ 나만의 첫 화면 — 순서 바꾸기 · 감추기 · 이름 · 새로고침 뒤에도 유지 · 되돌리기');
