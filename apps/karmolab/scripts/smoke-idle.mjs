/**
 * 화면이 **가만히 있을 때 정말로 쉬는가** (TASK-KL-128 ⑯)
 *
 * 왜 있나: 같은 부류의 사고가 이 저장소에서 **두 번** 조용히 지나갔다.
 *  ① 첫 화면 배경 장식 — 무한 애니메이션이 크롬을 초당 96번 그리게 했다. 코어의 42% 를
 *     영구히 썼는데, 페인트·래스터는 0ms 라 「우리 함수가 느린가」로는 절대 안 잡혔다.
 *  ② 마스코트 — 매 프레임 요소 열 개에 transform 을 새로 쓴다. 손을 안 대도 초당 120회
 *     스타일 재계산이 돈다.
 * 둘 다 화면은 멀쩡하고 오류도 0이라 사람 눈으로는 구분이 안 된다. 그래서 기계가 본다.
 *
 * 재는 법: 화면이 다 뜨고 **손을 떼고** 4초. 그동안
 *   - `requestAnimationFrame` 이 몇 번 예약되는지 (매 프레임 도는 루프의 지문)
 *   - 짧은 `setTimeout`(<200ms)·`setInterval` 이 몇 번 걸리는지
 *   - 스타일 재계산이 몇 번 도는지
 * 를 세고, **누가 걸었는지**(파일·함수)까지 같이 낸다 — 숫자만 주면 아무도 못 고친다.
 *
 * 기준: 가만히 있는 화면은 **초당 4회 미만**이어야 한다. 사람이 안 보는 동안 매 프레임
 * 도는 것은 「부드러움」이 아니라 그냥 배터리와 반응성을 태우는 것이다.
 * 계속 움직여야 하는 것(숨쉬기 같은)은 CSS 애니메이션으로 넘겨라 — 그건 합성기가 맡는다.
 *
 * 사용: node scripts/smoke-idle.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/karmolab/' || u === '/karmolab') u = '/apps/karmolab/index.html';
  if (u.startsWith('/karmolab/t/')) u = '/apps/blog' + u;
  if (u.endsWith('/')) u += 'index.html';
  const f = path.join(repoRoot, u.replace(/^\//, ''));
  if (!f.startsWith(repoRoot) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = fs.readFileSync(f);
  const ext = path.extname(f);
  if (ext === '.html') body = Buffer.from(String(body).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''), 'utf8');
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
});
/* 도구 화면은 배포 때 찍는 생성물이라 새 체크아웃·세션 레인에는 없다.
 * 없는 채로 돌리면 404 를 「제품 고장」으로 보고한다 — 검사는 「못 돌린다」를 말할 줄 알아야 한다. */
if (!fs.existsSync(path.join(repoRoot, 'apps/blog/karmolab/t/index.html'))) {
  console.log('[smoke-idle] 건너뜀 — 찍힌 도구 화면이 없다 (`npm run gen:tool-pages` 뒤에 돌려라)');
  process.exit(0);
}

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/** 손을 뗀 채 재는 시간 · 초당 몇 회까지 봐 주나 */
const WATCH_MS = 4000;
const BUDGET_PER_SEC = 4;

const TARGETS = [
  ['첫 화면', `${BASE}/karmolab/`],
  ['도구 목록', `${BASE}/karmolab/t/`],
  ['도구 화면', `${BASE}/karmolab/t/loan/`]
];

const SPY = () => {
  window.__idle = { raf: {}, timer: {}, on: false };
  /* 스택에서 **우리 덫이 만든 줄**은 걷어낸다 — 안 걷으면 「누가 걸었나」 자리에 이 검사
     자신이 찍힌다. 숫자는 맞는데 범인은 영영 안 보인다(실제로 처음에 그랬다). */
  const who = (stack) => (stack || '').split('\n')
    .map((l) => l.replace(/https?:\/\/[^/]+/g, '').replace(/\s+at\s+/g, ' ').trim())
    .filter((l) => l && !l.includes('<anonymous>') && !l.startsWith('Error'))
    .slice(0, 2).join(' ← ') || '(어디인지 못 잡음)';
  const bump = (bag, stack) => { if (window.__idle.on) { const k = who(stack); bag[k] = (bag[k] || 0) + 1; } };
  const R = requestAnimationFrame;
  window.requestAnimationFrame = function (f) { bump(window.__idle.raf, (new Error()).stack); return R.call(window, f); };
  const T = setTimeout;
  window.setTimeout = function (f, d) { if (d < 200) bump(window.__idle.timer, (new Error()).stack); return T.apply(window, arguments); };
  const I = setInterval;
  window.setInterval = function (f, d) { if (d < 200) bump(window.__idle.timer, (new Error()).stack); return I.apply(window, arguments); };
};

const problems = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });

for (const [label, url] of TARGETS) {
  const page = await ctx.newPage();
  await page.addInitScript(SPY);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  /* 넉넉히 기다린다 — **정착하는 동안의 움직임까지 세면 억울한 빨간불**이 난다.
     배경 장식은 손을 떼고 4초 뒤 스르르 서는데, 그 서는 과정도 프레임을 쓴다(정상). */
  await page.waitForTimeout(8000);
  await page.evaluate(() => { window.__idle.on = true; });
  await page.waitForTimeout(WATCH_MS);             // 여기서부터 **손을 안 댄다**
  const seen = await page.evaluate(() => { window.__idle.on = false; return window.__idle; });
  await page.close();

  const total = Object.values(seen.raf).reduce((s, n) => s + n, 0)
    + Object.values(seen.timer).reduce((s, n) => s + n, 0);
  const perSec = total / (WATCH_MS / 1000);
  const worst = [...Object.entries(seen.raf), ...Object.entries(seen.timer)]
    .sort((a, b) => b[1] - a[1]).slice(0, 3);

  console.log(`  ${label.padEnd(8)} 초당 ${perSec.toFixed(1)}회` + (worst.length ? ` — ${worst[0][0].slice(0, 90)}` : ''));
  if (perSec >= BUDGET_PER_SEC) {
    problems.push(
      `${label}: 손을 안 댔는데 초당 ${perSec.toFixed(1)}회 돈다 (기준 ${BUDGET_PER_SEC})\n` +
      worst.map(([k, n]) => `        ${String(n).padStart(4)}회  ${k.slice(0, 120)}`).join('\n')
    );
  }
}

await browser.close();
server.close();

if (problems.length) {
  console.error('[smoke-idle] 쉬지 않는 화면 ' + problems.length + '개');
  problems.forEach((p) => console.error('  - ' + p));
  console.error('  → 계속 움직여야 하는 것이면 CSS 애니메이션으로 넘겨라(합성기가 맡는다).');
  console.error('    상태가 바뀔 때만 움직이면 되는 것이면, 다 가라앉았을 때 루프를 멈춰라.');
  process.exit(1);
}
console.log('[smoke-idle] 세 화면 모두 손을 떼면 쉰다');
