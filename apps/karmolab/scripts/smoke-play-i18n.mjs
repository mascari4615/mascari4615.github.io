#!/usr/bin/env node
/**
 * **놀이 열 개가 실제로 지어지나** (2026-08-14, 실서비스 고장에서 나옴)
 *
 * 왜 있나: 「높은 쪽 고르기」가 실서비스에서 **죽어 있었다** — 열면 「장비 꺼내는 중이에요…」
 * 에서 영영 안 넘어갔다. 까닭은 한 줄이었다: 게임 표를 파일 맨 위에서
 * `title: t('higher.t04')` 로 만들었는데, 그 자리는 **파일이 읽히는 순간**이라 아직
 * `loadNamespace('higher')` 전이다. 되받을 글 없는 `t()` 는 그때 **던진다** — 위젯이 통째로
 * 안 올라가고, 화면에는 오류도 안 뜬다.
 *
 * 왜 기존 검사가 못 잡았나:
 *   · `audit:i18n-load` 는 「그 파일이 `loadNamespace` 를 부르나」만 본다. higher 는 **부른다** —
 *     늦게 부를 뿐이다. 글자만 봐서는 이르고 늦음을 못 가른다.
 *   · `test:i18n:runtime` 은 **도구 장**(`/karmolab/t/<id>/`)이 있는 것만 연다. 놀이는 장이 없다.
 *     그래서 놀이 열 개는 아무 화면 검사도 안 받고 있었다.
 *
 * 그래서 여기서는 **열어 본다**. 판정은 둘:
 *   ① 말 묶음 오류(`[i18n]` · MissingTranslation)가 하나라도 나면 빨강
 *   ② 그 놀이 판에 아직 「꺼내는 중」만 있으면 빨강 (= 지어지다 말았다)
 *
 * [빨강-확인] 2026-08-14 — 고치기 전 빌드로 돌려 `higher: 말 묶음 오류 — [i18n] Missing
 *   translation: ko/higher.t04` 로 빨개지는 것을 봤다. 고친 뒤 열 판 모두 초록.
 *
 * 사용: node scripts/smoke-play-i18n.mjs   (BASE 를 주면 그 사이트를 본다)
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(appRoot));
const games = JSON.parse(fs.readFileSync(path.join(appRoot, '../play/games.json'), 'utf8'));
const ids = (Array.isArray(games) ? games : games.games || []).map((g) => g.id);

if (!ids.length) {
  console.log('[play-i18n] CANNOT-RUN — 놀이 목록(apps/play/games.json)이 비었다');
  process.exit(2);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
let base = process.env.BASE || '';
let server = null;
if (!base) {
  server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(repoRoot, url);
    if (url.endsWith('/')) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return void res.writeHead(404).end('no');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}
const 문 = `${base}/apps/karmolab/index.html`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const 빨강 = [];
const 건너뜀 = [];

for (const id of ids) {
  const page = await ctx.newPage();
  const 오류 = [];
  page.on('pageerror', (e) => 오류.push(String(e.message).slice(0, 120)));
  page.on('console', (m) => {
    if (m.type() === 'error') 오류.push(m.text().slice(0, 120));
  });
  try {
    await page.goto(문, { waitUntil: 'load', timeout: 40000 });
    await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
    await page.evaluate((x) => Toolbox.switchPage(x), id);
    await page.waitForTimeout(2500);
    const 판 = await page.evaluate((x) => {
      const el = document.getElementById('page-' + x);
      return { 있나: !!el, 글: (el?.textContent || '').trim() };
    }, id);
    const 말오류 = 오류.filter((t) => /\[i18n\]|MissingTranslation|CatalogLoad/.test(t));
    if (말오류.length) {
      빨강.push(`${id}: 말 묶음 오류 — ${말오류[0]}`);
    } else if (!판.있나) {
      /* 앱 안 화면이 아닌 놀이도 있다(`/daily/` 처럼 제 주소로 사는 것). 그건 고장이 아니라
         **여기서 볼 것이 아니다** — 다만 조용히 넘기지 않고 이름을 적어 둔다. */
      건너뜀.push(id);
      process.stdout.write('-');
    } else if (!판.글 || /꺼내는 중|불러오는 중|Loading/.test(판.글)) {
      빨강.push(`${id}: 판이 안 지어졌다 — 화면에 「${판.글.slice(0, 24)}」만 있다`);
    } else {
      process.stdout.write('.');
    }
  } catch (e) {
    빨강.push(`${id}: 못 열었다 — ${String(e.message).split(String.fromCharCode(10))[0].slice(0, 60)}`);
  }
  await page.close().catch(() => {});
}
process.stdout.write(String.fromCharCode(10));
await browser.close().catch(() => {});
if (server) server.close();

if (건너뜀.length) console.log(`[play-i18n] 앱 안 화면이 아니라 건너뛴 놀이 ${건너뜀.length}개: ${건너뜀.join(', ')}`);
/* 다 건너뛰었으면 본 것이 없다 — 초록으로 적으면 거짓이다. */
if (건너뜀.length === ids.length) {
  console.error('[play-i18n] CANNOT-RUN — 놀이를 하나도 못 봤다 (전부 앱 밖 주소였다)');
  process.exit(2);
}

if (빨강.length) {
  console.error(`[play-i18n] 놀이 ${ids.length}개 중 ${빨강.length}개가 안 지어진다`);
  빨강.forEach((r) => console.error('  - ' + r));
  process.exit(1);
}
console.log(`[play-i18n] 놀이 ${ids.length - 건너뜀.length}개 모두 지어진다 — 말 묶음 오류 0 (건너뜀 ${건너뜀.length})`);
