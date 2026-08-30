/**
 * **눌렀을 때 얼마나 굼뜬가**를 잰다. INP (2026-08-16)
 *
 * 왜 만드나: 우리는 LCP(첫 그림)와 CLS(밀림)는 재는 도구가 있는데 **INP 는 한 번도 안 쟀다.**
 * 바깥 기준(2026)에서 가장 많이 실패하는 항목이 INP 다. 사이트 43%가 200ms 를 못 넘긴다.
 * 안 재는 것은 안 고쳐진다. 그래서 재는 자리를 먼저 만든다(고치는 것은 그 다음).
 *
 * INP 가 무엇인가: 누른 순간부터 **그 결과가 화면에 그려질 때까지**. 눌림 처리(processing)만
 * 세는 게 아니라 다음 그림까지 포함한다. 그래서 함수는 5ms 인데 체감은 300ms가 잡힌다.
 * 우리는 판마다 **가장 나쁜 눌림 하나**를 본다. 평균은 굼뜬 순간을 지운다.
 *
 * 무엇을 눌러 보나: 사람이 실제로 첫 화면에서 하는 것. 찾는 칸에 글자 넣기, 결과 고르기,
 * 메뉴 열기. 목록은 아래 `ACTIONS` 한 곳에 있다.
 *
 * 사용: node scripts/measure-live-inp.mjs [주소] [판수]
 */
import { chromium } from 'playwright';

const URL = process.argv[2] || 'https://blog.mascari4615.com/';
const RUNS = Number(process.argv[3] || 3);
/* 폰 폭 + 느린 기계로 잰다. 데스크톱 최신 CPU 로는 뭘 해도 초록이라 아무것도 안 보인다. */
const VIEW = { width: 390, height: 844 };
const CPU_SLOWDOWN = Number(process.env.INP_CPU || 4);

/** 첫 화면에서 사람이 실제로 하는 것. 이름은 결과에 그대로 나온다. */
const ACTIONS = [
  { name: '찾는 칸 누르기', run: async (p) => { await p.click('.kp-input, .landing-palette input', { timeout: 5000 }); } },
  { name: '찾는 칸에 글자', run: async (p) => { await p.keyboard.type('json', { delay: 60 }); } },
  { name: '메뉴 열기', run: async (p) => { await p.click('.mobile-nav button, .header-bar button', { timeout: 5000 }); } }
];

let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  console.log(`[live-inp] 못 돌림. 브라우저를 못 띄운다 (${String(err).split('\n')[0].slice(0, 80)})`);
  process.exit(0);
}

const worsts = [];
for (let i = 0; i < RUNS; i++) {
  const ctx = await browser.newContext({ viewport: VIEW, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  await page.addInitScript(() => {
    window.__inp = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.interactionId) continue;   // 눌림이 아닌 것(스크롤 등)은 INP 가 아니다
        window.__inp.push({
          d: Math.round(e.duration),
          type: e.name,
          proc: Math.round(e.processingEnd - e.processingStart),
          target: (() => {
            const el = e.target;
            if (!el || el.nodeType !== 1) return '?';
            const c = String(el.className?.baseVal ?? el.className ?? '').trim().split(/\s+/)[0];
            return el.id ? '#' + el.id : el.tagName.toLowerCase() + (c ? '.' + c : '');
          })()
        });
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  });
  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  } catch (err) {
    console.log(`[live-inp] 못 열었다. ${String(err.message).split('\n')[0].slice(0, 80)}`);
    await ctx.close();
    continue;
  }
  await page.waitForTimeout(2500);

  const skipped = [];
  for (const a of ACTIONS) {
    try { await a.run(page); await page.waitForTimeout(600); }
    catch { skipped.push(a.name); }
  }
  // 재움-의도: 누른 뒤 반응이 끝난 시점의 값. 기다릴 조건이 아니라 흘러간 시간이 축
  await page.waitForTimeout(600);

  const rows = await page.evaluate(() => window.__inp);
  await ctx.close();

  /* 아무 눌림도 안 잡혔으면 «빠르다»가 아니라 «못 쟀다»다. 화면이 바뀌어 누를 것을 못 찾은
     경우가 여기로 온다. 초록으로 뭉개면 이 도구가 조용히 죽는다. */
  if (rows.length === 0) {
    console.log(`판 ${i + 1}. 못 쟀다 (눌림이 하나도 안 잡혔다${skipped.length ? `, 못 누른 것: ${skipped.join(', ')}` : ''})`);
    continue;
  }
  rows.sort((a, b) => b.d - a.d);
  const worst = rows[0];
  worsts.push(worst.d);
  console.log(`판 ${i + 1}. 가장 굼뜬 눌림 ${worst.d}ms${skipped.length ? ` (못 누른 것: ${skipped.join(', ')})` : ''}`);
  for (const r of rows.slice(0, 3)) {
    console.log(`     ${String(r.d).padStart(4)}ms  ${r.type} → ${r.target}   (처리 ${r.proc}ms, 나머지는 그리기, 대기)`);
  }
}
await browser.close();

if (worsts.length === 0) {
  console.log('\n[live-inp] 못 쟀다. 누를 것을 못 찾았다. 화면이 바뀌었는지 ACTIONS 를 볼 것.');
  process.exit(2);
}
const worst = Math.max(...worsts);
console.log(`\n[live-inp] 가장 나쁜 판 ${worst}ms, 판마다 ${worsts.join(' / ')}ms  (CPU ${CPU_SLOWDOWN}배 느리게)`);
console.log('  (200ms 이하면 좋음, 500ms 넘으면 나쁨. 처리 시간이 짧은데 총합이 길면 = 그리기가 무겁다)');
