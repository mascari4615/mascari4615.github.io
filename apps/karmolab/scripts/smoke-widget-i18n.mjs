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
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, SOURCE_LOCALE, catalog, localizedPath } from './lib/locales.mjs';

/** 첫 화면에 바로 그려지는 글만 고른다 — 눌러야 나오는 글로 재면 늘 「안 보인다」가 된다. */
const FIRST_SCREEN = ['btn.camera', 'drop', 'status.idle', 'out.label', 'btn.run', 'btn.preview'];

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(appRoot));
const PORT = 8833;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/** 말 묶음이 있는 도구 = 이 검사의 대상. */
const targets = [];
for (const l of LOCALES) {
  if (l.code === SOURCE_LOCALE) continue;
  const dir = path.join(appRoot, 'i18n', l.code);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
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

const browser = await chromium.launch();
const fail = [];

for (const { code, id, page } of targets) {
  const tab = await browser.newPage();
  const rel = path.relative(path.join(appRoot, '..', '..'), page).split(path.sep).join('/');
  await tab.goto(`http://127.0.0.1:${PORT}/${rel}`, { waitUntil: 'domcontentloaded' });

  /* 도구가 제 화면을 그릴 때까지 기다린다 — 미리 그려 둔 그림이 아니라 **스크립트가 그린 것**을
     봐야 한다. 재는 말은 **첫 화면에 바로 나오는 것**으로 고른다: 처음에는 「읽고 나야 나오는 글」로
     쟀다가 늘 「안 보인다」가 나왔다(도구는 멀쩡했다 — 검사가 틀린 것이었다). */
  const mine = catalog(code, id);
  const src = catalog(SOURCE_LOCALE, id);
  const keys = FIRST_SCREEN.map((k) => `${id}.${k}`).filter((k) => mine[k] && src[k]);
  if (!keys.length) {
    await tab.close();
    continue;
  }

  const seen = await tab
    .waitForFunction((needle) => document.body.innerText.includes(needle), mine[keys[0]], { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!seen) fail.push(`${code}/${id}: 도구 화면에 그 언어 글이 안 보인다 (${mine[keys[0]]})`);

  /* **원본 언어 글이 그대로 남았나** — 화면 전체의 한국어를 세면 안 된다. 이 장에는 도구 밖에
     다른 자리(다른 도구 안내 등)가 함께 있고 그건 이 도구의 몫이 아니다. 같은 열쇠의 원본 글이
     보이면 그건 확실히 안 갈린 것이다. */
  const text = await tab.evaluate(() => document.body.innerText || '');
  for (const k of keys) {
    if (text.includes(src[k])) fail.push(`${code}/${id}: 원본 언어 글이 남았다 — ${k} (${src[k]})`);
  }

  await tab.close();
}

await browser.close();
server.close();

if (fail.length) {
  for (const f of fail) console.error('[widget-i18n] ' + f);
  process.exit(1);
}
console.log(`[widget-i18n] 도구 화면 ${targets.length}건 정상 — ${targets.map((t) => `${t.code}/${t.id}`).join(', ')}`);
