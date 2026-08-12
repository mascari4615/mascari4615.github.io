/**
 * 소리 풍경 — 정말로 소리가 나는가 (TASK-KL-248).
 *
 * 알맹이 검사가 셈법을 지킨다면 이쪽은 **실제로 울리는지**를 본다. 소리는 눈에 안 보이므로
 * 귀 대신 **파형을 잰다**: 브라우저에 분석기를 붙여 나오는 소리의 크기를 숫자로 읽는다.
 * 「켜졌다」가 아니라 「울린다」를 재야 한다 — 마디가 안 이어져도 상태는 켜짐으로 남는다.
 *
 * 사용: node scripts/smoke-soundscape.mjs
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

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await page.goto(`${BASE}#soundscape`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#ssLayers', { timeout: 20000 });
await page.waitForTimeout(600);

/* ① 겹 슬라이더가 다 붙었나 */
const sliders = await page.locator('#ssLayers input[type=range]').count();
check(sliders === 9, `겹 슬라이더가 아홉이어야 한다 (지금 ${sliders})`);
const presets = await page.locator('[data-preset]').count();
check(presets >= 5, `미리 섞어 둔 것이 다섯 이상이어야 한다 (지금 ${presets})`);

/**
 * 나오는 소리의 세기를 잰다.
 *
 * 페이지가 만든 `AudioContext` 를 가로채 분석기를 끼운다 — 도구 코드를 검사용으로 고치지
 * 않으려면 이 방법뿐이다(고치면 검사는 초록인데 진짜 코드는 다른 것이 된다).
 * **문서가 뜨기 전에** 심어야 한다: 화면이 뜬 뒤에 넣으면 새로고침 한 번에 날아간다.
 */
await page.addInitScript(() => {
  const Real = window.AudioContext;
  window.__peak = 0;
  window.AudioContext = function () {
    const ctx = new Real();
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.connect(ctx.destination);
    /* 소리가 지나가는 길 한가운데에 자를 놓는다 — 목적지 대신 분석기를 내준다. */
    Object.defineProperty(ctx, 'destination', { get: () => an, configurable: true });
    const buf = new Float32Array(an.fftSize);
    setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let m = 0;
      for (const v of buf) m = Math.max(m, Math.abs(v));
      if (m > window.__peak) window.__peak = m;
    }, 100);
    return ctx;
  };
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#ssLayers', { timeout: 20000 });

const peak = async () => page.evaluate(() => window.__peak || 0);
const resetPeak = async () => page.evaluate(() => {
  window.__peak = 0;
});

/* ② 프리셋을 누르면 소리가 난다 */
await page.locator('[data-preset="rainynight"]').click();
await page.waitForTimeout(2600);
const p1 = await peak();
check(p1 > 0.0005, `프리셋을 누르면 실제로 소리가 나야 한다 (마루 ${p1.toFixed(5)})`);

/* ③ 슬라이더를 올리면 그 겹이 더해진다 */
await resetPeak();
await page.locator('#ss-fire').fill('90');
await page.locator('#ss-fire').dispatchEvent('input');
await page.waitForTimeout(2600);
const p2 = await peak();
check(p2 > 0.0005, `겹을 올리면 소리가 더해져야 한다 (마루 ${p2.toFixed(5)})`);

/* ④ 전부 0으로 하면 잦아든다 */
await page.locator('#ssSilence').click();
await page.waitForTimeout(3200);
await resetPeak();
await page.waitForTimeout(1400);
const p3 = await peak();
check(p3 < p1, `전부 0으로 하면 잦아들어야 한다 (지금 ${p3.toFixed(5)} vs 아까 ${p1.toFixed(5)})`);

/* ⑤ 섞어 둔 것을 기억한다 */
await page.locator('[data-preset="cafe"]').click();
await page.waitForTimeout(500);
const before = await page.locator('#ss-murmur').inputValue();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#ssLayers', { timeout: 20000 });
await page.waitForTimeout(600);
const after = await page.locator('#ss-murmur').inputValue();
check(before === after && Number(after) > 0, `다시 열어도 섞어 둔 것이 남아야 한다 (${before} → ${after})`);

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-soundscape] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-soundscape] 전부 통과');
