#!/usr/bin/env node
/**
 * audit-atlas-init. **자리를 물려주는 초기값을 재서 골랐나** (TASK-KAR-233).
 *
 * Kobak & Linderman(Nature Biotechnology 2021): UMAP 이 t-SNE 보다 전역 구조를 잘 지킨다는
 * 알고리즘 차이가 아니라 **초기화 차이 하나**였다. **전역 배치는 최적화가 만드는 게 아니라
 * 초기값이 물려주고**, 끌림-밀침은 그 위에서 지역만 다듬는다. 우리가 잰 자리의 절반은
 * 난수가 정한다는 그 증상이고, 처방이 여기 있다. 그래서 사다리를 굽고 재서 골랐다.
 *
 * ★ **재 봤고, 사전에 박은 문턱을 못 넘었다.** 최고 조건(spectral/maxabs10)이 전역 상관을
 * 0.5047 → 0.5317 로 올렸는데(선형으로 눕힌 천장 0.6047 의 88%), 넘어야 할 폭은 0.10 이었다.
 * 그래서 **안 바꿨다.** 표는 지우지 않고 그대로 싣는다. PaCMAP, MMR, 관심도와 같은 자리다.
 *
 * ★★ 다만 **문턱이 잰 것과 병이 있는 곳이 달랐다**: 병은 평균이 아니라 **판마다 흔들리는
 * 폭**이었고 거기서는 이겼다(상관 폭 [0.388~0.543] → [0.512~0.546], 자리 떨림 0.084 → 0.057,
 * 이웃 유지 30.8% → 34.3% 로 **오히려 나아짐**). 그래도 판정은 사전등록대로 간다 . 
 * **재고 나서 문턱을 만지면 그건 재는 게 아니다.** 다음 바퀴에 **다시 사전등록**한다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  0  배관. 극단 init 판이 난수 init 판과 **달라야** 한다. 같으면 아래 표는 전부 헛것
 *  ①  스케일도 재서 고른다. init 3종 × 스케일 3종을 다 굽는다
 *  ②  주 판정 = **전역 거리 상관**(+0.10, ≥0.8×천장, CI 비겹침). 천장도 재서 정한다(선형 PCA-2D)
 *  ③  비퇴행. 이웃 유지가 안 떨어져야 한다
 *  ④  떨림은 **보조 지표**. init 을 못 박으면 공짜로 주니 판정에 안 쓴다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
const bad = [];

if (!fs.existsSync(ATLAS)) { console.log('[init] 지도가 없다. 검사 건너뜀'); process.exit(0); }
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const L = atlas.initLadder;
if (!L) {
  if (isFake(ATLAS)) { console.log('[init] 가짜 지도다. 초기화 사다리는 진짜 굽기에서만 잰다'); process.exit(0); }
  console.log('[init] **초기값을 재 본 표가 없다** (initLadder). 난수 초기값이 아직 안 쟨 상수다');
  console.log('  굽기에 `--초기화` 를 주면 잰다 (사다리 한 판이 몇 분이라 늘 돌지는 않는다).');
  console.log('  안 잰 것은 통과도 실패도 아니다. 지도를 그 자리 없이 구웠을 뿐이다 (2026-09-01).');
  process.exit(2);
}

console.log(`  0 배관. 극단 초기값 판이 난수 판과 ${L.plumbing?.differs ? '다르다 (초기 자리가 먹힌다)' : '**같다**'}`);
if (!L.plumbing || !L.plumbing.differs) {
  bad.push('극단 초기값을 줘도 판이 안 바뀐다. `u.embedding` 재대입이 무시되는 그 자리다. 아래 표는 전부 헛것이다');
}

console.log(`  ① 표. ${L.table.map((t) => `${t.name}:${t.r}`).join(' ')}`);
console.log(`  ② 천장(선형 PCA-2D) ${L.ceiling}, 지금(난수) ${L.base}, 본선 진출 ${L.top.join(', ')}`);
/* ① 사다리가 **실제로 여러 조건을 굽었나**. 한 조건만 재고 이게 낫다 하면 안 된다. */
if (!(L.table.length >= 5)) bad.push(`조건을 ${L.table.length}개만 굽고 골랐다. 사다리라 할 수 없다`);
const ways = new Set(L.table.map((t) => t.name.split('/')[0]));
if (ways.size < 3) bad.push(`초기값 방식이 ${ways.size}가지뿐이다 (난수, PCA, 스펙트럼 셋을 다 굽어야 한다)`);
const scales = new Set(L.table.filter((t) => t.name.includes('/')).map((t) => t.name.split('/')[1]));
if (scales.size < 3) bad.push(`스케일을 ${scales.size}가지만 재고 골랐다. 스케일도 손으로 고르면 안 된다`);

/* ② 사보타주가 살아 있나. 이게 0 이 아니면 자가 아무거나 재고 있는 것이다. */
console.log(`  ② 사보타주. 자리 섞기 ${L.sabotage.points}, 벡터 섞기 ${L.sabotage.vectors} (둘 다 0 에 붙어야)`);
if (Math.abs(L.sabotage.points) > 0.03) bad.push(`2D 자리를 마구 섞어도 상관이 ${L.sabotage.points} 다. 자가 아무거나 재고 있다`);
if (Math.abs(L.sabotage.vectors) > 0.03) bad.push(`고차원 벡터를 마구 섞어도 상관이 ${L.sabotage.vectors} 다. 자가 아무거나 재고 있다`);
/* 천장이 바탕보다 위여야 말이 된다. 선형으로 눕힌 판이 더 나쁘면 천장이 아니다. */
if (!(L.ceiling > L.base)) bad.push(`천장 ${L.ceiling} 이 지금 값 ${L.base} 보다 낮다. 천장을 잘못 잡았다`);

if (!L.winner || !L.control) bad.push('본선 결과가 없다. 씨앗 여러 판으로 다시 재야 판정이 선다');
else {
  const W = L.winner; const C = L.control;
  console.log(`  ② 본선 ${W.runs}판. ${W.name}: r ${W.r} [${W.rLo}~${W.rHi}], 떨림 ${W.wobble}, 이웃 유지 ${W.keep}`);
  console.log(`             난수: r ${C.r} [${C.rLo}~${C.rHi}], 떨림 ${C.wobble}, 이웃 유지 ${C.keep}`);
  /* ★ **판정이 수와 맞나**. 이 자의 핵심. 졌는데 바꿨다고 적으면 빨강. */
  const should = !!(L.plumbing?.differs && W.r >= C.r + L.margin && W.r >= 0.8 * L.ceiling && W.rLo > C.rHi);
  console.log(`  ② 판정. ${L.used ? '바꾼다' : '안 바꾼다'} (올린 폭 ${(W.r - C.r).toFixed(4)}, 넘어야 할 폭 ${L.margin})`);
  if (L.used !== should) {
    bad.push(`${L.used ? '바꾼다' : '안 바꾼다'}고 적혀 있는데 수는 ${should ? '바꾼다' : '안 바꾼다'}다`
      + ` (r ${W.r} vs ${C.r}, 폭 ${L.margin}, 천장 ${L.ceiling}, CI [${W.rLo}~${W.rHi}] vs [${C.rLo}~${C.rHi}])`);
  }
  /* ③ 비퇴행. 이겼든 졌든, **이웃을 팔았는지**는 반드시 적혀 있어야 한다. */
  const soldNeighbours = W.keep < C.keep - 0.02;
  console.log(`  ③ 비퇴행. 이웃 유지 ${C.keep} → ${W.keep} ${soldNeighbours ? '**팔았다**' : '(안 팔았다)'}`);
  if (L.used && soldNeighbours) bad.push(`전역을 사려고 이웃을 팔았는데(${C.keep} → ${W.keep}) 그 초기값을 썼다`);
  /* ④ 떨림은 보조. 다만 **실려는 있어야** 한다. 안 실으면 무엇을 샀나를 못 적는다. */
  if (!(W.wobble > 0) || !(C.wobble > 0)) bad.push('떨림이 안 실려 있다. 무엇을 사고 팔았는지 적을 수가 없다');
}

// ── 화면 ────────────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[init] playwright, 번들 중 없는 게 있다. 화면 확인 건너뜀');
} else if (L.winner && L.control) {
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
  const text = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
  const saysR = text.includes(String(L.winner.r)) && text.includes(String(L.control.r));
  const saysCeil = text.includes(String(L.ceiling));
  const saysVerdict = L.used ? !/안 바꾼 것/.test(text) : /안 바꿨다|안 바꾼 것/.test(text);
  console.log(`  화면. 두 상관 ${saysR ? '○' : '✗'}, 천장 ${saysCeil ? '○' : '✗'}, 판정 ${saysVerdict ? '○' : '✗'}`);
  if (!saysR) bad.push('화면이 바꾼 값과 지금 값을 나란히 안 적는다');
  if (!saysCeil) bad.push('화면이 **천장**(선형으로 눕힌 판)을 안 적는다. 0.53 이 좋은 값인지 알 수 없다');
  if (!saysVerdict) bad.push('화면이 바꿨다/안 바꿨다를 안 적는다. 진 것을 숨기면 다음 사람이 또 해 본다');
  await browser.close();
}

if (bad.length) {
  console.log('[init] **초기값을 제대로 재지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 initLadder, initPoints, rGlobal 과 umap2 의 init 이음매를 봐라.');
  process.exit(1);
}
console.log(`[init] 사다리 ${L.table.length}조건을 굽고 재서 ${L.used ? '골랐다' : '**안 바꿨다**'}`
  + '. 천장, 바탕, 사보타주, 비퇴행을 나란히 싣는다');
