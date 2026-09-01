#!/usr/bin/env node
/**
 * 스킨을 바꿔도 **짜임은 같은가** (2026-09-01)
 *
 * 왜 있나. 스킨은 칠만 바꾸기로 한 약속인데, 새 조각을 만들 때 `html[data-skin="field"]` 아래에만
 * 적으면 다른 스킨에서는 그 조각이 통째로 사라진다. 사람 눈에는 "클래식이 덜 만들어졌다"로 보인다.
 * 실제로 그렇게 숨어 있던 것 넷을 이 방법으로 찾았다: 도구 판 머리(번호, 라벨, 자, 별 칩),
 * 재료 도구 판의 번호 머리와 번호 절, 옆줄 줄 번호, 첫 화면 라벨 줄.
 *
 * 재는 것. 화면마다 두 스킨을 열어 **보이는 요소의 이름표 집합**을 견준다.
 *   한쪽에만 있는 이름표가 있으면 빨강. 이름표는 `태그.클래스 둘`까지.
 *   장면(배경 장식)은 스킨의 정체성이라 뺀다. 목록은 `SCENE_ONLY`.
 *
 * 예쁨은 안 본다. 색과 모서리와 그림자는 스킨이 바꾸라고 있는 것이다. 여기는 **있나 없나**만.
 *
 * 사용: node scripts/smoke-skin-parity.mjs [해시...]
 *   끝값 0 같음, 1 한쪽에만 있는 것 있음, 2 못 잼
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripFrontMatter } from './lib/serve-html.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));

if (!fs.existsSync(path.join(root, 'js/toolbox.js'))) {
  console.log('[skin-parity] 못 돌림. 아직 안 구웠다 (`npm run build` 뒤에 돌려라). 이건 통과가 아니다.');
  process.exit(2);
}
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('[skin-parity] 못 돌림. 이 기계에 브라우저가 없다. 이건 통과가 아니다.');
  process.exit(2);
}

/** 스킨마다 다른 것이 맞는 것. 배경 장면과 그 고르개 */
const SCENE_ONLY = [
  'home-decor',
  'settings-bg-picker',
  'bg-swatch',
  'settings-row-stack',
  'kl-cursor',   // 같이 쓰기 커서. 서버에서 늦게 와 판마다 뜨고 안 뜬다
];

/* 볼 화면. 셸의 뼈대가 다 나오는 자리
   `/t/<id>/` 는 앱 셸이 아니라 미리 구운 상세 장이다. 2026-09-01 에 그 머리를 앱 안과
   같은 짜임으로 맞췄으므로 여기서도 지킨다 (한쪽 생성기만 고치면 다시 갈라진다) */
const DEFAULT_SCREENS = ['', '#calc', '#pdf', '#uikit', '#settings', '/apps/blog/t/loan/'];
const screens = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const list = screens.length ? screens : DEFAULT_SCREENS;

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
  const stream = fs.createReadStream(file);
  stream.on('error', () => { try { res.destroy(); } catch { /* 이미 닫힘 */ } });
  stream.pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });

/** 한 화면 한 스킨의 '보이는 이름표' 집합 */
async function labels(skin, hash) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript((s) => {
    try { localStorage.setItem('toolbox_skin', s); localStorage.setItem('toolbox_theme', 'light'); } catch { /* 막힌 판 */ }
  }, skin);
  const url = hash.startsWith('/') ? `${BASE}${hash}` : `${BASE}/apps/karmolab/${hash}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page
    .waitForFunction(() => !!document.querySelector('.tool-page.active') || !!document.querySelector('#page-home'), undefined, { timeout: 25000 })
    .catch(() => null);
  // 재움-의도: 늦게 그려지는 조각(장식, 지연 위젯)이 붙을 틈을 준다. 읽어서 판정하는 값이 아니다
  await page.waitForTimeout(2000);
  const out = await page.evaluate(() => {
    const seen = new Set();
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (el.getClientRects().length === 0) continue;
      /* 장면 안쪽은 통째로 뺀다. 그 안의 조각까지 세면 스킨마다 다른 게 당연하다 */
      if (el.closest('.home-decor, .settings-bg-picker, .kl-cursors')) continue;
      /* SVG 의 className 은 객체다. 속성으로 읽어야 이름이 나온다 */
      const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      seen.add((el.tagName.toLowerCase() + (cls ? '.' + cls : '')).slice(0, 48));
    }
    return [...seen];
  });
  await page.close();
  return new Set(out.filter((k) => !SCENE_ONLY.some((s) => k.includes(s))));
}

const failures = [];
try {
  for (const hash of list) {
    const c = await labels('classic', hash);
    const f = await labels('field', hash);
    const onlyField = [...f].filter((x) => !c.has(x));
    const onlyClassic = [...c].filter((x) => !f.has(x));
    const name = hash || '첫 화면';
    if (onlyField.length) failures.push(`${name}: 필드에만 있다 ${onlyField.slice(0, 6).join(', ')}`);
    if (onlyClassic.length) failures.push(`${name}: 클래식에만 있다 ${onlyClassic.slice(0, 6).join(', ')}`);
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`[skin-parity] **스킨에 따라 사라지는 조각이 있다** ${failures.length}건:`);
  for (const f of failures) console.error('  - ' + f);
  console.error('  짜임은 스킨 밖에 둔다. 칠과 모양만 `html[data-skin="..."]` 아래에 적어라.');
  console.error('  정말 한쪽에만 있어야 하는 장면이면 이 검사의 SCENE_ONLY 에 까닭과 함께 더해라.');
  process.exit(1);
}
console.log(`[skin-parity] OK. 화면 ${list.length}개에서 두 스킨의 보이는 조각이 같다`);
