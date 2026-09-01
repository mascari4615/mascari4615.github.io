/**
 * 도구가 열리기는 하나. 브라우저로 전부 열어 본다 (2026-08-31)
 *
 * 왜 있나. 티어표가 3주 동안 안 열렸는데 아무 검사도 안 걸렸다.
 * 지워진 파일(`from-pack.ts`)을 아직 부르고 있었고, 그 404 하나에 이어 받기가 끊겼다.
 * 같은 날 둘 더 나왔다. 플래너 달력은 아직 안 선 값을 그리는 순간 불러 통째로 안 떴고,
 * 내 정보의 쓰임새 표는 묶음이 아예 안 지어져 404 였다.
 * 셋 다 화면은 멀쩡히 뜨고 그 안만 비어서, 사람이 열어 보기 전에는 아무도 몰랐다.
 *
 * 재는 것 둘. 둘 다 그 도구가 죽었다는 증거다
 *  ① 자바스크립트 오류 (pageerror)
 *  ② 못 받은 `.js` (404, 500). 데이터와 그림은 안 센다. 서버가 없으면 원래 없는 것들이라
 *
 * 예쁨도 동작도 안 본다. 그건 다른 검사 몫. 여기는 **열리나**만
 *
 * 사용: node scripts/smoke-tool-boot.mjs [도구id...]
 *   끝값 0 전부 열림, 1 죽은 도구 있음, 2 못 잼
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripFrontMatter } from './lib/serve-html.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));

if (!fs.existsSync(path.join(root, 'js/toolbox.js'))) {
  console.log('[tool-boot] 못 돌림. 아직 안 구웠다 (`npm run build` 뒤에 돌려라). 이건 통과가 아니다.');
  process.exit(2);
}
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('[tool-boot] 못 돌림. 이 기계에 브라우저가 없다. 이건 통과가 아니다.');
  process.exit(2);
}

/** 메타에 적힌 도구 전부. 손으로 적으면 새 도구가 빠진다 */
function allIds() {
  const src = fs.readFileSync(path.join(root, 'src/widgets-lazy-meta.ts'), 'utf8');
  /* 한 줄로 적힌 것(숨김 도구 스무 개)도 담는다. 줄머리만 보면 그것들이 통째로 빠진다 */
  return [...new Set([...src.matchAll(/(?:^|[{,]\s*)id: '([a-z0-9-]+)'/gm)].map((m) => m[1]))];
}

const given = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const ids = given.length ? given : allIds();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.txt': 'text/plain', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm',
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

const failures = [];
const skipped = [];
let opened = 0;
const browser = await chromium.launch({ headless: true });

/** 한 판씩 여러 개를 동시에. 하나씩 열면 도구 231개에 7분이다 */
/* 판(밝음, 어두움)마다 다른 코드가 도는 위젯이 있다. 두 판 다 연다
   (2026-08-31: 어두운 판만 죽는 자리를 지금은 아무도 안 봤다) */
const THEMES = (process.env.KL_BOOT_THEMES || 'light,dark').split(',');
/* 스킨은 기본값(필드)으로 돈다. 클래식까지 재려면 KL_BOOT_SKIN=classic */

async function openOne(id, theme) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript((v) => {
    try {
      localStorage.setItem('toolbox_theme', v.theme);
      if (v.skin) localStorage.setItem('toolbox_skin', v.skin);
    } catch { /* 저장이 막힌 판 */ }
  }, { theme, skin: process.env.KL_BOOT_SKIN || '' });
  const hits = new Set();
  page.on('pageerror', (e) => hits.add('오류 ' + String(e).split('\n')[0].slice(0, 90)));
  page.on('response', (r) => {
    if (r.status() < 400) return;
    const url = r.url();
    if (!/\.js(\?|$)/.test(url)) return; // 데이터와 그림은 서버 없이도 없다. 그건 이 검사 몫이 아니다
    /* 말 묶음은 뺀다. 통짜 게이트가 도는 동안 `build:i18n` 이 그 폴더를 지웠다 다시 굽는 순간이 있어
       멀쩡한 도구가 열 개씩 빨개졌다 (2026-08-31 실측). 없는 묶음은 `audit:i18n-catalog` 가 따로 본다 */
    if (url.includes('/js/i18n/')) return;
    hits.add('못 받음 ' + url.split('/apps/karmolab/')[1]);
  });
  try {
    await page.goto(`${BASE}/apps/karmolab/#${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const drew = await page
      .waitForFunction(() => !!document.querySelector('.tool-page.active'), undefined, { timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    if (!drew) { skipped.push(`${id}(${theme}): 도구 판이 안 그려졌다`); return; }
    /* 여기 재움은 값을 기다리는 게 아니라 **오류가 날 시간을 준다**. 무엇이 될지가 아니라
       무엇이 깨지나를 보는 자리라 기다릴 상태가 없다. 멎기를 기다리게 해 봤더니 1분 7초가
       2분 52초가 되고 무거운 도구 둘이 시간 초과로 빠졌다 (2026-08-31 실측) */
    // 재움-의도: 오류가 터질 틈을 준다. 읽어서 판정하는 값이 없다
    await page.waitForTimeout(900);
    opened++;
    if (hits.size) failures.push(`${id}(${theme}): ${[...hits].slice(0, 3).join(' | ')}`);
  } catch (err) {
    skipped.push(`${id}(${theme}): 화면을 못 열었다 (${String(err).slice(0, 60)})`);
  } finally {
    await page.close();
  }
}

const LANES = Number(process.env.KL_BOOT_LANES || 6);   // 판 둘을 도니 레인을 늘린다
try {
  const queue = [];
  for (const theme of THEMES) for (const id of ids) queue.push([id, theme]);
  await Promise.all(
    Array.from({ length: LANES }, async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        await openOne(next[0], next[1]);
      }
    })
  );
} finally {
  await browser.close();
  server.close();
}

for (const s of skipped) console.log('  건너뜀 ' + s);
if (failures.length) {
  console.error(`[tool-boot] **안 열리는 도구 ${failures.length}개** (연 것 ${opened}개):`);
  for (const f of failures) console.error('  - ' + f);
  console.error('  부르는 파일이 지어지나(`scripts/entry-points.mjs`), 그리는 순간 부르는 값이 이미 섰나를 본다.');
  process.exit(1);
}
console.log(`[tool-boot] OK. 도구 ${ids.length}개가 ${THEMES.join(', ')} 판에서 오류 없이 열린다 (연 것 ${opened}, 건너뜀 ${skipped.length})`);
