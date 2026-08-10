/**
 * 비교 슬라이더와 흐른 시간 카운터가 **화면에서** 도는가 (흡수 ⓐ)
 *
 * 이 둘은 알맹이 시험으로 못 잡는 자리가 하나씩 있다:
 *
 * ★ 비교 슬라이더 — 겹치는 **방향**. 왼쪽에 「전」, 오른쪽에 「후」가 와야 하는데 자르는 쪽을
 *   뒤집어도 화면은 멀쩡해 보인다(그림 두 장이 다 있으니까). 색이 다른 두 장을 넣고
 *   왼쪽·오른쪽 점을 실제로 읽어야 잡힌다.
 *
 * ★ 카운터 — **떠날 때 멈추는가.** 안 멈춰도 화면에는 아무 표시가 없다. 그런 게 열 개 쌓이면
 *   가만히 둔 노트북의 배터리가 닳고, 원인은 어디에도 안 보인다. 그래서 뒷정리를 부른 뒤
 *   숫자가 **더는 안 바뀌는지**까지 본다.
 *
 * 사용: node scripts/smoke-compare-count.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const NL = String.fromCharCode(10);
const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const NEEDED = ['js/widgets/tools/comparepic.js', 'js/widgets/tools/livecount.js'];
const missing = NEEDED.filter((rel) => fs.existsSync(path.join(appRoot, rel)) === false);
if (missing.length > 0) {
  console.log(`[compare-count] CANNOT-RUN(건너뜀) — 번들이 아직 없다: ${missing.join(' · ')}`);
  console.log('  `node build.mjs` 뒤에 돌려라.');
  process.exit(0);
}

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  console.error('[compare-count] CANNOT-RUN — 브라우저를 못 띄웠다. `npx playwright install chromium` 이 필요하다.');
  console.error(String(error?.message ?? error).split(NL)[0]);
  process.exit(1);
}

const page = await browser.newPage();
await page.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__KARMO_LOCALE = 'ko';
  window.__reg = {};
  window.__dispose = [];
  window.Toolbox = {
    register: (t) => {
      window.__reg[t.id] = t;
    },
    trackUse() {},
    copyText() {},
    /* 뒷정리를 **붙잡아 둔다** — 이 검사의 절반이 「그걸 부르면 진짜 멈추는가」다. */
    onDispose: (fn) => window.__dispose.push(fn),
    mountTool() {
      return true;
    }
  };
});
const read = (rel) => fs.readFileSync(path.join(appRoot, rel), 'utf8');
await page.addScriptTag({ content: read('js/widgets/tools/comparepic.js') });
await page.addScriptTag({ content: read('js/widgets/tools/livecount.js') });

const fails = [];

/* ── 비교 슬라이더 ───────────────────────────────────────────────────────── */
const cmp = await page.evaluate(async () => {
  const tool = window.__reg['comparepic'];
  if (!tool) return { missing: true };
  const host = document.createElement('div');
  host.id = 'cpHost';
  host.style.width = '400px';
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  /** 한 가지 색으로 채운 그림 한 장을 파일처럼 만든다. */
  const makeFile = async (name, color) => {
    const c = document.createElement('canvas');
    c.width = 100;
    c.height = 100;
    const ctx = c.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 100, 100);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return new File([blob], name, { type: 'image/png' });
  };
  const put = async (sel, file) => {
    const input = host.querySelector(sel);
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  await put('#cpA', await makeFile('a.png', '#ff0000')); // 왼쪽 = 빨강
  await put('#cpB', await makeFile('b.png', '#0000ff')); // 오른쪽 = 파랑
  await new Promise((r) => setTimeout(r, 400));

  const canvas = host.querySelector('#cpCanvas');
  const ctx = canvas.getContext('2d');
  const at = (x) => {
    const d = ctx.getImageData(Math.round(canvas.width * x), Math.round(canvas.height / 2), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  return { left: at(0.15), right: at(0.85), w: canvas.width, h: canvas.height };
});

if (cmp.missing === true) {
  fails.push('번들을 실어도 comparepic 이 등록되지 않는다');
} else if (cmp.w === 0 || cmp.h === 0) {
  fails.push('그림 두 장을 넣어도 그림판 크기가 0이다 — 아무것도 안 그려졌다');
} else {
  /* 손잡이가 가운데(0.5)일 때 왼쪽은 「전」, 오른쪽은 「후」여야 한다. */
  if (cmp.left[0] < 200 || cmp.left[2] > 60) fails.push(`왼쪽이 「전」(빨강)이 아니다: rgb(${cmp.left.join(',')})`);
  if (cmp.right[2] < 200 || cmp.right[0] > 60) fails.push(`오른쪽이 「후」(파랑)가 아니다: rgb(${cmp.right.join(',')})`);
}

/* ── 흐른 시간 카운터 ────────────────────────────────────────────────────── */
const count = await page.evaluate(async () => {
  const tool = window.__reg['livecount'];
  if (!tool) return { missing: true };
  const before = window.__dispose.length;
  const host = document.createElement('div');
  host.id = 'lcHost';
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  const read = () => host.querySelector('#lcBig')?.textContent ?? '';
  const first = read();
  await new Promise((r) => setTimeout(r, 1300));
  const ticked = read();

  /* 화면을 떠난다 — 도구를 갈아 끼울 때 셸이 하는 일 그대로. */
  const mine = window.__dispose.slice(before);
  for (const fn of mine) fn();
  const atLeave = read();
  await new Promise((r) => setTimeout(r, 1300));
  const afterLeave = read();

  return { first, ticked, atLeave, afterLeave, disposers: mine.length };
});

if (count.missing === true) {
  fails.push('번들을 실어도 livecount 가 등록되지 않는다');
} else {
  if (count.first === count.ticked) fails.push(`1.3초를 기다려도 숫자가 안 올라간다: ${count.first}`);
  if (count.disposers === 0) fails.push('뒷정리를 안 맡긴다 — 도구를 닫아도 계속 돈다');
  if (count.atLeave !== count.afterLeave) {
    fails.push(`떠난 뒤에도 계속 돈다: ${count.atLeave} → ${count.afterLeave}`);
  }
}

await browser.close();

if (fails.length > 0) {
  console.error('[compare-count] 실패:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('[compare-count] 슬라이더 왼쪽=전·오른쪽=후 확인 · 카운터는 올라가다가 떠나면 멈춤');
