#!/usr/bin/env node
/**
 * audit-atlas-edges — **선을 묶어야 하나** (TASK-KAR-233).
 *
 * 이음 묶기(edge bundling)는 화면을 깔끔하게 만든다. 그런데 2025년에 그 품질을 재는
 * 정량 지표 21개가 정리돼 나왔고(Wallinger 외, CGF 2025 — 그전엔 「묶음이 좋은지 재는
 * 합의된 방법이 없다」가 정설이었다), 상관 분석의 결론이 이렇다:
 * **잉크 감소와 모호도가 같이 움직인다.** 세게 묶을수록 깔끔해지지만 **없는 이웃을
 * 만들어 낸다**(Ambiguity = 선을 따라가면 이어져 보이는데 실제로는 링크가 아닌 쌍).
 *
 * 우리는 점에서 이미 「거짓 이웃」을 재고 있다(정직도·믿음). **선에서는 안 쟀다.**
 * 그래서 묶을지 말지를 취향으로 정하지 않고 두 수로 정한다:
 *
 *  ① **겹쳐 그림** — 선이 지나간 칸 중 **둘 이상**이 지나간 칸의 비율
 *  ② **거짓 이웃** — 자기 이음도 아닌 선 위에 얹혀 「이어져 보이는」 점의 비율
 *
 * 문턱은 재기 **전에** 박았다(TASK 문서, 앞 바퀴): 겹침 20% · 거짓 이웃 0.10.
 * 둘 다 밑이면 **안 묶는다** — 그리고 그 숫자를 남긴다. 힘 배치를 안 쓰기로 한 때와 같은 방식.
 *
 * ③ 자가 진짜 무는지도 여기서 본다: **이음을 열 배로 늘리면** 두 수가 올라가야 한다.
 *   (안 올라가면 이 자는 선을 안 보고 있는 것이다.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
/* ★ **가짜 지도로는 이 자를 못 댄다.** 조용히 통과시키지 않고 **왜 안 도는지 말한다** —
   건너뛴 검사는 통과한 검사가 아니다. 진짜로 구운 뒤 `npm run atlas` 에서 돈다. */
if (isFake(ATLAS)) { console.log('[edges] 가짜 지도다 — 이음선은 진짜 굽기에서만 잰다'); process.exit(0); }

const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');

if (!fs.existsSync(ATLAS) || !fs.existsSync(BUNDLE)) {
  console.log('[edges] 지도나 번들이 없다 — 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[edges] playwright 가 없다 — 검사 건너뜀');
  process.exit(0);
}

const OVERPLOT_LINE = 0.20;   // 이보다 겹치면 묶는 것을 꺼낼 때다
const FALSE_LINE = 0.10;      // 이보다 많이 얹혀 있으면 선이 거짓말을 하고 있다
const NEAR_PX = 3;            // 점이 선에서 이만큼 안이면 「얹혀 있다」
/* 선 한 겹은 짙기 0.10 이라 사실상 안 보인다. **이만큼은 짙어야 「보인다」**고 친다
   (0.25 = 네 겹쯤). 알파를 무시하고 세면 잉크를 재는 것이지 눈을 재는 게 아니다. */
const SEE_AT = 0.25;

const bundle = fs.readFileSync(BUNDLE, 'utf8');
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

/** 이음을 몇 배로 부풀린 지도를 띄우고 선분·점을 받아 온다. */
async function measure(times, ignoreKnock = false) {
  const copy = JSON.parse(JSON.stringify(atlas));
  if (times > 1) {
    const base = copy.edges.slice();
    for (let t = 1; t < times; t += 1) {
      /* **같은 선을 겹쳐 그리면 겹침만 오른다** — 자리를 옮겨 「선이 더 많은 지도」를 흉내 낸다.
         (같은 쌍을 복사하면 픽셀이 똑같아 아무것도 안 달라진다 = 무효 망가뜨림.) */
      for (const [a, b] of base) copy.edges.push([(a + t * 7) % copy.docs.length, (b + t * 13) % copy.docs.length]);
    }
  }
  const page = await ctx.newPage();
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/data/memo-atlas.json')) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(copy) });
    }
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
  });
  await page.goto('http://localhost/');
  await page.evaluate(() => {
    window.__reg = {};
    window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {} };
  });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    const h = document.createElement('div');
    h.id = 'host'; h.style.width = '1200px'; h.style.height = '760px';
    document.body.appendChild(h);
    window.__reg['memo-atlas'].tabs[0].build(h);
  });
  await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), undefined, { timeout: 30000 });

  const got = await page.evaluate(({ nearPx, seeAt, ignoreKnock }) => {
    const segs = window.__atlasEdgeSegs || [];
    const dots = window.__atlasDotScreen || [];   // **화면 좌표** — 지도 좌표로 견주면 아무것도 안 잡힌다
    const alpha = window.__atlasEdgeAlpha ?? 1;
    const cv = document.querySelector('#host .atlas-canvas');
    const W = cv.width; const H = cv.height;
    /* 선을 칸(1픽셀)에 찍어 **몇 겹**인지 센다. 겹칠수록 짙어진다: 1−(1−a)^n. */
    const grid = new Uint16Array(W * H);
    /* **점 둘레는 화면에서 도려내진다**(위젯이 `destination-out` 으로 지운다). 그 자리는
       선이 안 보이므로 여기서도 빼고 센다 — 안 빼면 「그리려 한 것」을 재게 되고,
       화면에서 이미 고친 것을 못 고쳤다고 한다. 반지름은 위젯이 알려 준 값을 그대로 쓴다
       (여기서 다시 정하면 어느 날 둘이 갈라진다). */
    const knock = ignoreKnock ? 0 : (window.__atlasEdgeKnock || 0);
    const blocked = new Uint8Array(W * H);
    if (knock > 0) {
      const r = Math.ceil(knock);
      for (const p of dots) {
        if (!p) continue;
        const cx = Math.round(p[0]); const cy = Math.round(p[1]);
        for (let dx = -r; dx <= r; dx += 1) {
          for (let dy = -r; dy <= r; dy += 1) {
            if (dx * dx + dy * dy > knock * knock) continue;
            const x = cx + dx; const y = cy + dy;
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            blocked[y * W + x] = 1;
          }
        }
      }
    }
    let drawn = 0;
    for (const [x1, y1, x2, y2] of segs) {
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
      for (let s = 0; s <= steps; s += 1) {
        const x = Math.round(x1 + ((x2 - x1) * s) / steps);
        const y = Math.round(y1 + ((y2 - y1) * s) / steps);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (blocked[i]) continue;              // 도려내진 자리 = 화면에 없는 선
        if (grid[i] === 0) drawn += 1;
        grid[i] += 1;
      }
    }
    /* **눈에 보이는 칸**만 센다 — 짙기가 seeAt 을 넘는 칸. 알파를 무시하고 「겹쳤나」만
       세면 잉크를 재는 것이지 사람이 보는 것을 재는 게 아니다(처음 판이 그랬고,
       36% / 78% 라는 수가 나왔다 — 실제로는 거의 안 보이는 선이었다). */
    let seenPix = 0; let over = 0;
    for (let i = 0; i < grid.length; i += 1) {
      const n = grid[i];
      if (!n) continue;
      if (n >= 2) over += 1;
      if (1 - Math.pow(1 - alpha, n) >= seeAt) seenPix += 1;
    }
    /* ② 거짓 이웃 — **보이는 선** 위에 얹힌 점. 자기 이음의 끝점이면 거짓말이 아니다.
       ⚠ 「아무 선의 끝점이면 빼기」로 하면 안 된다 — 선을 열 배로 늘리자 거의 모든 점이
       어떤 선의 끝점이 되어 값이 12% → 0.3% 로 **떨어졌다**(자가 거꾸로 물었다).
       **그 선의** 끝점인지를 선마다 따진다. */
    const near = (px, py, x1, y1, x2, y2) => {
      const dx = x2 - x1; const dy = y2 - y1;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((px - x1) * dx + (py - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      return { d: Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)), x: x1 + t * dx, y: y1 + t * dy };
    };
    const visible = (x, y) => {
      const xi = Math.round(x); const yi = Math.round(y);
      const n = (xi >= 0 && yi >= 0 && xi < W && yi < H) ? grid[yi * W + xi] : 0;
      return n > 0 && 1 - Math.pow(1 - alpha, n) >= seeAt;
    };
    let lied = 0; let seenDots = 0;
    for (const p of dots) {
      if (!p) continue;
      seenDots += 1;
      for (const [x1, y1, x2, y2] of segs) {
        if (Math.hypot(p[0] - x1, p[1] - y1) < 1.5 || Math.hypot(p[0] - x2, p[1] - y2) < 1.5) continue;  // 이 선의 끝점
        const hit = near(p[0], p[1], x1, y1, x2, y2);
        if (hit.d <= nearPx && visible(hit.x, hit.y)) { lied += 1; break; }
      }
    }
    return { segs: segs.length, dots: seenDots, drawn, over, seenPix, lied, alpha, knock };
  }, { nearPx: NEAR_PX, seeAt: SEE_AT, ignoreKnock });
  await page.close();
  return {
    ...got,
    overplot: got.drawn ? got.seenPix / got.drawn : 0,
    inkOverlap: got.drawn ? got.over / got.drawn : 0,
    falseNear: got.dots ? got.lied / got.dots : 0,
  };
}

/* 화면 좌표는 **점 자리**로 잡는다 — 위젯이 그린 그대로를 읽으므로 우리가 다시 계산하지 않는다.
   (미니맵 자에서 위젯 셈을 옮겨 적었다가 8.8% 를 잘못 잡은 적이 있다.) */
const one = await measure(1);
const ten = await measure(10);
/* **도려내기를 끄고도 재 본다.** 지금 거짓 이웃이 0% 인 건 점 둘레를 도려내기 때문인데,
   그게 없을 때도 0% 라면 이 자는 아무것도 안 재는 것이다(도려내기 전에는 35.2% 였다). */
const raw = await measure(1, true);
await browser.close();

const pct = (x) => `${(x * 100).toFixed(1)}%`;
console.log(`[edges] 선 ${one.segs}개 · 점 ${one.dots}개`);
console.log(`  ① 보이는 겹침 ${pct(one.overplot)} (문턱 ${pct(OVERPLOT_LINE)}) · 잉크로만 세면 ${pct(one.inkOverlap)} · 선 짙기 ${one.alpha}`);
console.log(`  ② 거짓 이웃 ${pct(one.falseNear)} — 남의 선 위에 얹힌 점 ${one.lied}개 (문턱 ${pct(FALSE_LINE)})`);
console.log(`  ③ 선을 열 배로 → 겹침 ${pct(ten.overplot)} · 거짓 이웃 ${pct(ten.falseNear)}`);
console.log(`  ④ 점 둘레 도려내기를 끄면 → 거짓 이웃 ${pct(raw.falseNear)} (도려내기 반지름 ${one.knock})`);

const bad = [];
if (!(ten.overplot > one.overplot + 0.01) && !(ten.falseNear > one.falseNear + 0.01)) {
  bad.push('선을 열 배로 늘려도 두 수가 안 오른다 — 이 자는 선을 안 보고 있다');
}
if (one.segs < 100) bad.push(`선이 ${one.segs}개뿐 — 화면이 이음을 안 그리고 있다`);
if (raw.falseNear < 0.05) {
  bad.push(`도려내기를 꺼도 거짓 이웃이 ${pct(raw.falseNear)} — 이 수는 아무것도 안 재고 있다`);
}
if (one.overplot > OVERPLOT_LINE) {
  bad.push(`겹쳐 그림 ${pct(one.overplot)} — 이제 이음 묶기(FDEB)나 솎기를 꺼낼 때다.`
    + ' 단 묶으면 **모호도가 같이 오른다**(잉크 감소와 강한 상관) — 묶은 뒤 ②를 다시 재라');
}
if (one.falseNear > FALSE_LINE) {
  bad.push(`거짓 이웃 ${pct(one.falseNear)} — 선이 없는 이웃을 만들고 있다. 선을 옅게/짧게 하거나 솎아라`);
}

if (bad.length) {
  console.log('[edges] **선이 화면에서 거짓말을 한다**');
  for (const b of bad) console.log('  - ' + b);
  process.exit(1);
}
console.log(`[edges] 겹침 ${pct(one.overplot)} · 거짓 이웃 ${pct(one.falseNear)} — 둘 다 문턱 밑이라 **안 묶는다**`);
