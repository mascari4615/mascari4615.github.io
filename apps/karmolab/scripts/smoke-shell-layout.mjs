/**
 * 도구 화면이 셸 밖으로 삐져나왔나. 브라우저에서 직접 잼
 *
 * 왜 있나. 2026-08-29 셸을 앱 모양으로 교체
 * 왼쪽 목록 224px 상시 노출, 가운데 고정폭 판 제거, 본문이 화면 폭 전부
 * 그때 스터디 맵이 조용히 깨짐. 100vw + 음수 margin 으로 폭을 잡던 도구라
 * 목록 밑 112px, 오른쪽 밖 112px, 가로 스크롤 발생
 * 단위도 smoke 도 전부 초록. 화면 폭을 재는 자리 0
 *
 * 재는 것 둘
 *  ① 문서 가로 스크롤 (scrollWidth > innerWidth). 언제나 빨강
 *  ② 도구 판 조각이 본문 칸 밖으로. 일부러 좌우 여백만큼 넘기는 것은 예외 목록
 *
 * 예쁨은 안 봄. 그건 사람 몫. 여기는 넘침만
 *
 * 사용: node scripts/smoke-shell-layout.mjs [도구id...] [--all]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripFrontMatter } from './lib/serve-html.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));

if (!fs.existsSync(path.join(root, 'js/toolbox.js'))) {
  console.log('[shell-layout] 못 돌림. 아직 안 구웠다 (`npm run build` 뒤에 돌려라). 이건 통과가 아니다.');
  process.exit(2);
}
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('[shell-layout] 못 돌림. 이 기계에 브라우저가 없다. 이건 통과가 아니다.');
  process.exit(2);
}

/* 갈래마다 하나씩 + 짜임이 특이한 것. 전부 열면 8분이라 대표만
   새 짜임을 만들면 여기 한 줄 추가 */
const DEFAULT_IDS = [
  'devtool', 'text', 'image', 'pdf', 'sound', 'videotool', 'qr',
  'calc', 'time', 'color', 'unitconv', 'passgen',
  'studymap', 'reference', 'emoji',
  'randomgen', 'worldcup', 'tierlist', 'arcade', 'memo', 'checklist',
];
const argv = process.argv.slice(2);
const given = argv.filter((x) => !x.startsWith('--'));
const ids = given.length ? given : DEFAULT_IDS;

/* 좌우 여백만큼 일부러 넘기는 도구. 본문 칸 밖이지만 화면 안
   여기 적을 때는 왜 넘기는지도 같이 */
const BLEED_OK = new Set([
  'studymap', // 지도 화면이 본문 여백을 지우고 칸을 꽉 채움
]);

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
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  for (const id of ids) {
    try {
      await page.goto(`${BASE}/apps/karmolab/#${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch {
      skipped.push(`${id}: 화면을 못 열었다`);
      continue;
    }
    /* 그리기가 끝날 때까지 대기. 재우고 한 번만 보면 느린 기계에서 안 그린 것을 잼 */
    const drew = await page
      .waitForFunction(() => !!document.querySelector('.tool-page.active'), undefined, { timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    if (!drew) { skipped.push(`${id}: 도구 판이 안 그려졌다`); continue; }
    await page.waitForTimeout(900);

    const seen = await page.evaluate(() => {
      const page2 = document.querySelector('.tool-page.active');
      const main = document.querySelector('.main-content');
      if (!page2 || !main) return null;
      const mainBox = main.getBoundingClientRect();
      /* 자기 칸 안에서 가로로 도는 넓은 표는 밖으로 나간 게 아니다 (때 도구의 24칸 줄, 2026-09-03).
         조상 중 overflow-x 가 auto 나 scroll 이고 그 조상 자체는 본문 안이면 봐준다 */
      const scrollsInside = (e) => {
        for (let a = e.parentElement; a && a !== page2; a = a.parentElement) {
          const o = getComputedStyle(a).overflowX;
          if (o !== 'auto' && o !== 'scroll') continue;
          const ar = a.getBoundingClientRect();
          if (ar.right <= mainBox.right + 1 && ar.left >= mainBox.left - 1) return true;
        }
        return false;
      };
      const out = [...page2.querySelectorAll('*')].filter((e) => {
        const cs = getComputedStyle(e);
        if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = e.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        if (!(r.right > mainBox.right + 1 || r.left < mainBox.left - 1)) return false;
        return !scrollsInside(e);
      });
      return {
        hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
        outside: out.length,
        sample: out.slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`),
      };
    });
    if (!seen) { skipped.push(`${id}: 셸을 못 찾았다`); continue; }

    if (seen.hscroll) failures.push(`${id}: 가로 스크롤이 났다. 무엇인가 화면보다 넓다`);
    if (seen.outside > 0 && !BLEED_OK.has(id)) {
      failures.push(`${id}: 조각 ${seen.outside}개가 본문 칸 밖으로 나갔다 (${seen.sample.join(' ')})`);
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (skipped.length) {
  console.log(`[shell-layout] 못 잰 도구 ${skipped.length}개 (통과도 실패도 아니다)`);
  skipped.forEach((x) => console.log('  , ' + x));
}
if (failures.length) {
  console.error(`[shell-layout] 넘친 도구 ${failures.length}개`);
  failures.forEach((x) => console.error('  - ' + x));
  process.exit(1);
}
console.log(`[shell-layout] OK. 도구 ${ids.length - skipped.length}개, 화면 밖으로 나간 조각 0`);
