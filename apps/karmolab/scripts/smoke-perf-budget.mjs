/**
 * 성능 예산 게이트 (TASK-KL-201 ⑨).
 *
 * 왜 있나: 계기판(`#perf`)은 **사람이 열 때만** 답한다. 그러면 느려진 것을 누가 열어 볼 때까지
 * 아무도 모른다 — 여태 성능 회귀 네 건이 그렇게 쌓였다(`smoke-perf.mjs` 머리말). 계기판이
 * 이미 「예산 안쪽인가」를 답할 수 있으니, 그 답을 사람 대신 물어보는 자리가 이 파일이다.
 *
 * **예산은 여기 안 적는다.** 정본은 `src/perf.ts` 의 `BUDGETS` 한 곳이고, 이 게이트는 앱을
 * 띄워 그 답(`KLPerf.snapshot().verdict`)을 받아 적기만 한다. 두 벌로 적으면 반드시 갈라진다.
 *
 * **못 잰 것은 통과로 안 센다.** 「합격」과 「검사 못 함」을 같은 칸에 넣으면 계측이 조용히 죽은
 * 날에도 초록이 뜬다. 못 잰 항목은 따로 세어 목록으로 남긴다.
 *
 * **기다리지 않고 일으킨다.** 조작 지연(INP)은 아무도 안 만지면 영영 「못 잼」이다 — 게이트가
 * 직접 눌러서 그 사건을 만든다. 안 그러면 그 예산은 있으나 마나다.
 *
 * 사용: node scripts/smoke-perf-budget.mjs        (npm run test:perf:budget)
 *       node scripts/smoke-perf-budget.mjs --regress   ← 예산을 일부러 조여 **빨간불이 나는지** 확인
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const REGRESS = process.argv.includes('--regress');

/* 볼 대상이 없으면 「못 돌린다」고 말한다 — 없는 것을 두고 「통과」도 「실패」도 거짓말이다. */
if (!fs.existsSync(path.join(root, 'js/perf.js')) || !fs.existsSync(path.join(root, 'js/toolbox.js'))) {
  console.log('[perf-budget] 못 돌림 — js/perf.js 또는 js/toolbox.js 가 없다 (`node build.mjs` 먼저)');
  process.exit(0);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u.endsWith('/')) u += 'index.html';
  const f = path.join(repoRoot, u.replace(/^\//, ''));
  if (!f.startsWith(repoRoot) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = fs.readFileSync(f);
  const ext = path.extname(f);
  // Jekyll 앞머리는 정적 서빙에서 글자로 떠 화면을 어긋나게 한다 — 빼고 준다.
  if (ext === '.html') body = Buffer.from(String(body).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''), 'utf8');
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* 재는 화면 **둘**.
 *   ① 앱 첫 화면
 *   ② 도구 한 장 — **검색으로 들어오는 정문**이다(131장). 셸이 다르다: 첫 화면 본문·팔레트·계정을
 *      빼고 찍는다. 그래서 첫 화면만 재면 사람 대부분이 실제로 밟는 길을 안 재는 것이 된다.
 * 도구 장은 배포 때 찍히는 생성물이라 새 체크아웃에는 없을 수 있다 — 없으면 건너뛴다고 말한다. */
const TARGETS = [['앱 첫 화면', '/apps/karmolab/index.html']];
const toolPage = path.join(repoRoot, 'apps/blog/karmolab/t/loan/index.html');
if (fs.existsSync(toolPage)) TARGETS.push(['도구 한 장(대출)', '/apps/blog/karmolab/t/loan/index.html']);
else console.log('[perf-budget] 도구 장은 건너뜀 — 찍힌 페이지가 없다 (`npm run gen:tool-pages` 뒤에 다시)');

const browser = await chromium.launch();

/** 화면 하나를 열고 조작을 일으킨 뒤 판정을 받아 온다. 계측기가 없으면 `null`. */
async function measure(url) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + url, { waitUntil: 'load' });
  const hasPerf = await page
    .waitForFunction(() => !!window.KLPerf && typeof Toolbox !== 'undefined', null, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (!hasPerf) {
    await page.close();
    return null;
  }
  /* 첫 그림·큰 그림이 정해질 틈. 너무 일찍 재면 「아직 안 나온 것」을 「없다」로 적는다. */
  await page.waitForTimeout(2500);
  /* 조작 지연은 **일으켜야** 잡힌다 — 기다리면 영영 「못 잼」이다.
     진짜 단추를 누른다(빈 곳을 누르면 핸들러가 없어 「우리 코드가 느린가」를 못 본다). */
  const clickable = await page.$$('.landing-cta, .tool-card, .hp-open, header button, nav button, .tab-btn');
  for (const target of clickable.slice(0, 4)) {
    await target.click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(600);
  const snap = await page.evaluate(() => {
    const s = window.KLPerf.snapshot();
    return { verdict: s.verdict, trust: s.trust };
  });
  await page.close();
  return { ...snap, errors };
}

const fmt = (v) => {
  if (v.value == null) return '못 잼';
  if (v.unit === 'B') return `${(v.value / 1024).toFixed(0)}KB`;
  if (v.unit === 'ms') return `${Math.round(v.value)}ms`;
  return v.value.toFixed(3);
};
const limitOf = (v) => (v.unit === 'B' ? `${(v.limit / 1024).toFixed(0)}KB` : v.unit === 'ms' ? `${v.limit}ms` : String(v.limit));

/* 되돌아온 답에 「빨간불이 나긴 하는지」를 확인하는 모드.
   새 검사는 **실제로 잡는다는 증거**가 있어야 한다 — 늘 초록인 검사는 없는 것과 같다. */

let totalFails = 0;
let measuredScreens = 0;

for (const [label, url] of TARGETS) {
  const result = await measure(url);
  console.log(`[perf-budget] ── ${label}`);
  if (!result) {
    /* 계측기가 안 실린 화면은 「통과」가 아니라 **못 돌림**이다. 도구 장은 배포 때 셸을 복사해
       찍히므로, 셸에 계측기를 넣은 뒤 아직 안 찍힌 판에서는 여기로 온다. */
    console.log('[perf-budget]   못 돌림 — 이 화면에 계측기(js/perf.js)가 안 실렸다 (`npm run gen:tool-pages` 로 다시 찍어라). 통과로 세지 않는다.');
    continue;
  }
  measuredScreens += 1;
  const rows = REGRESS
    ? result.verdict.map((v) => (v.value == null ? v : { ...v, limit: v.value / 2, state: 'fail' }))
    : result.verdict;
  const fails = rows.filter((v) => v.state === 'fail');
  const unknowns = rows.filter((v) => v.state === 'unknown');
  const passes = rows.filter((v) => v.state === 'pass');
  for (const v of rows) {
    const mark = v.state === 'fail' ? 'FAIL' : v.state === 'unknown' ? '못 잼' : ' OK ';
    console.log(`[perf-budget]   ${mark}  ${v.label.padEnd(20)} ${fmt(v).padStart(8)} / 예산 ${limitOf(v)}`);
  }
  if (!result.trust.ok) console.log(`[perf-budget]   ⚠ 이 판은 비교에 못 쓴다 — ${result.trust.why}`);
  if (result.errors.length) console.log(`[perf-budget]   ⚠ 화면 오류 ${result.errors.length}건 — ${result.errors[0].slice(0, 120)}`);
  console.log(`[perf-budget]   결과: 예산 안쪽 ${passes.length} · 넘김 ${fails.length} · 못 잼 ${unknowns.length}`);
  if (unknowns.length) {
    console.log(`[perf-budget]     못 잰 것은 통과로 세지 않는다: ${unknowns.map((v) => v.label).join(' · ')}`);
  }
  totalFails += fails.length;
}

await browser.close();
server.close();

if (!measuredScreens) {
  console.error('[perf-budget] 잰 화면이 하나도 없다 — 이건 통과가 아니다.');
  process.exit(1);
}

if (REGRESS) {
  // 조인 예산에 전부 걸려야 정상이다. 안 걸리면 이 게이트는 아무것도 못 잡는다.
  console.log(`[perf-budget] --regress: 예산을 반으로 조여 ${totalFails}건 잡음 (0 이면 게이트가 죽은 것)`);
  process.exit(totalFails > 0 ? 0 : 1);
}
process.exit(totalFails > 0 ? 1 : 0);
