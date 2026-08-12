/**
 * 코드 사진 — 정말로 색이 칠해지고 껍데기가 갈리는가 (TASK-KL-245).
 *
 * 알맹이 검사(`test-codeshot-core.mjs`)가 **재는 일**을 지킨다면 이쪽은 **칠하는 일**을 지킨다.
 * 문법 색칠은 Prism 이 화면에서 뒤늦게 언어 파일을 받아 와 다시 칠하는 구조라, 한 박자
 * 어긋나면 「처음 고른 언어만 색이 없다」가 된다 — 그건 브라우저를 띄워야만 잡힌다.
 *
 * 사용: node scripts/smoke-codeshot.mjs
 */
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

const frozen = process.env.URL ? null : await serveRepo();
const BASE = process.env.URL || `${frozen.base}/apps/karmolab/index.html`;

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await page.goto(`${BASE}#codeshot`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#csCanvas', { timeout: 20000 });
await page.waitForTimeout(1500);

/** 캔버스에서 **서로 다른 색이 몇 가지** 쓰였나 — 색칠이 됐는지의 증거. */
const paletteOf = async () =>
  page.evaluate(() => {
    const cv = document.querySelector('#csCanvas');
    const c = cv.getContext('2d', { willReadFrequently: true });
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 7) {
      // 아주 어두운 바탕은 세지 않는다 — 글자 색만 보고 싶다
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      if (r + g + b < 150) continue;
      seen.add(`${r >> 4},${g >> 4},${b >> 4}`);
    }
    return seen.size;
  });

const sizeOf = async () =>
  page.evaluate(() => {
    const cv = document.querySelector('#csCanvas');
    return { w: cv.width, h: cv.height };
  });

/* ① 열자마자 한 장이 그려져 있다 */
const first = await sizeOf();
check(first.w > 200 && first.h > 100, `열면 바로 그림이 있어야 한다 (지금 ${first.w}×${first.h})`);

/* ② 문법 색칠이 실제로 됐다 — 한 가지 색만 쓰였으면 색칠이 안 된 것이다 */
const colors = await paletteOf();
check(colors >= 4, `여러 색으로 칠해져야 한다 (지금 ${colors}가지)`);

/* ③ 껍데기를 갈면 그림이 달라진다 */
const shotOf = async () => (await page.locator('#csCanvas').screenshot()).toString('base64').slice(0, 4000);
const before = await shotOf();
await page.selectOption('#csFrame', 'paper');
await page.waitForTimeout(700);
const after = await shotOf();
check(before !== after, '껍데기를 갈면 그림이 달라져야 한다');

/* ④ 종이 껍데기는 밝은 바닥이다 — 껍데기가 색 한 벌을 함께 정한다는 규칙의 증거 */
const bg = await page.evaluate(() => {
  const cv = document.querySelector('#csCanvas');
  const c = cv.getContext('2d', { willReadFrequently: true });
  const d = c.getImageData(2, 2, 1, 1).data;
  return d[0] + d[1] + d[2];
});
check(bg > 450, `종이 껍데기의 바닥은 밝아야 한다 (지금 밝기 합 ${bg})`);

/* ⑤ 언어를 바꿔도 색칠이 유지된다 — Prism 이 언어 파일을 뒤늦게 받아 오는 자리 */
await page.selectOption('#csFrame', 'specimen');
await page.selectOption('#csLang', 'python');
await page.fill('#csCode', 'def hi(name):\n    # 인사한다\n    return f"hello {name}"\n');
await page.waitForTimeout(1600);
const pyColors = await paletteOf();
check(pyColors >= 4, `언어를 바꿔도 색이 칠해져야 한다 (지금 ${pyColors}가지)`);

/* ⑥ 줄이 늘면 그림이 길어진다 (줄을 접지 않는다는 규칙의 화면 쪽 증거) */
const short = await sizeOf();
await page.fill('#csCode', Array.from({ length: 20 }, (_, i) => `line_${i} = ${i}`).join('\n'));
await page.waitForTimeout(900);
const tall = await sizeOf();
check(tall.h > short.h, '줄이 늘면 그림이 길어져야 한다');

/* ⑦ 긴 줄은 접지 않고 넓어진다 */
await page.fill('#csCode', 'x = ' + '"' + 'a'.repeat(200) + '"');
await page.waitForTimeout(900);
const wide = await sizeOf();
check(wide.w > tall.w * 1.5, '긴 줄은 접지 않고 그림이 넓어져야 한다');

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-codeshot] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-codeshot] 전부 통과');
