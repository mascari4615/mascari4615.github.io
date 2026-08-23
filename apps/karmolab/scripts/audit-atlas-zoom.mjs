#!/usr/bin/env node
/**
 * audit-atlas-zoom — **당기면 내용이 뜻을 바꾸나** (TASK-KAR-233).
 *
 * 뜻 있는 당기기(semantic zoom)의 요점은 「그냥 커진다」가 아니라 **뭉친 것이 갈라진다**
 * 이다. ZMLT(다층 트리 그래프 그리기)는 검사 가능한 제약을 못 박는다:
 * **단조성** — 한 층에 나온 것은 더 깊은 층에도 나온다(당겼는데 사라지는 것이 없다).
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 배율에 따라 층이 6→14→30 으로 바뀐다 (문턱은 **박지 말고 재서** 고른다)
 *  ② **단조성**을 수로 확인한다 — 촘촘한 층의 한 무리는 성긴 층의 한 무리 **안에 통째로**
 *  ③ 층이 바뀌어도 **점은 안 움직인다**
 *  ④ 화면이 「지금 층 N · 당기면 갈라진다」를 적는다
 *
 * ★ **문턱의 잣대를 한 번 바꿔 박았다.** 처음엔 ZMLT 의 「이름 겹침 0」을 그대로 문턱으로
 * 쓰려 했는데, 재 보니 층 30 의 이름 서른 개가 **0.65배에서도 안 겹친다**(자리를 일곱 군데나
 * 비켜 보기 때문). 겹침은 넉넉히 통과하지만 그 화면은 안 읽힌다. 그래서 **덮는 넓이**로
 * 바꿨다 — 예산은 **처음 화면에서 가장 성긴 층이 덮던 만큼**(박은 값이 아니다).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

import { untilSettled } from './lib/settle.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
/* ★ **가짜 지도로는 이 자를 못 댄다.** 조용히 통과시키지 않고 **왜 안 도는지 말한다** —
   건너뛴 검사는 통과한 검사가 아니다. 진짜로 구운 뒤 `npm run atlas` 에서 돈다. */
if (isFake(ATLAS)) { console.log('[zoom] 가짜 지도다 — 당겼을 때 뜻이 바뀌는지는 진짜 굽기에서만 잰다'); process.exit(0); }

const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
if (!fs.existsSync(ATLAS)) {
  console.log('[zoom] 지도가 없다 — 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const bad = [];

// ── ② 단조성 — 촘촘한 무리가 성긴 무리 안에 통째로 드나 ───────────────
if (!Array.isArray(atlas.levels) || atlas.levels.length < 2) {
  console.log('[zoom] 층이 둘도 안 된다 — 단조성 검사 건너뜀');
} else {
  for (let i = 0; i + 1 < atlas.levels.length; i += 1) {
    const spread = new Map();
    let n = 0;
    for (const d of atlas.docs) {
      const coarse = Array.isArray(d.levels) ? d.levels[i] : null;
      const fine = Array.isArray(d.levels) ? d.levels[i + 1] : null;
      if (coarse == null || fine == null) continue;
      n += 1;
      if (!spread.has(fine)) spread.set(fine, new Map());
      const m = spread.get(fine);
      m.set(coarse, (m.get(coarse) || 0) + 1);
    }
    let split = 0; let worst = 0;
    for (const m of spread.values()) {
      if (m.size <= 1) continue;
      split += 1;
      const tot = [...m.values()].reduce((a, b) => a + b, 0);
      worst = Math.max(worst, 1 - Math.max(...m.values()) / tot);
    }
    console.log(`  ② 층 ${atlas.levels[i + 1].k} → 층 ${atlas.levels[i].k}: 촘촘한 무리 ${spread.size}개 중`
      + ` 여러 성긴 무리에 걸친 것 ${split}개 (가장 심한 것 ${(worst * 100).toFixed(1)}%) · 글 ${n}편`);
    if (split > 0) {
      bad.push(`층 ${atlas.levels[i + 1].k} 의 무리 ${split}개가 성긴 층을 가로지른다`
        + ' — 당기면 갈라지는 게 아니라 뒤섞인다(단조성이 깨졌다)');
    }
  }
}

// ── ①③④ 화면에서 ────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[zoom] playwright·번들 중 없는 게 있다 — 화면 확인 건너뜀');
} else {
  const bundle = fs.readFileSync(BUNDLE, 'utf8');
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/data/memo-atlas.json')) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(atlas) });
    }
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
  });
  await page.goto('http://localhost/');
  await page.evaluate(() => {
    window.__reg = {};
    window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {}, onDispose() {} };
  });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    const h = document.createElement('div');
    h.id = 'host'; h.style.width = '1200px'; h.style.height = '760px';
    document.body.appendChild(h);
    window.__reg['memo-atlas'].tabs[0].build(h);
  });
  await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), undefined, { timeout: 30000 });
  await page.waitForTimeout(300);

  const at = async (scale) => {
    await page.evaluate((s) => { const c = window.__atlasControl; c.reset(); c.zoom(s, 600, 380); c.draw(); }, scale);
    await untilSettled(page, () => page.evaluate(() => JSON.stringify([window.__atlasScale, window.__atlasVisible, window.__atlasPlaced?.length, window.__atlasLabelBoxes?.length, document.querySelector('#host')?.textContent?.length])));
    return page.evaluate(() => ({
      scale: window.__atlasControl.state().scale,
      cover: window.__atlasNameCover,
      off: window.__atlasNameOff,
      dropped: window.__atlasDropped,
      dots: (window.__atlasDotScreen || []).slice(0, 60),
      say: (document.querySelector('#host .atlas-howto')?.textContent || '').match(/지금 층 \d+/)?.[0] || '',
    }));
  };

  const sw = await page.evaluate(() => window.__atlasSwitchAt);
  const budget = await page.evaluate(() => window.__atlasNameBudget);
  console.log(`  ① 문턱(잰 값) ${JSON.stringify(sw)} · 이름이 덮는 넓이 예산 ${budget}`);
  if (!Array.isArray(sw) || sw.length !== (atlas.levels?.length || 0)) {
    bad.push('문턱이 층 수만큼 안 실려 있다 (__atlasSwitchAt) — 박은 값을 쓰고 있다');
  } else {
    for (let i = 1; i < sw.length; i += 1) {
      if (!(sw[i] > sw[i - 1])) bad.push(`문턱이 층을 따라 안 커진다 (${sw[i - 1]} → ${sw[i]})`);
      if (sw[i] <= 0.4 || sw[i] >= 8) bad.push(`층 ${atlas.levels[i].k} 문턱이 ${sw[i]} 다 — 그 층은 영영 안 뜨거나 늘 뜬다`);
    }
    /* 문턱이 **잰 값**인지: 바로 아래는 예산을 넘고, 바로 위는 예산 이하여야 한다.
       ★ 탐침 ±0.15 는 계기 해상도지 잣대가 아니다 — 두 문턱이 그보다 좁게 붙으면
       (749편 판에서 3.49·3.58, 간격 0.09) 탐침이 옆 층을 밟아 헛빨강이 난다.
       탐침은 이웃 문턱까지 거리의 절반까지 줄인다 — 「바로 아래·바로 위」라는 질문 그대로다. */
    for (let i = 1; i < sw.length; i += 1) {
      const gapLo = sw[i] - sw[i - 1];
      const gapHi = i + 1 < sw.length ? sw[i + 1] - sw[i] : Infinity;
      const eps = Math.max(0.02, Math.min(0.15, gapLo / 2, gapHi / 2));
      const below = await at(Math.max(0.45, sw[i] - eps));
      const above = await at(sw[i] + eps);
      console.log(`     층 ${atlas.levels[i].k} 문턱 ${sw[i]} — 아래(${below.scale.toFixed(2)}) 「${below.say}」`
        + ` · 위(${above.scale.toFixed(2)}) 「${above.say}」`);
      const wantBelow = `지금 층 ${atlas.levels[i - 1].k}`;
      const wantAbove = `지금 층 ${atlas.levels[i].k}`;
      if (below.say !== wantBelow) bad.push(`문턱 바로 아래에서 「${below.say}」 다 (「${wantBelow}」 여야 한다)`);
      if (above.say !== wantAbove) bad.push(`문턱 바로 위에서 「${above.say}」 다 (「${wantAbove}」 여야 한다)`);
    }
  }

  // ③ 층이 바뀌어도 점은 안 움직인다 — 문턱을 아주 조금 넘겨 본다
  if (Array.isArray(sw) && sw.length > 1) {
    const s0 = sw[1];
    const a = await at(s0 - 0.01);
    const b = await at(s0 + 0.01);
    /* ★ **그냥 「얼마나 움직였나」를 재면 안 된다** — 배율이 1% 달라졌으니 화면 끝 점은
       그것만으로 11px 움직인다(처음 그렇게 재서 빨강이 났다). 물어야 할 것은
       **「움직인 것이 확대뿐인가」**다: 두 판 사이의 옳은 자리를 먼저 계산하고 그 나머지를 잰다.
       (같은 배율에서 층만 바꿔 볼 수는 없다 — 층은 배율의 함수라서.) */
    const ratio = b.scale / a.scale;
    const AX = 600; const AY = 380;
    let worst = 0;
    const nn = Math.min(a.dots.length, b.dots.length);
    for (let i = 0; i < nn; i += 1) {
      const px = AX + (a.dots[i][0] - AX) * ratio;
      const py = AY + (a.dots[i][1] - AY) * ratio;
      worst = Math.max(worst, Math.hypot(b.dots[i][0] - px, b.dots[i][1] - py));
    }
    console.log(`  ③ 층이 바뀐 두 판 — 확대만으로 설명되는 자리에서 벗어난 거리 최대 ${worst.toFixed(2)}px`
      + ` (${nn}개 견줌 · 배율 ${a.scale.toFixed(3)}→${b.scale.toFixed(3)})`);
    if (!nn) bad.push('점 자리를 못 읽었다 (__atlasDotScreen)');
    else if (worst > 2) bad.push(`층이 바뀔 때 점이 확대로 설명 안 되는 ${worst.toFixed(1)}px 를 움직인다 — 자리가 층을 따라간다`);
  }

  // ④ 화면이 문턱과 지금 층을 적나
  const now = await at(1);
  const text = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
  const saysNow = /지금 층 \d+/.test(text);
  const saysGate = Array.isArray(sw) && sw.slice(1).every((v) => text.includes(String(v)));
  console.log(`  ④ 화면이 적나 — 지금 층 ${saysNow ? '○' : '✗'} · 문턱 ${saysGate ? '○' : '✗'} (${now.say})`);
  if (!saysNow) bad.push('화면이 「지금 층 N」을 안 적는다 — 저 혼자 바뀌는 것처럼 보인다');
  if (!saysGate) bad.push('화면이 문턱 배율을 안 적는다 — 박은 값인지 잰 값인지 알 수 없다');

  await browser.close();
}

if (bad.length) {
  console.log('[zoom] **당겨도 뜻이 안 바뀌거나, 바뀌는 방식이 어긋난다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  memo-atlas.ts 의 measureSwitches·levelIndex·placeNames 를 봐라.');
  process.exit(1);
}
console.log('[zoom] 당기면 층이 갈라지고, 문턱은 재서 골랐고, 점은 제자리다');
