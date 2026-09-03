/**
 * 데이터가 UI 를 정한다를 **실제로** 재 본다 (wm-hub.md §0 마지막 줄).
 *
 * WM 은 개발 중이라 필드, 종류가 주 단위로 바뀐다. 그래서 도감은 이 필드들을 보여라가 아니라
 * 있는 것을 보여라여야 한다. 안 그러면 WM 이 필드를 하나 더할 때마다 웹 코드를 고쳐야 하고,
 * 그 사이 도감은 **조용히 그 필드를 안 보여 준다**(빨간불도 안 뜬다).
 *
 * 재는 법: 도감이 받는 자료(`data/worldbook.json`)를 **가로채** 이 세상에 없던 것을 끼워 넣는다.
 *   ① 처음 보는 **필드**(`발효도`) → 상세에 그 이름과 값이 그대로 나와야 한다
 *   ② 처음 보는 **종류**(`효모`) → 갈래(탭)가 저절로 생겨야 한다
 * 둘 다 코드에 이름이 안 박혀 있다는 뜻이고, 그게 이 규율의 전부다.
 *
 * 그려졌나로는 못 잡는 것이라 화면 글자로 잰다. 묶음이 없으면 **못 돌린다**고 말하고 비킨다
 * (제품 고장과 안 지음을 안 섞는다).
 *
 * 사용: node scripts/smoke-worldbook-unknown.mjs   (npm run test:worldbook:unknown)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchOrSkip } from './lib/browser.mjs';
import { stripJekyll } from './lib/serve-static.mjs';
import { WAIT } from './lib/waits.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(path.join(root, 'js/widgets/wm/wm.js'))) {
  console.log('[smoke-worldbook] 못 돌림. js/widgets/wm/wm.js 가 없다 (`node build.mjs` 먼저)');
  process.exit(0);
}

/** 이 세상에 없던 필드, 종류. 코드에 이름이 박혀 있으면 이 둘은 화면에 못 나온다. */
const newField = '발효도';
const nextValue = '3단계-부글부글';
const newKind = '효모';
const newTitle = '시험용 효모 한 덩이';

const FAKE = {
  generated: '2026-08-14T00:00:00Z',
  counts: { docs: 1, kinds: 1, privateSkipped: 0 },
  kinds: [{ id: newKind, label: newKind, count: 1 }],
  docs: [
    {
      id: 'test-yeast',
      title: newTitle,
      kind: newKind,
      kindLabel: newKind,
      summary: '수집기가 모르는 종류, 필드를 들고 온 문서',
      source: 'memo/wm/design/test-yeast.md',
      body: '# 시험용 효모 한 덩이\n\n본문이다.',
      // 수집기가 늘 채워 주는 칸(빈 배열이라도)은 그대로 흉내 낸다. 화면이 `doc.tags.length` 를
      // 그냥 읽기 때문이다. 여기서 빼면 제품이 틀렸다가 아니라 **가짜 자료가 틀린 것**이 된다.
      tags: [],
      fields: { [newField]: nextValue },
    },
  ],
};

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/' || u === '/') u = '/apps/karmolab/index.html';
  // `/t/<도구>/` 는 배포 때 찍히는 상세 쪽이다. 여기선 껍데기를 그대로 내주면 된다 . 
  // 껍데기가 **주소에서** 어느 도구인지 읽어 그걸 연다(toolbox 의 `pathTool`).
  const toolPath = /^\/t\/([a-z0-9-]+)\/?$/.exec(u);
  if (toolPath) u = '/apps/karmolab/index.html';
  if (u.endsWith('/')) u += 'index.html';
  // 도감 자료만 가짜로 바꿔 준다. 나머지는 진짜 파일을 그대로 문다.
  if (u === '/apps/karmolab/data/worldbook.json') {
    res.writeHead(200, { 'Content-Type': MIME['.json'] }).end(JSON.stringify(FAKE));
    return;
  }
  const f = path.join(repoRoot, u.replace(/^\//, ''));
  if (!f.startsWith(repoRoot) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = fs.readFileSync(f);
  const ext = path.extname(f);
  if (ext === '.html') body = Buffer.from(stripJekyll(String(body)), 'utf8');
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await launchOrSkip('worldbook-unknown');
if (!browser) {
  server.close();
  process.exit(0);
}
const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 }, serviceWorkers: 'block' });
const page = await ctx.newPage();

const problems = [];
try {
  // 도구 주소로 곧장 연다. 첫 화면의 `#wm` 로는 위젯이 안 떴다(2026-08-14 실측: 목록만 나온다).
  /* 진입 = 껍데기가 읽는 `KARMOLAB_ENTRY_TOOL` (도구 상세 쪽이 심는 값과 같은 것).
   * `#wm` 해시로는 첫 화면만 떴고, `/t/wm/` 로 가면 상대 경로가 깨져 빈 쪽이 온다.
   * 배포 쪽이 실제로 쓰는 길을 그대로 흉내 내는 것이 맞다. */
  await page.addInitScript(() => { window.KARMOLAB_ENTRY_TOOL = 'wm'; });
  await page.goto(`${BASE}/apps/karmolab/index.html`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500);
  const text = () => page.evaluate(() => document.body.innerText);
  // 도감은 이 화면의 갈래 하나다. 눌러야 뜬다. 세계 도감 열기 단추 쪽이 확실하다.
  const open = page.getByText('세계 도감 열기').first();
  if (await open.count()) await open.click().catch(() => {});
  else {
    const tab = page.locator('button, a').filter({ hasText: /세계 도감/ }).first();
    if (await tab.count()) await tab.click().catch(() => {});
  }
  // 목록이 그려질 때까지 기다린다. 자료를 받아 그리는 사이가 있다.
  await page.waitForFunction((t) => document.body.innerText.includes(t), newTitle, { timeout: 20000 }).catch(() => {});

  const listText = await text();
  /* 위젯이 아예 안 떴으면 그건 제품이 틀렸다가 아니라 **못 잰 것**이다 (2026-08-14).
   * 지금 이 자리에서 실제로 그랬다. 작은 서버로 껍데기만 띄우면 wm 묶음이 안 붙는다.
   * 그 상태를 빨강으로 찍으면 늑대소년이 되고, 초록으로 찍으면 거짓말이 된다. 그래서 exit 2. */
  if (!listText.includes(newTitle) && !/도감|Witch/.test(listText)) {
    console.error('[smoke-worldbook] CANNOT-RUN: wm 화면이 안 떴다 (화면 글자 ' + listText.length + '자).');
    console.error('[smoke-worldbook]   껍데기만 띄우는 이 작은 서버로는 wm 묶음이 안 붙는 것으로 보인다.');
    console.error('[smoke-worldbook]   → 붙이는 길을 찾기 전까지 이 검사는 `gates` 에 안 건다(초록도 빨강도 거짓이므로).');
    await browser.close();
    server.close();
    process.exit(2);
  }
  if (!listText.includes(newTitle)) problems.push(`처음 보는 종류의 문서가 목록에 없다. ${newTitle}`);
  if (!listText.includes(newKind)) problems.push(`처음 보는 종류 갈래가 안 생겼다. ${newKind}`);

  // 상세로 들어가야 필드가 보인다.
  const card = page.locator(`text=${newTitle}`).first();
  if (await card.count()) {
    await card.click();
    await page.waitForSelector('.wb-detail', { timeout: WAIT }).catch(() => {});
  }
  const detail = await text();
  if (!detail.includes(newField)) problems.push(`처음 보는 필드 이름이 상세에 없다. ${newField}`);
  if (!detail.includes(nextValue)) problems.push(`처음 보는 필드 값이 상세에 없다. ${nextValue}`);
} catch (e) {
  problems.push(`화면을 여는 중 죽었다: ${String(e).split('\n')[0]}`);
}

await browser.close();
server.close();

if (problems.length > 0) {
  console.error('[smoke-worldbook] ❌ 데이터가 UI 를 못 정하고 있다:');
  for (const p of problems) console.error(`    - ${p}`);
  console.error('    → 도감은 필드, 종류 이름을 코드에 박으면 안 된다. `Object.entries(doc.fields)` 처럼');
  console.error('      **있는 것을 그리는** 방식이어야 WM 이 흔들려도 웹이 안 깨진다.');
  process.exit(1);
}
console.log(`[smoke-worldbook] OK. 처음 보는 종류(${newKind})와 필드(${newField})가 코드 수정 없이 그대로 나온다`);
