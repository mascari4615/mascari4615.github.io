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
  /* 도구 상세·목록은 배포 때 **찍히는 생성물**이라 소스 옆이 아니라 blog 밑에 있다.
     이어 주지 않으면 그 화면을 여는 검사가 통째로 404 를 본다. */
  if (urlPath.startsWith('/karmolab/t/')) urlPath = '/apps/blog' + urlPath;
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

/* ── ① 첫 화면에 찾는 입력이 있다 ───────────────────────────
 * 예전에는 「포커스까지 쥐어야 한다」로 봤다. 그런데 첫 화면이 바뀌어 입력이 카드·통계
 * 아래로 내려갔고(KL-129, 사용자 요청), 그 자리에 자동 포커스를 주면 페이지가 아래로
 * 확 밀린다 — 그러면 위에 놓은 카드를 아무도 못 본다. 자리 다툼은 화면 주인이 정할 일이라
 * 여기서 규칙으로 박지 않는다. 이 검사가 지키는 것은 **입력이 있고 실제로 동작하는가** 다. */
await gotoHome();
const inputThere = await page.$('.kp-inline .kp-input');
if (!inputThere) problems.push('첫 화면에 찾는 입력이 없다');
// 검사는 사람처럼 눌러서 시작한다 — 자동 포커스에 기대면 그 정책이 바뀔 때 같이 깨진다.
await page.locator('.kp-inline .kp-input').click();

/* 카드 3장은 **남아 있어야 한다** (사용자 요청 2026-08-07). 한때 카드 자리를 팔레트가
 * 통째로 가져갔는데, 눈에 익은 자리를 그대로 두라는 말을 들었다. 둘 다 있는 것이 정답이다 —
 * 한쪽만 남으면 둘 중 누군가의 화면이 사라진 것이므로 여기서 잡는다. */
/* 장수는 고정이 아니다 — 다른 작업이 카드를 늘린다(커뮤니티가 그렇게 붙었다). 숫자를
 * 박아 두면 남의 정상적인 추가가 남의 잘못으로 잡힌다. 「사라지지 않았나」만 본다. */
const cards = await page.$$eval('.landing-cta-card', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
if (cards.length < 3) {
  problems.push(`첫 화면 카드가 ${cards.length}장뿐이다 — ${cards.join(' / ') || '없음'}`);
}
for (const must of ['즐겨찾기', '도구 목록', '문서']) {
  if (!cards.some((c) => c.startsWith(must))) problems.push(`첫 화면에서 「${must}」 카드가 사라졌다`);
}
/* 위아래 순서는 화면 주인이 정한다 (카드가 먼저인 지금 배치 = KL-129, 사용자 요청).
 * 검사가 지킬 것은 순서가 아니라 **둘 다 살아 있는가** 다 — 한쪽이 사라지면 그건 사고다. */
const bothThere = await page.evaluate(() => ({
  입력: !!document.querySelector('.landing-palette .kp-input'),
  카드: document.querySelectorAll('.landing-cta-card').length,
}));
if (!bothThere.입력) problems.push('첫 화면에서 찾는 입력이 사라졌다');
if (!bothThere.카드) problems.push('첫 화면에서 갈 곳 카드가 사라졌다');

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

/* ── ⑨ 둘러보기가 「한 번 쓰고 나면」 사라지지 않는다 ─────────
 * 예전에는 최근·즐겨찾기가 비었을 때만 갈래 칩을 보여 줬다. 도구를 한 번이라도 쓰면
 * 칩이 통째로 사라져(실측 4개 → 0개), 이름을 모르는 사람은 갈 곳이 없어졌다.
 * 위 ⑧ 에서 이미 도구를 하나 열었으므로 지금이 딱 그 상태다. */
const chipsAfterUse = await page.$$eval('.kp-inline .kp-browse-chip', (els) => els.map((e) => e.textContent.trim()));
if (!chipsAfterUse.length) {
  problems.push('도구를 쓰고 나니 둘러보기 칩이 사라졌다 — 이름을 모르면 갈 곳이 없다');
}

/* ── ⑩ 갈래를 펼치면 묶음 탭까지 나오고, 되돌아갈 길이 있다 ── */
if (chipsAfterUse.length) {
  await page.locator('.kp-inline .kp-browse-chip').first().click();
  await page.waitForTimeout(200);
  const opened = await page.$$eval('.kp-inline .kp-row', (els) => els.length);
  const children = await page.$$eval('.kp-inline .kp-row-child', (els) => els.length);
  if (opened < 50) problems.push(`갈래를 펼쳤는데 ${opened}줄뿐이다 — 묶음 안의 도구가 빠졌다`);
  if (!children) problems.push('묶음 탭이 부모 밑에 붙지 않았다 — 무엇의 일부인지 알 수 없다');

  const back = await page.$('.kp-inline .kp-back');
  if (!back) problems.push('갈래를 펼친 뒤 되돌아갈 길이 없다 — 막다른 골목이다');
  else {
    await back.click();
    await page.waitForTimeout(200);
    if (!(await page.$('.kp-inline .kp-browse-chip'))) problems.push('되돌아가기를 눌렀는데 안 돌아온다');
  }
}

/* ── ⑪ 헤더에 상시 검색창이 없다 (사용자 거부 항목) ────────── */
const headerInputs = await page.$$eval('.header-bar input, .sidebar input', (els) => els.length);
if (headerInputs > 0) problems.push(`헤더/사이드바에 상시 입력칸이 ${headerInputs}개 생겼다 — 두지 않기로 한 것이다`);

/* ── ⑫ 도구 화면은 팔레트를 **안 싣고** 뜬다. 그런데 눌러서 열린다 (TASK-KL-128 ①-b) ──
 *
 * 도구 화면은 앱 셸을 통째로 싣고 있었다. 팔레트는 거기서 첫 그림에 아무것도 안 하므로
 * 부팅에서 뺐는데, 셸이 `window.KarmoPalette?.…` 로 부르기 때문에 **그냥 빼면 ⌘K 가
 * 아무 일도 안 하고 오류도 안 난다** — 눈에 안 보이는 고장이다. 그래서 둘 다 본다:
 * 부팅 때 안 받았나 · 그런데 눌렀을 때 열리고 찾히나.
 */
{
  const tp = await ctx.newPage();
  const asked = [];
  tp.on('request', (r) => asked.push(r.url()));
  await tp.goto(`${BASE}/karmolab/t/loan/`, { waitUntil: 'load', timeout: 30000 });
  await tp.waitForTimeout(1200);
  const bootHas = (n) => asked.some((u) => u.includes(n));
  if (bootHas('palette.js')) problems.push('도구 화면이 부팅 때 팔레트를 받는다 — 미룬 것이 되돌아왔다');
  if (bootHas('widgets-index.js')) problems.push('도구 화면이 부팅 때 검색 목록을 받는다 — 미룬 것이 되돌아왔다');

  await tp.keyboard.press('Control+k');
  await tp.waitForSelector('.kp-overlay .kp-input', { timeout: 8000 })
    .catch(() => problems.push('도구 화면에서 ⌘K 를 눌러도 팔레트가 안 열린다 (미룬 뒤 조용히 죽음)'));
  if (!bootHas('palette.js')) problems.push('⌘K 를 눌렀는데 팔레트를 받으러 가지 않았다');
  await tp.keyboard.type('대출');
  await tp.waitForTimeout(500);
  const rows = await tp.$$eval('.kp-overlay .kp-row', (els) => els.length).catch(() => 0);
  if (!rows) problems.push('도구 화면에서 연 팔레트가 「대출」을 하나도 못 찾는다 — 검색 목록이 안 따라왔다');
  await tp.close();
}

await browser.close();
server.close();

if (problems.length) {
  console.error('[smoke-palette] 문제 ' + problems.length + '건');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('[smoke-palette] 찾기·초성·Enter·⌘K·최근·숨은도구·둘러보기·되돌아가기 + 도구화면 지연로드 12개 항목 OK');
