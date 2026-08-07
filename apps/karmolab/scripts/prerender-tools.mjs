/**
 * 도구 화면을 **빌드 때 미리 그려서 HTML 에 박는다** (TASK-KL-135)
 *
 * 왜: 지금 도구 상세 화면의 첫 그림은 「HTML → CSS → JS → JS 실행 → 그림」이다. 그때까지
 * 그 자리는 **빈 상자**다(높이만 잡아 둔다 — `#tool-pages{min-height:…}` 가 그 증거다).
 * JS 가 느리거나 못 오면 그동안 아무것도 안 보인다.
 *
 * 무엇을 하나: 위젯을 다시 쓰지 않는다. 위젯은 이미 `tabs[].build(container)` 로 DOM 을 만드는데,
 * 그 함수를 **여기서 한 번 돌려** 나온 DOM 을 그대로 떠서 HTML 에 넣는다. 그러면 첫 그림이
 * HTML 도착 시점으로 당겨진다. 화면이 뜨면 JS 가 평소대로 다시 그린다(같은 내용).
 * 스크립트를 못 쓰는 사람에게도 도구가 **보인다**(누르는 건 안 되지만 읽을 수 있다).
 *
 * 전제: 먼저 `npm run gen:tool-pages` 로 화면이 찍혀 있어야 하고, 그 화면을 실제로 열어 볼
 * 서버가 떠 있어야 한다(`npm run serve:gzip`). 못 열면 **아무것도 안 바꾸고 그냥 넘어간다** —
 * 미리 그리기는 있으면 좋은 것이지, 없다고 배포를 세울 일이 아니다.
 *
 * 사용: node scripts/prerender-tools.mjs [도구id ...]     (없으면 전부)
 *       BASE=http://127.0.0.1:8801/apps/blog node scripts/prerender-tools.mjs loan
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.resolve(root, '../blog/karmolab/t');
const BASE = process.env.BASE || 'http://127.0.0.1:8801/apps/blog';

/**
 * 미리 그리지 않을 도구 — 지금은 없다.
 *
 * (한때 `csvjson` 을 뺐다가 되돌렸다: 그 도구의 행동 검사가 빨간 것은 미리 그리기 탓이 아니라
 *  검사가 옛 화면을 보고 있어서다. 그 도구는 단추를 누르지 않고 **넣는 즉시** 바뀌게 바뀌었는데
 *  검사는 아직 「CSV → JSON」 단추를 찾는다 — 빼 두고 돌려 봐도 똑같이 빨갛다.)
 */
const SKIP_IDS = new Set();

/** 이 자리에 미리 그린 것을 넣는다. 비어 있어야 넣는다(두 번 넣지 않는다). */
const EMPTY = '<div class="content-body" id="tool-pages"></div>';
const MARK = '<!-- KARMOLAB_PRERENDERED -->';

const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = ids.length
  ? ids
  : fs.existsSync(OUT)
    ? fs.readdirSync(OUT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];

if (!targets.length) {
  console.error('[prerender] 찍어 둔 도구 화면이 없다 — 먼저 `npm run gen:tool-pages`');
  process.exit(1);
}

const probe = await fetch(`${BASE}/karmolab/t/`).catch(() => null);
if (!probe?.ok) {
  console.log(`[prerender] 화면을 열 서버가 없다 (${BASE}) — 미리 그리기는 건너뛴다.`);
  process.exit(0);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
let done = 0;
let skipped = 0;

for (const id of targets) {
  if (SKIP_IDS.has(id)) { skipped++; continue; }
  const file = path.join(OUT, id, 'index.html');
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes(MARK)) { skipped++; continue; }      // 이미 박혀 있다
  if (!html.includes(EMPTY)) { skipped++; continue; }     // 넣을 자리가 없다

  const page = await ctx.newPage();
  let markup = '';
  try {
    await page.goto(`${BASE}/karmolab/t/${id}/`, { waitUntil: 'load', timeout: 45000 });
    // 위젯이 제 화면을 만들 때까지 기다린다 — 「자리만 있고 속이 빈」 상태를 뜨면 의미가 없다.
    await page.waitForFunction(
      () => {
        const host = document.getElementById('tool-pages');
        const active = host && host.querySelector('.tool-page.active');
        /* 첫 화면(랜딩)이 떠 있는 것을 도구로 착각하면 **엉뚱한 화면을 박는다** —
           실제로 한 도구가 그렇게 첫 화면 카드들을 품고 나갔다(TASK-KL-135). */
        return !!active && active.id !== 'page-home' && active.textContent.trim().length > 20;
      },
      { timeout: 30000 }
    );
    await page.waitForTimeout(500);
    markup = await page.evaluate(() => {
      const host = document.getElementById('tool-pages');
      const active = host && host.querySelector('.tool-page.active');
      if (!active) return '';
      /* **그 도구 화면 하나만** 뜬다. 담는 상자를 통째로 뜨면 그 안에 있던 첫 화면(랜딩)까지
         같이 박혀, 나중에 앱이 제 것을 또 만들면서 같은 화면이 두 벌이 된다
         (실제로 그래서 도구 하나가 검사에서 걸렸다 — TASK-KL-135). */
      const copy = active.cloneNode(true);
      /* 뜨기 전에 **사람 손이 닿아야 아는 것**은 지운다: 스크립트가 없으면 어차피 안 도는데,
         미리 그린 값이 옛 값으로 남아 오해를 준다. */
      copy.querySelectorAll('[data-count-for]').forEach((el) => { el.textContent = ''; });
      return copy.outerHTML;
    });
  } catch (err) {
    skipped++;
    await page.close();
    continue;
  }
  await page.close();

  if (!markup || markup.length < 200) { skipped++; continue; }

  const filled =
    MARK + '\n<div class="content-body" id="tool-pages">' + markup + '</div>';
  fs.writeFileSync(file, html.replace(EMPTY, filled), 'utf8');
  done++;
}

await browser.close();
console.log(`[prerender] 미리 그려 넣은 화면 ${done}장 · 건너뜀 ${skipped}장`);
