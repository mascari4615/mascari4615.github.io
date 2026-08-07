/**
 * 빠르기를 **같은 방법으로 여러 번** 재서 중앙값을 낸다 (TASK-KL-089)
 *
 * 왜 있나: 그동안 회차마다 즉석 스크립트로 재다 보니 세 번이나 잘못된 결론을 냈다.
 *  - 로컬 서버가 압축을 안 해서 시간이 몇 배로 부풀려졌다
 *  - 저장소 파일의 앞머리 설정이 글자로 떠서 밀림이 세 배로 잡혔다
 *  - 한 번만 재서 264ms 와 1044ms 를 같은 것으로 착각했다(실제 편차)
 * 그래서 **압축하는 서버(`npm run serve:gzip`)로, 여러 번, 같은 조건**으로 재는 것만 남긴다.
 *
 * 재는 것 (느린 회선 1.6Mbps + 느린 기기 4배, 폰 폭 375px):
 *  - 첫 그림   화면에 뭐라도 나타나는 시각
 *  - 막힘     주 스레드가 길게 잡혀 있던 시간 합 (그동안 눌러도 반응이 없다)
 *  - 밀림     레이아웃이 흔들린 정도 (0.1 이하가 좋음)
 *
 * 사용: node scripts/measure-speed.mjs [횟수]
 *       BASE=http://127.0.0.1:8801/apps/blog node scripts/measure-speed.mjs 5
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8801/apps/blog';
const RUNS = Number(process.argv[2] || 5);
const TARGETS = [
  ['', '앱 첫 화면'],
  ['t/', '도구 목록'],
  ['t/loan/', '대출 상환표'],
  ['t/gitcmd/', 'git 명령어']
];

const probe = await fetch(`${BASE}/karmolab/t/`).catch(() => null);
if (!probe?.ok) {
  console.error(`[measure-speed] 목록을 못 받는다 — ${BASE}`);
  console.error('  → 다른 창에서 `npm run serve:gzip` 을 먼저 띄워라 (압축을 해야 실제와 같은 값이 나온다).');
  process.exit(1);
}

const browser = await chromium.launch();
const mid = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

for (const [path, label] of TARGETS) {
  const fcp = [];
  const blocked = [];
  const shift = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 720 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      window.__long = 0;
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long += e.duration; }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    try {
      await page.goto(`${BASE}/karmolab/${path}`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(2500);
      const r = await page.evaluate(() => ({
        fcp: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || -1),
        long: Math.round(window.__long),
        cls: +window.__cls.toFixed(3)
      }));
      if (r.fcp > 0) {
        fcp.push(r.fcp);
        blocked.push(r.long);
        shift.push(r.cls);
      }
    } catch {
      /* 한 번 실패해도 나머지로 중앙값을 낸다 */
    }
    await ctx.close();
  }
  if (!fcp.length) {
    console.log(`${label.padEnd(10)} 잴 수 없었다`);
    continue;
  }
  console.log(
    `${label.padEnd(10)} 첫 그림 ${String(mid(fcp)).padStart(4)}ms · 막힘 ${String(mid(blocked)).padStart(4)}ms · 밀림 ${mid(shift)}` +
      `   (${fcp.length}회, 첫 그림 ${Math.min(...fcp)}~${Math.max(...fcp)})`
  );
}

await browser.close();
console.log('[measure-speed] 느린 회선 1.6Mbps · 느린 기기 4배 · 폰 폭 375px 기준');
