#!/usr/bin/env node
/**
 * **앱 안 화면이 실제로 지어지나** (2026-08-14, 실서비스 고장 일곱 건에서 나옴)
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
const 놀이 = (Array.isArray(games) ? games : games.games || []).map((g) => g.id);
/* ★ **놀이만이 아니었다** (2026-08-14, 같은 날 다섯 건 더). 같은 병으로 「반려동물·활동·광장·
   내 정보·상태」가 실서비스에서 죽어 있었다 — 전부 **도구 장이 없는 앱 안 화면**이라
   `test:i18n:runtime`(도구 장만 연다)도 놀이 검사도 안 보던 자리다.
   그래서 대상 = 놀이 ∪ **제 말 묶음을 가진 위젯 전부**. 묶음이 있다는 건 `t()` 를 쓴다는 뜻이고,
   `t()` 를 이르게 부르면 그 화면은 통째로 안 올라간다. */
const 묶음있는위젯 = fs
  .readdirSync(path.join(appRoot, 'i18n/ko'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .filter((id) => fs.existsSync(path.join(appRoot, `src/widgets/${id}.ts`)));
const ids = [...new Set([...놀이, ...묶음있는위젯])];

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
/* 다른 말로 보는 판은 문이 다르다(`/ja/karmolab/`). 통째로 주소를 받는 길을 둔다 —
   `KL_PAGE=https://…/ja/karmolab/ node scripts/smoke-play-i18n.mjs` */
/* 다른 말로 보는 판은 문이 다르다(`/ja/karmolab/`). 통째로 주소를 받는 길을 둔다 —
   `node scripts/smoke-play-i18n.mjs --page https://…/ja/karmolab/` (env `KL_PAGE` 도 된다).
   창 띄우는 명령에 `VAR=값` 을 앞에 붙이는 방식은 윈도우에서 안 통해서 깃발도 같이 둔다. */
const 깃발 = process.argv.indexOf('--page');
const 문 = (깃발 >= 0 ? process.argv[깃발 + 1] : '') || process.env.KL_PAGE || `${base}/apps/karmolab/index.html`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
/* ★ **데스크톱 전용 화면도 본다** (2026-08-14). 브라우저에서는 셸이 그것들을 감춰서
   `switchPage` 가 아무 일도 안 한다 — 그래서 「앱 안 화면이 아님」으로 넘어갔고,
   실제로 그 사이 **알람·Claude 환경**이 죽어 있었다(아무 검사도 안 보던 자리다).
   셸이 보는 표시 하나만 미리 켜 두면 같은 자리에서 같이 잴 수 있다. */
await ctx.addInitScript(() => {
  window.__KARMOLAB_DESKTOP__ = true;
});
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
    /* ★ **판이 뜰 때까지 기다린다 — 정해진 초를 세지 않는다** (2026-08-14).
       2.5초만 세었더니 판이 늦게 뜨는 화면이 판마다 「앱 안 화면이 아님」으로 넘어갔다
       (같은 화면이 어떤 판에서는 재어지고 어떤 판에서는 안 재어졌다). 그러면 **정말 죽은
       화면이 건너뛴 것에 섞여** 조용히 지나갈 수 있다. 못 기다린 것만 넘긴다. */
    await page.waitForSelector('#page-' + id, { timeout: 9000 }).catch(() => null);
    await page.waitForTimeout(1200);
    const 판 = await page.evaluate((x) => {
      const el = document.getElementById('page-' + x);
      /* ★ **건너뛰는 까닭을 갈라 적는다** (2026-08-14). 「판이 안 뜬다」를 한 통에 담으면
         정말 죽은 화면이 「원래 화면이 아닌 것」 틈에 섞여 조용히 지나간다. 셋으로 가른다:
         ① 애초에 위젯이 아닌 이름(말 묶음만 있는 것) ② 숨긴 위젯(다른 화면의 탭으로 합쳐진 것)
         ③ **보이는 위젯인데 안 열린다** — 이건 고장이다. */
      const meta = (window.KARMOLAB_LAZY_META || []).find((m) => m && m.id === x);
      return {
        있나: !!el,
        글: (el?.textContent || '').trim(),
        위젯: !!meta,
        숨김: !!(meta && meta.hidden)
      };
    }, id);
    const 말오류 = 오류.filter((t) => /\[i18n\]|MissingTranslation|CatalogLoad/.test(t));
    if (말오류.length) {
      빨강.push(`${id}: 말 묶음 오류 — ${말오류[0]}`);
    } else if (!판.있나) {
      if (판.위젯 && !판.숨김) {
        /* 목록에 버젓이 있고 숨기지도 않았는데 안 열린다 = 사람이 눌러도 안 열린다. */
        빨강.push(`${id}: 보이는 화면인데 안 열린다 (판이 안 생겼다)`);
      } else {
        /* 앱 안 화면이 아닌 것도 있다(`/daily/` 처럼 제 주소로 사는 것, 다른 화면의 탭으로
           합쳐진 것). 고장이 아니라 **여기서 볼 것이 아니다** — 이름은 적어 둔다. */
        건너뜀.push(`${id}(${판.위젯 ? '숨김' : '위젯 아님'})`);
        process.stdout.write('-');
      }
    } else if (!판.글 || (판.글.length < 60 && /꺼내는 중|불러오는 중|Loading/.test(판.글))) {
      /* 「불러오는 중」이 **화면의 전부**일 때만 멎은 것으로 본다. 다 지어진 화면 안에도
         그런 글자가 한 조각 있을 수 있다 — 서버 모니터가 그랬다(브라우저에서는 제 서버에
         못 닿아 한 칸이 「불러오는 중」이다. 그건 고장이 아니라 그 화면의 정상이다). */
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

if (건너뜀.length) console.log(`[play-i18n] 앱 안 화면이 아니라 건너뛴 것 ${건너뜀.length}개: ${건너뜀.join(', ')}`);
/* 다 건너뛰었으면 본 것이 없다 — 초록으로 적으면 거짓이다. */
if (건너뜀.length === ids.length) {
  console.error('[play-i18n] CANNOT-RUN — 화면을 하나도 못 봤다 (전부 앱 밖 주소였다)');
  process.exit(2);
}

if (빨강.length) {
  console.error(`[play-i18n] 화면 ${ids.length}개 중 ${빨강.length}개가 안 지어진다`);
  빨강.forEach((r) => console.error('  - ' + r));
  process.exit(1);
}
console.log(`[play-i18n] 화면 ${ids.length - 건너뜀.length}개 모두 지어진다 — 말 묶음 오류 0 (건너뜀 ${건너뜀.length})`);
