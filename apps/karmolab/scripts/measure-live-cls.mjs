/**
 * **진짜 사이트**에서 밀림을 잰다 (TASK-KL-201, 2026-08-10)
 *
 * 왜 따로 두나: 로컬 검사판에서는 **원리적으로 안 나는 밀림**이 있다. 서버에 물어보고 채우는
 * 칸(`/kl/tools/stats`·실황)은 우리 기계에서 다른 출처라 막혀 늘 비어 있고, 그래서 그 칸이
 * 만드는 밀림은 로컬에서 영영 0 이다. 실측(2026-08-09): 로컬 0.007 ↔ 실사이트 0.044.
 *
 * 그러니 첫 화면 성능을 고쳤다면 **여기서 한 번 더** 재라. 로컬 초록은 「내 기계에서 안 난다」
 * 까지만 말한다.
 *
 * 무엇을 보나: 판마다 총합 + 큰 것 세 개(무엇이 얼마나 움직였나). **평균 내지 않는다** —
 * 흔들리는 값은 평균이 지운다(0.0168 과 0.2363 이 번갈아 나던 날 평균만 보고 넘어갔었다).
 *
 * 사용: node scripts/measure-live-cls.mjs [주소] [판수]
 *       node scripts/measure-live-cls.mjs https://blog.mascari4615.com/karmolab/ 5
 */
import { chromium } from 'playwright';

const URL = process.argv[2] || 'https://blog.mascari4615.com/karmolab/';
const RUNS = Number(process.argv[3] || 3);
/* 폰 폭으로 잰다 — 오늘 잡은 밀림 셋 중 둘이 **폰에서만** 났다(데스크톱은 값이 같아 안 튄다). */
const VIEW = { width: 390, height: 844 };

let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  console.log(`[live-cls] 못 돌림 — 브라우저를 못 띄운다 (${String(err).split('\n')[0].slice(0, 80)})`);
  process.exit(0);
}

const totals = [];
for (let i = 0; i < RUNS; i++) {
  const ctx = await browser.newContext({ viewport: VIEW });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__cls = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__cls.push({
          v: +e.value.toFixed(4),
          at: Math.round(e.startTime),
          who: (e.sources || []).slice(0, 3).map((s) => {
            const n = s.node;
            const el = n && (n.nodeType === 1 ? n : n.parentElement);
            if (!el) return '?';
            const c = String(el.className?.baseVal ?? el.className ?? '').trim().split(/\s+/)[0];
            const move = Math.round((s.currentRect?.top ?? 0) - (s.previousRect?.top ?? 0));
            return `${el.id ? '#' + el.id : el.tagName.toLowerCase() + (c ? '.' + c : '')}(${move > 0 ? '↓' : '↑'}${Math.abs(move)}px)`;
          })
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  } catch (err) {
    console.log(`[live-cls] 못 열었다 — ${String(err.message).split('\n')[0].slice(0, 80)}`);
    await ctx.close();
    continue;
  }
  await page.waitForTimeout(5000);
  const rows = await page.evaluate(() => window.__cls);
  const total = rows.reduce((a, r) => a + r.v, 0);
  totals.push(total);
  console.log(`판 ${i + 1} — 밀림 ${total.toFixed(4)}`);
  for (const r of rows.sort((a, b) => b.v - a.v).slice(0, 3)) {
    if (r.v < 0.001) continue;
    console.log(`     ${r.v.toFixed(4)}  ${String(r.at).padStart(5)}ms  ${r.who.join(' , ')}`);
  }
  await ctx.close();
}
await browser.close();

if (totals.length) {
  const worst = Math.max(...totals);
  console.log(`\n[live-cls] 가장 나쁜 판 ${worst.toFixed(4)} · 판마다 ${totals.map((t) => t.toFixed(3)).join(' / ')}`);
  console.log('  (0.1 이하면 좋음. 판마다 크게 다르면 = 늦게 오는 것과의 경주다)');
}
