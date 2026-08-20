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

/* ★ **여기서 여는 것은 앱 화면이지 블로그 첫 화면이 아니다** (2026-08-13).
 *
 * 워크플로는 모든 검사에 같은 `BASE`(사이트 뿌리) 하나를 준다. 그런데 이 검사만 주소 뒤에
 * `/karmolab/` 이 붙어야 앱이 열린다 — 그게 없으면 **블로그 첫 화면**이 열리고, 앱 화면 다섯이
 * 전부 「알맹이가 안 그려졌다」로 빨개진다. CI 에서만 나던 그 빨강의 정체가 이것이었다
 * (계측을 붙여 보니 화면에 뜬 글이 「GoatCounter — 쿠키도 배너도 없는…」 블로그 글이었다).
 * 그러니 받은 주소를 그대로 믿지 말고 **앱 자리까지 맞춰 준다**. */
const BASE = (() => {
  const given = process.env.BASE || 'https://blog.mascari4615.com/karmolab/';
  if (/karmolab/.test(given)) return given;
  return given.replace(/\/+$/, '') + '/karmolab/';
})();

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
/** 봇이 안 답해 판정할 수 없던 것 — 빨강도 초록도 아니다(2 로 끝낸다). */
const couldNotMeasure = [];
const notes = [];

async function check(width, height, label) {
  const context = await browser.newContext({ userAgent: HUMAN_UA, viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));

  for (const screen of SCREENS) {
    errors.length = 0;
    /* ★ **안 그려졌을 때 「무엇이 보였는지」를 남긴다** (2026-08-13).
     *   CI 에서 다섯 화면이 **전부** 안 그려졌다고 나오는데 내 자리에서는 같은 실주소가 초록이다.
     *   그러면 「제품이 고장」과 「이 판이 막혔다(429·차단·로그인 요구)」를 가를 수가 없어서
     *   없는 버그를 쫓게 된다. 실패한 판에서만 응답 코드와 화면에 뜬 글을 적어 둔다. */
    const badResponses = [];
    /* ★ **봇이 안 답하면 우리 화면 탓이 아니다** (2026-08-16, 실측). 커뮤니티·광장 알맹이는
       봇(`yawnbot.mascari4615.com`)이 준다. 봇이 잠깐 늦거나 안 뜨면 이 검사는
       「알맹이가 안 그려졌다」로 **빨강**을 냈다 — 내 자리에서는 늘 초록이라 더 헷갈렸다.
       봇이 답을 줬는지를 따로 세어, 안 줬으면 **못 잼**이라고 말한다. */
    let botReply = 0;
    let botLast = '';
    const onResponse = (r) => {
      if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().slice(0, 90)}`);
      if (r.url().includes('yawnbot.mascari4615.com')) {
        botReply += 1;
        botLast = `${r.status()} ${r.url().split('/').slice(-1)[0].slice(0, 40)}`;
      }
    };
    page.on('response', onResponse);
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

    page.off('response', onResponse);
    if (!drew) {
      const seen = await page
        .evaluate(() => ({
          title: document.title,
          text: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
          nodes: document.querySelectorAll('#tool-pages *, main *').length,
        }))
        .catch(() => ({ title: '?', text: '?', nodes: -1 }));
      if (botReply === 0) {
        /* 봇에 한 번도 못 닿았다 — 이 화면의 알맹이는 봇이 준다. 우리 화면을 판정할 수 없다. */
        couldNotMeasure.push(`${label} ${screen.name}: 봇이 한 번도 답을 안 줬다 (알맹이는 봇이 준다) · 마디 ${(await page.evaluate(() => document.querySelectorAll('#tool-pages *, main *').length).catch(() => -1))}개`);
        page.off('response', onResponse);
        continue;
      }
      failures.push(
        `${label} ${screen.name}: 알맹이가 안 그려졌다 (${screen.need})` +
          ` · 봇 응답 ${botReply}건(마지막 ${botLast})` +
          ` · 화면에 뜬 글 「${seen.text}」 · 마디 ${seen.nodes}개` +
          (badResponses.length ? ` · 막힌 응답 ${badResponses.slice(0, 3).join(' / ')}` : ' · 막힌 응답 없음'),
      );
    }
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
/* 봇이 안 답해 못 본 화면이 있으면 **그 사실을 먼저** 적는다. 빨강이 따로 없으면 2(못 잼)로 끝낸다 —
   통과로 세면 「봇이 죽은 날」이 초록으로 남는다(안 본 것을 봤다고 적는 자리다). */
for (const one of couldNotMeasure) console.log(`[smoke-platform] · ${one}`);
if (couldNotMeasure.length && failures.length === 0) {
  console.log(`[smoke-platform] 못 돌림 ${couldNotMeasure.length}건 — 봇이 답을 안 줘 그 화면은 판정 못 했다. 통과로 세지 않는다.`);
  process.exit(2);
}
if (failures.length) {
  for (const line of failures) console.error(`[smoke-platform] ✗ ${line}`);
  console.error(`[smoke-platform] ${failures.length}건 실패`);
  process.exit(1);
}
console.log(`[smoke-platform] 화면 ${SCREENS.length}개 × 넓은 화면·폰 — 전부 그려지고 안 넘친다`);
