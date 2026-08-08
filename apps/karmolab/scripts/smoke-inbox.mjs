/**
 * 종이 **받은함**이 됐는가 (TASK-KL-191 축7)
 *
 * 예전 종은 최근 서른 개를 한 줄로 보여 주는 것이 전부였다. 알림이 서른을 넘는 순간 그 앞의
 * 것은 **없는 것**이 된다 — 「나중에 볼게」가 성립하지 않으면 그건 받은함이 아니라 종소리다.
 * 갈래도 없어서, 커뮤니티 알림에 파묻힌 팔로우 알림을 찾을 방법이 없었다.
 *
 * 서버 없이 본다 — 알림 목록 응답을 가로채 넣어 주고, 화면이 그것을 어떻게 다루는지만 잰다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-inbox.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.URL || 'https://blog.mascari4615.com/karmolab/';
const problems = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));

const asked = [];
const make = (n, source) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${source}-${i}`,
    title: `${source} 알림 ${i}`,
    body: '내용',
    source,
    count: 1,
    url: '/karmolab/',
    readAt: null,
    updatedAt: new Date().toISOString(),
  }));

await context.route('**/kl/notifications*', async (route) => {
  const url = new URL(route.request().url());
  const bucket = url.searchParams.get('bucket') ?? '';
  const limit = Number(url.searchParams.get('limit') || 30);
  asked.push({ bucket, limit });
  const all = [...make(40, 'community'), ...make(5, 'follow')];
  const picked = bucket === 'follow' ? all.filter((n) => n.source === 'follow') : all;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: picked.slice(0, limit),
      unread: 45,
      buckets: { community: 40, follow: 5 },
      signedIn: true,
      discord: false,
      discordAvailable: false,
    }),
  });
});

/* 로그인한 척 — 종은 로그인해야 그려진다. 계정 응답을 가로채는 것이 가장 정직하다
 * (화면이 진짜로 걷는 길을 그대로 걷는다). */
await context.route('**/kl/me', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      account: { id: 'probe', handle: 'probe', displayName: '검사', avatarUrl: null, identities: {} },
    }),
  });
});

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForFunction(() => document.querySelector('#klBell') !== null, { timeout: 20000 }).catch(() => {
  problems.push('종 단추가 안 그려졌다 (로그인 상태를 못 만들었다)');
});

if (!problems.length) {
  await page.click('#klBell');
  await page.waitForSelector('.kl-bell-panel', { timeout: 5000 });

  // ① 갈래 줄이 있고, 갈래마다 안 읽은 수가 보인다
  const tabs = await page.locator('.kl-bell-tab').allTextContents();
  if (tabs.length !== 4) problems.push(`갈래가 ${tabs.length}개 (전체·커뮤니티·팔로우·그 밖)`);
  if (!tabs.some((t) => t.includes('커뮤니티 40'))) problems.push(`갈래별 수가 안 보인다: ${tabs.join(' / ')}`);

  // ② 처음엔 서른 개 — 그리고 「지난 알림 더 보기」가 뜬다
  const first = await page.locator('.kl-bell-item').count();
  if (first !== 30) problems.push(`처음에 ${first}개 왔다 (30개여야 한다)`);
  if ((await page.locator('#klBellMore').count()) !== 1) problems.push('꽉 찼는데 「더 보기」가 없다');

  // ③ 더 보기 → 앞의 것도 보인다
  await page.click('#klBellMore');
  await page.waitForFunction(() => document.querySelectorAll('.kl-bell-item').length > 30, { timeout: 5000 })
    .catch(() => problems.push('「더 보기」를 눌러도 안 늘었다'));
  if (asked.at(-1)?.limit !== 100) problems.push(`더 보기가 서버에 ${asked.at(-1)?.limit} 를 물었다`);

  // ④ 갈래를 고르면 그 갈래만 — 그리고 개수는 처음으로 되돌아간다
  await page.locator('.kl-bell-tab[data-bucket="follow"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.kl-bell-item').length === 5, { timeout: 5000 })
    .catch(() => problems.push('팔로우 갈래를 골랐는데 목록이 안 바뀌었다'));
  const last = asked.at(-1);
  if (last?.bucket !== 'follow') problems.push(`서버에 갈래를 안 물었다: ${JSON.stringify(last)}`);
  if (last?.limit !== 30) problems.push(`갈래를 바꿨는데 앞에서 늘린 수(${last?.limit})가 따라왔다`);
  // 다 보여 준 갈래에는 「더 보기」가 없어야 한다 — 눌러도 아무 일 없는 단추를 두지 않는다
  if ((await page.locator('#klBellMore').count()) !== 0) problems.push('다섯 개뿐인데 「더 보기」가 떠 있다');
}

await browser.close();

if (problems.length) {
  console.error('❌ 받은함:');
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}
console.log('✅ 받은함 — 갈래별 수가 보이고, 지난 알림을 더 볼 수 있고, 갈래를 바꾸면 처음부터 센다');
