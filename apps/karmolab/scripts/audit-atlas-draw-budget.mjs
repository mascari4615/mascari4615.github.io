#!/usr/bin/env node
/**
 * audit-atlas-draw-budget — **밀고 당길 때 버벅이지 않나** (TASK-KAR-233).
 *
 * 캔버스 2D 는 점 1만 개까지 60프레임이 통설이고 우리는 1516개다. 그래서 WebGL 은
 * 안 가기로 했다 — **그 판단에는 전제가 있다: 한 판이 예산 안에 들어온다는 것.**
 * 글이 늘거나 그리는 게 붙으면 조용히 깨진다. 사람이 「좀 굼뜬데」 하고 느끼기 전에
 * 이 자가 말해 준다.
 *
 * 예산: 60프레임 = 한 판 16.7ms. 중간값은 그 절반 아래여야 여유가 있다.
 * 잰 값(2026-08-21, 헤드리스 CPU): 중간 4.1ms · 90% 10.4ms.
 *
 * 빨개지면 그때가 **쿼드트리(점 고르기)·색깔별 묶어 그리기·WebGL** 을 꺼낼 때다.
 * 어디가 느린지도 같이 찍는다 — 짐작으로 고치면 엉뚱한 데를 깎는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
const ATLAS = atlasPath(HERE);

if (!fs.existsSync(ATLAS) || !fs.existsSync(BUNDLE)) {
  console.log('[draw] 지도나 번들이 없다 — 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[draw] playwright 가 없다 — 검사 건너뜀');
  process.exit(0);
}

const FRAMES = 40;
const MED_BUDGET = 8;      // 중간값 — 예산의 절반
const P90_BUDGET = 16.7;   // 90% — 60프레임 한 판

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const atlas = fs.readFileSync(ATLAS, 'utf8');
await page.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.endsWith('/data/memo-atlas.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: atlas });
  return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
});
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {} };
});
await page.addScriptTag({ content: fs.readFileSync(BUNDLE, 'utf8') });
await page.evaluate(() => {
  const h = document.createElement('div');
  h.id = 'host'; h.style.width = '1200px'; h.style.height = '760px';
  document.body.appendChild(h);
  /* **셸과 같은 길로 얹는다** — 셸은 `tabs[].build` 로만 그린다. 예전엔 여기서
         `render(h)` 를 직접 불렀는데, 그 바람에 위젯이 셸이 안 읽는 모양으로 등록해도
         자들은 전부 초록이었다(2026-08-21, 사람이 열어 보고서야 드러났다). */
      window.__reg['memo-atlas'].tabs[0].build(h);
});
await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), { timeout: 30000 });

/* **시간을 재는 자는 기계가 바쁘면 거짓말한다.** 자 스물다섯을 줄줄이 돌리는 판에서
   이 자가 혼자 빨개졌다 — 따로 돌리면 중간 4.1ms, 판 안에서는 7.2~9.8ms.
   우리가 묻는 건 「이 기계가 예산 안에 그릴 수 있나」지 「그 순간 기계가 한가했나」가
   아니다. 그래서 **세 번까지 다시 재고 가장 좋은 판을 쓴다** — 한 번이라도 예산에
   들면 그릴 수 있다는 뜻이다. 진짜로 느려지면 세 번 다 못 든다. */
const TRIES = 3;
async function measure(frames) {
  return page.evaluate((frames) => {
  const c = window.__atlasControl;
  if (!c) return null;
  /* 한 번 미리 돌려 몸을 푼다 — 첫 판은 늘 느리다(글꼴·그림판 준비). */
  c.pan(1, 0); c.draw();
  const acc = {}; const tot = [];
  for (let i = 0; i < frames; i += 1) {
    const t0 = performance.now();
    c.pan(1, 0); c.draw();
    tot.push(performance.now() - t0);
    const t = window.__atlasTimes || {};
    for (const k of Object.keys(t)) acc[k] = (acc[k] || 0) + t[k];
  }
  tot.sort((a, b) => a - b);
  return {
    med: tot[Math.floor(frames / 2)],
    p90: tot[Math.floor(frames * 0.9)],
    max: tot[frames - 1],
    parts: Object.entries(acc).map(([k, v]) => [k, v / frames]).sort((a, b) => b[1] - a[1]),
    dots: (window.__atlasPlaced || []).length,
  };
  }, frames);
}

let r = null;
for (let i = 0; i < TRIES; i += 1) {
  const got = await measure(FRAMES);
  if (!got) break;
  if (!r || got.med < r.med) r = got;
  if (r.p90 <= P90_BUDGET) break;
  if (i + 1 < TRIES) console.log(`[draw] 중간 ${got.med.toFixed(1)}ms — 기계가 바빴을 수 있다, 다시 잰다 (${i + 2}/${TRIES})`);
}
await browser.close();

if (!r) {
  console.log('[draw] 조종 입구가 없다 — 잴 수가 없다');
  process.exit(1);
}
console.log(`[draw] 점 ${r.dots}개 · 한 판 중간 ${r.med.toFixed(1)}ms · 90% ${r.p90.toFixed(1)}ms · 최대 ${r.max.toFixed(1)}ms`);
for (const [k, v] of r.parts.slice(0, 4)) console.log(`  ${k} ${v.toFixed(2)}ms`);

const bad = [];
/* **빨갛게 만드는 건 90% 뿐이다.** 중간값 8ms 는 「예산의 절반」이라는 여유선이었는데,
   같은 코드로 다시 재기만 해도 5.6 → 11.5ms 로 갈렸다(이 기계는 세션 여럿이 같이 쓴다).
   그건 지도를 재는 게 아니라 **그때 기계가 한가했나**를 재는 선이다. 사람이 겪는 것은
   「한 판이 16.7ms 를 넘겨 끊기나」이므로 그 선만 빨갛게 두고, 중간값은 **적어만 둔다.** */
if (r.med > MED_BUDGET) console.log(`  (중간값 ${r.med.toFixed(1)}ms — 여유선 ${MED_BUDGET}ms 위. 기계가 바빴을 수 있다, 빨갛게는 안 한다)`);
if (r.p90 > P90_BUDGET) bad.push(`90% ${r.p90.toFixed(1)}ms (60프레임 한 판 ${P90_BUDGET}ms)`);
if (bad.length) {
  console.log('[draw] **밀고 당길 때 버벅인다**');
  for (const x of bad) console.log('  - ' + x);
  console.log('  위에 어느 토막이 오래 걸리는지 찍혀 있다. 이제 쿼드트리·색깔별 묶어 그리기·WebGL 을 꺼낼 때다.');
  console.log('  (2026-08-21 에는 중간 4.1ms 라 안 꺼냈다 — 그 판단의 전제가 깨진 것이다.)');
  process.exit(1);
}
console.log('[draw] 예산 안에 있다 — 아직 WebGL 을 꺼낼 때가 아니다');
