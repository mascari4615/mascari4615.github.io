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
 * **한 번 재고 판정하지 않는다.** 같은 코드도 기계가 바쁘면 두 배가 난다 — 표본 하나로 CI 를
 * 세우면 애먼 빨간불이 나고, 애먼 빨간불이 몇 번 나면 사람이 그 검사를 안 믿게 된다(그 순간
 * 게이트는 죽는다). 화면마다 세 번 재서 **중앙값**으로 판정한다. 못 잰 항목은 중앙값에서도
 * 「못 잼」이다 — 잰 것만 골라 평균 내면 없는 값이 조용히 사라진다.
 *
 * **빠른 기계에서만 재지 않는다.** 여기는 24코어 데스크톱이고 사람은 폰으로 온다. 실측으로
 * 갈렸다: 셸 준비가 빠른 판 42ms · CPU 4배 느림 211ms · 거기에 느린 회선까지 3102ms.
 * 앞의 둘만 보고 있었으면 「40ms 짜리 앱」이라고 믿었을 것이다. 그래서 시나리오 둘을 잰다.
 *
 * 시간 예산은 환경에 딸린 값이라 느린 판에는 **배수**를 준다(크기·밀림은 환경과 무관하니 그대로).
 * 배수는 예산의 두 번째 사본이 아니다 — 예산 정본은 `perf.ts` 한 곳이고, 여기는 「이 환경은
 * 그것의 몇 배까지 봐준다」만 정한다.
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
if (!fs.existsSync(toolPage)) {
  console.log('[perf-budget] 도구 장은 건너뜀 — 찍힌 페이지가 없다 (`npm run gen:tool-pages` 뒤에 다시)');
} else if (!fs.readFileSync(toolPage, 'utf8').includes('js/perf.js')) {
  /* 브라우저로 확인하면 「없는 것」을 기다리느라 화면마다 60초를 버린다. 파일을 보면 즉시 안다 —
     게이트가 제 발로 느려지면 사람이 안 돌린다. */
  console.log('[perf-budget] 도구 장은 못 돌림 — 그 화면에 계측기(js/perf.js)가 안 실렸다 (다음 `gen:tool-pages` 때 들어간다). 통과로 세지 않는다.');
} else {
  TARGETS.push(['도구 한 장(대출)', '/apps/blog/karmolab/t/loan/index.html']);
}

const browser = await chromium.launch();

/* 시나리오 둘. 느린 쪽은 Lighthouse 가 쓰는 것과 같은 종류의 설정(느린 폰 + 느린 회선)이다.
   `slack` = 시간 항목 예산에 곱하는 배수. 3102ms 를 봤으므로 4000ms 선(1200×3.4)을 잡는다 —
   지금을 겨우 통과시키는 값이 아니라 **여기서 더 나빠지면 잡히는** 값이다. */
const SCENARIOS = [
  { name: '빠른 데스크톱', cpu: 1, slowNet: false, slack: 1 },
  { name: '느린 폰 + 느린 회선', cpu: 4, slowNet: true, slack: 3.4 },
];

/** 화면 하나를 열고 조작을 일으킨 뒤 판정을 받아 온다. 계측기가 없으면 `null`. */
async function measure(url, scenario) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (scenario.cpu > 1 || scenario.slowNet) {
    const cdp = await page.context().newCDPSession(page);
    if (scenario.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: scenario.cpu });
    if (scenario.slowNet) {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
      });
    }
  }
  await page.goto(BASE + url, { waitUntil: 'load' });
  const hasPerf = await page
    .waitForFunction(() => !!window.KLPerf && typeof Toolbox !== 'undefined', null, { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  if (!hasPerf) {
    await page.close();
    return null;
  }
  /* 첫 그림·큰 그림이 정해질 틈. 너무 일찍 재면 「아직 안 나온 것」을 「없다」로 적는다.
     느린 판은 더 기다린다 — 같은 시간을 주면 느린 쪽만 「못 잼」이 되어 비교가 안 된다. */
  await page.waitForTimeout(scenario.slowNet ? 5000 : 2500);
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

/** 항목별 중앙값. 못 잰 회차가 절반을 넘으면 그 항목은 「못 잼」이다(잰 것만 골라 세지 않는다). */
function median(runs) {
  const base = runs[0].verdict;
  return base.map((sample, index) => {
    const values = runs.map((run) => run.verdict[index].value).filter((v) => v != null);
    if (values.length * 2 <= runs.length) return { ...sample, value: null, state: 'unknown' };
    values.sort((a, b) => a - b);
    const value = values[Math.floor(values.length / 2)];
    return { ...sample, value, state: value > sample.limit ? 'fail' : 'pass' };
  });
}

const RUNS = 3;

for (const scenario of SCENARIOS)
for (const [screen, url] of TARGETS) {
  const label = `${screen} · ${scenario.name}`;
  /* 느린 판은 한 회차가 10초를 넘는다 — 세 번은 과하다. 흔들림이 큰 쪽이 빠른 판이므로
     반복은 거기에 준다. */
  const runCount = scenario.slack > 1 ? 1 : RUNS;
  const runs = [];
  for (let i = 0; i < runCount; i++) {
    const one = await measure(url, scenario);
    if (one) runs.push(one);
  }
  const result = runs.length
    ? { verdict: median(runs), trust: runs[runs.length - 1].trust, errors: runs.flatMap((r) => r.errors) }
    : null;
  console.log(`[perf-budget] ── ${label}${runs.length > 1 ? ` (${runs.length}회 중앙값)` : ''}`);
  if (!result) {
    /* 계측기가 안 실린 화면은 「통과」가 아니라 **못 돌림**이다. 도구 장은 배포 때 셸을 복사해
       찍히므로, 셸에 계측기를 넣은 뒤 아직 안 찍힌 판에서는 여기로 온다. */
    console.log('[perf-budget]   못 돌림 — 이 화면에 계측기(js/perf.js)가 안 실렸다 (`npm run gen:tool-pages` 로 다시 찍어라). 통과로 세지 않는다.');
    continue;
  }
  measuredScreens += 1;
  /* 시간 항목만 이 환경의 배수를 준다. 크기·밀림은 기계가 느리다고 커지지 않는다. */
  const scaled = result.verdict.map((v) =>
    v.unit === 'ms' && scenario.slack !== 1
      ? { ...v, limit: Math.round(v.limit * scenario.slack), state: v.value == null ? 'unknown' : v.value > v.limit * scenario.slack ? 'fail' : 'pass' }
      : v
  );
  const rows = REGRESS
    ? scaled.map((v) => (v.value == null ? v : { ...v, limit: v.value / 2, state: 'fail' }))
    : scaled;
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
