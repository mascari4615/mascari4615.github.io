/**
 * 숨은 도구의 **직접 주소**가 그 도구로 가는가 (TASK-KL-273).
 *
 * 도구 예순 남짓은 재료 묶음(PDF·이미지·글·데이터·수·때·영상·소리) 안으로 들어갔지만
 * **자기 주소는 살아 있다**(검색으로 들어오는 길이다 — `/karmolab/t/imgresize/`).
 * 예전에는 묶음이 탭이었고 `switchTab(도구id)` 로 그 탭이 열렸다. 재료 화면을 **한 탭**으로
 * 바꾸면서 그 길이 끊겼다: 열리는 건 묶음의 첫 화면뿐이고, 찾아온 도구는 안 열린다.
 *
 * 여기서 재는 것: 주소로 들어오면 **그 도구가 실제로 화면에 있는가**.
 *
 * 사용: node scripts/smoke-bundle-deeplink.mjs
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

/** [숨은 도구, 그 도구가 열렸다는 표시] — 재료마다 하나씩 */
const CASES = [
  ['imgresize', '#irFile'],
  ['pdfcrop', '#pfHost input[type=file]'],
  /* 글 정리는 **글 작업대의 조작**이 됐다 (2026-08-13). 예전엔 표 변환과 한 묶음이라 그 묶음의
     표시(`#tcIn`)를 봤는데, 이제 `#textclean` 로 들어오면 작업대가 열려야 맞다 —
     사람 북마크가 걸린 자리라 「열리기만 하면 된다」가 아니라 **이 주소가 살아 있나**를 본다. */
  ['textclean', '#pfText'],
  ['jsonfmt', '#pfHost textarea'],
  ['videotrim', '#pfHost input[type=file]'],
  ['audiocut', '#pfHost input[type=file]'],
  ['vat', '#pfHost input, #pfHost select']
];

const browser = await chromium.launch();
for (const [tool, marker] of CASES) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(`${BASE}#${tool}`, { waitUntil: 'domcontentloaded' });
  const found = await page
    .waitForSelector(marker, { timeout: 15000, state: 'attached' })
    .then(() => true)
    .catch(() => false);
  check(found, `「${tool}」 주소로 들어오면 그 도구가 열려야 한다 (표시 ${marker})`);
  await page.close();
}

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-bundle-deeplink] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-bundle-deeplink] 숨은 도구 주소가 전부 그 도구로 간다');
