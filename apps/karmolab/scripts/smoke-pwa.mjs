/**
 * 앱으로 설치할 때 쓰는 정보가 성한지 확인 (TASK-KL-089)
 *
 * 실제로 셋이 한꺼번에 틀어져 있었다 — 아이콘 파일이 아예 없었고(404), 설치하면 열리는
 * 주소가 앱 주소가 아니라 자산 경로였고, 설명이 이 사이트와 무관한 옛 문구였다.
 * 눈에 안 띄는 자리라 아무도 모른 채 오래 있었다.
 *
 * 보는 것:
 *  - 설치 정보를 받을 수 있는가
 *  - 가리키는 아이콘이 실제로 있는가 (여기서 404 가 나면 설치가 막힌다)
 *  - 설치하면 열리는 주소와 맡는 범위가 **앱 주소**인가 (자산 경로면 오프라인 저장이 어긋난다)
 *  - 범위가 도구 상세 페이지까지 덮는가
 *  - 이름·설명이 비어 있지 않은가
 *
 * 그림 없이 주소만 받아 보므로 빠르다.
 *
 * 사용: node scripts/smoke-pwa.mjs
 *       BASE=http://127.0.0.1:8797/apps/blog node scripts/smoke-pwa.mjs
 */
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const APP = '/karmolab/';

// 설치 정보와 아이콘은 사이트 뿌리 기준 주소(`/apps/karmolab/...`)로 걸려 있다.
// 로컬 사본을 볼 때 BASE 에 하위 경로가 붙어 있어도 뿌리에서 찾아야 한다.
const ORIGIN = new URL(BASE).origin;

const problems = [];

const res = await fetch(`${ORIGIN}/apps/karmolab/manifest.json`);
if (!res.ok) {
  console.error(`[smoke-pwa] 설치 정보를 못 받는다 (http ${res.status})`);
  process.exit(1);
}
const m = await res.json();

if (!m.name) problems.push('앱 이름이 비었다');
if (!m.description) problems.push('설명이 비었다');
if (m.start_url !== APP) problems.push(`설치하면 열리는 주소가 앱 주소가 아니다 (${m.start_url})`);
if (m.scope !== APP) problems.push(`맡는 범위가 앱 주소가 아니다 (${m.scope})`);
if (m.scope && !`${APP}t/loan/`.startsWith(m.scope)) problems.push('범위가 도구 상세 페이지를 덮지 않는다');

const icons = m.icons || [];
if (icons.length < 2) problems.push(`아이콘이 ${icons.length}개뿐이다 (192·512 가 필요하다)`);
for (const icon of icons) {
  const url = icon.src.startsWith('http') ? icon.src : `${ORIGIN}${icon.src}`;
  try {
    const r = await fetch(url, { method: 'GET' });
    if (!r.ok) problems.push(`아이콘 ${icon.sizes} 가 없다 (http ${r.status})`);
    else {
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length < 500) problems.push(`아이콘 ${icon.sizes} 가 너무 작다 (${buf.length}바이트)`);
    }
  } catch (e) {
    problems.push(`아이콘 ${icon.sizes} 를 받다 실패 — ${String(e.message).slice(0, 40)}`);
  }
}

/* ── iOS 홈 화면 아이콘 ─────────────────────────────
 * 설치 정보에는 안 적히고 페이지의 링크로만 걸린다. 없으면 iOS 가 화면을 찍어 아이콘으로 삼아
 * 브랜드가 사라지는데, 그 사실이 어디에도 안 드러난다. */
{
  const r = await fetch(`${ORIGIN}/apps/karmolab/img/apple-touch-icon.png`);
  if (!r.ok) problems.push(`iOS 홈 화면 아이콘이 없다 (http ${r.status})`);
}

/* ── 바로가기 ───────────────────────────────────────
 * 설치한 앱 아이콘을 길게 누르면 나오는 목록이다. 여기 걸린 주소가 죽으면 눌러도 아무 일이
 * 없거나 없는 페이지로 간다 — 도구 이름이 바뀌면 조용히 그렇게 된다. */
for (const s of m.shortcuts || []) {
  if (!s.url?.startsWith(APP)) {
    problems.push(`바로가기 「${s.name}」 의 주소가 앱 범위 밖이다 (${s.url})`);
    continue;
  }
  // 바로가기는 **페이지**라 BASE 기준이다(설치 정보·아이콘은 사이트 뿌리 기준이라 ORIGIN 을 썼다).
  const r = await fetch(`${BASE}${s.url}`);
  if (!r.ok) problems.push(`바로가기 「${s.name}」 가 없는 페이지를 가리킨다 (http ${r.status})`);
}

/* ── 끊고도 열리는가 ────────────────────────────────
 * 앱으로 설치하는 이유가 이것이다. 서비스 워커가 죽거나 범위가 어긋나면 설치해도 빈 화면이 된다.
 * 워커는 https 에서만 돌고 로컬 사본은 주소 범위가 달라 등록되지 않으므로, 실제 사이트일 때만 본다. */
const isLive = ORIGIN.startsWith('https://');
let offlineNote = '끊고 열기는 실제 사이트에서만 본다 — 건너뜀';

if (isLive) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    // 워커가 제어를 잡으려면 한 번 방문한 뒤 다시 들어가야 한다.
    await page.goto(`${ORIGIN}${APP}t/loan/`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    if (!controlled) problems.push('서비스 워커가 페이지를 제어하지 않는다 (설치해도 끊기면 빈 화면)');

    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    const r = await page.evaluate(() => ({
      tool: (document.querySelector('.tool-page.active')?.getBoundingClientRect().height || 0) > 60,
      text: (document.body.innerText || '').length
    }));
    if (!r.tool && r.text < 200) problems.push(`끊으면 빈 화면이 된다 (글 ${r.text}자)`);
    else offlineNote = `끊어도 열린다 (글 ${r.text}자)`;
    await ctx.setOffline(false);
  } catch (e) {
    problems.push(`끊고 열다 실패 — ${String(e.message).slice(0, 60)}`);
  }
  await browser.close();
}

if (problems.length) {
  console.error(`[smoke-pwa] 설치 정보에 문제 ${problems.length}건`);
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log(
  `[smoke-pwa] 설치 정보 정상 — 이름 "${m.name}" · 시작 ${m.start_url} · 아이콘 ${icons.length}개 모두 있음 · ${offlineNote}`
);
