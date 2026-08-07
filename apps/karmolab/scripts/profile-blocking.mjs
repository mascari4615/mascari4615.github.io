/**
 * **첫 화면이 왜 막히나** — 어느 코드가 주 스레드를 잡는지 (TASK-KL)
 *
 * `measure-speed` 는 「막힘 몇 ms」까지만 말한다. 어디가 먹었는지는 안 말한다.
 * 여기서는 크롬의 표본 프로파일러(V8 Sampling Profiler)를 켜서
 * **함수 단위 self time** 으로 나눈다 — 인라인 스크립트도 줄 번호까지 나온다.
 *
 * 사용: node scripts/profile-blocking.mjs [경로] [머무는초]
 *   예) node scripts/profile-blocking.mjs '' 5
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8801/apps/blog';
const PATH = process.argv[2] ?? '';
const SETTLE = Number(process.argv[3] ?? 4) * 1000;
const URL_ = `${BASE}/karmolab/${PATH}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  serviceWorkers: 'block',      /* 캐시가 끼면 값이 반토막 난다 */
});
const page = await ctx.newPage();
const client = await ctx.newCDPSession(page);

await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await client.send('Network.enable');
await client.send('Network.emulateNetworkConditions', {
  offline: false, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8, latency: 150,
});

/* 긴 작업(50ms 넘게 주 스레드를 잡은 구간)은 페이지 쪽에서 표준 관측기로 센다 */
await page.addInitScript(() => {
  window.__long = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__long.push(Math.round(e.duration));
  }).observe({ type: 'longtask', buffered: true });
});

await client.send('Profiler.enable');
await client.send('Profiler.setSamplingInterval', { interval: 100 });
await client.send('Profiler.start');

await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });
await page.waitForTimeout(SETTLE);

const { profile } = await client.send('Profiler.stop');
const longs = await page.evaluate(() => window.__long ?? []);

/* 표본을 self time 으로 접는다 */
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas ?? [];
profile.samples.forEach((id, i) => {
  self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0) / 1000);
});

const 이름 = (n) => {
  const f = n.callFrame;
  const file = f.url ? f.url.split('/').slice(-1)[0] : '(인라인)';
  const fn = f.functionName || '(익명)';
  return `${file}:${f.lineNumber + 1}  ${fn}`;
};

const rows = [...self.entries()]
  .map(([id, ms]) => [이름(byId.get(id)), ms])
  .filter(([k]) => !k.startsWith('(program)') && !k.includes('(idle)') && !k.includes('(garbage'));

const merged = new Map();
for (const [k, ms] of rows) merged.set(k, (merged.get(k) ?? 0) + ms);

const top = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
const 총막힘 = longs.reduce((a, b) => a + Math.max(0, b - 50), 0);

console.log(`\n=== ${URL_} ===`);
console.log(`긴 작업 ${longs.length}개 (${longs.join(', ')}ms) · 막힘 합계 ${총막힘}ms`);
console.log('\n주 스레드를 오래 잡은 코드 (자기 시간):');
for (const [k, ms] of top) console.log(`  ${String(Math.round(ms)).padStart(5)}ms  ${k}`);

await browser.close();
