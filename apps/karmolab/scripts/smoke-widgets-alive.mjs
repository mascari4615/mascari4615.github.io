/**
 * **도구가 통째로 죽어 있지 않나** (2026-08-17).
 *
 * 왜 생겼나: 지구본에 화면 읽기용 이름을 다는 한 줄을 **말 묶음을 받기 전에** 넣었더니
 * 「그 말이 없다」로 터져 위젯이 통째로 안 떴다 — 그런데 **어떤 검사도 안 빨개졌다.**
 * 빌드 초록 · 타입 초록 · 말 묶음 검사 초록 · 대비 검사 초록. 몇 시간을 죽은 채로 서비스했다.
 * 껍데기는 그 경우 `.karmolab-build-error` 알림을 대신 그려 준다 — 그러니까 **그 알림이 떴나**만
 * 봐도 「이 도구가 안 뜬다」를 잡는다. 아무도 안 보고 있던 가장 큰 구멍이 그것이었다.
 *
 * 재는 것: 도구를 하나씩 열어 ① 못 그렸다는 알림이 떴나 ② 화면이 텅 비었나.
 * 느리다(도구 하나에 1~2초) — 그래서 `--shard i/n` 을 받는다. CI 는 쪼개서 돌린다.
 *
 *
 * [빨강-확인] 2026-08-17: 지구본에 없는 말 열쇠를 일부러 넣고 구워 돌렸더니
 *   「죽은 것 1개 — 번역을 불러오지 못했습니다」로 빨개졌다. 되돌리고 다시 초록인 것도 봤다.
 * 사용: node scripts/smoke-widgets-alive.mjs [id ...] [--shard 1/4]
 * 나가는 값: 0 = 다 살아 있다 / 1 = 죽은 도구가 있다 / 2 = 못 돌림.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { stripFrontMatter } from './lib/serve-html.mjs';
import { 열어볼것 } from './lib/alive-scope.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));

if (!fs.existsSync(path.join(root, 'js/toolbox.js'))) {
  console.log('[widgets-alive] 못 돌림 — 아직 안 구웠다 (`npm run build` 뒤에 돌려라). 이건 통과가 아니다.');
  process.exit(2);
}
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('[widgets-alive] 못 돌림 — 이 기계에 브라우저가 없다. 이건 통과가 아니다.');
  process.exit(2);
}

const argv = process.argv.slice(2);
const 조각 = (() => {
  const i = argv.indexOf('--shard');
  if (i < 0) return null;
  const [a, b] = String(argv[i + 1] || '').split('/').map(Number);
  return a >= 1 && b >= 1 && a <= b ? { of: a,총: b } : null;
})();
const 준이름 = argv.filter((x) => !x.startsWith('--') && x !== (조각 ? `${조각.of}/${조각.총}` : ''));

const lazyMeta = fs.readFileSync(path.join(root, 'src/widgets-lazy-meta.ts'), 'utf8');
// desktopOnly 는 앱에서만 뜬다 — 브라우저에선 홈으로 튕기므로 여기서 재면 거짓 빨강이다.
const 전체 = 준이름.length
  ? 준이름
  : [...lazyMeta.matchAll(/id: '([a-z0-9-]+)'([\s\S]*?)(?=\n {2}\{|\n\];)/g)]
      .filter((m) => !m[2].includes('desktopOnly'))
      .map((m) => m[1]);
if (전체.length < 10 && !준이름.length) {
  console.error(`[widgets-alive] CANNOT-RUN: 도구를 ${전체.length}개만 읽었다 — 매니페스트 모양이 바뀌었는지 볼 것.`);
  process.exit(2);
}
/* ★ **다 열면 8분이다** — 그대로 두면 `npm run build` 가 그만큼 느려진다(배포는 지금 250초).
   그래서 기본값은 **이번에 손댄 도구만** 연다. 무엇을 열지 가르는 셈은 `lib/alive-scope.mjs`
   에 따로 두고 시험을 붙였다 — 그 셈이 틀리면 **죽은 도구를 지나친다**(제일 조용한 고장). */
function 바뀐파일() {
  if (argv.includes('--all')) return null;
  try {
    /* ★ 신호를 **세 곳**에서 모은다 (2026-08-17). CI 는 갓 꺼낸 체크아웃이라 `origin/master...HEAD`
       가 비고, 그것만 보면 「손댄 것 0개」로 읽혀 이 검사가 CI 에서 234개를 매번 다 열거나
       아예 안 돈다. **이 커밋이 무엇을 바꿨나**(HEAD~1..HEAD)가 CI 에서 가장 정직한 신호다. */
    const 갈래 = execFileSync('git', ['diff', '--name-only', 'origin/master...HEAD'], { cwd: repoRoot, encoding: 'utf8' });
    const 이커밋 = execFileSync('git', ['diff', '--name-only', 'HEAD~1', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
    const 작업중 = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
    const 나온것 = (갈래.trim() ? 갈래 : 이커밋) + 작업중;
    return 나온것.split(NL).map((x) => x.trim().replace(/^[A-Z? ]{1,2} /, '')).filter(Boolean);
  } catch {
    return null; // 못 물어봤으면 좁히지 않는다
  }
}
const 좁힌것 = 준이름.length ? null : 열어볼것(바뀐파일());
const 볼것 = 좁힌것 === null ? 전체 : 전체.filter((id) => 좁힌것.includes(id));
if (좁힌것 !== null) console.log(`[widgets-alive] 이번에 손댄 도구만 본다 — ${볼것.length}개 (전부 = --all)`);
const ids = 조각 ? 볼것.filter((_, i) => i % 조각.총 === 조각.of - 1) : 볼것;

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

const 죽음 = [];
const 못잼 = [];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  for (const id of ids) {
    try {
      await page.goto(`${BASE}/apps/karmolab/#${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch {
      못잼.push(`${id}: 화면을 못 열었다`);
      continue;
    }
    /* 그리기는 늦게 끝날 수 있다 — **알림이 뜨거나 뭔가 그려질 때까지** 기다린다.
       재우고 한 번 보면 느린 기계에서 「아직 안 그린 것」을 「죽었다」로 읽는다. */
    const 답 = await page
      .waitForFunction((wid) => {
        /* ★ 도구 이름과 화면 이름이 늘 같지는 않다 — 묶여 있는 도구(`docscan` → `page-image`)가 있다.
           그래서 **지금 보이는 화면**을 본다(2026-08-17: 그걸 몰라 멀쩡한 둘을 「못 쟀다」로 적었다). */
        const box = document.getElementById(`page-${wid}`)
          || [...document.querySelectorAll('[id^="page-"]')].find((e) => getComputedStyle(e).display !== 'none');
        if (!box) return false;
        if (box.querySelector('.karmolab-build-error')) return { 죽음: true, 말: box.querySelector('.karmolab-build-error').textContent.trim().slice(0, 60) };
        return box.textContent.trim().length > 0 || box.querySelector('canvas, input, button, svg') ? { 죽음: false } : false;
      }, id, { timeout: 20000 })
      .then((h) => h.jsonValue())
      .catch(() => null);
    if (!답) { 못잼.push(`${id}: 20초 안에 아무것도 안 그려졌다`); continue; }
    if (답.죽음) 죽음.push(`${id}: ${답.말}`);
  }
} finally {
  await browser.close();
  server.close();
}

const 이름 = 조각 ? `${조각.of}/${조각.총} 조각 ` : '';
console.log(`[widgets-alive] ${이름}도구 ${ids.length}개 · 죽은 것 ${죽음.length}개 · 못 잰 것 ${못잼.length}개`);
for (const m of 못잼) console.log(`  ? ${m}`);
if (죽음.length) {
  console.error('[widgets-alive] ❌ 열었는데 못 그린 도구가 있다 — 화면에 「못 불러왔다」만 뜬다:');
  for (const m of 죽음) console.error('  - ' + m);
  process.exit(1);
}
if (못잼.length === ids.length) {
  console.log('[widgets-alive] 못 돌림 — 하나도 못 쟀다. 이건 통과가 아니다.');
  process.exit(2);
}
console.log('[widgets-alive] OK — 연 도구가 전부 무언가를 그렸다.');
