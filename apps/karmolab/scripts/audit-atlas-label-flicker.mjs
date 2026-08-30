#!/usr/bin/env node
/**
 * audit-atlas-label-flicker. **당길 때 이름이 사라지나** (TASK-KAR-233).
 *
 * 움직이는 지도의 이름 붙이기는 정지 지도와 다른 문제다. Been, Daiches, Yap(InfoVis 2006)
 * 의 3계명:
 *  ① **단조성**. 당길 때 이름이 사라지면 안 되고, 밀 때 나타나면 안 된다
 *  ② **자리 불변**. 움직이는 동안 이름의 자리, 크기가 안 변한다
 *  ③ **히스토리 독립**. 이름 고르기, 놓기는 **지금 화면 상태만의 함수**여야 한다
 * 형식화 R2 = 한 등장 구간에 활성 구간은 **최대 하나**(= 깜빡임 금지).
 *
 * ★ 재 보고 알았다. 충돌로 **버린 이름은 어느 배율에서도 0개**였다. 사라지는 이름은
 * 전부 **닻이 화면 밖으로 날아가서**였다. 닻을 덩어리의 **모든** 글로 냈기 때문이다:
 * 배율 8에서 이름 30개 중 **1개**만 남았다. 그 덩어리를 코앞에서 보고 있는데 이름만 없었다.
 * 고친 규칙 = 닻은 **화면 안에 보이는 그 덩어리의 글들**의 무게중심.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 정해진 길(당기기, 밀기, 끌기)을 프레임마다 훑어 이름별 **활성 구간 수**를 센다. 1보다 크면 깜빡인 것
 *  ② 글이 3개 이상 보이는데 이름이 없는 짝을 센다. 이게 진짜 단조성 위반이다
 *  ③ **히스토리 독립**. 딴 길로 갔다 와도 같은 화면이면 같은 이름 집합
 *  ④ 자. **옛 방식(모든 글로 무게중심)**을 나란히 재서, 우리 쪽이 뚜렷이 나아야 한다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
const bad = [];
const MIN_VIS = 3;      // 이름을 붙일 만큼 보이는 글 수 (위젯의 규칙과 같아야 한다)

if (!fs.existsSync(ATLAS) || !fs.existsSync(BUNDLE)) {
  console.log('[label-flicker] 지도나 번들이 없다. 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium) { console.log('[label-flicker] playwright 가 없다. 검사 건너뜀'); process.exit(0); }

const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
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

/** 정해진 길을 프레임마다 훑는다. 씨앗 없는 무작위 X. 같은 길이어야 견줄 수 있다. */
const sweep = (kind) => page.evaluate((k) => {
  const c = window.__atlasControl;
  c.reset(); c.draw();
  const frames = [];
  for (let i = 0; i < 60; i += 1) {
    if (k === 'in') c.zoom(1.04, 600, 380);
    else if (k === 'out') c.zoom(0.975, 600, 380);
    else c.pan(-14, -6);
    c.draw();
    frames.push({
      scale: Number(c.state().scale.toFixed(4)),
      anchors: (window.__atlasNameAnchors || []).map((a) => ({ name: a.name, vis: a.vis, placed: a.placed })),
      oldOff: window.__atlasNameOldOff,
      /* 사라진 이름이 **충돌로 버려진 것**인지 **화면 밖으로 나간 것**인지 갈라 적는다 . 
         안 가르면 고칠 자리를 못 찾는다(1/289 을 이걸로 짚었다). */
      dropped: window.__atlasDropped, off: window.__atlasNameOff,
    });
  }
  return frames;
}, kind);

for (const kind of ['in', 'out', 'pan']) {
  const frames = await sweep(kind);
  /* ① 이름별 활성 구간 수, ② 보이는데 이름 없는 짝 */
  const runs = new Map();       // 이름 → { on, runs }
  let blind = 0; let namable = 0; let shown = 0;
  for (const f of frames) {
    const on = new Set(f.anchors.filter((a) => a.placed).map((a) => a.name));
    for (const a of f.anchors) {
      if (a.vis < MIN_VIS) continue;
      namable += 1;
      if (a.placed) shown += 1; else blind += 1;
    }
    for (const name of new Set(f.anchors.map((a) => a.name))) {
      const st = runs.get(name) || { on: false, runs: 0 };
      if (on.has(name) && !st.on) st.runs += 1;
      st.on = on.has(name);
      runs.set(name, st);
    }
  }
  const flick = [...runs].filter(([, v]) => v.runs > 1);
  const oldOff = frames.reduce((a, f) => a + (f.oldOff || 0), 0);
  const counts = frames.map((f) => f.anchors.filter((a) => a.placed).length);
  const dropSum = frames.reduce((a, f) => a + (f.dropped || 0), 0);
  const offSum = frames.reduce((a, f) => a + (f.off || 0), 0);
  console.log(`  [${kind}] 이름 ${runs.size}개, **껐다 켜진 이름 ${flick.length}개**`
    + `, 충돌로 버림 ${dropSum}, 화면 밖 ${offSum}`
    + `, 보이는데 이름 없는 짝 ${blind}/${namable}`
    + `, **옛 방식이면 닻이 밖으로 나갔을 이름 ${oldOff}번**`
    + `, 프레임별 ${counts[0]}→${counts[counts.length - 1]}`);
  if (flick.length) {
    bad.push(`[${kind}] 같은 이름이 껐다 켜졌다 한다 ${flick.length}개 (${flick.slice(0, 4).map(([n, v]) => `${n}:${v.runs}번`).join(', ')})`);
  }
  if (blind) bad.push(`[${kind}] 글이 ${MIN_VIS}개 이상 보이는데 이름이 없는 짝이 ${blind}개다. 당길 때 이름이 사라진다`);
  /* ④ **대조군**. 옛 방식이 실제로 나빴어야 이 고침이 뜻이 있다. 당기는 길에서만 잰다. */
  if (kind === 'in' && !(oldOff > 20)) {
    bad.push(`옛 방식이었어도 사라졌을 이름이 ${oldOff}번뿐이다. 대조군이 안 나빠서 견줄 수가 없다(잣대를 의심하라)`);
  }
}

// ③ 히스토리 독립. 딴 길로 갔다 와도 같은 화면이면 같은 이름
const r3 = await page.evaluate(() => {
  const c = window.__atlasControl;
  const at = () => (window.__atlasLabelNames || []).slice().sort().join('|');
  c.reset(); c.zoom(2.2, 600, 380); c.draw(); const a = at();
  c.reset(); c.pan(-300, 120); c.zoom(3.5, 100, 100); c.draw();
  c.reset(); c.zoom(0.5, 200, 600); c.draw();
  c.reset(); c.zoom(2.2, 600, 380); c.draw(); const b = at();
  return { same: a === b, n: a ? a.split('|').length : 0, a, b };
});
console.log(`  ③ 딴 길로 갔다 와도 같은 이름 집합 ${r3.same ? '○' : '✗'} (이름 ${r3.n}개)`);
if (!r3.same) bad.push(`같은 화면인데 이름이 다르다. 히스토리에 기대고 있다\n      전: ${r3.a}\n      후: ${r3.b}`);
if (!(r3.n > 0)) bad.push('견줄 이름이 하나도 없다. 잣대가 헛돈다');

await browser.close();

if (bad.length) {
  console.log('[label-flicker] **움직이면 이름이 사라지거나 깜빡인다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  memo-atlas.ts 의 placeNames. 닻은 화면 안에 보이는 글들의 무게중심이어야 한다.');
  process.exit(1);
}
console.log('[label-flicker] 당겨도 이름이 안 사라지고, 깜빡이지 않고, 같은 화면이면 늘 같은 이름이다');
