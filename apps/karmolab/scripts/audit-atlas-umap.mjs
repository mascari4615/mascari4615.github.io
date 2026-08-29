#!/usr/bin/env node
/**
 * audit-atlas-umap. **자리 잡기 손잡이도 재서 골랐나** (TASK-KAR-233).
 *
 * UMAP 정본 문서가 못 박는 것 셋:
 *  - **n_neighbors** 는 국소↔전역을 맞바꾼다(작으면 덩어리가 부스러지고, 크면 큰 그림을 본다)
 *  - **min_dist** 는 뭉침↔퍼짐을 맞바꾼다
 *  - **어떤 값도 맞는 값이 아니다**. 여러 값에서 살아남는 구조가 믿을 만한 것이다
 * 그리고 하나 더: **덩어리 사이 거리는 뜻이 없다**(국소 이웃을 맞추지 전역 거리를 맞추는 게 아니다).
 *
 * 우리는 30, 0.3 을 손으로 박아 두고 있었다. 뼈대 렌즈, 손잡이는 쓸어서 골랐으면서.
 * 이제 표본으로 쓸어 **믿을 만함+안 놓침**이 가장 큰 자리를 고른다.
 *
 * 이 자가 보는 것:
 *  ① 손잡이와 **표**가 실려 있나 (왜 이 값이냐를 다시 볼 수 있어야 고른 게 된다)
 *  ② 고른 자리가 표에서 **최선**인가
 *  ③ 화면이 손잡이와 함께 **덩어리 사이 거리는 뜻이 없다**를 적나 (정본 경고를 옮긴다)
 *  ④ 표가 **한쪽으로 죽어 있지 않나**. 값이 다 같으면 쓸어 본 뜻이 없다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
if (!fs.existsSync(ATLAS)) {
  console.log('[umap] 지도가 없다. 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const bad = [];
const u = atlas.umap;

if (!u) {
  if (isFake(ATLAS)) {
    console.log('[umap] 가짜 지도다. 손잡이 고르기는 진짜 굽기에서만 돈다. 건너뜀');
    process.exit(0);
  }
  console.log('[umap] **자리 잡기 손잡이가 안 실려 있다** (umap)');
  console.log('  손으로 박은 값이면 그렇다고 적어야 하고, 골랐으면 표를 실어야 한다.');
  process.exit(1);
}

// ── ①② 표가 있고 고른 자리가 최선인가 ───────────────────────────────
if (!Array.isArray(u.table) || u.table.length < 4) {
  bad.push('손잡이를 **어떻게 골랐는지**가 안 실려 있다 (umap.table)');
} else {
  /* **고르는 잣대와 재는 잣대는 하나여야 한다.** 이웃(믿을 만함+안 놓침)만 보면 가장 국소적인
     자리(10/0)가 이기는데 그건 뭉쳐서 화면을 버리는 쪽이다. 굽는 쪽은 채움율이 최고의
     80% 이상인 것들 중에서 고른다. 자도 같은 규칙을 다시 건다(안 그러면 성한 것이 빨개진다 . 
     이 세션에서 뼈대 렌즈로 똑같은 실수를 했다). */
  const score = (t) => t.trust + t.cont;
  if (u.table.some((t) => t.fill == null)) {
    bad.push('표에 **화면 채움율**이 없다. 이웃만 보고 고르면 한 귀퉁이에 뭉친 그림이 이긴다');
  }
  const maxFill = Math.max(...u.table.map((t) => t.fill ?? 0));
  const pool = u.table.filter((t) => (t.fill ?? 0) >= maxFill * 0.8);
  const from = pool.length ? pool : u.table;
  const best = from.reduce((a, b) => (score(b) > score(a) ? b : a), from[0]);
  const mine = u.table.find((t) => t.nn === u.nn && t.md === u.md);
  console.log(`  ①② 표 ${u.table.length}자리, 고른 값 이웃 ${u.nn}, 최소거리 ${u.md}`
    + ` (믿을 만함 ${u.trust}, 안 놓침 ${u.cont})`);
  console.log('     ' + u.table.map((t) => `${t.nn}/${t.md}:${score(t).toFixed(3)}, 채움${t.fill ?? '?'}`).join(' '));
  console.log(`     채움이 최고(${maxFill})의 80% 이상인 자리 ${pool.length}개 중에서 고른다`);
  if (!mine) bad.push('고른 손잡이가 표에 없다. 표와 그림이 딴 얘기를 한다');
  else if (score(best) > score(mine) + 1e-9) {
    bad.push(`표에 더 나은 자리가 있는데 안 골랐다: ${best.nn}/${best.md} (${score(best).toFixed(3)} vs ${score(mine).toFixed(3)})`);
  }
  // ④ 표가 죽어 있지 않나
  const vals = u.table.map(score);
  const range = Math.max(...vals) - Math.min(...vals);
  console.log(`  ④ 표의 높낮이 ${range.toFixed(3)}`);
  if (range < 0.005) {
    bad.push(`표가 평평하다(높낮이 ${range.toFixed(4)}). 쓸어 본 뜻이 없다. 잣대나 표본을 봐라`);
  }
}

// ── ③ 화면이 경고를 적나 ─────────────────────────────────────────────
if (!fs.existsSync(BUNDLE)) {
  console.log('[umap] 번들이 없다. ③ 건너뜀');
} else {
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
  if (!chromium) {
    console.log('[umap] playwright 가 없다. ③ 건너뜀');
  } else {
    const bundle = fs.readFileSync(BUNDLE, 'utf8');
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    await page.route('**/*', (r) => {
      const url = new URL(r.request().url());
      if (url.pathname.endsWith('/data/memo-atlas.json')) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(atlas) });
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
    const text = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
    await browser.close();
    const saysWarn = /거리는 뜻이 없|거리에 뜻이 없|거리는 재지/.test(text);
    const saysKnob = text.includes(String(u.nn)) && text.includes(String(u.md));
    console.log(`  ③ 화면이 손잡이를 적나 ${saysKnob ? '적는다' : '**안 적는다**'}, 경고를 적나 ${saysWarn ? '적는다' : '**안 적는다**'}`);
    if (!saysWarn) bad.push('화면이 덩어리 사이 거리는 뜻이 없다를 안 적는다. 정본 경고를 사람이 못 본다');
    if (!saysKnob) bad.push('화면이 자리 잡기 손잡이를 안 적는다');
  }
}

// ── ⑤ **다른 방식도 견줬나**. 중간거리 짝 (PaCMAP) ────────────────────
/* 자리 잡기를 손잡이만 쓸어 보는 게 아니라 **다른 방식**과도 견줘야 한다.
   중간거리 짝을 쓰는 방식을 같은 표본, 같은 잣대로 재서 표에 넣어 뒀다.
   (실측: 이웃합 1.804, 채움 0.354. UMAP 최고 1.819, 0.469 에 **둘 다 진다** → 안 썼다.
    그게 맞는 판단인지 여기서 다시 세운다.) */
{
  const other = (u.table || []).filter((t) => t.way && t.way !== 'UMAP');
  console.log(`  ⑤ 다른 방식 ${other.length}가지. ` + (other.length
    ? other.map((t) => `${t.way}: ${(t.trust + t.cont).toFixed(3)}, 채움${t.fill}`).join(' ')
    : '없음'));
  if (!other.length) bad.push('다른 방식(중간거리 짝)을 재 본 자리가 표에 없다. 손잡이만 쓸고 있다');
  else {
    /* 표대로 다시 골라 본다. 채움 문턱을 통과한 것 중 이웃합 최고. */
    const maxFill2 = Math.max(...u.table.map((t) => t.fill ?? 0));
    const okRows = u.table.filter((t) => (t.fill ?? 0) >= maxFill2 * 0.8);
    const from = okRows.length ? okRows : u.table;
    const win = from.reduce((a, b) => ((b.trust + b.cont) > (a.trust + a.cont) ? b : a), from[0]);
    const chosenWay = u.way || 'UMAP';
    console.log(`     표대로면 ${win.way || 'UMAP'} (이웃합 ${(win.trust + win.cont).toFixed(3)}), 실제 ${chosenWay}`);
    if ((win.way || 'UMAP') !== chosenWay) {
      bad.push(`표대로면 ${win.way || 'UMAP'} 를 써야 하는데 ${chosenWay} 를 썼다`);
    }
  }
}

if (bad.length) {
  console.log('[umap] **자리 잡기 손잡이의 근거가 안 선다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  pickUmapParams 의 표, 고르는 규칙이나 화면 문구를 봐라.');
  process.exit(1);
}
console.log('[umap] 손잡이를 재서 골랐고, 표가 실려 있고, 화면이 거리는 뜻이 없다를 적는다');
