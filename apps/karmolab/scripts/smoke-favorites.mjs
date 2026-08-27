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
   `https://…/t/favorites/` 였는데 그 장은 **애초에 안 찍힌다** — 즐겨찾기는
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
/* ⚠ <b>여는 길이 바뀌었다</b> (2026-08-21 고침). `177fa8e7a`(KL-327, 스트림덱처럼 보는 길)가
   화면을 새로 짜면서 「담기」 단추(`#fav-add-open`)를 없앴다 — 지금은 <b>빈 칸을 누르면</b>
   그 자리에 담으라고 추가창이 열린다(`[data-add-slot]`). 검사만 옛 단추를 30초 기다리다 죽었다.
   (`#fav-add-btn` 은 추가창 <b>안의 저장 단추</b>라 닫혀 있을 때는 안 보인다 — 그걸로 바꾸면
   「보이지 않음」으로 또 30초를 기다린다. 실제로 한 번 그렇게 헛짚었다.) */
await page.locator('[data-add-slot]').first().click();
await page.waitForSelector('#fav-add-modal.open', { timeout: 5000 });
await page.click('.fav-kind-btn[data-kind="tool"]');
/* ⚠ `.fav-tool-row` 는 <b>도구와 앱이 함께 쓴다</b> (2026-08-21 실측: 215개가 잡히고
   첫 것이 앱 `Discord` 였다). 도구는 `data-pick`, 설치된 앱은 `data-app-pick` 이다.
   좁히지 않으면 앱을 담아 놓고 「도구를 담았는데 화면엔 0개」로 갈린다. */
await page.waitForSelector('.fav-tool-row[data-pick]', { timeout: 5000 });
const pickedId = await page.locator('.fav-tool-row[data-pick]').first().getAttribute('data-pick');
await page.locator('.fav-tool-row[data-pick]').first().click();
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

/* ⑤ **자판으로도 자리가 바뀌는가** (2026-08-21)
 *
 * 끌기는 08-19 에 들어갔는데 자판 길이 없어 `audit:mouse-only` 가 이 파일을 짚었다.
 * ⚠ 그 감사는 **글자만 본다** — 아무 `keydown` 이나 달아도 초록이 된다. 그러니 초록의
 *   뜻을 여기서 만든다: 실제로 눌러서 **자리표가 바뀌는 것**을 본다. 안 그러면 자판 길이
 *   죽어도 감사는 계속 초록이고, 손 못 쓰는 사람에게는 그 기능이 없는 것과 같다. */
await page.evaluate(() => localStorage.setItem('toolbox_fav_layout', 'deck'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.fav-deck-grid', { timeout: 15000 });
const keysNow = () => page.$$eval('.fav-deck-grid .fav-item-wrap', (els) => els.map((e) => e.dataset.key || null));
const before = await keysNow();
const firstKey = before.find(Boolean);
if (!firstKey) problems.push('덱에 자리 잡은 칸이 하나도 없다 — 자판 길을 잴 수가 없다');
else {
    const at = before.indexOf(firstKey);
    await page.locator(`.fav-item-wrap[data-key="${firstKey}"] .fav-key`).focus();
    await page.keyboard.press('Control+ArrowRight');
    await page.waitForTimeout(250);
    const after = await keysNow();
    if (after[at + 1] !== firstKey) {
        problems.push(`Ctrl+→ 를 눌렀는데 칸이 안 옮겨졌다 — ${at}번에 「${before[at]}」, ${at + 1}번에 「${after[at + 1]}」`);
    }
    if (after[at] !== before[at + 1]) problems.push('옆 칸이 빈 자리로 옮겨오지 않았다 — 맞바꿈이 아니라 덮어쓰기다');
    /* 연달아 누르는 것이 이 조작의 전부다 — 한 번 누르고 초점이 날아가면 두 번째가 안 먹는다. */
    const focused = await page.evaluate(() => document.activeElement?.closest('.fav-item-wrap')?.dataset.key || null);
    if (focused !== firstKey) problems.push(`자리를 바꾼 뒤 초점을 잃었다 (지금 「${focused}」) — 연달아 못 누른다`);
}
await page.evaluate(() => localStorage.setItem('toolbox_fav_layout', 'list'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.fav-layout', { timeout: 15000 });

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
