/**
 * 즐겨찾기 — 도구는 「담아야」 뜬다 (TASK-KL-147)
 *
 * 예전엔 등록된 도구 전부가 첫 화면에 자동으로 부어져 있었다. 이 검사는 **빈 브라우저**에서
 * 시작해 다음 네 가지를 실제로 눌러 확인한다:
 *   ① 처음 = 도구 칸 0개 (사이트 즐겨찾기는 그대로 있다)
 *   ② 「+」 → 도구 갈래에서 하나 담으면 그 자리에 뜬다
 *   ③ 새로고침해도 남아 있다
 *   ④ × 로 빼면 사라진다
 *
 * 사용: node scripts/smoke-favorites.mjs   (다른 데를 재려면 URL=… 로 말해라)
 */
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';

/* ★ **기본 주소가 없는 장이었다** (2026-08-14). 기본이 실서비스
   `https://…/karmolab/t/favorites/` 였는데 그 장은 **애초에 안 찍힌다** — 즐겨찾기는
   `tools-seo.json` 에 없고 갈래도 비어 있어 도구 상세 페이지 대상이 아니다. 실제로 404 다.
   그래서 이 검사는 열리지도 않는 문 앞에서 15초를 기다리다 빨갛게 죽어 있었다 —
   그런데 아무 데도 안 물려 있어서(고아) **몇 달간 아무도 못 봤다**.
   즐겨찾기 화면은 앱 안에서 `#favorites` 로 연다. 그 자리를 재고, 서버는 내가 띄운다
   (사람의 dev 서버를 몰래 쓰지 않는다 — `lib/smoke-base.mjs`). */
const server = process.env.URL ? null : await smokeBase('URL_BASE');
const URL_TARGET = process.env.URL || `${server.base}/apps/karmolab/index.html#favorites`;
const problems = [];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));

const res = await page.goto(URL_TARGET, { waitUntil: 'networkidle', timeout: 30000 });
if (!res || res.status() !== 200) problems.push(`즐겨찾기가 안 열린다 (http ${res && res.status()})`);
await page.waitForSelector('.fav-layout', { timeout: 15000 });

const countTools = () => page.locator('.fav-item[data-tool-id]').count();
const countSites = () => page.locator('.fav-item[target="_blank"]').count();

// ① 빈 브라우저 = 도구 0개
const tools0 = await countTools();
const sites0 = await countSites();
if (tools0 !== 0) problems.push(`아무것도 안 담았는데 도구가 ${tools0}개 떠 있다`);
if (sites0 === 0) problems.push('사이트 즐겨찾기까지 같이 사라졌다');

// ② 담기
await page.click('#fav-add-open');
await page.click('.fav-kind-btn[data-kind="tool"]');
await page.waitForSelector('.fav-tool-row', { timeout: 5000 });
const pickedId = await page.locator('.fav-tool-row').first().getAttribute('data-pick');
await page.locator('.fav-tool-row').first().click();
await page.waitForTimeout(200);
const tools1 = await countTools();
if (tools1 !== 1) problems.push(`도구 하나를 담았는데 화면엔 ${tools1}개다`);
const shown = await page.locator(`.fav-item[data-tool-id="${pickedId}"]`).count();
if (shown !== 1) problems.push(`담은 도구(${pickedId})가 화면에 없다`);

// ③ 새로고침해도 남는가
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.fav-layout', { timeout: 15000 });
const tools2 = await countTools();
if (tools2 !== 1) problems.push(`새로고침하니 담아 둔 도구가 ${tools2}개로 바뀐다`);

// ④ 빼기
await page.locator(`.fav-item-wrap:has(.fav-item[data-tool-id="${pickedId}"]) .fav-remove`).click({ force: true });
await page.waitForTimeout(200);
const tools3 = await countTools();
if (tools3 !== 0) problems.push(`× 를 눌렀는데 도구가 ${tools3}개 남아 있다`);

await browser.close();
if (server) await server.close();

if (problems.length) {
    console.error('[smoke-favorites] 문제 ' + problems.length + '건');
    problems.forEach((p) => console.error('  - ' + p));
    process.exit(1);
}
console.log(`[smoke-favorites] 처음 도구 0개 · 담으면 1개(새로고침 유지) · 빼면 0개 — 사이트 ${sites0}개는 그대로`);
