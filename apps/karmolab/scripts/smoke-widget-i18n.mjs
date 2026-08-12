/**
 * 도구 **자기 화면**이 그 언어로 그려지는가 (TASK-KL-203 S9)
 *
 * 지금까지의 번역은 전부 **찍을 때** 일어났다 — 제목·설명·머리띠는 HTML 에 박혀 나간다.
 * 그런데 도구의 화면은 스크립트가 그린다. 그래서 영어 장을 열어도 **도구 안쪽만 한국어**로
 * 남을 수 있고, 그건 겉을 아무리 옮겨도 안 없어진다. 한국어를 읽는 사람 눈에는 안 보이는
 * 종류라 여기서 직접 열어 본다.
 *
 * 보는 것: 그 언어의 도구 장을 열고, 도구가 다 그려진 뒤 화면에 **그 언어 글이 있고 한국어가
 * 없는가**. 말 묶음이 있는 도구(`i18n/<언어>/<도구>.json`)만 돈다 — 아직 안 옮긴 도구를
 * 여기서 세우면 「언젠가 다 옮기기 전까지 계속 빨강」이 되고, 그건 꺼지는 검사다.
 *
 * 사용: node scripts/smoke-widget-i18n.mjs
 */
import { launchOrSkip } from './lib/browser.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, SOURCE_LOCALE, catalog, localizedPath } from './lib/locales.mjs';

/** 첫 화면에 바로 그려지는 글만 고른다 — 눌러야 나오는 글로 재면 늘 「안 보인다」가 된다. */
const FIRST_SCREEN = [
  'btn.camera',
  'drop',
  'status.idle',
  'out.label',
  'btn.run',
  'btn.preview',
  'search',
  'baseCity',
  'mode.random',
  'btn.make',
  'label.value',
  'cat.length'
];

/** 한국어가 **내용 자체**인 도구 — 여기서 한글이 보이는 건 정상이다. */
const HANGUL_OK = new Set(['hangulkey', 'jamo', 'numword', 'morse', 'bizno']);

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(appRoot));
const PORT = 8833;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/** 말 묶음이 있는 도구 = 이 검사의 대상. */
const targets = [];
const knownKeys = new Set();
for (const l of LOCALES) {
  const dir = path.join(appRoot, 'i18n', l.code);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.json')) {
      const values = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      Object.keys(values).forEach((key) => knownKeys.add(key));
    }
    if (l.code === SOURCE_LOCALE) continue;
    const id = f.replace(/\.json$/, '');
    /* 도구 묶음만 — 공용 묶음(site·shell…)은 도구가 아니다. 판별 = 그 이름의 도구 장이 있는가. */
    const page = path.join(appRoot, '../blog', localizedPath(`/karmolab/t/${id}/`, l.code).replace(/^\//, ''), 'index.html');
    if (fs.existsSync(page)) targets.push({ code: l.code, id, page });
  }
}

if (!targets.length) {
  console.log('[widget-i18n] 대상 없음 (도구 말 묶음이 아직 없거나 장이 안 찍혔다) — 건너뜀');
  process.exit(0);
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(repoRoot, url);
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('no');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const browser = await launchOrSkip('widget-i18n');
if (!browser) process.exit(0);
const fail = [];

for (const { code, id, page } of targets) {
  /* **한국 밖에서 보는 사람**으로 열어 본다 (TASK-KL-203 S10). 지역을 안 정하면 이 기계의
     시간대(서울)를 따라 KR 이 되고, 그러면 한국 전용 칸(평당 가격 등)이 켜져 「한국어가 남았다」로
     잡힌다 — 그건 맞는 동작이다. 이 검사가 보려는 것은 **어디서나 나오는 화면**이다. */
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('karmolab_region', 'XX');
    } catch {
      /* 저장을 막아 둔 환경 */
    }
  });
  const tab = await ctx.newPage();
  const runtimeI18nErrors = [];
  tab.on('console', (message) => {
    const text = message.text();
    if (text.includes('[i18n]') && /없는 열쇠|Missing translation|Failed to load catalog/.test(text)) {
      runtimeI18nErrors.push(text);
    }
  });
  /* ★ **이 도구의 말**만 센다 (2026-08-12).
   *   화면에는 셸 위젯(대화 등)도 같이 실려 제 말 묶음을 받아 온다. 검사가 이 도구의 글을 다 재고
   *   창을 닫으면 그 요청이 취소되고, 취소는 `CatalogLoadError` 로 올라온다 — 도구도 묶음도
   *   멀쩡한데 「en/chat 을 못 받았다」로 빨개졌다(실측: 도구 여럿이 같은 이유로 줄줄이).
   *   열쇠가 없는 것(MissingTranslation)은 어느 묶음이든 진짜 고장이라 그대로 센다.
   *   묶음 받기 실패는 **재는 도구의 묶음일 때만** 센다. */
  tab.on('pageerror', (error) => {
    const text = String(error?.message || error);
    if (!/MissingTranslationError|CatalogLoadError|\[i18n\]/.test(text)) return;
    const catalogFail = /Failed to load catalog: [^/]+\/([\w-]+)/.exec(text);
    if (catalogFail && catalogFail[1] !== id) return;
    runtimeI18nErrors.push(text);
  });
  const rel = path.relative(path.join(appRoot, '..', '..'), page).split(path.sep).join('/');
  await tab.goto(`http://127.0.0.1:${PORT}/${rel}`, { waitUntil: 'domcontentloaded' });

  /* 도구가 제 화면을 그릴 때까지 기다린다 — 미리 그려 둔 그림이 아니라 **스크립트가 그린 것**을
     봐야 한다. 재는 말은 **첫 화면에 바로 나오는 것**으로 고른다: 처음에는 「읽고 나야 나오는 글」로
     쟀다가 늘 「안 보인다」가 나왔다(도구는 멀쩡했다 — 검사가 틀린 것이었다). */
  const mine = catalog(code, id);
  const src = catalog(SOURCE_LOCALE, id);
  const keys = FIRST_SCREEN.map((k) => `${id}.${k}`).filter((k) => mine[k] && src[k]);
  if (!keys.length) {
    await ctx.close();
    continue;
  }

  /* 있는가 = **마크업**으로 본다. 자리표시(placeholder)·읽어 주는 이름(aria-label)처럼 글자로
     안 보이는 자리도 사람이 쓰는 말이다 — 글자만 보면 그 자리는 영영 안 잡힌다(실측: 세계시계의
     찾기 칸이 그래서 「안 보인다」로 나왔다. 도구는 멀쩡했다). */
  const seen = await tab
    .waitForFunction((needle) => document.body.innerHTML.includes(needle), mine[keys[0]], { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!seen) fail.push(`${code}/${id}: 도구 화면에 그 언어 글이 안 보인다 (${mine[keys[0]]})`);

  /* 남았는가 = **도구가 그린 자리 안**에서만 본다. 장에는 도구 밖 조각(미리 그려 둔 뼈대·다른 도구
     안내)이 함께 있고 그건 이 도구의 몫이 아니다 — 거기까지 세면 늘 빨갛고, 그러면 검사가 꺼진다. */
  const live = await tab.evaluate(() => {
    const host = document.querySelector('#tool-pages');
    if (!host) return '';
    const copy = host.cloneNode(true);
    copy.querySelectorAll('script,style').forEach((n) => n.remove());
    return copy.innerHTML;
  });
  for (const k of keys) {
    if (live.includes(src[k])) fail.push(`${code}/${id}: 원본 언어 글이 남았다 — ${k} (${src[k]})`);
  }

  /* **열쇠로 아는 글만 보면 새로 박힌 한국어는 못 잡는다.**
     실측(2026-08-09): 다른 작업이 알맹이 리팩터를 하며 글자수 세기에 「텍스트 입력」·「붙여넣기」·
     「지우기」를 도로 박았고, 그 셋은 말 묶음에 없는 낱말이라 이 검사를 그대로 통과해
     **영어 화면에 한국어 단추 셋이 나가고 있었다**. 운으로 발견했다.
     → 이미 옮긴 도구에서는 **그린 자리 안의 한글을 통째로** 본다. */
  const leakedKeys = await tab.evaluate((keysToCheck) => {
    const visible = [
      document.body?.innerText || '',
      ...[...document.querySelectorAll('body *')]
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden' &&
            (element.offsetParent !== null || style.position === 'fixed');
        })
        .flatMap((element) => [
          element.getAttribute('title') || '',
          element.getAttribute('aria-label') || '',
          element.getAttribute('placeholder') || '',
          element.getAttribute('value') || ''
        ])
    ].join('\n');
    return keysToCheck.filter((key) => visible.includes(key)).slice(0, 8);
  }, [...knownKeys]);
  if (leakedKeys.length) {
    fail.push(`${code}/${id}: translation key exposed: ${leakedKeys.join(', ')}`);
  }

  if (runtimeI18nErrors.length) {
    fail.push(`${code}/${id}: runtime i18n error: ${[...new Set(runtimeI18nErrors)].slice(0, 4).join(' | ')}`);
  }

  if (!HANGUL_OK.has(id)) {
    const strayText = await tab.evaluate(() => {
      const host = document.querySelector('#tool-pages');
      if (!host) return '';
      /* **안 보이는 자리는 빼고 본다** — 지역 때문에 숨긴 칸(평당 가격 등)은 화면에 없는데
         글자만 DOM 에 남아 있어서, 그대로 읽으면 「한국어가 남았다」로 잡힌다(실측). */
      host.querySelectorAll('*').forEach((el) => {
        if (el instanceof HTMLElement && el.offsetParent === null && getComputedStyle(el).position !== 'fixed') {
          el.setAttribute('data-smoke-hidden', '1');
        }
      });
      const copy = host.cloneNode(true);
      copy.querySelectorAll('[data-smoke-hidden]').forEach((n) => n.remove());
      /* 도구 **자기 화면**만 본다 — 아래 「여기도 있어요」 묶음은 *다른 도구들의* 이름·설명이라
         아직 안 옮긴 도구가 하나라도 있으면 늘 걸린다. 그건 이 도구의 잘못이 아니다. */
      copy.querySelectorAll('script,style,textarea,input,.tool-page-next').forEach((n) => n.remove());
      return copy.textContent || '';
    });
    const stray = [...new Set((strayText.match(/[가-힣][가-힣\s]{0,20}/g) || []).map((v) => v.trim()))].filter(Boolean);
    if (stray.length) {
      fail.push(`${code}/${id}: 옮긴 도구인데 화면에 한국어가 남았다 — ${stray.slice(0, 4).join(' / ')}`);
    }
  }

  await ctx.close();
}

await browser.close();
server.close();

/* ★ **막는 것은 원본 언어(한국어)뿐이다** (2026-08-12, 사용자 결정).
 *   화면은 한국어로 먼저 만든다 — 다른 언어는 따라오는 것이라, 번역이 덜 됐다고 배포를 세우면
 *   고친 한국어 화면이 사람에게 안 나간다. 다른 언어 문제는 **적어서 보여 주되 막지 않는다**. */
const blocking = fail.filter((f) => String(f).startsWith(SOURCE_LOCALE + '/'));
const warnOnly = fail.filter((f) => !String(f).startsWith(SOURCE_LOCALE + '/'));
for (const f of warnOnly) console.log('[widget-i18n] 경고(막지 않음) — ' + f);
if (blocking.length) {
  for (const f of blocking) console.error('[widget-i18n] ' + f);
  process.exit(1);
}
console.log(`[widget-i18n] 도구 화면 ${targets.length}건 정상 — ${targets.map((t) => `${t.code}/${t.id}`).join(', ')}`);
