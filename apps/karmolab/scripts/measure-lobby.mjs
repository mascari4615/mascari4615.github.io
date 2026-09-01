/**
 * 로비 첫 화면에 물건이 몇 개 보이나 (2026-09-01 레퍼런스 대조)
 *
 * - 게임 진열 쪽 실측은 사람이 그림 하나 보고 1초 안에 누를지 만다. 그 1초는 첫 화면 안에서만 남
 * - 그래서 세는 것은 전부가 아니라 **스크롤 없이 보이는 수**
 * - 데스크톱과 폰 둘 다. 지금까지 수치가 전부 데스크톱뿐이었음
 *
 * `node scripts/measure-lobby.mjs`
 */
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';
import { waitHydrated } from './lib/hydrated.mjs';

const server = await smokeBase();
const PAGE = `${server.base}/apps/karmolab/index.html`;

const SIZES = [
  { name: '데스크톱', width: 1440, height: 900 },
  { name: '노트북', width: 1280, height: 720 },
  { name: '폰', width: 390, height: 844 }
];

const browser = await chromium.launch({ channel: 'msedge' });
try {
  for (const s of SIZES) {
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height } });
    await page.addInitScript(() => {
      // eslint-disable-next-line no-undef
      Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined });
    });
    await page.goto(PAGE + '#arcade', { waitUntil: 'domcontentloaded' });
    await waitHydrated(page, '[data-obj]', { timeout: 30000 });
    await page.waitForSelector('.ac-obj', { timeout: 20000 });
    const got = await page.evaluate(() => {
      const h = window.innerHeight;
      const all = [...document.querySelectorAll('.ac-obj')];
      const seen = all.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top < h && r.bottom > 0 && r.height > 0;
      });
      const first = all[0]?.getBoundingClientRect();
      return {
        total: all.length,
        seen: seen.length,
        firstTop: first ? Math.round(first.top) : -1,
        shelfTop: Math.round(document.querySelector('#acShelfAll')?.getBoundingClientRect().top ?? -1),
        /* 진열장 앞을 무엇이 막고 있나 */
        head: [...(document.querySelector('#acShelfAll')?.children ?? [])].map((el) => ({
          tag: el.id || el.className,
          top: Math.round(el.getBoundingClientRect().top),
          h: Math.round(el.getBoundingClientRect().height)
        })).filter((x) => x.h > 0)
      };
    });
    console.log(
      `${JSON.stringify(got.head)}
${s.name} ${s.width}x${s.height}: 첫 화면 ${got.seen}개 / 전체 ${got.total}개, ` +
        `첫 물건 y=${got.firstTop}, 진열장 y=${got.shelfTop}`
    );
    await page.close();
  }
} finally {
  await browser.close();
  await server.stop?.();
}
