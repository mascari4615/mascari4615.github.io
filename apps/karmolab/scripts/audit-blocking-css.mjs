/**
 * 첫 화면을 막는 스타일 중에 안 쓰는 것이 있는지 (TASK-KL-089)
 *
 * 왜 있나: 코드 색칠 스타일이 도구 125장 전부의 머리에 걸려 있었다. 그런데 색칠을 쓰는
 * 도구 페이지는 **한 장도 없었다**. 브라우저로 재 보니 사용률 0%. 그런 링크는 첫 화면이
 * 나오기 전에 반드시 받아야 하는 자리를 하나씩 차지한다. 눈에 안 보이는 낭비라 아무도 모른다.
 *
 * 보는 것: 도구 페이지 몇 장을 열어, 화면을 막는 스타일마다 실제로 쓰인 비율을 잰다.
 * 하나도 안 쓰이면 빨간불. 안 막게 바꾸거나(생성기에서 media 를 바꾼다) 아예 빼라.
 *
 * 문턱을 0% 로 둔 이유: 도구마다 쓰는 규칙이 달라서 몇 % 이상은 장마다 흔들린다.
 * 단 한 줄도 안 쓴다만 사고로 본다. 흔들리지 않고, 실제로 있었던 사고와 정확히 같다.
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

/* 성격이 다른 장을 고른다. 계산기 / 글 다루기 / 개발자용 / 그림.
 * 한 장만 보면 그 도구가 우연히 쓰는 규칙 때문에 놓친다. */
const SAMPLE = ['loan', 'charcount', 'jsonfmt', 'qrgen'].filter((id) => ids.includes(id));

const browser = await chromium.launch();
const problems = [];
const seen = [];
/* ★ **한 줄도 안 쓰인다만 보면 늘어나는 것을 못 잡는다** (2026-08-17). 실측: 도구 장이
   첫 그림 전에 기다리는 스타일이 163KB 인데 그중 85%가 그 장에서 안 쓰인다(TASK-KL-323).
   그건 0% 짜리 파일이 아니라 **덩치**의 문제라 지금 판정으로는 영영 안 걸린다.
   줄이는 일은 그 TASK 몫이고, 여기서는 **더 늘지 않게** 톱니를 건다. */
const totalBytes = {};
const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_TOTAL = path.join(here, '..', 'data', 'blocking-css-total.json');
const totalBytesBaseline = fs.existsSync(BASELINE_TOTAL) ? JSON.parse(fs.readFileSync(BASELINE_TOTAL, 'utf8')) : { list: {} };

for (const id of SAMPLE) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.coverage.startCSSCoverage();
  await page.goto(`${BASE}/t/${id}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const cov = await page.coverage.stopCSSCoverage();

  /* ★ **브라우저에게 직접 묻는다** (2026-08-17). 여태는 blocks를 우리가 추론했다 . 
     media 값과 표식(`onload` → `data-deferred`)으로. 그 추론이 두 번 거짓 빨강을 냈다
     (표식 글자를 CSP 때문에 걷어냈을 때, 표를 다는 코드가 아직 배포 전이었을 때).
     크롬은 그 답을 이미 갖고 있다: 자원 기록의 `renderBlockingStatus`.
     추론 대신 **잰 값**을 쓴다. 못 주는 브라우저면 옛 추론으로 물러선다(그때만). */
  const measured = await page.evaluate(() =>
    performance.getEntriesByType('resource')
      .filter((e) => typeof e.renderBlockingStatus === 'string')
      .map((e) => ({ url: e.name, blocks: e.renderBlockingStatus })));
  const measuredBlocking = measured.filter((e) => e.blocks === 'blocking').map((e) => e.url);

  /* 옛 추론. 잰 값이 아예 안 나오는 판에서만 쓴다. */
  const inferredBlocking = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="stylesheet"]')]
      .filter((l) => !l.media || l.media === 'all' || l.media === 'screen')
      /* 일부러 미뤄 둔 것은 뺀다. 처음엔 안 막게 걸어 두고 다 받은 뒤에 켜는 방식이라,
       * 이 검사가 볼 때는 이미 켜져 있다.
       * ★ **표식이 바뀌면 이 검사가 거짓 빨강을 낸다** (2026-08-17 실측). 예전 표식은
       * `onload=` 라는 글자였는데, CSP 에 script-src 를 걸려고 그 글자를 전부 걷어냈다.
       * 그러자 미뤄 둔 스타일 넷이 첫 화면을 막는다로 잡혀 라이브 점검 한 조각이 섰다 . 
       * 막지 않는데도. 이제 켜 주는 자리가 `data-deferred` 표를 남긴다(`index.html` 머리).
       * 옛 표식도 같이 본다: 다른 곳에서 아직 그 방식을 쓸 수 있다. */
      .filter((l) => !l.hasAttribute('onload') && !l.hasAttribute('data-deferred'))
      /* 글꼴 정의만 들어 있는 것은 뺀다. 브라우저는 `@font-face` 를 쓰였다로 안 세므로
       * 늘 0% 로 나온다. 그건 안 쓰는 게 아니라 셀 수 없는 것이다.
       * 예전엔 남의 서버에서 오는 것으로 걸렀는데, 글꼴을 우리 서버에서 주기 시작하면서
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

  const blocking = measured.length > 0 ? measuredBlocking : inferredBlocking;
  if (measured.length === 0) console.log('[audit-blocking-css] 이 브라우저가 renderBlockingStatus 를 안 준다. 옛 추론으로 잰다');

  let blockingBytes = 0;
  for (const url of blocking) {
    const e = cov.find((c) => c.url === url);
    if (!e || !e.text.length) continue;
    const used = e.ranges.reduce((s, r) => s + r.end - r.start, 0);
    const name = url.split('/').pop().split('?')[0];
    blockingBytes += e.text.length;
    seen.push(`${id}/${name} ${((used / e.text.length) * 100).toFixed(0)}%`);
    if (used === 0) {
      problems.push(`${id} 페이지. ${name}(${(e.text.length / 1024).toFixed(1)}KB) 이 한 줄도 안 쓰이는데 첫 화면을 막는다`);
    }
  }
  totalBytes[id] = blockingBytes;
  await ctx.close();
}
await browser.close();

if (!seen.length) {
  console.error('[audit-blocking-css] 잰 것이 하나도 없다. 주소가 맞는지, 스타일이 실리는지 보라');
  process.exit(1);
}
/* 톱니. 기준선보다 늘면 빨강(줄면 조이라고 말한다). 늘 초록인 검사는 검사가 아니다. */
const grown = [];
const shrunk = [];
for (const [id, value] of Object.entries(totalBytes)) {
  const before = totalBytesBaseline.list?.[id];
  if (typeof before !== 'number') { grown.push(`${id}. 기준선에 없다(${(value / 1024).toFixed(0)}KB), --bless 로 적어라`); continue; }
  if (value > before + 2048) grown.push(`${id}. 첫 그림에 기다리는 스타일이 ${(before / 1024).toFixed(0)}KB → ${(value / 1024).toFixed(0)}KB 로 늘었다`);
  else if (value < before - 2048) shrunk.push(`${id} ${(before / 1024).toFixed(0)}→${(value / 1024).toFixed(0)}KB`);
}
if (process.argv.includes('--bless')) {
  fs.writeFileSync(BASELINE_TOTAL, JSON.stringify({ note: '도구 장이 첫 그림 전에 기다리는 스타일 바이트. 늘면 빨강 (TASK-KL-323 이 줄인다)', updated: new Date().toISOString().slice(0, 10), list: totalBytes }, null, 2) + String.fromCharCode(10));
  console.log(`[audit-blocking-css] 총량 기준선을 적었다. ${Object.entries(totalBytes).map(([k, v]) => `${k} ${(v / 1024).toFixed(0)}KB`).join(', ')}`);
}
if (shrunk.length) console.log('[audit-blocking-css] 줄었다. ' + shrunk.join(', ') + ', --bless 로 기준선을 조여라');
for (const one of grown) problems.push(one);

if (problems.length) {
  console.error(`[audit-blocking-css] 안 쓰는데 첫 화면을 막는 스타일 ${problems.length}건`);
  problems.forEach((p) => console.error('  - ' + p));
  console.error('  → 생성기에서 media="print" 로 미루거나(필요해지면 켜 준다), 그 장에서 아예 빼라');
  process.exit(1);
}
console.log(`[audit-blocking-css] ${SAMPLE.length}장 × 첫 화면을 막는 스타일. 안 쓰이는 것 0 (${seen.join(', ')})`);
