/**
 * 도구가 아닌 화면들이 실제로 그려지는지 (TASK-KL-098).
 *
 * 왜 있나: 검사가 전부 **도구 페이지**만 보고 있었다. 광장·상태·커뮤니티·내 정보는 어디에도
 * 안 물려 있어서, 오늘 하루에만 이런 것들이 조용히 지나갔다 —
 *  · 값이 안 와서 칸이 **빈 채로** 남음(요소는 있으니 아무도 못 알아챈다)
 *  · 서버가 새 값을 아직 안 주면 통째로 안 그려짐
 *  · 폰에서 옆으로 넘침
 * 셋 다 「HTTP 200」으로는 절대 안 잡힌다. 그래서 진짜 브라우저로 열어 본다.
 *
 * 무엇을 실패로 보나 (셋 다 사람이 겪는 고장이다):
 *  ① 그 화면의 알맹이가 아예 없다
 *  ② 스크립트가 죽었다
 *  ③ 폰 폭에서 문서가 옆으로 넘친다
 *
 * 서버(집 노트북)에 못 닿는 것은 **실패가 아니다** — 그때는 화면이 조용히 닫히는 게 설계다.
 * 대신 「못 닿아서 못 봤다」고 말한다 (통과라고 하지 않는다).
 *
 * 사용: node scripts/smoke-platform-pages.mjs
 *       BASE=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-platform-pages.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://blog.mascari4615.com/karmolab/';

/** 사람 브라우저라고 밝힌다 — 서버가 헤드리스를 사람으로 안 세는 게 맞고(그게 설계), 그러면 이 검사도 사람 화면을 못 본다. */
const HUMAN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** 화면마다 「이게 있으면 그려진 것」 하나. 없으면 빈 화면이다. */
const SCREENS = [
  { hash: 'plaza', name: '광장', need: '.plaza-section h3, .plaza-note' },
  { hash: 'status', name: '상태 · 변경 기록', need: '.st-card, .st-fail' },
  // 커뮤니티는 들어오는 자리에 따라 다른 것을 그린다 — 홈(갤러리 카드·최근 글)과 갤러리 안(표).
  // 처음에 홈 표식을 빼먹어서 「안 그려졌다」고 잘못 일렀다. 둘 다 적는다.
  { hash: 'community', name: '커뮤니티', need: '.c-feed-row, .c-gal-card, .c-boards, .c-table, .c-fail, .c-invite' },
  { hash: 'user', name: '내 정보', need: '.user-layout' },
  // 「내 정보」에서 떼어 낸 화면 (TASK-KL-139). 헤더 톱니의 유일한 목적지라 안 그려지면 설정이 통째로 사라진다.
  { hash: 'settings', name: '환경 설정', need: '.settings-layout' },
];

const browser = await chromium.launch();
const failures = [];
const notes = [];

async function check(width, height, label) {
  const context = await browser.newContext({ userAgent: HUMAN_UA, viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));

  for (const screen of SCREENS) {
    errors.length = 0;
    await page.goto(`${BASE}#${screen.hash}`, { waitUntil: 'domcontentloaded' });

    let drew = true;
    try {
      await page.waitForSelector(screen.need, { timeout: 20000, state: 'attached' });
    } catch {
      drew = false;
    }
    // 늦게 오는 값(서버)까지 기다린 뒤에 넘침을 잰다 — 먼저 재면 늘 안 넘친다.
    await page.waitForTimeout(1500);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );

    if (!drew) failures.push(`${label} ${screen.name}: 알맹이가 안 그려졌다 (${screen.need})`);
    if (errors.length) failures.push(`${label} ${screen.name}: 스크립트 오류 — ${errors[0]}`);
    // 장식은 화면 밖으로 나가도 되지만 **문서**가 넘치면 손가락으로 옆으로 밀린다.
    if (overflow > 2) failures.push(`${label} ${screen.name}: 옆으로 ${overflow}px 넘침`);
  }

  await context.close();
}

// 서버가 살아 있나 — 못 닿으면 「통과」라고 말하면 안 된다 (KL-098: 게이트는 「못 돌았다」를 말해야 한다).
try {
  const probe = await fetch('https://yawnbot.mascari4615.com/kl/health', { signal: AbortSignal.timeout(6000) });
  if (!probe.ok) notes.push('기록 서버가 이상하다 — 값이 필요한 칸은 못 봤다');
} catch {
  notes.push('기록 서버에 못 닿았다 — 값이 필요한 칸은 못 봤다 (화면이 닫히는 것 자체는 정상)');
}

await check(1280, 900, '[넓은 화면]');
await check(390, 844, '[폰]');
await browser.close();

for (const note of notes) console.log(`[smoke-platform] ⚠ ${note}`);
if (failures.length) {
  for (const line of failures) console.error(`[smoke-platform] ✗ ${line}`);
  console.error(`[smoke-platform] ${failures.length}건 실패`);
  process.exit(1);
}
console.log(`[smoke-platform] 화면 ${SCREENS.length}개 × 넓은 화면·폰 — 전부 그려지고 안 넘친다`);
