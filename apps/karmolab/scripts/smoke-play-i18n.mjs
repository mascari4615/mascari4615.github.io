#!/usr/bin/env node
/**
 * **앱 안 화면이 실제로 지어지나** (2026-08-14, 실서비스 고장 일곱 건에서 나옴)
 *
 * 왜 has: 「높은 쪽 고르기」가 실서비스에서 **죽어 있었다** — 열면 「장비 꺼내는 중이에요…」
 * 에서 영영 안 넘어갔다. 까닭은 한 줄이었다: 게임 표를 파일 맨 위에서
 * `title: t('higher.t04')` 로 만들었는데, 그 자리는 **파일이 읽히는 순간**이라 아직
 * `loadNamespace('higher')` 전이다. 되받을 text 없는 `t()` 는 그때 **던진다** — 위젯이 통째로
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
const game = (Array.isArray(games) ? games : games.games || []).map((g) => g.id);
/* ★ **놀이만이 아니었다** (2026-08-14, 같은 날 다섯 건 더). 같은 병으로 「반려동물·활동·광장·
   내 정보·상태」가 실서비스에서 죽어 있었다 — 전부 **도구 장이 없는 앱 안 화면**이라
   `test:i18n:runtime`(도구 장만 연다)도 놀이 검사도 안 보던 자리다.
   그래서 대상 = 놀이 ∪ **제 말 묶음을 가진 widget 전부**. 묶음이 있다는 건 `t()` 를 쓴다는 뜻이고,
   `t()` 를 이르게 부르면 그 화면은 통째로 안 올라간다. */
const widgetsWithBundle = fs
  .readdirSync(path.join(appRoot, 'i18n/ko'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .filter((id) => fs.existsSync(path.join(appRoot, `src/widgets/${id}.ts`)));
const ids = [...new Set([...game, ...widgetsWithBundle])];

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
const flag = process.argv.indexOf('--page');
const gate = (flag >= 0 ? process.argv[flag + 1] : '') || process.env.KL_PAGE || `${base}/apps/karmolab/index.html`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
/* ★ **데스크톱 전용 화면도 본다** (2026-08-14). 브라우저에서는 셸이 그것들을 감춰서
   `switchPage` 가 아무 일도 안 한다 — 그래서 「앱 안 화면이 아님」으로 넘어갔고,
   실제로 그 사이 **알람·Claude 환경**이 죽어 있었다(아무 검사도 안 보던 자리다).
   셸이 보는 표시 하나만 미리 켜 두면 같은 자리에서 같이 잴 수 있다. */
await ctx.addInitScript(() => {
  window.__KARMOLAB_DESKTOP__ = true;
});
const red = [];
const skipped = [];
/* ★ **끝나는 시각을 정해 둔다** (2026-08-14 실측). 화면 57개를 하나씩 여는데 한 장에 40초를
   기다릴 수 있어, 사이트가 느린 판에서는 **50분을 넘긴다** — 실제로 라이브 점검 조각 하나가
   그렇게 멈춰 서서 판정이 아예 안 나왔다(빨강보다 나쁘다: 아무 말도 없다).
   시간이 다 되면 남은 것을 못 잰 것으로 세고 나간다. */
const deadline = Date.now() + Number(process.env.PLAY_I18N_BUDGET_SEC || 600) * 1000;
const couldNotMeasure = [];

/* ★ **한 판씩 여느라 3분을 썼다** (2026-08-19 실측: 이 검사 하나가 게이트 158개 합계
   707초 중 192초 = 27%). 안을 열어 보니 값이 두 군데였다:
     ① 화면마다 **고정 1.2초 잠자기** — 59개면 71초. 이 저장소가 이미 이름 붙여 막는
        패턴이다(`audit:sleep-read` · `settle.mjs 될때까지`). 여기만 빠져 있었다.
        → 「지어졌나」를 **조건으로** 기다린다. 못 기다리면 예전 그 자리(1.5초)에서 멈춘다.
     ② 화면을 **하나씩** 열었다 — 창은 하나뿐인데 코어는 스물넷이다.
        → 몇 장을 동시에 연다. **판정은 안 바꾼다**: 화면마다 제 페이지를 새로 열고
          오류도 그 페이지 것만 담는 것은 그대로다(같이 여는 것뿐이다).
   판정이 한 개라도 달라지면 그건 빨라진 게 아니라 검사를 망가뜨린 것이다. */
const concurrent = Math.max(1, Number(process.env.PLAY_I18N_JOBS || 6));

async function onePage(id) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 120));
  });
  try {
    await page.goto(gate, { waitUntil: 'load', timeout: 25000 });
    await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
    await page.evaluate((x) => Toolbox.switchPage(x), id);
    /* ★ **판이 뜰 때까지 기다린다 — 정해진 초를 세지 않는다** (2026-08-14).
       2.5초만 세었더니 판이 늦게 뜨는 화면이 판마다 「앱 안 화면이 아님」으로 넘어갔다
       (같은 화면이 어떤 판에서는 재어지고 어떤 판에서는 안 재어졌다). 그러면 **정말 죽은
       화면이 건너뛴 것에 섞여** 조용히 지나갈 수 있다. 못 기다린 것만 넘긴다. */
    await page.waitForSelector('#page-' + id, { timeout: 9000 }).catch(() => null);
    /* **다 지어졌나를 묻는다 — 초를 세지 않는다.** 판정이 보는 것은 둘뿐이다:
       판에 글이 찼나 · 셸이 「못 열었어요」로 바꿨나. 둘 중 하나가 되면 더 기다릴 이유가
       없다. 못 기다리는 화면은 예전과 같은 자리(1.5초)에서 멈춘다 — 예전 1.2초보다
       **더 기다리므로** 늦게 뜨는 화면이 빨강으로 뒤집힐 일은 없다. */
    await page
      .waitForFunction(
        (x) => {
          const el = document.getElementById('page-' + x);
          if (document.querySelector('[data-kl-load-failed="' + x + '"]')) return true;
          return !!el && (el.textContent || '').trim() !== '';
        },
        id,
        { timeout: 1500, polling: 50 }
      )
      .catch(() => null);
    const locale = await page.evaluate((x) => {
      const el = document.getElementById('page-' + x);
      /* ★ **건너뛰는 까닭을 갈라 적는다** (2026-08-14). 「판이 안 뜬다」를 한 통에 담으면
         정말 죽은 화면이 「원래 화면이 아닌 것」 틈에 섞여 조용히 지나간다. 셋으로 가른다:
         ① 애초에 위젯이 아닌 이름(말 묶음만 있는 것) ② 숨긴 widget(다른 화면의 탭으로 합쳐진 것)
         ③ **보이는 위젯인데 안 열린다** — 이건 고장이다. */
      const meta = (window.KARMOLAB_LAZY_META || []).find((m) => m && m.id === x);
      /* ★ **글자로 「멎었다」를 판정하지 않는다** (2026-08-14 실측). 「불러오는 중」은 화면마다
         뜻이 다르다 — 남의 서버에서 목록을 받아 오는 화면(만든 도구)은 정상인데도 그 글자가
         남아 있어 거짓 빨강이 났다. 진짜 죽음은 하나뿐이다: **위젯이 끝내 등록 안 됨.**
         셸도 그때 「이 화면을 못 열었어요」로 바꾼다. 그 사실만 본다. */
      const didNotLoad = !!document.querySelector('[data-kl-load-failed="' + x + '"]');
      return {
        has: !!el,
        content: (el?.textContent || '').trim(),
        widget: !!meta,
        hidden: !!(meta && meta.hidden),
        didNotLoad
      };
    }, id);
    const i18nErrors = errors.filter((t) => /\[i18n\]|MissingTranslation|CatalogLoad/.test(t));
    if (i18nErrors.length) {
      red.push(`${id}: 말 묶음 오류 — ${i18nErrors[0]}`);
    } else if (!locale.has) {
      if (locale.widget && !locale.hidden) {
        /* 목록에 버젓이 있고 숨기지도 않았는데 안 열린다 = 사람이 눌러도 안 열린다. */
        red.push(`${id}: 보이는 화면인데 안 열린다 (판이 안 생겼다)`);
      } else {
        /* 앱 안 화면이 아닌 것도 있다(`/daily/` 처럼 제 주소로 사는 것, 다른 화면의 탭으로
           합쳐진 것). 고장이 아니라 **여기서 볼 것이 아니다** — 이름은 적어 둔다. */
        skipped.push(`${id}(${locale.widget ? '숨김' : 'widget 아님'})`);
        process.stdout.write('-');
      }
    /* ⚠ 만드는 쪽은 `content`, 읽는 쪽은 `text` 였다 (2026-08-21 고침). 없는 필드라 늘 참 —
       59개 중 48개가 「화면이 비어 있다」로 빨갰는데 실제로는 멀쩡히 떠 있었다(글 212자 확인).
       한 커밋(`6b1113723`) 안에서 `글` 을 한쪽은 `content`, 다른 쪽은 `text` 로 바꾼 탓이다. */
    } else if (locale.didNotLoad || !locale.content) {
      /* 「불러오는 중」이 **화면의 전부**일 때만 멎은 것으로 본다. 다 지어진 화면 안에도
         그런 글자가 한 조각 있을 수 있다 — 서버 모니터가 그랬다(브라우저에서는 제 서버에
         못 닿아 한 칸이 「불러오는 중」이다. 그건 고장이 아니라 그 화면의 정상이다). */
      red.push(`${id}: 판이 안 지어졌다 — ${locale.didNotLoad ? "셸이 「못 열었어요」로 바꿨다" : "화면이 비어 있다"}`);
    } else {
      process.stdout.write('.');
    }
  } catch (e) {
    red.push(`${id}: 못 열었다 — ${String(e.message).split(String.fromCharCode(10))[0].slice(0, 60)}`);
  }
  await page.close().catch(() => {});
}

/* 몇 장씩 나눠 연다. 시간이 다 되면 남은 것은 **못 잰 것**으로 센다 — 예전 그대로다
   (못 잰 것을 초록으로 세는 것이 이 저장소에서 제일 비싼 고장이다). */
const left = [...ids];
await Promise.all(
  Array.from({ length: Math.min(concurrent, left.length) }, async () => {
    for (;;) {
      const id = left.shift();
      if (id === undefined) return;
      if (Date.now() > deadline) {
        couldNotMeasure.push(id);
        continue;
      }
      await onePage(id);
    }
  })
);
process.stdout.write(String.fromCharCode(10));
await browser.close().catch(() => {});
if (server) server.close();

if (couldNotMeasure.length) {
  console.error(`[play-i18n] 시간이 다 돼 못 잰 화면 ${couldNotMeasure.length}개: ${couldNotMeasure.slice(0, 10).join(', ')}`);
  console.error('  못 잰 것은 초록이 아니다 — 판정하지 않는다 (PLAY_I18N_BUDGET_SEC 로 늘릴 수 있다).');
  if (red.length) {
    console.error(`[play-i18n] 그 전에 잡힌 빨강 ${red.length}개:`);
    red.forEach((r) => console.error('  - ' + r));
    process.exit(1);
  }
  process.exit(2);
}
if (skipped.length) console.log(`[play-i18n] 앱 안 화면이 아니라 건너뛴 것 ${skipped.length}개: ${skipped.join(', ')}`);
/* 다 건너뛰었으면 본 것이 없다 — 초록으로 적으면 거짓이다. */
if (skipped.length === ids.length) {
  console.error('[play-i18n] CANNOT-RUN — 화면을 하나도 못 봤다 (전부 앱 밖 주소였다)');
  process.exit(2);
}

if (red.length) {
  console.error(`[play-i18n] 화면 ${ids.length}개 중 ${red.length}개가 안 지어진다`);
  red.forEach((r) => console.error('  - ' + r));
  process.exit(1);
}
console.log(`[play-i18n] 화면 ${ids.length - skipped.length}개 모두 지어진다 — 말 묶음 오류 0 (건너뜀 ${skipped.length})`);
