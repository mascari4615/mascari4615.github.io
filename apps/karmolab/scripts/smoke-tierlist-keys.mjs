/**
 * 티어표를 **자판만으로 옮길 수 있나** (2026-08-17).
 *
 * 왜: 여기는 끌기 말고는 길이 없어서 마우스가 없으면 순위를 아예 못 매겼다(접근성 감사가
 * `dnd.ts` 를 이름으로 짚은 자리). 화살표로 옮기게 만들었는데, 그게 **정말로 옮겨지는지**를
 * 보는 눈이 없으면 표시만 달고 죽은 상태를 아무도 모른다.
 *
 * 재는 것 ① 카드가 초점을 받나 ② → 로 같은 줄에서 자리가 바뀌나 ③ ↓ 로 아래 줄로 가나.
 * 나가는 값: 0 = 통과 / 1 = 빨강 / 2 = 못 돌림(안 구웠거나 브라우저 없음).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripFrontMatter } from './lib/serve-html.mjs';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(appRoot));

if (!fs.existsSync(path.join(appRoot, 'js/widgets/tierlist/tierlist.js'))) {
  console.log('[tierlist-keys] 못 돌림. 아직 안 구웠다 (`node build.mjs` 뒤에 돌려라). 이건 통과가 아니다.');
  process.exit(2);
}
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('[tierlist-keys] 못 돌림. 이 기계에 브라우저가 없다. 이건 통과가 아니다.');
  process.exit(2);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.txt': 'text/plain', '.gif': 'image/gif',
};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(repoRoot, p);
  if (!file.startsWith(repoRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('404'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  if (path.extname(file) === '.html') { res.end(stripFrontMatter(fs.readFileSync(file, 'utf8'))); return; }
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const problems = [];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/apps/karmolab/#tierlist`, { waitUntil: 'networkidle', timeout: 60000 });
  /* ★ **잴 것을 우리가 만든다**. 이 화면은 무슨 표를 매길지를 고르기 전에는 카드가 0장이라,
     그냥 열고 기다리면 판마다 다른 답이 나온다(실측: 한 판은 카드가 있고 한 판은 없었다).
     위젯이 이미 내놓은 제 손잡이로 표 하나와 카드 셋을 만들어 두고 잰다. 흔들리지 않는다. */
  await page.waitForFunction(() => !!(window.Tierlist?.state?.createList && window.Tierlist?.state?.addItem),
    null, { timeout: 30000 });
  await page.evaluate(() => {
    const S = window.Tierlist.state;
    S.createList('자판 시험표', '');
    for (const n of ['가', '나', '다']) S.addItem(n, null);
    return window.Tierlist.render?.renderAll?.(); // 만들었으면 다시 그려야 화면에 나온다
  });
  const card = await page.waitForSelector('#page-tierlist .tl-item[data-item-id]', { timeout: 30000 }).catch(() => null);
  if (!card) {
    console.log('[tierlist-keys] 못 돌림. 표를 만들었는데도 카드가 안 뜬다.');
    await browser.close(); server.close();
    process.exit(2);
  }

  const readLines = () => page.$$eval('#page-tierlist .tl-dropzone:not([data-toc-drop]), #page-tierlist .tl-pool',
    (zs) => zs.map((z) => [...z.querySelectorAll('.tl-item')].map((e) => e.dataset.itemId)));

  const first = await readLines();
  const lineNumber = first.findIndex((z) => z.length >= 2);
  if (lineNumber < 0) {
    console.log('[tierlist-keys] 못 돌림. 카드가 둘 이상 있는 줄이 없다(옮길 것이 없다).');
    await browser.close(); server.close();
    process.exit(2);
  }
  const toMove = first[lineNumber][0];

  await page.click(`.tl-item[data-item-id="${toMove}"]`, { position: { x: 2, y: 2 } }).catch(() => {});
  await page.evaluate((id) => document.querySelector(`.tl-item[data-item-id="${id}"]`).focus(), toMove);
  const caught = await page.evaluate((id) => document.activeElement?.dataset?.itemId === id, toMove);
  if (!caught) problems.push('카드가 초점을 못 받는다. 자판으로는 잡을 수조차 없다');

  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((a) => {
    const z = document.querySelectorAll('#page-tierlist .tl-dropzone:not([data-toc-drop]), #page-tierlist .tl-pool')[a.i];
    return z && [...z.querySelectorAll('.tl-item')][0]?.dataset.itemId !== a.id;
  }, { i: lineNumber, id: toMove }, { timeout: 5000 }).catch(() => problems.push('→ 를 눌러도 같은 줄에서 자리가 안 바뀐다'));

  const horizontal = await readLines();
  await page.evaluate((id) => document.querySelector(`.tl-item[data-item-id="${id}"]`)?.focus(), toMove);
  /* 맨 아래 줄(담아 두는 자리)에 있으면 ↓ 는 갈 데가 없다. 그건 결함이 아니라 끝이다. 그때는 ↑ 로 잰다. */
  const vertical = lineNumber >= first.length - 1;
  await page.keyboard.press(vertical ? 'ArrowUp' : 'ArrowDown');
  await page.waitForFunction((a) => {
    const zs = document.querySelectorAll('#page-tierlist .tl-dropzone:not([data-toc-drop]), #page-tierlist .tl-pool');
    return ![...zs[a.i].querySelectorAll('.tl-item')].some((e) => e.dataset.itemId === a.id);
  }, { i: lineNumber, id: toMove }, { timeout: 5000 }).catch(() => problems.push('↓ 를 눌러도 아래 줄로 안 간다'));

  console.log(`[tierlist-keys] 줄 ${first.length}개, 옮긴 카드 ${toMove}, 문제 ${problems.length}건`);
  void horizontal;
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  for (const m of problems) console.error('  - ' + m);
  console.error('[tierlist-keys] ❌ 자판으로 티어표를 못 옮긴다.');
  process.exit(1);
}
console.log('[tierlist-keys] OK. 화살표만으로 같은 줄, 아래 줄로 옮겨진다.');
