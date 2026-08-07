/**
 * 도구 목록 페이지가 성한지 확인 (TASK-KL-089)
 *
 * 다른 검사들은 도구 **상세** 페이지만 본다. 정작 목록 페이지는 아무도 안 보는데,
 * 여기는 검색으로 들어온 사람이 「다른 건 뭐가 있나」 하고 거치는 관문이고
 * 크롤러가 도구 전체를 발견하는 통로이기도 하다. 여기가 비면 그 아래가 통째로 가려진다.
 *
 * 보는 것:
 *  - 페이지가 200 으로 열리는가
 *  - 도구가 **하나도 빠짐없이** 걸려 있는가 (tools-seo.json 과 대조)
 *  - 링크가 실제로 눌리는가 (첫 카드를 눌러 그 도구 페이지로 가는지)
 *  - 분류 묶음이 남아 있는가
 *
 * 사용: node scripts/smoke-hub.mjs
 *       BASE=http://127.0.0.1:8797/apps/blog node scripts/smoke-hub.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;
const expected = Object.keys(seo);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const problems = [];

const res = await page.goto(`${BASE}/karmolab/t/`, { waitUntil: 'networkidle', timeout: 30000 });
if (res.status() !== 200) problems.push(`목록 페이지가 안 열린다 (http ${res.status()})`);

const state = await page.evaluate(() => {
  const links = [...document.querySelectorAll('a[href^="/karmolab/t/"]')];
  const ids = links
    .map((a) => a.getAttribute('href').replace(/^\/karmolab\/t\//, '').replace(/\/$/, ''))
    .filter(Boolean);
  const first = document.querySelector('.tool-hub-card');
  return {
    ids: [...new Set(ids)],
    groups: document.querySelectorAll('.tool-hub-group').length,
    cards: document.querySelectorAll('.tool-hub-card').length,
    firstHref: first ? first.getAttribute('href') : null,
    // 목록이 화면에 실제로 보이는가 (스타일이 깨져 통째로 숨는 사고를 잡는다)
    visibleCards: [...document.querySelectorAll('.tool-hub-card')].filter((c) => c.getBoundingClientRect().height > 0).length
  };
});

// 빠진 도구가 있는지는 **링크로** 센다. 묶음 부모는 카드가 아니라 분류 제목 링크로 걸리므로
// 카드 수는 늘 도구 수보다 적다 — 그것을 문제로 세었다가 멀쩡한 목록을 실패로 판정했다.
const missing = expected.filter((id) => !state.ids.includes(id));
if (missing.length) problems.push(`목록에 없는 도구 ${missing.length}개: ${missing.slice(0, 12).join(', ')}`);
if (state.visibleCards !== state.cards) problems.push(`화면에 안 보이는 카드 ${state.cards - state.visibleCards}개`);
if (state.groups < 3) problems.push(`분류 묶음이 ${state.groups}개뿐이다`);

/* ── 걸러 찾기 ──────────────────────────────────────
 * 백 가지가 넘으면 눈으로 훑기 어려워 넣은 기능이다. 조용히 멈추면 목록이 다시 훑기만 남는다. */
{
  let find = await page.$('#hubFind');
  if (!find) problems.push('걸러 찾는 칸이 없다');
  else {
    await find.fill('PDF');
    await page.waitForTimeout(400);
    const narrowed = await page.evaluate(() => ({
      shown: [...document.querySelectorAll('.tool-hub-card')].filter((c) => c.getBoundingClientRect().height > 0).length,
      total: document.querySelectorAll('.tool-hub-card').length
    }));
    if (narrowed.shown === 0) problems.push('걸러 찾기에 「PDF」 를 넣으니 하나도 안 남는다');
    else if (narrowed.shown >= narrowed.total) problems.push('걸러 찾기가 아무것도 걸러 내지 못한다');

    // 영문 이름으로도 찾힌다 — 「regex」 로 치는 사람이 「정규식」 으로 치는 사람만큼 많다.
    for (const [q, least] of [['regex', 2], ['hash', 2], ['timer', 1], ['diff', 2]]) {
      await find.fill(q);
      await page.waitForTimeout(350);
      const n = await page.evaluate(
        () => [...document.querySelectorAll('.tool-hub-card')].filter((c) => c.getBoundingClientRect().height > 0).length
      );
      if (n < least) problems.push(`영문 이름으로 못 찾는다 (「${q}」 로 ${n}개, 적어도 ${least}개)`);
    }

    // 갈래 이름으로도 찾힌다 — 사람은 「개발」 처럼 분류 이름을 치기도 한다.
    await find.fill('개발');
    await page.waitForTimeout(400);
    const byGroup = await page.evaluate(
      () => [...document.querySelectorAll('.tool-hub-card')].filter((c) => c.getBoundingClientRect().height > 0).length
    );
    if (byGroup < 5) problems.push(`분류 이름으로 찾기가 안 된다 (「개발」 로 ${byGroup}개만 남음)`);
    await find.fill('PDF');
    await page.waitForTimeout(400);

    // 화면에 보이는 카드 수와 분류 옆 숫자의 합은 늘 같아야 한다.
    // 걸러 찾기·분류 숫자·목차가 각각 따로 갱신되므로, 하나만 손보면 조용히 어긋난다.
    const consistent = await page.evaluate(() => {
      const vis = (e) => e.getBoundingClientRect().height > 0;
      const cards = [...document.querySelectorAll('.tool-hub-card')].filter(vis).length;
      const sum = [...document.querySelectorAll('.tool-hub-group')]
        .filter(vis)
        .reduce((s, g) => s + (parseInt(g.querySelector('.tool-hub-count')?.textContent || '0', 10) || 0), 0);
      return { cards, sum };
    });
    if (consistent.cards !== consistent.sum) {
      problems.push(`걸러낸 뒤 카드 수와 분류 숫자 합이 다르다 (카드 ${consistent.cards} · 합 ${consistent.sum})`);
    }

    // 걸러낸 뒤에도 목차가 성해야 한다 — 숨은 분류로 가는 링크는 눌러도 갈 곳이 없다.
    const tocState = await page.evaluate(() => {
      const links = [...document.querySelectorAll('.tool-hub-toc a')].filter((a) => a.getBoundingClientRect().height > 0);
      const dead = links.filter((a) => {
        const el = document.getElementById(a.getAttribute('href').slice(1));
        return !el || el.style.display === 'none';
      });
      return { visible: links.length, dead: dead.length };
    });
    if (tocState.dead) problems.push(`걸러낸 뒤 목차에 갈 곳 없는 링크 ${tocState.dead}개`);
    if (!tocState.visible) problems.push('걸러낸 뒤 목차가 통째로 사라진다');

    // 초성으로도 찾힌다 — 「ㄱㅈㅅ」 로 글자수 세기를 부르는 식이다.
    await find.fill('ㄱㅈㅅ');
    await page.waitForTimeout(400);
    const byCho = await page.evaluate(() =>
      [...document.querySelectorAll('.tool-hub-card')]
        .filter((c) => c.getBoundingClientRect().height > 0)
        .map((c) => c.querySelector('strong')?.textContent || '')
    );
    if (!byCho.some((n) => n.includes('글자수'))) problems.push('초성으로 찾기가 안 된다 (ㄱㅈㅅ → 글자수 세기)');

    // 걸러 놓고 엔터를 누르면 맨 앞 도구로 간다.
    await find.fill('글자수');
    await page.waitForTimeout(400);
    const firstHref = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.tool-hub-card')].filter((x) => x.getBoundingClientRect().height > 0)[0];
      return c ? c.getAttribute('href') : null;
    });
    await page.press('#hubFind', 'Enter');
    await page.waitForLoadState('networkidle');
    if (!firstHref || !new URL(page.url()).pathname.startsWith(firstHref)) {
      problems.push(`걸러 놓고 엔터를 눌러도 그 도구로 안 간다 (${new URL(page.url()).pathname})`);
    }
    // 다시 목록으로 돌아와 이어서 본다 (페이지가 바뀌었으므로 손잡이를 새로 잡는다)
    await page.goto(`${BASE}/karmolab/t/`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(500);
    find = await page.$('#hubFind');

    await find.fill('이런건없다');
    await page.waitForTimeout(400);
    const emptyShown = await page.evaluate(
      () => (document.querySelector('.tool-hub-empty')?.getBoundingClientRect().height || 0) > 0
    );
    if (!emptyShown) problems.push('찾는 것이 없을 때 안내가 안 뜬다');

    await find.fill('');
    await page.waitForTimeout(400);
    const restored = await page.evaluate(
      () => [...document.querySelectorAll('.tool-hub-card')].filter((c) => c.getBoundingClientRect().height > 0).length
    );
    if (restored !== state.cards) problems.push(`비웠는데 목록이 안 돌아온다 (${restored}/${state.cards})`);

    // 찾은 결과를 주소로 주고받을 수 있어야 한다 — 링크로 보낸 사람과 받은 사람이 같은 화면을 본다.
    await find.fill('PDF');
    await page.waitForTimeout(400);
    if (!/[?&]q=/.test(page.url())) problems.push('걸러 찾은 결과가 주소에 안 남는다');
    const shared = await page.goto(`${BASE}/karmolab/t/?q=PDF`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(600);
    const fromLink = await page.evaluate(() => ({
      value: document.getElementById('hubFind')?.value || '',
      shown: [...document.querySelectorAll('.tool-hub-card')].filter((c) => c.getBoundingClientRect().height > 0).length
    }));
    if (shared.status() !== 200 || fromLink.value !== 'PDF' || fromLink.shown === 0) {
      problems.push(`검색어가 붙은 주소로 들어가면 그 상태로 안 열린다 (칸="${fromLink.value}" 보이는 카드 ${fromLink.shown})`);
    }

    /* 한글 검색어도 마찬가지여야 한다 — 이 사이트를 쓰는 사람 대부분이 한글로 친다.
     * 주소에 실릴 때 글자가 한 번 감싸지므로, 푸는 쪽이 어긋나면 **한글 링크만** 조용히 깨진다. */
    const ko = '이미지';
    const korean = await page.goto(`${BASE}/karmolab/t/?q=${encodeURIComponent(ko)}`, {
      waitUntil: 'networkidle',
      timeout: 25000
    });
    await page.waitForTimeout(600);
    const fromKorean = await page.evaluate(() => ({
      value: document.getElementById('hubFind')?.value || '',
      shown: [...document.querySelectorAll('.tool-hub-card')].filter((c) => c.getBoundingClientRect().height > 0).length
    }));
    if (korean.status() !== 200 || fromKorean.value !== ko || fromKorean.shown === 0) {
      problems.push(`한글 검색어가 붙은 주소가 깨진다 (칸="${fromKorean.value}" 보이는 카드 ${fromKorean.shown})`);
    }
  }
}

// 실제로 눌러서 그 도구로 가는지
if (state.firstHref) {
  // 앞 단계에서 걸러 놓은 상태로 오면 첫 카드가 숨어 있어 눌리지 않는다.
  // 「거르지 않은 목록」으로 돌아와서 누른다 — 카드 차례가 바뀌어도 흔들리지 않는다.
  await page.goto(`${BASE}/karmolab/t/`, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(400);
  await page.click('.tool-hub-card');
  await page.waitForLoadState('networkidle');
  const landed = new URL(page.url()).pathname;
  if (!landed.startsWith(state.firstHref)) problems.push(`카드를 눌렀더니 엉뚱한 곳으로 간다 (${landed})`);
} else {
  problems.push('누를 카드가 하나도 없다');
}

/* ── 아래로 내려갈 수 있는가 ─────────────────────────
 * 이 페이지는 백 가지가 넘는 목록이라 첫 화면에 다 안 들어간다. 그런데 앱 껍데기용 스크롤
 * 잠금(body overflow:hidden)이 껍데기 없는 이 문서에도 걸려, 데스크톱에서 첫 화면 밑이
 * 통째로 못 보게 갇혀 있었다. 여기 검사가 없어 아무도 못 잡았다.
 * 주의: window.scrollTo 로 재면 잠겨 있어도 통과한다 — **바퀴를 실제로 굴려** 확인한다. */
{
  const s = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const sp = await s.newPage();
  await sp.goto(`${BASE}/karmolab/t/`, { waitUntil: 'networkidle', timeout: 30000 });
  await sp.waitForTimeout(400);
  /* 내려가는 자리가 **문서라고 단정하지 않는다** (TASK-KL-129).
   * 목록이 앱 셸 안으로 들어오면서 실제로 굴러가는 것은 본문 칸(.main-content)이다.
   * 문서만 재면 「짧다」고 나오는데, 화면에서는 멀쩡히 내려간다 — 검사가 거짓으로 운다.
   * 굴릴 것을 먼저 찾고, 그 다음에 **바퀴를 실제로 굴려** 확인한다. */
  const scroller = await sp.evaluate(() => {
    const cands = [document.querySelector('.main-content'), document.scrollingElement].filter(Boolean);
    const hit = cands.find((e) => e.scrollHeight > e.clientHeight + 100);
    return hit ? (hit === document.scrollingElement ? 'doc' : 'main') : null;
  });
  if (!scroller) problems.push('목록이 한 화면보다 짧다 — 스크롤 검사가 아무것도 못 본다');
  else {
    await sp.mouse.move(640, 450);
    await sp.mouse.wheel(0, 1200);
    await sp.waitForTimeout(400);
    const y = await sp.evaluate(
      (which) => (which === 'main' ? document.querySelector('.main-content').scrollTop : document.scrollingElement.scrollTop),
      scroller
    );
    if (y < 100) problems.push(`바퀴를 굴려도 안 내려간다 — 아래가 통째로 갇혔다 (${scroller} scrollTop ${y})`);
  }
  await sp.close();
  await s.close();
}

/* ── 폰에서 본 목록 ─────────────────────────────────
 * 이 페이지는 검색으로 들어온 사람이 처음 밟는 자리이고, 그 대부분이 폰이다. 도구 페이지에는
 * 이미 같은 검사가 걸려 있는데 정작 관문에는 없었다 — 실제로 분류 옆 숫자가 11px 이었다. */
{
  const phone = await (await browser.newContext({ viewport: { width: 375, height: 720 } })).newPage();
  await phone.goto(`${BASE}/karmolab/t/`, { waitUntil: 'networkidle', timeout: 30000 });
  await phone.waitForTimeout(700);
  const m = await phone.evaluate(() => {
    const near = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const clipped = [...document.querySelectorAll('body *')]
      .filter((e) => e.scrollWidth > e.clientWidth + 2 && near(e))
      .filter((e) => !['auto', 'scroll'].includes(getComputedStyle(e).overflowX))
      /* 일부러 자른 한 줄은 사고가 아니다 (TASK-KL-128 — 카드 설명은 한 줄로 자르고 「…」를
         붙인다. 뒷부분은 도구를 열면 다 보이고 마우스를 올려도 뜬다). 이 검사가 잡아야 하는
         것은 **자를 생각이 없었는데 잘린 것**이다. 예전부터 여기 걸려 울고 있었다. */
      .filter((e) => getComputedStyle(e).textOverflow !== 'ellipsis')
      .map((e) => `${(e.className || e.tagName).toString().split(' ')[0].slice(0, 18)} ${e.scrollWidth}>${e.clientWidth}`);
    const smallTap = [...document.querySelectorAll('a.tool-hub-card, .tool-hub-toc a, button, input')]
      .filter(near)
      .filter((e) => { const b = e.getBoundingClientRect(); return Math.min(b.width, b.height) < 32; })
      .map((e) => `${(e.className || e.tagName).toString().split(' ')[0].slice(0, 18)}`);
    const tinyText = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let n;
    while ((n = walk.nextNode())) {
      if ((n.textContent || '').trim().length < 2) continue;
      const e = n.parentElement;
      if (!e || seen.has(e) || !near(e)) continue;
      seen.add(e);
      const px = parseFloat(getComputedStyle(e).fontSize);
      if (px < 12) tinyText.push(`${(e.className || e.tagName).toString().split(' ')[0].slice(0, 18)} ${px}px`);
    }
    const inputs = [...document.querySelectorAll('input')].filter(near).map((e) => parseFloat(getComputedStyle(e).fontSize));
    return { clipped: clipped.slice(0, 2), smallTap: [...new Set(smallTap)].slice(0, 2), tinyText: [...new Set(tinyText)].slice(0, 2), inputs };
  });
  if (m.clipped.length) problems.push(`폰에서 잘려 못 보는 것 — ${m.clipped.join(' , ')}`);
  if (m.smallTap.length) problems.push(`폰에서 누르기 작은 것 — ${m.smallTap.join(' , ')}`);
  if (m.tinyText.length) problems.push(`폰에서 글씨가 작은 것 — ${m.tinyText.join(' , ')}`);
  if (m.inputs.some((px) => px < 16)) problems.push(`찾기 칸을 누르면 화면이 확대된다 (${m.inputs.join(',')}px)`);
  await phone.close();
}

/* ── 없는 도구 주소 ─────────────────────────────────
 * 오타나 옛 링크로 들어온 주소가 200 을 돌려주면 검색엔진이 그 빈 페이지를 정상 문서로 색인한다.
 * (없는 문서를 200 으로 답하는 것을 「가짜 200」이라 부른다.) 404 로 답해야 한다. */
{
  const ghost = await page.goto(`${BASE}/karmolab/t/이런도구는없다/`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000
  });
  if (ghost.status() === 200) problems.push('없는 도구 주소가 200 을 돌려준다 (빈 페이지가 색인된다)');
}

/* ── 앱 첫 화면 ─────────────────────────────────────
 * 여기도 아무 검사가 안 보던 자리다. 브랜드가 처음 보이는 곳이고, 여기서 도구 목록으로
 * 건너갈 길이 끊기면 사람도 크롤러도 아래로 못 내려간다. */
const home = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const homeErrs = [];
home.on('pageerror', (e) => homeErrs.push(String(e.message).slice(0, 70)));
const homeRes = await home.goto(`${BASE}/karmolab/`, { waitUntil: 'networkidle', timeout: 30000 });
await home.waitForTimeout(1200);

// 첫 화면(`/karmolab/index.html`)은 배포가 복사해 만든다. 로컬 사본에는 없을 수 있는데,
// 그건 이 환경에 없는 것이지 사이트가 깨진 게 아니다 — 없으면 건너뛴다(라이브에는 늘 있다).
const homeMissing = homeRes.status() === 404;
if (!homeMissing && homeRes.status() !== 200) problems.push(`첫 화면이 안 열린다 (http ${homeRes.status()})`);

const homeState = homeMissing ? null : await home.evaluate(() => {
  const landing = document.querySelector('.landing-page, #page-home');
  const toHub = [...document.querySelectorAll('a[href*="/karmolab/t/"]')].filter(
    (a) => a.getBoundingClientRect().height > 0
  );
  return {
    landingVisible: (landing?.getBoundingClientRect().height || 0) > 100,
    navItems: document.querySelectorAll('.nav-item').length,
    hubLinks: toHub.length,
    text: (document.body.innerText || '').trim().length
  };
});
if (homeState) {
  if (!homeState.landingVisible) problems.push('첫 화면에 아무것도 안 그려진다');
  if (!homeState.hubLinks) problems.push('첫 화면에서 도구 목록으로 갈 길이 없다');
  if (homeState.navItems < 10) problems.push(`사이드바가 비었다 (항목 ${homeState.navItems}개)`);
  if (homeErrs.length) problems.push(`첫 화면 콘솔 에러 — ${homeErrs[0]}`);
}

await browser.close();

if (problems.length) {
  console.error(`[smoke-hub] 관문(첫 화면·도구 목록)에 문제 ${problems.length}건`);
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
const homeNote = homeState ? `사이드바 ${homeState.navItems}개` : '이 환경엔 사본이 없어 건너뜀';
console.log(`[smoke-hub] 관문 정상 — 첫 화면 ${homeNote} · 목록 카드 ${state.cards}개 · 분류 ${state.groups}개 · 빠진 도구 0`);
