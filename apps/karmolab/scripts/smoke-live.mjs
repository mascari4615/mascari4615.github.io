/**
 * 실황 — 「지금 사람이 있다」가 첫 화면에 보이는가 (TASK-KL-196 G)
 *
 * 왜 화면 검사인가: 이 줄은 **없을 때 안 보여야** 한다. 그건 코드를 읽어서는 확인이 안 된다 —
 * 빈 상자가 남으면 첫 화면에 「지금 0명」짜리 죽은 띠가 생긴다.
 * 서버 답은 가로채서 준다(있을 때·없을 때 둘 다 만들어 본다).
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-live.mjs
 */
import { chromium } from 'playwright';

const URL_TARGET = process.env.URL || 'https://blog.mascari4615.com/karmolab/';
const problems = [];

const open = async (live) => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.route('**/kl/live', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(live) })
  );
  await context.route('**/kl/**', (route) =>
    route.request().url().includes('/kl/live') ? route.fallback() : route.abort()
  );
  /* ★ 실황 칸은 이제 **켜야 보인다** (`21c1a19e3` — 첫 화면 꾸미기가 today·live·cta 를 기본으로
   *   접었다). 그 뒤로 이 검사는 `#homeLive` 를 기다리다 죽었다 — 제품이 아니라 **켠 사람의
   *   화면**을 보러 온 검사가 안 켜고 들어온 것이다. 사람이 꾸미기에서 켠 것과 같은 값을 넣는다.
   *   (자매 검사 smoke-today.mjs · smoke-brag.mjs 와 같은 처방. 기본값은 디자인 결정이라 안 건드린다.) */
  await context.addInitScript(() => {
    localStorage.setItem('karmolab_home_prefs', JSON.stringify({ version: 2, order: [], hidden: [], name: '' }));
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));
  await page.goto(`${URL_TARGET}#home`, { waitUntil: 'networkidle', timeout: 30000 });
  /* 「보일 때까지」로 기다리면 안 된다 — 비었을 때 안 보이는 것이 **정상**이라 그 경우가
     영원히 대기가 된다(여기서 한 번 멈췄다). 자리가 붙었는지만 본다. */
  await page.waitForSelector('#homeLive', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(1200);
  return { browser, page };
};

// ① 아무도 없고 방금 열린 것도 없으면 — 줄이 통째로 없어야 한다.
{
  const { browser, page } = await open({ online: 0, recent: [] });
  const text = (await page.locator('#homeLive').innerText()).trim();
  if (text) problems.push(`아무도 없는데 실황 줄이 떠 있다: 「${text}」`);
  const visible = await page.locator('#homeLive').isVisible();
  if (visible) problems.push('빈 실황 줄이 자리를 차지하고 있다 (:empty 로 감춰야 한다)');
  await browser.close();
}

// ② 사람이 있고 방금 열린 도구가 있으면 — 숫자와 도구 이름이 뜨고, 눌러서 갈 수 있어야 한다.
{
  const now = new Date().toISOString();
  const { browser, page } = await open({
    online: 3,
    recent: [
      { toolId: 'charcount', at: now },
      { toolId: 'passgen', at: new Date(Date.now() - 5 * 60000).toISOString() }
    ]
  });
  const text = await page.locator('#homeLive').innerText();
  if (!/3명/.test(text)) problems.push(`접속자 수가 안 보인다: 「${text}」`);
  if (!/방금/.test(text)) problems.push(`「방금」이 안 보인다: 「${text}」`);
  if (!/5분 전/.test(text)) problems.push(`지난 시각이 안 보인다: 「${text}」`);
  // 도구 id 가 그대로 뜨면 안 된다 — 사람이 읽는 이름이어야 한다.
  if (/charcount/.test(text)) problems.push('도구 id 가 화면에 그대로 떴다');

  await page.locator('#homeLive .lv-chip').first().click();
  await page.waitForTimeout(700);
  if (/#home/.test(page.url())) problems.push(`실황 칩을 눌렀는데 안 갔다 (${page.url()})`);
  await browser.close();
}

if (problems.length) {
  console.error('❌ 실황\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('✅ 실황 — 아무도 없으면 줄 없음 · 있으면 「지금 3명」+방금 열린 도구(이름·시각) · 눌러서 이동');
