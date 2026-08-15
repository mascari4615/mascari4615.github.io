/**
 * 지구본 창문틀 — 제목이 보이는가, 조작부가 머리띠에 가리지 않는가 (TASK-KL-241).
 *
 * 왜 화면 검사인가: 2026-08-12 에 제목이 「안 보인다」는 말을 들었다. 원인은 캔버스에
 * `var(--font-sans)` 를 넣은 것 — **캔버스는 CSS 변수를 못 읽는다**. 글꼴 지정이 통째로
 * 버려져 10px 기본값으로 그려졌는데, 타입체크도 단위검사도 전부 초록이었다. 「그려졌나」가
 * 아니라 **「얼마나 크게 그려졌나」**를 재야 잡히는 종류다.
 *
 * 사용: node scripts/smoke-bluemarble-frame.mjs
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${BASE}#bluemarble`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.bm-canvas', { timeout: 20000 });
// 제목이 다 떠오를 때까지 (1.4초에 걸쳐 나타난다)
await page.waitForTimeout(2400);

/* ① 제목이 실제로 크게 그려졌는가 — 캔버스에서 밝은 점이 걸친 가로 범위를 잰다 */
const title = await page.evaluate(() => {
  const cv = document.querySelector('.bm-canvas');
  const c = cv.getContext('2d', { willReadFrequently: true });
  const h = cv.height;
  const w = cv.width;
  // 제목은 화면 한가운데 가로줄에 있다. 지구도 거기 있으므로 **아주 밝은 점**만 센다.
  const band = c.getImageData(0, Math.round(h / 2) - 2, w, 5).data;
  let min = w;
  let max = 0;
  let lit = 0;
  for (let i = 0; i < band.length; i += 4) {
    const r = band[i];
    const g = band[i + 1];
    const b = band[i + 2];
    if (r > 225 && g > 225 && b > 225) {
      const x = (i / 4) % w;
      if (x < min) min = x;
      if (x > max) max = x;
      lit += 1;
    }
  }
  return { span: max > min ? (max - min) / w : 0, lit, w };
});
if (process.env.DEBUG) console.log('[dbg] 제목:', title);
/* ★ **한글 글꼴은 안 올 수도 있다 — 그건 설계다** (2026-08-14).
   `css/fonts.css` 의 한글 조각은 `font-display: optional` 이다. 첫 화면을 늦추지 않으려고
   「빨리 못 오면 그냥 안 쓴다」로 둔 것이다. 그러면 제목은 **대체 글꼴**로 그려지고 폭이 준다 —
   CI 에서 이 줄이 44% 로 빨갰던 이유다(내 자리는 글꼴이 캐시에 있어 늘 초록이었다).
   화면이 고장 난 게 아니므로, 우리 글꼴이 실제로 쓰였을 때만 폭을 잰다. */
const 우리글꼴 = await page.evaluate(() => document.fonts.check('900 100px KarmoSans', '지구촌'));
if (!우리글꼴) {
  console.log(`  [~] 제목이 화면 폭의 60% 이상에 걸쳐야 한다 — 못 쟀다(한글 글꼴이 이 판에 안 왔다: 지금 ${(title.span * 100).toFixed(0)}%)`);
} else {
  /* ★ **빨갈 때는 「왜」를 같이 낸다** (2026-08-16). 이 줄은 CI 에서만 44% 로 빨갛고 내 자리에서는
     늘 초록이라 몇 달째 원인을 못 짚었다 — 글꼴을 일부러 늦게 줘 재현해 봤더니 오히려 88% 로
     **더 넓게** 나왔다. 즉 여태 적혀 있던 「글꼴이 안 와서 좁아진다」는 설명이 안 맞는다.
     추측으로 고치는 대신, 빨간 판이 **자기가 무엇을 보고 있었는지** 말하게 한다:
     캔버스 실제 크기·픽셀 밀도·글꼴이 정말 실렸는지·재던 띠의 밝은 점 수.
     다음 CI 빨강 한 판이면 갈린다. */
  if (title.span <= 0.6) {
    const 속사정 = await page.evaluate(() => ({
      dpr: window.devicePixelRatio,
      css: (() => {
        const cv = document.querySelector('.bm-canvas');
        const r = cv.getBoundingClientRect();
        return `${Math.round(r.width)}x${Math.round(r.height)}`;
      })(),
      canvas: (() => {
        const cv = document.querySelector('.bm-canvas');
        return `${cv.width}x${cv.height}`;
      })(),
      fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + '/' + f.weight).slice(0, 6),
      제목글꼴: getComputedStyle(document.querySelector('.bm-canvas')).fontFamily,
    }));
    console.log(`  [dbg] 재던 자리: 밝은 점 ${title.lit}개 · 띠 폭 ${title.w}px · ${JSON.stringify(속사정)}`);
  }
  check(title.span > 0.6, `제목이 화면 폭의 60% 이상에 걸쳐야 한다 (지금 ${(title.span * 100).toFixed(0)}%)`);
}
/* 획이 가는 글꼴이라 가운데 한 줄에 걸리는 점은 원래 많지 않다 — 여기서 재는 것은 두께가
   아니라 **정말 칠해졌는가**다. 크기는 위의 `span` 이 지킨다. */
check(title.lit > 60, `제목 글자가 칠해져야 한다 (밝은 점 ${title.lit}개)`);

/* ② 조작부가 머리띠(고정 헤더) 아래에 있는가 */
const headH = await page.evaluate(() => {
  const el = document.querySelector('.header-bar');
  return el ? el.getBoundingClientRect().height : 0;
});
check(headH > 0, '머리띠가 있어야 한다(이 검사의 전제)');
await page.locator('.bm-menu').click({ force: true }); // 조작부 펼치기
await page.waitForTimeout(400);
const covered = await page.evaluate((h) => {
  const sel = ['.bm-menu', '.bm-chips', '.bm-body', '.bm-link', '.bm-card', '.bm-fs', '.bm-day'];
  const bad = [];
  for (const s of sel) {
    for (const el of document.querySelectorAll(s)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.top < h - 1) bad.push(`${s} top=${Math.round(r.top)}`);
    }
  }
  return bad;
}, headH);
check(covered.length === 0, `조작부가 머리띠에 가리면 안 된다: ${covered.join(' · ')}`);

/* ③ 창문이 화면을 정확히 채우는가 — 아래에 빈 칸이 남으면 안 된다 */
const box = await page.evaluate(() => {
  const r = document.querySelector('.bm-wrap').getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight };
});
check(Math.abs(box.top) <= 2, `창문이 화면 맨 위에서 시작해야 한다 (지금 ${box.top}px)`);
check(Math.abs(box.bottom - box.vh) <= 4, `창문 아래에 빈 칸이 없어야 한다 (아래 ${box.vh - box.bottom}px 남음)`);

/* ④ 도구 상세 머리말이 안 붙는가 */
const hero = await page.evaluate(() => ({
  hero: !!document.querySelector('.tool-page.active .tool-page-hero'),
  next: !!document.querySelector('.tool-page.active .tool-page-next')
}));
check(!hero.hero, '지구본에는 제목·방문수 머리말이 붙지 않아야 한다');
check(!hero.next, '지구본에는 「여기도 있어요」가 붙지 않아야 한다');

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-bluemarble-frame] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-bluemarble-frame] 전부 통과');
