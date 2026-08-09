/**
 * KarmoMap — 실제로 열리고 그려지는가 (TASK-KL-202)
 *
 * 왜 화면 검사인가: 2026-08-09 에 이 위젯은 **앱에서 열 수조차 없는 상태**로 20 커밋을 받았다.
 * `widgets-lazy-meta.ts` 에 항목이 없어 묶음 자체가 안 만들어졌는데, 타입체크도 묶음 정합 검사도
 * 그동안 전부 초록이었다 — 「없는 것」은 검사할 대상이 없기 때문이다. 그래서 띄워서 만져 본다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-karmomap.mjs
 */
import { chromium } from 'playwright';

const URL = `${process.env.URL || 'http://127.0.0.1:8813/apps/karmolab/index.html'}#karmomap`;
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
// 서비스 워커 404 는 이 검사의 대상이 아니다(개발 서버에는 sw 가 없다).
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (m.text().includes('fetching the script')) return;
  errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
// 저장본이 남아 있으면 결과가 달라진다 — 깨끗한 상태에서 시작.
await page.evaluate(() => { localStorage.clear(); });
await page.reload({ waitUntil: 'domcontentloaded' });

const step = async (name, fn) => {
  try { await fn(); console.log(`  OK   ${name}`); }
  catch (e) { console.log(`  FAIL ${name} — ${e.message.split('\n')[0]}`); errors.push(`${name}: ${e.message.split('\n')[0]}`); }
};

await step('위젯이 뜬다', async () => {
  await page.waitForSelector('.km-root', { timeout: 15000 });
});
await step('툴바 버튼 전부 있다', async () => {
  for (const k of ['maps', 'pack', 'new-kind', 'groups', 'terms', 'undo', 'redo', 'bg', 'fit', 'story', 'png', 'export', 'import', 'clear']) {
    if (await page.locator(`[data-km="${k}"]`).count() === 0) throw new Error(`없음: ${k}`);
  }
});
await step('캔버스가 쓸 만한 크기다', async () => {
  // ★ 자리가 잡힐 때까지 기다린다 — `.km-root` 가 나타난 **직후**에 재면 아직 배치 전이라
  //   117px 같은 값이 나온다(실측 2026-08-09: 같은 코드로 117 과 832 가 번갈아 나왔다).
  await page.waitForFunction(
    () => (document.querySelector('.km-canvas')?.getBoundingClientRect().height ?? 0) >= 320,
    null,
    { timeout: 8000 }
  );
});
await step('빈 곳 더블클릭 → 노드 생김', async () => {
  const box = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(box.x + box.width * 0.3, box.y + box.height * 0.35);
  await page.waitForSelector('.ck-node', { timeout: 4000 });
});
await step('이름 입력이 노드에 반영', async () => {
  await page.fill('[data-km="edit-label"]', '욘');
  await page.waitForFunction(() => document.querySelector('.ck-node text')?.textContent === '욘', null, { timeout: 4000 });
});
await step('두 번째 노드 + 손잡이 드래그로 선 잇기', async () => {
  const box = await page.locator('.km-canvas').boundingBox();
  await page.mouse.dblclick(box.x + box.width * 0.7, box.y + box.height * 0.7);
  await page.fill('[data-km="edit-label"]', '링');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 2, null, { timeout: 4000 });
  const first = page.locator('.ck-node').first();
  await first.hover();
  const h = await first.locator('.ck-link-handle').boundingBox();
  const target = await page.locator('.ck-node').nth(1).boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForSelector('.ck-edge', { timeout: 4000 });
});
await step('선 이름표가 보인다', async () => {
  await page.waitForSelector('.ck-edge-label', { timeout: 4000 });
});
await step('되돌리기 버튼이 살아난다', async () => {
  const disabled = await page.locator('[data-km="undo"]').isDisabled();
  if (disabled) throw new Error('undo 가 여전히 꺼져 있다');
});
await step('배경 무늬 전환', async () => {
  await page.click('[data-km="more"]');
  await page.selectOption('[data-km="bg"]', 'grid');
  const fill = await page.locator('.ck-bg').getAttribute('fill');
  if (!fill?.includes('grid')) throw new Error(`배경이 안 바뀜: ${fill}`);
  // 고르고 나면 서랍은 스스로 닫힌다 — 안 닫히면 그 아래 버튼이 통째로 죽으므로 여기서 못 박는다.
  await page.waitForSelector('[data-km="drawer"].hidden', { state: 'attached', timeout: 4000 });
});
await step('어휘 팩 전환 (관계도)', async () => {
  await page.selectOption('[data-km="pack"]', 'relation');
  const opts = await page.locator('[data-km="new-kind"] option').allTextContents();
  if (!opts.join(' ').includes('인물')) throw new Error(`팩이 안 바뀜: ${opts.join('/')}`);
});
await step('묶음 패널이 열리고 묶음이 생긴다', async () => {
  await page.click('[data-km="groups"]');
  await page.click('[data-km="group-add"]');
  await page.waitForSelector('.ck-group', { timeout: 4000 });
  await page.click('[data-km="group-close"]');
});
await step('내 용어 패널에서 관계 종류 추가', async () => {
  await page.click('[data-km="terms"]');
  await page.click('[data-km="t-add-edge"]');
  await page.waitForSelector('[data-term-edge]', { timeout: 4000 });
  await page.click('[data-km="t-close"]');
});
await step('찾기 → 포커스가 걸린다', async () => {
  // 노드 둘이 서로 이어져 있으므로 「1다리」로 보면 둘 다 포함된다 — 「고른 것만」으로 본다.
  await page.selectOption('[data-km="degree"]', '0');
  await page.fill('[data-km="find"]', '욘');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node.is-dimmed').length > 0, null, { timeout: 4000 });
  await page.fill('[data-km="find"]', '');
  await page.selectOption('[data-km="degree"]', '');
});
await step('발표 모드 진입 / 나가기', async () => {
  await page.click('[data-km="story"]');
  await page.waitForSelector('.km-root.is-presenting', { timeout: 4000 });
  await page.click('[data-km="stage-exit"]');
  if (await page.locator('.km-root.is-presenting').count()) throw new Error('나가기가 안 먹음');
});
await step('맵 새로 만들기 → 빈 캔버스', async () => {
  await page.click('[data-km="map-new"]');
  await page.waitForFunction(() => document.querySelectorAll('.ck-node').length === 0, null, { timeout: 4000 });
});
await step('PNG 내보내기가 파일을 만든다', async () => {
  // 새 맵은 비어 있으니 먼저 맵을 되돌린다.
  const ids = await page.locator('[data-km="maps"] option').evaluateAll((os) => os.map((o) => o.value));
  await page.selectOption('[data-km="maps"]', ids[0]);
  await page.waitForSelector('.ck-node', { timeout: 4000 });
  await page.click('[data-km="more"]');
  await page.waitForSelector('[data-km="drawer"]:not(.hidden)', { state: 'visible', timeout: 4000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.click('[data-km="png"]'),
  ]);
  if (!download.suggestedFilename().endsWith('.png')) throw new Error('png 아님');
});

await browser.close();

console.log(errors.length ? `\nRESULT: FAIL (${errors.length})\n - ` + errors.join('\n - ') : '\nRESULT: PASS — 콘솔 에러 0');
process.exit(errors.length ? 1 : 0);
