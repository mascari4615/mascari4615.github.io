/**
 * **리눅스에서 재 본다** — 「CI 에서만 빨간」 자리 재현용 (2026-08-16, TASK-KAR-216).
 *
 * 왜 있나: 우리 화면 검사는 이 PC(윈도우)에서 돌고, **판정은 ubuntu-latest 에서 난다.**
 * 글꼴 폭이 달라 위쪽 요소가 다르게 접히고 그만큼 아래가 밀리는데, 그 차이는 윈도우에서
 * 아무리 돌려도 안 보인다. 그래서 며칠 동안 「밀어 보고 기다렸다 읽기」를 반복했다 —
 * 빨강 하나에 배포 왕복 한 번이 들었다.
 *
 * 이 파일은 그 왕복을 없앤다. CI 와 **같은 리눅스 이미지** 안에서 같은 페이지를 열고
 * 자리를 재서, 윈도우 값과 나란히 볼 수 있게 한다. 앱의 node_modules 는 안 쓴다 —
 * 공식 playwright 이미지에 브라우저가 이미 들어 있고, 서버는 여기서 직접 띄운다
 * (리눅스용 의존성 설치 0 · 몇 초면 뜬다).
 *
 * 쓰는 법 (윈도우에서):
 *   npm run repro:linux
 * 또는 직접:
 *   docker run --rm -v <repo>:/w -w /w/apps/karmolab mcr.microsoft.com/playwright:v1.62.1-jammy \
 *     node scripts/linux-repro.mjs
 *
 * 재는 것을 늘리려면 아래 `잴것` 에 한 줄 추가한다.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const APP = process.cwd();
const BLOG_ROOT = path.dirname(path.dirname(APP));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp',
};

/** Jekyll 앞머리(`---` 블록)를 걷는다 — 안 걷으면 그 글자가 화면 맨 위에 뜬다. */
const stripFrontMatter = (s) => (s.startsWith('---') ? s.replace(/^---[\s\S]*?\n---\s*\n/, '') : s);

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(String(req.url).split('?')[0]);
  if (p === '/' || p === '/') p = '/apps/karmolab/index.html';
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(BLOG_ROOT, p.replace(/^\//, ''));
  if (!file.startsWith(BLOG_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  if (ext === '.html') body = Buffer.from(stripFrontMatter(String(body)), 'utf8');
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const toMeasure = [
  {
    name: 'karmograph 폰 — 시점 줄과 도구 줄 사이',
    hash: '#karmograph',
    viewport: { width: 390, height: 844 },
    phone: true,
    prepare: async (p) => {
      await p.waitForSelector('.km-canvas', { timeout: 20000 });
      await p.waitForTimeout(1200);
      const b = await p.locator('.km-canvas').boundingBox();
      await p.mouse.dblclick(b.x + b.width * 0.4, b.y + b.height * 0.22);
      await p.waitForTimeout(900);
      await p.evaluate(() => document.querySelector('[data-km="time-add"]')?.click());
      await p.waitForTimeout(900);
    },
    measure: () => {
      const box = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const above = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return '없음';
        const r = el.getBoundingClientRect();
        const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return t ? (t.dataset?.km || String(t.className || t.tagName).slice(0, 24)) : '없음';
      };
      return {
        mobileNav: box('.mobile-nav'), times: box('[data-km="times"]'),
        mini: box('[data-km="mini"]'), more: box('[data-km="more"]'),
        moreTop: above('[data-km="more"]'),
        canvasTop: box('.km-canvas')?.y,
      };
    },
  },
  {
    name: 'bluemarble — 제목이 화면 폭의 몇 %',
    hash: '#bluemarble',
    viewport: { width: 1280, height: 900 },
    prepare: async (p) => {
      await p.waitForSelector('.bm-canvas', { timeout: 20000 });
      await p.evaluate(() => document.fonts.ready).catch(() => null);
      await p.waitForTimeout(2400);
    },
    measure: () => {
      const cv = document.querySelector('.bm-canvas');
      const c = cv.getContext('2d', { willReadFrequently: true });
      const w = cv.width;
      const band = c.getImageData(0, Math.round(cv.height / 2) - 2, w, 5).data;
      let min = w;
      let max = 0;
      let lit = 0;
      for (let i = 0; i < band.length; i += 4) {
        if (band[i] > 225 && band[i + 1] > 225 && band[i + 2] > 225) {
          const x = (i / 4) % w;
          if (x < min) min = x;
          if (x > max) max = x;
          lit += 1;
        }
      }
      /* 글꼴이 **정말 쓰였나**는 「있나」가 아니라 **폭을 재서** 안다 — 대체 글꼴은 폭이 다르다. */
      const FACE = 'KarmoSans, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
      const label = '지구촌';
      c.save();
      c.font = `900 100px ${FACE}`;
      const ourWidth = Math.round(c.measureText(label).width);
      c.font = '900 100px sans-serif';
      const defaultWidth = Math.round(c.measureText(label).width);
      c.restore();
      return {
        widthPercent: max > min ? Math.round(((max - min) / w) * 100) : 0,
        brightSpot: lit, canvas: `${cv.width}x${cv.height}`, dpr: window.devicePixelRatio,
        ourFont: document.fonts.check('900 100px KarmoSans', '지구촌'),
        '100px폭_우리': ourWidth, '100px폭_기본': defaultWidth,
        maxHeight: Math.round(cv.height * 0.34), wantedWidth: Math.round(cv.width * 0.92),
        /* 5px 띠 대신 **글자가 놓인 구역 전체**를 훑으면 글꼴 모양에 안 흔들린다 — 그 값도 같이 잰다. */
        wideWidthPercent: (() => {
          const top = Math.round(cv.height * 0.30);
          const hgt = Math.round(cv.height * 0.40);
          const d = c.getImageData(0, top, w, hgt).data;
          let lo = w;
          let hi = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225) {
              const x = (i / 4) % w;
              if (x < lo) lo = x;
              if (x > hi) hi = x;
            }
          }
          return hi > lo ? Math.round(((hi - lo) / w) * 100) : 0;
        })(),
      };
    },
  },
];

const browser = await chromium.launch();
console.log(`[linux-repro] ${process.platform} · playwright 컨테이너 안`);
for (const item of toMeasure) {
  const ctx = await browser.newContext({
    serviceWorkers: 'block', viewport: item.viewport,
    ...(item.phone ? { isMobile: true, hasTouch: true } : {}),
  });
  const p = await ctx.newPage();
  try {
    await p.goto(`${BASE}/apps/karmolab/index.html${item.hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await item.prepare(p);
    console.log(`\n── ${item.name}`);
    console.log(JSON.stringify(await p.evaluate(item.measure), null, 1));
  } catch (e) {
    console.log(`\n── ${item.name}\n  못 쟀다: ${String(e.message).split('\n')[0]}`);
  }
  await ctx.close();
}
await browser.close();
server.close();
