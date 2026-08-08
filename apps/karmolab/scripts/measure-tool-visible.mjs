/**
 * **도구 화면이 보이는 시각**을 잰다 (TASK-KL-135 ②)
 *
 * 왜 따로 있나: `measure-speed` 의 「첫 그림」은 머리띠·설명 글이 뜬 시각이라 **도구를 미리
 * 그리든 안 그리든 거의 같다**. 실제로 미리 그리기를 켜고 끄고 재 봤더니 첫 그림은 오히려
 * 몇십 ms 늘었다(HTML 이 커지니까). 미리 그리기가 바꾸는 건 첫 그림이 아니라 **도구 자체가
 * 자리에 나타나는 시각**이다 — 그걸 재는 눈이 없어서 효과를 말할 수 없었다.
 *
 * 재는 것 (느린 회선 1.6Mbps + 느린 기기 4배, 폰 폭 375px — measure-speed 와 같은 조건):
 *  - 도구 보임   `#tool-pages` 안의 켜진 도구 화면에 글자가 찬 시각
 *  - 첫 그림     비교용 (머리띠·설명이 뜬 시각)
 *
 * 사용: BASE=http://127.0.0.1:8801/apps/blog node scripts/measure-tool-visible.mjs [횟수] [도구id ...]
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8801/apps/blog';
const args = process.argv.slice(2);
const RUNS = Number(args[0] || 5);
const IDS = args.slice(1).length ? args.slice(1) : ['loan', 'gitcmd', 'charcount'];

const probe = await fetch(`${BASE}/karmolab/t/`).catch(() => null);
if (!probe?.ok) {
  console.error(`[measure-tool-visible] 목록을 못 받는다 — ${BASE}`);
  console.error('  → 다른 창에서 `npm run serve:gzip` 을 먼저 띄워라 (압축을 해야 실제와 같은 값이 나온다).');
  process.exit(1);
}

const browser = await chromium.launch();
const mid = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

for (const id of IDS) {
  const visible = [];
  const first = [];
  let prerendered = null;

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

    /* 도구가 자리에 **찬 순간**을 페이지가 스스로 적는다. 밖에서 폴링하면 폴링 간격만큼
       늦게 잡히고, 느린 기기 흉내 때문에 그 오차가 더 커진다. */
    await page.addInitScript(() => {
      window.__toolAt = -1;
      const filled = () => {
        const host = document.getElementById('tool-pages');
        const active = host && host.querySelector('.tool-page.active');
        return !!active && active.id !== 'page-home' && active.textContent.trim().length > 20;
      };
      const mark = () => { if (window.__toolAt < 0 && filled()) window.__toolAt = performance.now(); };
      /* 이 스크립트는 **문서가 생기기 전에** 돈다 — `document.documentElement` 는 아직 null 이라
         거기에 붙이면 조용히 죽는다(실제로 그래서 「잴 수 없었다」만 나왔다). 문서 자체에 붙인다. */
      new MutationObserver(mark).observe(document, { childList: true, subtree: true });
      document.addEventListener('readystatechange', mark);
      mark();
    });

    try {
      await page.goto(`${BASE}/karmolab/t/${id}/`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(2500);
      const r = await page.evaluate(() => ({
        tool: Math.round(window.__toolAt),
        fcp: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || -1),
        pre: document.documentElement.innerHTML.includes('KARMOLAB_PRERENDERED')
      }));
      if (r.tool > 0 && r.fcp > 0) {
        visible.push(r.tool);
        first.push(r.fcp);
        prerendered ??= r.pre;
      }
    } catch {
      /* 한 번 실패해도 나머지로 중앙값을 낸다 */
    }
    await ctx.close();
  }

  if (!visible.length) {
    console.log(`${id.padEnd(10)} 잴 수 없었다`);
    continue;
  }
  console.log(
    `${id.padEnd(10)} 도구 보임 ${String(mid(visible)).padStart(4)}ms · 첫 그림 ${String(mid(first)).padStart(4)}ms` +
      `   (${visible.length}회, 도구 ${Math.min(...visible)}~${Math.max(...visible)}` +
      ` · 미리 그림 ${prerendered ? 'O' : 'X'})`
  );
}

await browser.close();
console.log('[measure-tool-visible] 느린 회선 1.6Mbps · 느린 기기 4배 · 폰 폭 375px 기준');
