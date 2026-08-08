/**
 * 화면을 옮기는 길이 실제로 빠른가 (TASK-KL-128 ②③)
 *
 * 왜 있나: 이 둘은 **켜 놓고도 안 도는 것을 눈으로 구분할 수 없다.**
 *  - 미리 실행(prerender): 규칙을 적어 둬도 조건이 안 맞으면 아무 일도 안 일어난다.
 *    화면은 똑같이 뜨므로, 안 도는 채로 몇 달이 갈 수 있다.
 *  - 이어 붙이기(View Transitions): 이름이 한 화면에 둘이면 전환이 **통째로 취소**된다.
 *    이때도 화면은 그냥 예전처럼 바뀔 뿐이라 오류가 안 난다.
 * 그래서 「적혀 있나」가 아니라 **「실제로 그렇게 됐나」** 를 브라우저에 물어본다.
 *
 * 보는 것:
 *  - 도구 링크에 마우스를 올리면 그 화면이 **미리 돈다**(도착 뒤 activationStart > 0)
 *  - 미리 도는 동안에는 계측이 **안 센다** (도착해야 센다)
 *  - 이어 붙이기 이름이 화면마다 **하나뿐**이다 (둘이면 전환이 취소된다)
 *  - 옮기는 동안 코드 오류 0
 *
 * 사용: node scripts/smoke-navigation.mjs
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
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/karmolab/' || urlPath === '/karmolab') urlPath = '/apps/karmolab/index.html';
  if (urlPath.startsWith('/karmolab/t/')) urlPath = '/apps/blog' + urlPath;
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.join(repoRoot, urlPath.replace(/^\//, ''));
  if (!file.startsWith(repoRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = fs.readFileSync(file);
  const ext = path.extname(file);
  if (ext === '.html') body = Buffer.from(String(body).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''), 'utf8');
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const problems = [];
const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

/* ── ① 이름이 화면마다 하나뿐인가 ────────────────────────────
 * 둘이면 브라우저가 전환을 통째로 버린다 — 그런데 조용히 버린다. */
async function namesOnPage(url) {
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const seen = {};
    for (const el of document.querySelectorAll('*')) {
      const n = getComputedStyle(el).viewTransitionName;
      if (n && n !== 'none') seen[n] = (seen[n] || 0) + 1;
    }
    return seen;
  });
}
for (const [label, url] of [['첫 화면', `${BASE}/karmolab/`], ['도구 화면', `${BASE}/karmolab/t/loan/`]]) {
  const seen = await namesOnPage(url);
  if (!Object.keys(seen).length) problems.push(`${label}: 이어 붙일 이름이 하나도 없다 — 옮길 때 화면이 통째로 깜빡인다`);
  for (const [n, c] of Object.entries(seen)) {
    if (c > 1) problems.push(`${label}: 이름 「${n}」 이 ${c}개다 — 전환이 통째로 취소된다`);
  }
}

/* ── ② 도구 링크에 손을 올리면 미리 돌기 **시작**하는가 ──────
 *
 * 끝까지는 못 본다 — **자동화가 붙어 있으면 크롬이 미리 실행을 스스로 끈다**
 * (`PrerenderingDisabledByDevTools`). 그러니 「도착해 보니 미리 돌아 있더라」로 재려 하면
 * 영원히 빨간불이다. 실제로 그렇게 만들었다가 이 벽을 만났다.
 *
 * 대신 브라우저가 **무엇을 하려 했는지**를 묻는다. 그러면 세 가지가 다 잡힌다:
 * 규칙이 글자로 성립하나(안 그러면 규칙집이 안 뜬다) · 우리가 겨눈 주소에 걸리나 ·
 * 막힌 이유가 「자동화 때문」 말고 다른 게 있나(그건 우리 잘못이다). */
await page.goto(`${BASE}/karmolab/t/`, { waitUntil: 'load', timeout: 30000 });
const cdp = await ctx.newCDPSession(page);
const rulesets = [];
const attempts = [];
const failures = [];
cdp.on('Preload.ruleSetUpdated', (e) => rulesets.push(e.ruleSet));
cdp.on('Preload.preloadingAttemptSourcesUpdated', (e) => attempts.push(...(e.preloadingAttemptSources || [])));
cdp.on('Preload.prerenderStatusUpdated', (e) => { if (e.status === 'Failure') failures.push(e.prerenderStatus); });
await cdp.send('Preload.enable');
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);

const link = page.locator('a[href^="/karmolab/t/"]:not([href$="/t/"])').first();
if (!(await link.count())) {
  problems.push('목록에서 도구로 가는 링크를 못 찾았다 — 미리 돌 대상이 없다');
} else {
  await link.hover();
  await page.waitForTimeout(2500);           // moderate = 올려 둔 채 잠깐

  const bad = rulesets.filter((r) => r.errorType);
  if (bad.length) problems.push(`미리받기 규칙이 성립하지 않는다 — ${bad[0].errorType} ${bad[0].errorMessage || ''}`);
  if (!rulesets.length) problems.push('미리받기 규칙집이 아예 안 잡혔다 — 화면에서 사라졌다');

  const pre = attempts.filter((a) => a.key.action === 'Prerender' && /\/karmolab\/t\/[^/]+\//.test(a.key.url));
  if (!pre.length) problems.push('도구 주소를 미리 **실행**하려는 시도가 하나도 없다 — 규칙이 prefetch 로 되돌아갔거나 주소가 안 걸린다');

  /* 자동화 탓 말고 다른 이유로 막혔다면 그건 우리가 고칠 것이다. */
  const notOurs = new Set(['PrerenderingDisabledByDevTools']);
  const real = failures.filter((f) => !notOurs.has(f));
  if (real.length) problems.push(`미리 실행이 우리 쪽 이유로 막혔다 — ${[...new Set(real)].join(', ')}`);
}

/* ── ③ 미리 도는 동안에는 안 센다 ──────────────────────────
 * 계측은 실서비스 주소에서만 도는데, 여기서 보는 것은 **줄 세우는 장치가 살아 있나** 다.
 * 그 장치가 사라지면 미리 도는 화면이 전부 방문으로 세인다(그래서 예전에 못 켰다). */
{
  const src = fs.readFileSync(path.join(root, 'js/analytics.js'), 'utf8');
  if (!src.includes('prerenderingchange')) {
    problems.push('계측이 「도착했을 때」를 안 본다 — 미리 도는 화면이 방문으로 세인다');
  }
}

if (errs.length) problems.push(`옮기는 동안 코드 오류 ${errs.length}건 — ${errs[0]}`);

await browser.close();
server.close();

if (problems.length) {
  console.error('[smoke-navigation] 문제 ' + problems.length + '건');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('[smoke-navigation] 미리 실행 · 이어 붙이기 이름 · 계측 대기 OK');
