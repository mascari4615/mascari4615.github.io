/**
 * 화면이 **쉬는가 · 만질 때 따라오는가** 를 재는 게이트 (2026-08-08)
 *
 * 왜 생겼나: 하루에 성능 사고가 네 건 나왔다 — 배경 장식 시차(CSS 변수 + calc), 배경 장식의
 * live blur, 채팅 점의 무한 고리, 마스코트 주사선 애니메이션. **전부 같은 실수 한 종류**다:
 * 「`will-change` 를 적었으니 합성기가 맡겠지」라고 **믿고 안 쟀다**. 채팅 코드에는
 * 「이제 주 스레드는 0」이라는 **틀린 확신이 주석으로** 박혀 있었고, 실제로는 손을 안 댄
 * 화면에서 초당 48회 스타일을 다시 계산하고 있었다.
 *
 * 이 저장소에는 게이트가 아주 많다(도구 129장 신선도·부팅 예산·CLS·접근성·타이포·링크…).
 * 그런데 **「가만히 둘 때 얼마나 일하나」와 「만질 때 몇 프레임 나오나」를 재는 자리가 없었다.**
 * 있었으면 네 건 다 들어오는 순간 빨간불이었다. 없으니 사람이 눈으로 발견할 때까지 쌓였다.
 *
 * 무엇을 재나 (전부 **로컬 빌드**, CPU 4배 느리게 — 보통 노트북 정도):
 *   ① 손 안 댐 5초  — 스타일 재계산 /s, 총작업 시간
 *   ② 스크롤        — 프레임 간격 중앙값, 50ms 넘긴 프레임 수
 *   ③ 마우스 이동    — 같은 것 + 그동안 쓴 CPU 시간
 *
 * 예산은 **오늘 고친 뒤 실측값의 1.5~3배**로 잡았다. 기계가 바쁘면 수치가 흔들리므로
 * 빠듯하게 잡으면 애먼 빨간불이 난다. 오늘 잡은 회귀들은 3~6배였으니 이 예산으로 다 걸린다
 * (아래 「이 게이트가 진짜 잡나」 참고 — 옛 코드를 도로 넣어 빨간불을 확인했다).
 *
 * 사용: node scripts/smoke-perf.mjs   (npm run test:perf)
 *       node scripts/smoke-perf.mjs --regress   ← 옛 코드를 흉내 내 **빨간불이 나는지** 확인
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));

/* 볼 대상이 없으면 「못 돌린다」고 말한다 — 없는 것을 두고 「통과」도 「실패」도 거짓말이다. */
if (!fs.existsSync(path.join(root, 'js/toolbox.js'))) {
  console.log('[smoke-perf] 못 돌림 — js/toolbox.js 가 없다 (`node build.mjs` 먼저)');
  process.exit(0);
}

/* 서버는 **공용 한 곳**을 쓴다 (`lib/serve-static.mjs`, TASK-KL-201).
   예전에는 여기에 복사본이 있었고, 그 복사본은 앞머리만 걷고 Liquid 태그는 그대로 내보냈다 —
   화면 맨 위에 조건문이 글자로 떠서 밀림이 실제보다 크게 잡혔다(실측 0.032 ↔ 0.010). */
const { base: BASE, close: closeServer } = await serveRepo();
/* 재는 화면 둘.
 *   ① 앱 첫 화면 — 상주물(마스코트·채팅·배경 장식)이 다 있는 자리
 *   ② 도구 한 장 — **검색으로 들어오는 정문**이자 129장 중 하나. 여기는 여태 아무도 안 쟀다.
 * 도구 장은 배포 때 찍히는 생성물이라 새 체크아웃에는 없을 수 있다 — 없으면 그 화면은 건너뛴다. */
const TARGETS = [['앱 첫 화면', BASE + '/apps/karmolab/index.html', null]];
const toolPage = path.join(repoRoot, 'apps/blog/karmolab/t/loan/index.html');
if (fs.existsSync(toolPage)) TARGETS.push(['도구 한 장(대출)', BASE + '/apps/blog/karmolab/t/loan/index.html', null]);
else console.log('[smoke-perf] 도구 장은 건너뜀 — 찍힌 페이지가 없다 (`npm run gen:tool-pages` 뒤에 다시)');

/** 예산 — 넘으면 빨간불. (오늘 고친 뒤 실측: 스타일 0/s · 스크롤 17ms · 마우스 33ms · 마우스CPU 0.65s) */
/* CI 기계는 여기보다 느리고 들쭉날쭉하다 — 프레임으로 재는 값은 그만큼 헐겁게 잡는다.
   **스타일 재계산/s 는 안 늘린다**: 그건 「매 프레임 일하나」를 세는 것이라 기계 속도와
   거의 무관하다(무한 애니 하나면 60에 가깝고, 없으면 0이다). 오늘 사고 넷 중 셋이 이 지표로 잡힌다. */
const LOOSE = process.env.CI ? 1.6 : 1;
const BUDGET = {
  idleStylePerSec: 12,     // 손 안 댄 화면은 **거의 아무것도 안 해야** 한다 (고친 뒤 0)
  idleTaskSec: 1.2 * LOOSE, // 5초 창 (고친 뒤 0.27~0.57)
  scrollMedianMs: 45 * LOOSE,   // 60fps=17 · 30fps=33 (고친 뒤 17~33, 고치기 전 50)
  scrollJank: 6 * LOOSE,        // 50ms 넘긴 프레임 수 (고친 뒤 0, 고치기 전 10)
  moveMedianMs: 45 * LOOSE,     // (고친 뒤 33, 고치기 전 100)
  moveJank: 6 * LOOSE,          // 50ms 넘긴 프레임 수 (고친 뒤 0, 고치기 전 24)
  /* 마우스 중 CPU 는 **재기만 하고 안 세운다**. 고친 뒤 0.65~0.95, 고치기 전 1.38 —
     구간이 너무 붙어 있어 예산을 걸면 바쁜 기계에서 애먼 빨간불이 난다. 못 미더운 게이트는
     없느니만 못하다(있으면 사람들이 무시하는 법을 배운다). 숫자는 눈으로 보라고 찍는다. */
};

/* 브라우저가 없으면 **「못 돌린다」**고 말하고 비켜 준다 (2026-08-08 실측 사고).
 *
 * 이 검사는 `npm run build` 안에 있어서 **배포 길목**이다. 배포 러너에는 Playwright 브라우저를
 * 안 깔아 두는데, 여기서 그냥 죽는 바람에 **배포가 세 판 연속 빨강**이었다 — 그동안 올린
 * 코드가 사람 화면에 하나도 안 닿았다(조각 다섯이 404). 위쪽 「js 가 없으면 못 돌림」과 같은
 * 규칙이다: 없는 것을 두고 「통과」도 「실패」도 거짓말이고, **막는 자리가 답을 더 나쁘게
 * 만들면 안 된다**. 브라우저가 있는 자리(라이브 점검)에서는 그대로 돈다. */
let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  const why = String(error && error.message ? error.message : error);
  if (/Executable doesn't exist|playwright install/i.test(why)) {
    console.log('[smoke-perf] 못 돌림 — 이 기계에 브라우저가 없다 (`npx playwright install chromium`)');
    process.exit(0);
  }
  throw error;
}

/** 화면 하나를 재고 결과를 돌려준다. */
async function measurePage(url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  /* 배경 도형은 손을 안 대면 4초 뒤부터 잦아든다 — 그 뒤에 재야 「가만히 있을 때」가 된다. */
  await page.waitForTimeout(11000);

  /* 옛 코드를 흉내 낸다 — 이 게이트가 **진짜 잡는지** 확인하는 자리.
     고친 것을 되돌리지 않고, 같은 모양의 비용만 얹는다. */
  if (process.argv.includes('--regress')) {
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.textContent =
        '.klchat-dot.on::after{content:"";position:absolute;inset:0;border-radius:50%;'
        + 'background:rgba(95,211,178,.5);animation:klchat-pulse 2.4s infinite;will-change:transform,opacity;}'
        + '.home-decor-item{filter:blur(14px);}';
      document.head.appendChild(st);
      /* 이 기계에서는 채팅이 서버에 못 붙어 점이 저절로 안 켜진다 — 켜 줘야 고리가 실제로 돈다. */
      document.querySelectorAll('.klchat-dot').forEach((d) => d.classList.add('on'));
    });
    await page.waitForTimeout(1200);
  }

  const metrics = async () =>
    Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

  await page.evaluate(() => {
    window.__f = [];
    window.__on = false;
    let last = performance.now();
    const tick = (t) => { if (window.__on) window.__f.push(Math.round(t - last)); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });

  async function during(action, settleMs) {
    const a = await metrics();
    await page.evaluate(() => { window.__f = []; window.__on = true; });
    await action();
    await page.waitForTimeout(settleMs);
    const frames = await page.evaluate(() => { window.__on = false; return window.__f; });
    const z = await metrics();
    const sorted = [...frames].sort((x, y) => x - y);
    return {
      median: sorted[Math.floor(sorted.length / 2)] || 0,
      jank: frames.filter((x) => x > 50).length,
      task: +((z.TaskDuration || 0) - (a.TaskDuration || 0)).toFixed(3),
      styleCount: (z.RecalcStyleCount || 0) - (a.RecalcStyleCount || 0)
    };
  }

  const idle = await during(async () => {}, 5000);
  const scroll = await during(async () => {
    for (let i = 0; i < 12; i += 1) { await page.mouse.wheel(0, 300); await page.waitForTimeout(110); }
  }, 700);
  const move = await during(async () => {
    for (let i = 0; i < 24; i += 1) { await page.mouse.move(200 + i * 35, 300 + ((i * 53) % 320)); await page.waitForTimeout(40); }
  }, 300);
  await ctx.close();
  return { idle, scroll, move };
}

const over = [];
const check = (got, budget, what) => { if (got > budget) over.push(`${what}: ${got} (예산 ${budget})`); };

for (const [label, url] of TARGETS) {
  const { idle, scroll, move } = await measurePage(url);
  const idleStylePerSec = Math.round(idle.styleCount / 5);
  console.log(`[smoke-perf] ${label}`);
  console.log('  손 안 댐 5초 · 스타일 재계산 ' + idleStylePerSec + '/s · 총작업 ' + idle.task + 's');
  console.log('  스크롤 · 중앙 ' + scroll.median + 'ms · 50ms 넘김 ' + scroll.jank);
  console.log('  마우스 · 중앙 ' + move.median + 'ms · 50ms 넘김 ' + move.jank + ' · 그동안 CPU ' + move.task + 's');
  check(idleStylePerSec, BUDGET.idleStylePerSec, label + ' — 손 안 댄 화면의 스타일 재계산/s');
  check(idle.task, BUDGET.idleTaskSec, label + ' — 손 안 댄 5초 동안 쓴 CPU(초)');
  check(scroll.median, BUDGET.scrollMedianMs, label + ' — 스크롤 프레임 중앙값(ms)');
  check(scroll.jank, BUDGET.scrollJank, label + ' — 스크롤 중 50ms 넘긴 프레임');
  check(move.median, BUDGET.moveMedianMs, label + ' — 마우스 프레임 중앙값(ms)');
  check(move.jank, BUDGET.moveJank, label + ' — 마우스 중 50ms 넘긴 프레임');
}

await browser.close();
closeServer();

if (process.argv.includes('--regress')) {
  /* 자기 시험: 옛 코드를 얹었으면 **반드시** 빨간불이어야 한다. 초록이면 이 게이트가 눈뜬장님이다. */
  if (!over.length) {
    console.error('[smoke-perf] ✗ 자기 시험 실패 — 옛 코드를 얹었는데도 초록이다. 예산이 헐겁다.');
    process.exit(1);
  }
  console.log('[smoke-perf] ✓ 자기 시험 통과 — 옛 코드를 얹으니 걸린다:\n  - ' + over.join('\n  - '));
  process.exit(0);
}

if (over.length) {
  console.error('[smoke-perf] ✗ 예산 초과\n  - ' + over.join('\n  - '));
  console.error('  손 안 댄 화면이 일하거나 만질 때 프레임이 떨어진다. 흔한 원인:');
  console.error('   · transform 을 CSS 변수+calc 로 만들었다 (변수 바뀌면 하위 전체 스타일 재계산 + 합성기가 못 맡는다)');
  console.error('   · 움직이는 요소(또는 그 부모)에 filter/backdrop-filter 를 걸었다 (매 프레임 다시 계산)');
  console.error('   · 무한 애니메이션을 켜 뒀다 (`will-change` 를 적어도 합성기에 올라간다는 보장이 아니다 — 재 봐라)');
  process.exit(1);
}
console.log('[smoke-perf] ✓ 화면이 쉬고, 만지면 따라온다');
