/**
 * 성능 예산 게이트 (TASK-KL-201 ⑨).
 *
 * 왜 있나: 계기판(`#perf`)은 **사람이 열 때만** 답한다. 그러면 느려진 것을 누가 열어 볼 때까지
 * 아무도 모른다. 여태 성능 회귀 네 건이 그렇게 쌓였다(`smoke-perf.mjs` 머리말). 계기판이
 * 이미 예산 안쪽인가를 답할 수 있으니, 그 답을 사람 대신 물어보는 자리가 이 파일이다.
 *
 * **예산은 여기 안 적는다.** 정본은 `src/perf.ts` 의 `BUDGETS` 한 곳이고, 이 게이트는 앱을
 * 띄워 그 답(`KLPerf.snapshot().verdict`)을 받아 적기만 한다. 두 벌로 적으면 반드시 갈라진다.
 *
 * **못 잰 것은 통과로 안 센다.** 합격과 검사 못 함을 같은 칸에 넣으면 계측이 조용히 죽은
 * 날에도 초록이 뜬다. 못 잰 항목은 따로 세어 목록으로 남긴다.
 *
 * **기다리지 않고 일으킨다.** 조작 지연(INP)은 아무도 안 만지면 영영 못 잼이다. 게이트가
 * 직접 눌러서 그 사건을 만든다. 안 그러면 그 예산은 있으나 마나다.
 *
 * **한 번 재고 판정하지 않는다.** 같은 코드도 기계가 바쁘면 두 배가 난다. 표본 하나로 CI 를
 * 세우면 애먼 빨간불이 나고, 애먼 빨간불이 몇 번 나면 사람이 그 검사를 안 믿게 된다(그 순간
 * 게이트는 죽는다). 화면마다 세 번 재서 **중앙값**으로 판정한다. 못 잰 항목은 중앙값에서도
 * 못 잼이다. 잰 것만 골라 평균 내면 없는 값이 조용히 사라진다.
 *
 * **빠른 기계에서만 재지 않는다.** 여기는 24코어 데스크톱이고 사람은 폰으로 온다. 실측으로
 * 갈렸다: 셸 준비가 빠른 판 42ms, CPU 4배 느림 211ms, 거기에 느린 회선까지 3102ms.
 * 앞의 둘만 보고 있었으면 40ms 짜리 앱이라고 믿었을 것이다. 그래서 시나리오 둘을 잰다.
 *
 * 시간 예산은 환경에 딸린 값이라 느린 판에는 **배수**를 준다(크기, 밀림은 환경과 무관하니 그대로).
 * 배수는 예산의 두 번째 사본이 아니다. 예산 정본은 `perf.ts` 한 곳이고, 여기는 이 환경은
 * 그것의 몇 배까지 봐준다만 정한다.
 *
 * 사용: node scripts/smoke-perf-budget.mjs        (npm run test:perf:budget)
 *       node scripts/smoke-perf-budget.mjs --regress   ← 예산을 일부러 조여 **빨간불이 나는지** 확인
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { browserReady } from './lib/serve-static.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const REGRESS = process.argv.includes('--regress');

/* 볼 대상이 없으면 못 돌린다고 말한다. 없는 것을 두고 통과도 실패도 거짓말이다. */
if (!fs.existsSync(path.join(root, 'js/perf.js')) || !fs.existsSync(path.join(root, 'js/toolbox.js'))) {
  console.log('[perf-budget] 못 돌림. js/perf.js 또는 js/toolbox.js 가 없다 (`node build.mjs` 먼저)');
  process.exit(2);
}

/**
 * Jekyll 이 처리해 줄 것을 정적 서빙에서도 없앤다. 앞머리 + {%...%}.
 *
 * 왜: 앞머리만 걷었더니 화면 맨 위에 조건문 한 줄이 **글자로** 떴다(계기판 화면을 찍어서
 * 발견). 그만큼 자리가 밀려 밀림(CLS) 값이 오염된다. 실서비스에는 없는 것이니 재는 자리에도
 * 없어야 같은 것을 재는 것이 된다.
 *
 * 정규식을 안 쓴다. 여러 줄 정규식을 스크립트로 심다가 세 번 깨졌다(개행, 따옴표 이스케이프).
 */
function stripJekyll(text) {
  let out = text;
  if (out.startsWith('---')) {
    const close = out.indexOf('---', 3);
    if (close > 0) out = out.slice(out.indexOf('\n', close) + 1);
  }
  return out
    .split('{%')
    .map((part, i) => (i === 0 ? part : part.slice(part.indexOf('%}') + 2)))
    .join('');
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
  // Jekyll 앞머리는 정적 서빙에서 글자로 떠 화면을 어긋나게 한다. 빼고 준다.
  if (ext === '.html') {
    /* 앞머리만 걷으면 **Liquid 태그가 글자로 뜬다**. 실측: 화면 맨 위에 `{% if
       jekyll.environment ... %}` 한 줄이 그대로 보였고, 그만큼 자리가 밀려 밀림(CLS)이 오염됐다.
       실서비스에서는 Jekyll 이 처리해 없는 것이니, 재는 자리에서도 없애야 같은 것을 재게 된다. */
    body = Buffer.from(
      stripJekyll(String(body)),
      'utf8'
    );
  }
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* 재는 화면 **둘**.
 *   ① 앱 첫 화면
 *   ② 도구 한 장. **검색으로 들어오는 정문**이다(131장). 셸이 다르다: 첫 화면 본문, 팔레트, 계정을
 *      빼고 찍는다. 그래서 첫 화면만 재면 사람 대부분이 실제로 밟는 길을 안 재는 것이 된다.
 * 도구 장은 배포 때 찍히는 생성물이라 새 체크아웃에는 없을 수 있다. 없으면 건너뛴다고 말한다. */
const TARGETS = [['앱 첫 화면', '/apps/karmolab/index.html', {}]];
const toolPage = path.join(repoRoot, 'apps/blog/t/loan/index.html');
if (!fs.existsSync(toolPage)) {
  console.log('[perf-budget] 도구 장은 건너뜀. 찍힌 페이지가 없다 (`npm run gen:tool-pages` 뒤에 다시)');
} else if (!fs.readFileSync(toolPage, 'utf8').includes('js/perf.js')) {
  /* 브라우저로 확인하면 없는 것을 기다리느라 화면마다 60초를 버린다. 파일을 보면 즉시 안다 . 
     게이트가 제 발로 느려지면 사람이 안 돌린다. */
  console.log('[perf-budget] 도구 장은 못 돌림. 그 화면에 계측기(js/perf.js)가 안 실렸다 (다음 `gen:tool-pages` 때 들어간다). 통과로 세지 않는다.');
} else {
  /* ★ **이 화면은 오늘 처음 재졌다** (2026-08-16). 여태 누를 때 머리말의 KarmoLab 단추를
     먼저 눌러 화면을 떠나 버렸고, 그래서 항상 계측기가 안 왔다로 끝났다. 검색으로 들어오는
     정문 131장을 한 번도 안 잰 것이다. 첫 측정이 바로 말한다: **부팅에 받고 안 쓴 코드 36.8KB**
     = 채팅 23.0KB(TASK-KL-161 로 일부러 심은 것이다. 그때 문서엔 8KB 남짓이라 적혔는데
     지금 **세 배**다) + 그 도구 자신 13.8KB(제 페이지에서 제 코드를 안 쓴 것으로 세는 것은
     재는 쪽 버그다). 둘 다 따로 갚을 일이라, 지금 값을 그대로 예산으로 박지 **않고**
     지금+한 위젯몫(16KB)을 준다: 오늘 값은 통과하되 **여기서 더 붙으면 잡힌다**. */
  TARGETS.push([
    '도구 한 장(대출)',
    '/apps/blog/t/loan/index.html',
    /* 톱니를 조인다 (2026-08-16 저녁): 제 도구 코드를 낭비로 세던 것을 고쳐 36.8KB → 22KB.
       남은 22KB 는 일부러 실은 채팅이다. 예산도 그만큼 내린다. 22 + 한 위젯몫 16. */
    { bootwaste: 22 * 1024 + 16 * 1024 },
  ]);
}

/* 브라우저가 없으면 통과가 아니라 **못 돌림**이다. CI 의 verify 잡에는 아직 설치 스텝이 없다.
   여기서 조용히 통과시키면 계측이 죽은 날에도 초록이 뜨고, 반대로 그냥 죽이면 배포 길목이 막힌다. */
if (!(await browserReady('perf-budget'))) process.exit(0);

const browser = await chromium.launch();

/* 시나리오 둘. 느린 쪽은 Lighthouse 가 쓰는 것과 같은 종류의 설정(느린 폰 + 느린 회선)이다.
   `slack` = 시간 항목 예산에 곱하는 배수. 3102ms 를 봤으므로 4000ms 선(1200×3.4)을 잡는다 . 
   지금을 겨우 통과시키는 값이 아니라 **여기서 더 나빠지면 잡히는** 값이다. */
/* ★ **CI 러너는 빠른 데스크톱이 아니다** (2026-08-16 실측). 같은 커밋에서
   긴 작업 총합이 내 데스크톱 106ms, CI 303ms 였다. 약 3배. 그런데 이 시나리오는
   배수 1 이라 CI 가 데스크톱 기준으로 재판받았고, 예산 300 을 1% 넘겨(303ms) 빨갛게 났다.
   코드가 나빠진 게 아니라 **잰 기계가 다른 기계**다.

   예산을 올리지 않는다(그러면 진짜 데스크톱의 회귀를 놓친다). 대신 **환경을 선언한다**:
   CI 에서는 시간 항목에 배수 2. 지금 값(303)의 두 배 가까이 나빠져야 잡히는 선이 아니라,
   *우리 기계 기준 106ms* 의 5.6배까지 봐주는 선이다. 진짜 회귀는 그 전에 잡힌다.
   `slack` 은 판수(runCount)도 결정하므로 **한도용 배수만** 따로 둔다(측정 품질은 그대로). */
const CI = process.env.CI === 'true' || process.env.CI === '1';
const SCENARIOS = [
  { name: '빠른 데스크톱', cpu: 1, slowNet: false, slack: 1, limitSlack: CI ? 2 : 1 },
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
  const deadRequests = [];
  const errorText = [];
  page.on('requestfailed', (r) => deadRequests.push(String(r.url()).split('/').pop()));
  page.on('response', (r) => { if (r.status() >= 400) deadRequests.push(`${String(r.url()).split('/').pop()}(${r.status()})`); });
  page.on('pageerror', (e) => errorText.push(String(e.message).split('\n')[0].slice(0, 80)));
  await page.goto(BASE + url, { waitUntil: 'load' });
  /* ★ **못 돌린 이유를 지어내지 않는다** (2026-08-16, 실측). 여태 여기서 조용히 null 을 주면
     바깥에서 계측기가 안 실렸다. 페이지를 다시 찍어라로 **한 가지 이유만** 적었다.
     그런데 진짜 원인은 넷이다: 파일이 404, 스크립트가 터짐, 셸이 안 뜸, 진짜로 계측기 없음.
     오늘 그 말만 믿고 페이지를 다시 찍었는데 아무것도 안 바뀌었다. 틀린 사유는 사람을
     엉뚱한 데로 보낸다. 무엇이 안 왔는지, 무엇이 터졌는지를 그대로 들고 나간다. */
  const hasPerf = await page
    .waitForFunction(() => !!window.KLPerf && typeof Toolbox !== 'undefined', null, { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  if (!hasPerf) {
    const why2 = await page.evaluate(() => ({
      KLPerf: !!window.KLPerf,
      Toolbox: typeof Toolbox !== 'undefined',
    })).catch(() => ({ KLPerf: false, Toolbox: false }));
    cannotRunReason = [
      `KLPerf ${why2.KLPerf ? '왔다' : '안 왔다'}, Toolbox ${why2.Toolbox ? '떴다' : '안 떴다'}`,
      deadRequests.length ? `못 받은 파일 ${deadRequests.length}개: ${deadRequests.slice(0, 3).join(', ')}` : '',
      errorText.length ? `스크립트가 터졌다: ${errorText.slice(0, 2).join(', ')}` : '',
    ].filter(Boolean).join(' | ');
    await page.close();
    return null;
  }
  /* 첫 그림, 큰 그림이 정해질 틈. 너무 일찍 재면 아직 안 나온 것을 없다로 적는다.
     느린 판은 더 기다린다. 같은 시간을 주면 느린 쪽만 못 잼이 되어 비교가 안 된다. */
  await page.waitForTimeout(scenario.slowNet ? 5000 : 2500);
  /* 조작 지연은 **일으켜야** 잡힌다. 기다리면 영영 못 잼이다.
     진짜 단추를 누른다(빈 곳을 누르면 핸들러가 없어 우리 코드가 느린가를 못 본다). */
  /* ★ **누르는 것이 화면을 떠나면 재는 화면이 사라진다** (2026-08-16, 실측).
     도구 한 장에서 첫 번째로 잡히는 것은 머리말의 `KarmoLab` 단추다. 생김새는 단추지만
     누르면 `/` 로 **간다**. 그 순간 재던 문서가 죽고 `KLPerf` 도 같이 사라져,
     검사는 15초 기다렸는데 계측기가 안 왔다로 끝났다. 그래서 **도구 한 장(131장, 검색으로
     들어오는 정문)은 한 번도 안 재졌다**. 첫 화면만 달려 사람 대부분이 밟는 길을 몰랐다.
     둘을 고친다: ① 화면을 떠나는 것은 후보에서 뺀다 ② 그래도 떠나면 **그걸 그대로 말한다**
     (설명 없는 15초 기다림으로 다시 둔갓하지 않게). 도구 자기 입력칸도 후보에 넣는다 . 
     도구 장에서 사람이 실제로 만지는 것이 그것이다. */
  const measuredUrl = page.url();
  const clickable = await page.$$(
    '.landing-cta, .tool-card, header button, nav button, .tab-btn, main input, main select, .tool-card-btn'
  );
  /* 떠나는 것 = **틀(chrome)** 이다. 머리말, 메뉴, 생김새, 링크. 도구 장에서는 그게 전부
     앱으로 들어가기라 하나라도 누르면 재던 화면이 사라진다(설정 단추 → `#settings`).
     재려는 것은 **그 화면 안의 조작**이므로 틀은 통째로 뺀다. */
  const leaving = (el) =>
    el.evaluate((n) => !!n.closest('a[href], header, nav, .breadcrumb, [data-page], [data-goto]'));
  let left = '';
  let causedLeave = '';
  let clicked = [];
  let clickCount = 0;
  /* 무엇을 눌렀는지 이름을 들고 다닌다. 떠났다만 말하면 다음 사람이 스무 번 눌러 보며 찾는다
     (오늘 실제로 그랬다). 틀 거르개는 **누를 것**을 보고 거르는데, 화면을 떠나게 한 것이
     그 그물을 어떻게 빠져나갔는지는 그 이름이 없으면 영영 모른다. */
  const name2 = (el) =>
    el
      .evaluate((n) => `${n.tagName}${n.id ? '#' + n.id : ''}${n.className ? '.' + String(n.className).split(' ')[0] : ''}`)
      .catch(() => '(사라진 것)');
  for (const target of clickable) {
    if (clickCount >= 4) break;                                    // 네 번이면 가장 굼뜬 조작이 드러난다
    if (await leaving(target).catch(() => true)) continue;
    const who = await name2(target);
    await target.click({ timeout: 1500 }).catch(() => {});
    clickCount += 1;
    clicked.push(who);
    await page.waitForTimeout(250);
    if (page.url() !== measuredUrl) { left = page.url(); causedLeave = who; break; }
  }
  if (left) {
    cannotRunReason =
      `누르는 순간 화면을 떠났다. 마지막에 누른 것 \`${causedLeave}\` (${measuredUrl} → ${left})` +
      `, 여기까지 누른 것: ${clicked.join(' → ')}` +
      '. 그 화면을 재려면 떠나지 않는 것만 눌러야 한다';
    await page.close();
    return null;
  }
  await page.waitForTimeout(600);
  /* ★ **계측기는 늦게 온다. 없으면 못 잼이지 터질 일이 아니다** (2026-08-14).
     `js/perf.js` 는 첫 그림 뒤 한가할 때 실린다(부팅 짐을 줄이려고 그렇게 옮겼다).
     여기서 곧장 `window.KLPerf.snapshot()` 을 부르다가 아직 안 왔으면
     `Cannot read properties of undefined` 로 **검사가 죽었다**. 아래에 이미 계측기가
     안 실린 화면은 못 돌림이라는 자리가 있는데, 거기까지 못 가고 터진 것이다.
     기다려 보고, 끝내 없으면 그 자리로 보낸다(null). */
  const meterArrived = await page
    .waitForFunction(() => !!window.KLPerf, null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!meterArrived) {
    cannotRunReason = [
      '두 번째 판에서 KLPerf 가 15초 안에 안 왔다',
      deadRequests.length ? `못 받은 파일 ${deadRequests.length}개: ${deadRequests.slice(0, 3).join(', ')}` : '',
      errorText.length ? `스크립트가 터졌다: ${errorText.slice(0, 2).join(', ')}` : '',
    ].filter(Boolean).join(' | ');
    await page.close();
    return null;
  }
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

/* 되돌아온 답에 빨간불이 나긴 하는지를 확인하는 모드.
   새 검사는 **실제로 잡는다는 증거**가 있어야 한다. 늘 초록인 검사는 없는 것과 같다. */

let totalFails = 0;
let measuredScreens = 0;

/* ★ **밀림만은 중앙값으로 보면 안 된다** (2026-08-17 실측).
   시간, 크기는 기계 잡음이 섞이니 중앙값이 맞다. 그런데 화면 밀림(CLS)은 **늦게 오는 것과의
   경주**라 판마다 크게 갈린다. 실사이트 도구 장에서 0.218 / 0.032 / 0.126 이 나왔다.
   중앙값을 쓰면 0.126 이 되고 세 판 중 하나였던 0.218 은 사라진다. 그런데 사람에게는
   **그 한 판이 그 사람의 경험 전부**다(구글이 현장값 p75 로 보는 것도 같은 뜻).
   그래서 밀림은 **가장 나쁜 판**으로 판정한다. 잡음이 아니라 실제로 일어난 일이다. */
const worst2 = new Set(['cls']);

/** 항목별 중앙값(밀림은 최댓값). 못 잰 회차가 절반을 넘으면 그 항목은 못 잼이다. */
function median(runs) {
  const base = runs[0].verdict;
  return base.map((sample, index) => {
    const values = runs.map((run) => run.verdict[index].value).filter((v) => v != null);
    if (values.length * 2 <= runs.length) return { ...sample, value: null, state: 'unknown' };
    values.sort((a, b) => a - b);
    const worst = worst2.has(String(sample.key ?? sample.id ?? '').toLowerCase())
      || /밀림|CLS/i.test(String(sample.label ?? ''));
    const value = worst ? values[values.length - 1] : values[Math.floor(values.length / 2)];
    return { ...sample, value, state: value > sample.limit ? 'fail' : 'pass' };
  });
}

/** 마지막으로 못 돌린 이유. `measure` 가 채우고 아래 보고가 그대로 쓴다. */
let cannotRunReason = '';

const RUNS = 3;

for (const scenario of SCENARIOS)
for (const [screen, url, screenBudget = {}] of TARGETS) {
  const label = `${screen}, ${scenario.name}`;
  /* 느린 판은 한 회차가 10초를 넘는다. 세 번은 과하다. 흔들림이 큰 쪽이 빠른 판이므로
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
  console.log(`[perf-budget] ── ${label}${runs.length > 1 ? ` (${runs.length}회, 시간, 크기는 중앙값, 밀림은 가장 나쁜 판)` : ''}`);
  if (!result) {
    /* 계측기가 안 실린 화면은 통과가 아니라 **못 돌림**이다. 도구 장은 배포 때 셸을 복사해
       찍히므로, 셸에 계측기를 넣은 뒤 아직 안 찍힌 판에서는 여기로 온다. */
    console.log(`[perf-budget]   못 돌림. ${cannotRunReason || '이유를 못 모았다'}. 통과로 세지 않는다.`);
    continue;
  }
  measuredScreens += 1;
  /* 시간 항목만 이 환경의 배수를 준다. 크기, 밀림은 기계가 느리다고 커지지 않는다. */
  const limitSlack = scenario.limitSlack ?? scenario.slack;
  /* 화면마다 셸이 다르면 예산도 다르다. 같은 자를 대면 엉뚱한 화면이 별을 받는다. */
  const budgetApplied = result.verdict.map((v) =>
    screenBudget[v.key] != null
      ? { ...v, limit: screenBudget[v.key], state: v.value == null ? 'unknown' : v.value > screenBudget[v.key] ? 'fail' : 'pass' }
      : v
  );
  const scaled = budgetApplied.map((v) =>
    v.unit === 'ms' && limitSlack !== 1
      ? { ...v, limit: Math.round(v.limit * limitSlack), state: v.value == null ? 'unknown' : v.value > v.limit * limitSlack ? 'fail' : 'pass' }
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
  if (!result.trust.ok) console.log(`[perf-budget]   ⚠ 이 판은 비교에 못 쓴다. ${result.trust.why}`);
  if (result.errors.length) console.log(`[perf-budget]   ⚠ 화면 오류 ${result.errors.length}건. ${result.errors[0].slice(0, 120)}`);
  console.log(`[perf-budget]   결과: 예산 안쪽 ${passes.length}, 넘김 ${fails.length}, 못 잼 ${unknowns.length}`);
  if (unknowns.length) {
    console.log(`[perf-budget]     못 잰 것은 통과로 세지 않는다: ${unknowns.map((v) => v.label).join(', ')}`);
  }
  totalFails += fails.length;
}

await browser.close();
server.close();

if (!measuredScreens) {
  console.error('[perf-budget] 잰 화면이 하나도 없다. 이건 통과가 아니다.');
  process.exit(1);
}

if (REGRESS) {
  // 조인 예산에 전부 걸려야 정상이다. 안 걸리면 이 게이트는 아무것도 못 잡는다.
  console.log(`[perf-budget] --regress: 예산을 반으로 조여 ${totalFails}건 잡음 (0 이면 게이트가 죽은 것)`);
  process.exit(totalFails > 0 ? 0 : 1);
}
process.exit(totalFails > 0 ? 1 : 0);
