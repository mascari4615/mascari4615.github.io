/**
 * 첫 화면을 막는 스타일 중에 안 쓰는 것이 있는지 (TASK-KL-089)
 *
 * 왜 있나: 코드 색칠 스타일이 도구 125장 전부의 머리에 걸려 있었다. 그런데 색칠을 쓰는
 * 도구 페이지는 **한 장도 없었다** — 브라우저로 재 보니 사용률 0%. 그런 링크는 첫 화면이
 * 나오기 전에 반드시 받아야 하는 자리를 하나씩 차지한다. 눈에 안 보이는 낭비라 아무도 모른다.
 *
 * 보는 것: 도구 페이지 몇 장을 열어, 화면을 막는 스타일마다 실제로 쓰인 비율을 잰다.
 * 하나도 안 쓰이면 빨간불 — 안 막게 바꾸거나(생성기에서 media 를 바꾼다) 아예 빼라.
 *
 * 문턱을 0% 로 둔 이유: 도구마다 쓰는 규칙이 달라서 「몇 % 이상」은 장마다 흔들린다.
 * 「단 한 줄도 안 쓴다」만 사고로 본다 — 흔들리지 않고, 실제로 있었던 사고와 정확히 같다.
 *
 * 사용: BASE=... node scripts/audit-blocking-css.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const ids = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools);

/* 성격이 다른 장을 고른다 — 계산기 / 글 다루기 / 개발자용 / 그림.
 * 한 장만 보면 그 도구가 우연히 쓰는 규칙 때문에 놓친다. */
const SAMPLE = ['loan', 'charcount', 'jsonfmt', 'qrgen'].filter((id) => ids.includes(id));

const browser = await chromium.launch();
const problems = [];
const seen = [];

for (const id of SAMPLE) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.coverage.startCSSCoverage();
  await page.goto(`${BASE}/karmolab/t/${id}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const cov = await page.coverage.stopCSSCoverage();

  /* 화면을 막는 것만 본다 — media="print" 로 미뤄 둔 것은 막지 않으므로 대상이 아니다.
   * (남의 서버에서 오는 글꼴 목록도 이미 안 막게 해 뒀다.) */
  const blocking = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="stylesheet"]')]
      .filter((l) => !l.media || l.media === 'all' || l.media === 'screen')
      /* 일부러 미뤄 둔 것은 뺀다 — 처음엔 안 막게 걸어 두고 다 받은 뒤에 켜는 방식이라,
       * 이 검사가 볼 때는 이미 켜져 있다. 그 표식(onload)이 남아 있으면 미뤄 둔 것이다. */
      .filter((l) => !l.hasAttribute('onload'))
      /* 글꼴 정의만 들어 있는 것은 뺀다. 브라우저는 `@font-face` 를 「쓰였다」로 안 세므로
       * 늘 0% 로 나온다 — 그건 안 쓰는 게 아니라 셀 수 없는 것이다.
       * 예전엔 「남의 서버에서 오는 것」으로 걸렀는데, 글꼴을 우리 서버에서 주기 시작하면서
       * (TASK-KL-128) 그 조건이 안 걸려 멀쩡한 것을 사고로 불렀다. 출처가 아니라 **내용**으로 판단한다. */
      .filter((l) => {
        try {
          const rules = [...(l.sheet?.cssRules || [])];
          return rules.length === 0 || !rules.every((r) => r instanceof CSSFontFaceRule);
        } catch {
          return true;   // 못 읽으면(다른 출처) 그대로 본다
        }
      })
      .map((l) => l.href)
  );

  for (const url of blocking) {
    const e = cov.find((c) => c.url === url);
    if (!e || !e.text.length) continue;
    const used = e.ranges.reduce((s, r) => s + r.end - r.start, 0);
    const name = url.split('/').pop().split('?')[0];
    seen.push(`${id}/${name} ${((used / e.text.length) * 100).toFixed(0)}%`);
    if (used === 0) {
      problems.push(`${id} 페이지 — 「${name}」(${(e.text.length / 1024).toFixed(1)}KB) 이 한 줄도 안 쓰이는데 첫 화면을 막는다`);
    }
  }
  await ctx.close();
}
await browser.close();

if (!seen.length) {
  console.error('[audit-blocking-css] 잰 것이 하나도 없다 — 주소가 맞는지, 스타일이 실리는지 보라');
  process.exit(1);
}
if (problems.length) {
  console.error(`[audit-blocking-css] 안 쓰는데 첫 화면을 막는 스타일 ${problems.length}건`);
  problems.forEach((p) => console.error('  - ' + p));
  console.error('  → 생성기에서 media="print" 로 미루거나(필요해지면 켜 준다), 그 장에서 아예 빼라');
  process.exit(1);
}
console.log(`[audit-blocking-css] ${SAMPLE.length}장 × 첫 화면을 막는 스타일 — 안 쓰이는 것 0 (${seen.join(' · ')})`);
