/**
 * 명령 팔레트가 실제로 도는지 (TASK-KL-099)
 *
 * 왜 있나: 이 화면은 「첫 화면의 본체」다. 여기가 조용히 죽으면 앱에 도구를 찾을 길이
 * 하나도 안 남는다 — 고치기 전 상태로 되돌아가는데, 화면은 멀쩡해 보인다(입력칸은 그려지고
 * 글자도 쳐진다, 목록만 안 뜬다). 그래서 「그려졌나」가 아니라 **「쳐서 열리나」** 를 본다.
 *
 * 보는 것:
 *  - 첫 화면에 입력이 있고 포커스를 쥐고 있다
 *  - 이름으로 찾으면 결과가 나오고, 일치한 글자가 강조된다
 *  - 초성(「ㄱㅈㅅ」)으로도 찾힌다
 *  - Enter 로 실제로 그 도구가 열린다 (주소·제목이 바뀐다)
 *  - 연 것이 「최근」 맨 위로 올라온다
 *  - 도구를 보는 중에 Ctrl+K 로 뜨고 Esc 로 닫힌다
 *  - 메뉴에 숨겨진 묶음 탭(base64 등)도 찾아진다 — 여기가 메뉴 대비 늘어난 면적이다
 *  - 없는 말을 치면 막다른 길이 아니라 전체 목록으로 가는 길이 나온다
 *
 * 사용: node scripts/smoke-palette.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const blogRoot = path.dirname(path.dirname(root));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

/**
 * 배포된 주소 모양(`/karmolab/`)과 디스크 모양(`apps/karmolab/`)이 다르다.
 * 앱 안의 링크는 배포 모양으로 적혀 있으므로 여기서 이어 준다.
 *
 * index.html 맨 앞의 Jekyll 앞머리(`---` 블록)는 걷어낸다. 안 걷으면 그 글자가 화면
 * 맨 위에 그대로 떠서, 자리·높이를 재는 검사가 실제와 다른 값을 본다.
 */
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/karmolab/' || urlPath === '/karmolab') urlPath = '/apps/karmolab/index.html';
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const file = path.join(blogRoot, urlPath.replace(/^\//, ''));
  if (!file.startsWith(blogRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = fs.readFileSync(file);
  const ext = path.extname(file);
  if (ext === '.html') {
    body = Buffer.from(String(body).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''), 'utf8');
  }
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const problems = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

/** 팔레트가 이미 그려진 뒤부터 시작해야 한다 — 위젯 등록이 끝나야 인덱스가 찬다. */
async function gotoHome() {
  await page.goto(`${BASE}/karmolab/`, { waitUntil: 'load', timeout: 30000 });
  // 첫 화면은 「마지막에 본 화면」 기억에 밀릴 수 있다 — 홈을 명시적으로 연다.
  await page.evaluate(() => Toolbox.switchPage('home'));
  await page.waitForSelector('.kp-inline .kp-input', { timeout: 15000 });
}

async function type(q) {
  const input = page.locator('.kp-inline .kp-input');
  await input.fill(q);
  // 결과는 input 이벤트로 그려진다 — 한 틱 준다.
  await page.waitForTimeout(120);
}

async function rowTitles(scope = '.kp-inline') {
  return page.$$eval(`${scope} .kp-row-title`, (els) => els.map((e) => e.textContent.trim()));
}

/* ── ① 첫 화면에 입력이 있고 포커스를 쥔다 ─────────────────── */
await gotoHome();
const focused = await page.evaluate(() => document.activeElement?.classList.contains('kp-input'));
if (!focused) problems.push('첫 화면 입력이 포커스를 못 쥔다 — 열자마자 칠 수 없다');

/* 카드 3장은 **남아 있어야 한다** (사용자 요청 2026-08-07). 한때 카드 자리를 팔레트가
 * 통째로 가져갔는데, 눈에 익은 자리를 그대로 두라는 말을 들었다. 둘 다 있는 것이 정답이다 —
 * 한쪽만 남으면 둘 중 누군가의 화면이 사라진 것이므로 여기서 잡는다. */
const cards = await page.$$eval('.landing-cta-card', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
if (cards.length !== 3) {
  problems.push(`첫 화면 카드가 3장이 아니다 (${cards.length}장) — ${cards.join(' / ') || '없음'}`);
}
const cardsBelow = await page.evaluate(() => {
  const p = document.querySelector('.landing-palette');
  const c = document.querySelector('.landing-cta-card');
  if (!p || !c) return null;
  return p.getBoundingClientRect().top < c.getBoundingClientRect().top;
});
if (cardsBelow === null) problems.push('첫 화면에 입력과 카드가 같이 있지 않다');
else if (!cardsBelow) problems.push('카드가 찾는 입력보다 위에 있다 — 주인공 자리가 뒤바뀌었다');

/* ── ①-b 입력칸이 상자 안에 또 네모를 그리지 않는다 ─────────
 * 이 파일 뒤쪽의 공통 입력칸 규칙(`input[type=text]`)이 힘이 세서, 클래스 하나로는
 * 눌리지 않는다. 실제로 두 번 되살아났다 — 한 번은 평소에, 한 번은 포커스를 준 뒤에만.
 * 눈으로만 보면 놓치므로 계산된 값으로 잡는다. */
await page.locator('.kp-inline .kp-input').focus();
const inputSkin = await page.$eval('.kp-inline .kp-input', (el) => {
  const s = getComputedStyle(el);
  return { bg: s.backgroundColor, bw: s.borderTopWidth + '/' + s.borderLeftWidth, shadow: s.boxShadow };
});
if (!/rgba\(0, 0, 0, 0\)|transparent/.test(inputSkin.bg)) {
  problems.push(`입력칸에 제 바탕색이 남아 있다 (${inputSkin.bg}) — 상자 안에 네모가 하나 더 보인다`);
}
if (inputSkin.bw !== '0px/0px') {
  problems.push(`입력칸에 테두리가 남아 있다 (${inputSkin.bw}) — 상자 안에 네모가 하나 더 보인다`);
}
if (inputSkin.shadow && inputSkin.shadow !== 'none') {
  problems.push(`입력칸에 그림자가 남아 있다 (${inputSkin.shadow})`);
}

/* ── ② 이름으로 찾기 + 일치 글자 강조 ──────────────────────── */
await type('글자수');
let titles = await rowTitles();
if (!titles.length) problems.push('「글자수」 로 찾은 결과가 0개다');
else if (!titles[0].includes('글자수')) problems.push(`「글자수」 첫 결과가 엉뚱하다 — ${titles[0]}`);

const markText = await page.$eval('.kp-inline .kp-mark', (e) => e.textContent).catch(() => null);
if (!markText) problems.push('일치한 글자가 강조되지 않는다');

/* ── ③ 초성으로 찾기 ───────────────────────────────────────── */
await type('ㄱㅈㅅ');
titles = await rowTitles();
if (!titles.some((t) => t.includes('글자수'))) {
  problems.push(`초성 「ㄱㅈㅅ」 로 「글자수 세기」 가 안 나온다 — 나온 것: ${titles.slice(0, 3).join(', ') || '없음'}`);
}

/* ── ④ 메뉴에 숨겨진 묶음 탭도 찾아진다 ────────────────────── */
await type('base64');
titles = await rowTitles();
if (!titles.length) problems.push('묶음 탭으로 들어간 도구(base64)가 안 찾아진다 — 메뉴 대비 늘어난 면적이 0이다');

/* ── ⑤ 없는 말 = 막다른 길이 아니다 ────────────────────────── */
await type('ZZZQQQ없는말');
const emptyLink = await page.$('.kp-inline .kp-empty-link');
if (!emptyLink) problems.push('결과 0건일 때 다음 갈 곳이 없다');

/* ── ⑥ Enter 로 실제로 열린다 ──────────────────────────────── */
await type('글자수');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const opened = await page.evaluate(() => ({
  hash: location.hash,
  title: document.getElementById('pageTitle')?.textContent || '',
}));
if (!opened.hash || opened.hash === '#home') {
  problems.push(`Enter 로 도구가 안 열린다 — 주소가 ${opened.hash || '(비어 있음)'} 그대로다`);
}

/* ── ⑦ 도구를 보는 중에 Ctrl+K 로 뜨고 Esc 로 닫힌다 ───────── */
await page.keyboard.press('Control+k');
await page.waitForTimeout(200);
if (!(await page.$('.kp-overlay .kp-input'))) problems.push('Ctrl+K 로 팔레트가 안 뜬다');
else {
  const ovFocused = await page.evaluate(
    () => document.activeElement?.closest('.kp-overlay') !== null
  );
  if (!ovFocused) problems.push('뜬 팔레트가 포커스를 안 가져간다 — 바로 칠 수 없다');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  if (await page.$('.kp-overlay')) problems.push('Esc 로 팔레트가 안 닫힌다');
}

/* ── ⑧ 연 도구가 「최근」 맨 위에 온다 ─────────────────────── */
await page.evaluate(() => Toolbox.switchPage('home'));
await page.waitForTimeout(300);
await page.locator('.kp-inline .kp-input').fill('');
await page.waitForTimeout(150);
const sections = await page.$$eval('.kp-inline .kp-section', (els) => els.map((e) => e.textContent.trim()));
if (!sections.includes('최근')) {
  problems.push(`도구를 쓰고 돌아왔는데 「최근」 칸이 없다 — 나온 칸: ${sections.join(', ') || '없음'}`);
} else {
  const first = (await rowTitles())[0] || '';
  if (!first.includes('글자수')) problems.push(`방금 연 도구가 최근 맨 위가 아니다 — 맨 위: ${first}`);
}

/* ── ⑨ 헤더에 상시 검색창이 없다 (사용자 거부 항목) ────────── */
const headerInputs = await page.$$eval('.header-bar input, .sidebar input', (els) => els.length);
if (headerInputs > 0) problems.push(`헤더/사이드바에 상시 입력칸이 ${headerInputs}개 생겼다 — 두지 않기로 한 것이다`);

await browser.close();
server.close();

if (problems.length) {
  console.error('[smoke-palette] 문제 ' + problems.length + '건');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('[smoke-palette] 찾기·초성·Enter·⌘K·최근·숨은도구 9개 항목 OK');
