/**
 * 남이 만든 도구의 **신뢰 층** (TASK-KL-191 축4)
 *
 * KL-183 H 가 상자를 만들었다(우리 출처 없음 · 바깥 통신 끊김). 상자는 안전을 만들지만
 * **판단을 대신해 주지는 않는다** — 사람은 열기 전에 「이게 뭘 하는 건가」를 알 길이 없었고,
 * 이상한 것을 봐도 누를 자리가 없었다.
 *
 * 여기서는 진짜 브라우저에서 셋을 본다:
 *   ① 열면 「하는 일 · 막힌 것」 요약이 상자 위에 뜬다 (설명이 아니라 소스에서 읽은 것)
 *   ② 신고 단추가 **열어 본 그 자리**에 있다 (목록에만 있으면 창을 닫고 안 돌아온다)
 *   ③ 세워진 도구는 소스가 안 오고, 화면이 「왜 못 여나」를 말한다
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-usertool-trust.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.URL || 'https://blog.mascari4615.com/karmolab/';
const problems = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));

const LIVE = { id: 'live00000001', title: '주사위', ownerHandle: 'someone', listed: true, runs: 3 };
const STOPPED = { id: 'stop00000001', title: '멈춘 것', ownerHandle: 'someone', listed: true, runs: 9 };
let reported = 0;

await context.route('**/kl/me', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ account: { id: 'p', handle: 'probe', displayName: '검사', identities: {} } }),
  }),
);
await context.route('**/kl/tools/user', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tools: [LIVE, STOPPED] }) }),
);
await context.route('**/kl/tools/mine', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tools: [] }) }),
);
await context.route(`**/kl/tools/user/${LIVE.id}`, (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      tool: { ...LIVE, source: '<canvas id="c"></canvas>' },
      summary: { does: ['그림을 그린다'], blocked: ['바깥으로 보내기 (끊겨 있음)'], unreadable: false },
    }),
  }),
);
await context.route(`**/kl/tools/user/${STOPPED.id}`, (route) =>
  route.fulfill({
    status: 451,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'stopped', reason: '신고 3건', title: STOPPED.title }),
  }),
);
await context.route('**/report', (route) => {
  reported += 1;
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{"reports":1,"stopped":false}' });
});
await context.route('**/run', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"runs":1}' }));

page.on('dialog', (d) => d.accept()); // 신고 확인창

await page.goto(`${BASE}#usertool`, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForSelector('.ut-wrap', { timeout: 20000 });

// ① 요약 — 열기 전에는 없고, 열면 상자 위에 뜬다
if ((await page.locator('.ut-summary').count()) !== 0) problems.push('안 열었는데 요약이 떠 있다');
await page.locator('button[data-run]').first().click();
await page.waitForSelector('.ut-stage iframe', { timeout: 10000 });
const summary = (await page.locator('.ut-summary').first().textContent()) ?? '';
if (!summary.includes('그림을 그린다')) problems.push(`하는 일이 안 보인다: ${summary}`);
if (!summary.includes('막힌 것')) problems.push(`막힌 것이 안 보인다: ${summary}`);

// ② 신고 단추가 열어 본 자리에 있다
if ((await page.locator('.ut-stage-head button[data-report]').count()) !== 1) {
  problems.push('열어 본 자리에 신고 단추가 없다');
} else {
  await page.locator('.ut-stage-head button[data-report]').click();
  await page.waitForTimeout(800);
  if (reported !== 1) problems.push('신고를 눌렀는데 서버로 안 갔다');
}

// ③ 세워진 도구 — 소스가 안 오고, 왜 못 여는지 말한다
await page.locator('button[data-run]').nth(1).click();
await page.waitForTimeout(900);
const stageText = (await page.locator('#utStage').textContent()) ?? '';
if (!stageText.includes('멈춰 있습니다')) problems.push(`세워진 도구인데 안내가 없다: ${stageText.slice(0, 60)}`);
if ((await page.locator('#utStage iframe').count()) !== 0) problems.push('세워진 도구인데 상자가 떠 있다');

await browser.close();

if (problems.length) {
  console.error('❌ 남의 도구 신뢰 층:');
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}
console.log('✅ 열기 전 요약 · 열어 본 자리의 신고 · 세워진 것은 소스가 안 온다');
