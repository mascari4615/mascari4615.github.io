/**
 * **첫 화면도 미리 그려서 HTML 에 박는다** (TASK-KL-201 후속)
 *
 * 도구 상세 129장은 이미 그렇게 한다(`prerender-tools.mjs`). 첫 화면만 아직 JS 가 짓는데,
 * 그 때문에 사람이 받는 첫 그림이 늦고 **글이 자리를 잡았다가 밀린다**. 실사이트 실측
 * (2026-08-09): 남은 밀림 0.033 이 전부 이 순간(156ms, 첫 화면이 지어질 때)의 것이었다.
 *
 * ## 살아 있는 칸은 안 박는다
 *
 * 도구 화면과 다른 점이 하나 있다 — 첫 화면에는 **지금 값**이 들어가는 칸이 있다:
 *   · 「오늘의 판」   (`#homeToday`)  — 오늘 것
 *   · 「이만큼 쓰였어요」 (`#homePulse`) — 서버 통계
 *   · 「같이 보는 중」  (`.landing-live`) — 지금 접속자
 * 이걸 빌드 때 값으로 구워 두면 **어제 숫자가 먼저 보였다가 바뀐다** — 없느니만 못하다.
 * 그래서 그 칸들은 **빈 채로, 자리만** 박는다(예약 표를 그대로 달아 둔다). 값은 평소대로
 * 브라우저가 채우고, 자리는 이미 잡혀 있으니 아무것도 안 밀린다.
 *
 * ## 꾸미기(블록 순서)와 어긋나지 않나
 *
 * 안 어긋난다. 꾸미기는 첫 그림 **뒤에** 와서 블록 순서를 바꾼다 — 미리 박은 것이든 JS 가
 * 지은 것이든 그 뒤에 똑같이 재배치된다. 미리 박는 것은 「기본 차림」이고, 그건 지금도
 * `home-page.ts` 가 만드는 바로 그것이다.
 *
 * 전제: `npm run serve:gzip` 가 떠 있어야 한다. 못 열면 **아무것도 안 바꾸고 넘어간다** —
 * 미리 그리기는 있으면 좋은 것이지, 없다고 배포를 세울 일이 아니다.
 *
 * 사용: node scripts/prerender-home.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILE = path.join(root, '../blog/karmolab/index.html');
const BASE = process.env.BASE || 'http://127.0.0.1:8801/apps/blog';
const EMPTY = '<div class="content-body" id="tool-pages"></div>';
const MARK = '<!-- KARMOLAB_HOME_PRERENDERED -->';

/** 지금 값이 들어가는 칸 — 자리만 두고 속은 비운다. */
const LIVE_BLOCKS = ['#homeToday', '#homePulse', '.landing-live', '.landing-pulse'];

if (!fs.existsSync(FILE)) {
  console.log('[prerender-home] 찍힌 첫 화면이 없다 — 건너뜀 (배포가 만들고 나서 돈다)');
  process.exit(0);
}
const html = fs.readFileSync(FILE, 'utf8');
if (html.includes(MARK)) {
  console.log('[prerender-home] 이미 박혀 있다');
  process.exit(0);
}
if (!html.includes(EMPTY)) {
  console.log('[prerender-home] 넣을 자리를 못 찾았다 — 셸 모양이 바뀌었다. 건너뜀');
  process.exit(0);
}

let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  console.log(`[prerender-home] 못 돌림 — 브라우저를 못 띄운다 (${String(err).split('\n')[0].slice(0, 80)})`);
  process.exit(0);
}
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let markup = '';
try {
  await page.goto(`${BASE}/karmolab/`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(
    () => {
      const el = document.getElementById('page-home');
      return !!el && el.textContent.trim().length > 40;
    },
    { timeout: 30000 }
  );
  markup = await page.evaluate((live) => {
    const el = document.getElementById('page-home');
    if (!el) return '';
    const copy = el.cloneNode(true);
    /* **늦은 상태를 박으면 안 된다** (2026-08-10 실사이트 실측).
     *
     * 처음엔 화면이 다 가라앉은 뒤를 떴다. 그런데 브라우저가 나중에 만드는 것은 **이른 상태**라,
     * 갈아 끼우는 순간 둘이 안 맞아 화면이 튀었다(실측 0.033 → 0.044, 되레 나빠졌다):
     *     꾸미기 단추(있음 → 없음) · 블록 순서(꾸미기가 바꾼 순서 → 기본 순서) ·
     *     쓰임 한 줄(23px 채워짐 → 0px)
     * 미리 그리는 것은 **브라우저가 처음 만들 그것과 같아야 한다.** 그래서 나중에 붙는 것은
     * 떼고, 나중에 자리를 잡을 칸에는 예약 표를 직접 달아 둔다. */
    copy.querySelectorAll('.hp-open, .hp-panel').forEach((n) => n.remove());
    /* 지금 값이 들어가는 칸은 **비운다** — 어제 숫자를 먼저 보여 주는 것보다 빈 자리가 낫다.
       예약 표(`data-reserving`)는 남겨 둔다: 그게 곧 「여기 이만큼 온다」는 약속이다. */
    for (const sel of live)
      copy.querySelectorAll(sel).forEach((n) => {
        n.innerHTML = '';
        /* 예약 표를 **직접** 단다 — 브라우저는 물어보기 시작할 때 이걸 단다. 미리 박은 쪽에도
           같이 있어야 자리가 같다(없으면 0px 였다가 23px 로 뛴다). */
        n.setAttribute('data-reserving', '1');
      });
    /* 사람 손이 닿아야 아는 것도 지운다(도구용 미리 그리기와 같은 규칙). */
    copy.querySelectorAll('[data-count-for]').forEach((n) => { n.textContent = ''; });
    return copy.outerHTML;
  }, LIVE_BLOCKS);
} catch (err) {
  console.log(`[prerender-home] 못 그림 — ${String(err?.message || err).split('\n')[0].slice(0, 100)}`);
  await browser.close();
  process.exit(0);
}
await browser.close();

if (!markup || markup.length < 400) {
  console.log(`[prerender-home] 그린 것이 너무 짧다 (${markup.length}자) — 안 박는다`);
  process.exit(0);
}

fs.writeFileSync(
  FILE,
  /* 넣을 글은 **함수로** — 그 안의 `$&`·`$1` 이 치환 패턴으로 읽히면 안 된다
     (자세한 사고 기록은 `prerender-tools.mjs` 의 같은 자리 주석). */
  html.replace(EMPTY, () => MARK + '\n<div class="content-body" id="tool-pages">' + markup + '</div>'),
  'utf8'
);
console.log(`[prerender-home] 첫 화면을 미리 그려 넣었다 (${(markup.length / 1024).toFixed(1)}KB)`);
