#!/usr/bin/env node
/**
 * audit-atlas-doi — **무엇을 화면에 남길지 재서 골랐나** (TASK-KAR-233).
 *
 * 우리는 1918편을 **다 그리고** 관련 없는 것을 알파 0.10 으로 흐리게만 한다. 그건 사실상
 * `DOI = D(x,y)` 한 항짜리에, 그것도 화면에서 지우지 않는 판이다 — 그 상수도 「전부 그리기」도
 * 한 번도 안 쟀다. van Ham & Perer(TVCG 2009)는 그 자리에 **관심 확산 + 예산 안의 연결
 * 부분그래프**를 놓는다: APIdiff(x) = max(API(x), α·max_이웃 (1/EI)·APIdiff(n)).
 *
 * ★ **재 봤고, 졌다.** α 를 아무리 올려도 도움이 안 되고(최적 α = 끝값 0), 예산 안의
 * **연결** 부분그래프는 그냥 「가까운 60개」보다 되찾는 게 적다. 그래서 **안 썼다.**
 * 이 자는 그 판정이 **수와 어긋나지 않는지**를 지킨다 — 표를 지우거나, 졌는데 쓴다고
 * 적거나, 대조군이 죽으면 빨개진다.
 *
 * ⚠ **동그라미를 피한 자리를 지킨다**: 걸어 다니는 그래프는 임베딩에서 나오지만 **정답은
 * 사람이 손으로 쓴 링크**(`[[이름]]`·일감 번호)다. 그래서 API 에 링크 수를 안 쓰고,
 * **초점에서 2홉 이상** 떨어진 정답만 센다(1홉은 이웃 목록이 이미 준다).
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 회수 — α 를 **앞 30개로 고르고 뒤 70개로만 보고**, 지금 방식과 α=0 **둘 다** 대비 +15%p,
 *     그리고 α 스윕에 **안쪽 최대**가 있을 것. 못 넘으면 **안 쓴다**(그리고 그렇게 적는다)
 *  ② 예산·연결·재현 — |F| ≤ S, 초점 포함 연결성분 1개, 같은 입력이면 같은 답
 *  ③ 화면 밖 정직성 — 「숨은 이웃 수」 전수 오차 0 · 확장 방향 top-3 적중 · **놓친 것 원장**
 *  ④ 대조군 — 사람이 쓴 링크를 **차수를 지킨 채** 다시 이으면 회수가 무너질 것
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

if (!fs.existsSync(ATLAS)) {
  console.log('[doi] 지도가 없다 — 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const d = atlas.doi;
if (!d) {
  if (isFake(ATLAS)) { console.log('[doi] 가짜 지도다 — 관심도는 진짜 굽기에서만 잰다'); process.exit(0); }
  console.log('[doi] **무엇을 남길지 재 본 표가 없다** (doi) — 「전부 그리고 흐리게」가 아직 안 쟨 상수다');
  process.exit(1);
}
/* 자료 미달 선언 — 굽는 쪽이 같은 문턱(고르기 20·판정 40)으로 재지 않기로 한 것.
   수가 정말 문턱 아래인지만 확인하고 CANNOT-RUN 으로 나간다. 통과가 아니다. */
if (d.tooFew) {
  const F = d.tooFew;
  if (F.pick >= F.needPick && F.test >= F.needTest) {
    console.log(`[doi] **미달이라 적었는데 수는 문턱 위다** (고르기 ${F.pick}/${F.needPick} · 판정 ${F.test}/${F.needTest})`);
    process.exit(1);
  }
  console.log(`[doi] CANNOT-RUN — 2홉 밖 정답을 가진 초점이 모자라 못 잰다`
    + ` (초점 ${F.focuses}개 → 고르기 ${F.pick}/${F.needPick} · 판정 ${F.test}/${F.needTest})`);
  process.exit(2);
}

console.log(`  ① 회수 — α ${d.alpha} · 홉 벌점 ${d.hopCost} (앞 ${d.pick}개로 고르고 뒤 ${d.test}개로 잼)`
  + ` · 2홉 밖 정답 ${d.want}개 중 관심도 ${(d.recall * 100).toFixed(1)}%`
  + ` [확산 없이 ${(d.zero * 100).toFixed(1)}% · 가까운 ${d.S}개 ${(d.cosine * 100).toFixed(1)}%`
  + ` · 링크를 마구 다시 이으면 ${(d.rand * 100).toFixed(1)}%]`);
console.log(`  ① 스윕 ${d.sweep.map((r) => `${r.alpha}:${(r.recall * 100).toFixed(0)}`).join(' ')}`
  + ` — 안쪽 최대 ${d.inner ? '있다' : '없다'}${d.flat ? ' (평평하다)' : ''}`);
console.log(`  → **${d.used ? '쓴다' : '안 쓴다'}** — ${d.why}`);

/* ① **판정이 수와 맞나** — 이 자의 핵심. 졌는데 「쓴다」고 적으면 빨강. */
const shouldUse = d.recall >= d.cosine + d.margin && d.recall >= d.zero + d.margin && d.inner;
if (d.used !== shouldUse) {
  bad.push(`「${d.used ? '쓴다' : '안 쓴다'}」고 적혀 있는데 수는 「${shouldUse ? '쓴다' : '안 쓴다'}」다`
    + ` (관심도 ${d.recall} vs 가까운 ${d.S}개 ${d.cosine} · 확산 없이 ${d.zero} · 넘어야 할 폭 ${d.margin} · 안쪽 최대 ${d.inner})`);
}
if (!d.why) bad.push('안 쓴 까닭이 안 적혀 있다 — 「졌다」만으로는 다음 사람이 또 해 본다');
/* 스윕이 실제로 여러 값을 훑었나 — 한 칸만 재고 「안쪽 최대 없다」 하면 안 잰 것이다. */
if (!(d.sweep.length >= 5)) bad.push(`α 를 ${d.sweep.length}칸만 훑었다 — 스윕이라 할 수 없다`);
if (!(d.pick >= 20 && d.test >= 40)) bad.push(`고르기 ${d.pick}개 / 판정 ${d.test}개 — 쪼개기가 너무 작다`);

// ── ④ 대조군이 살아 있나 ────────────────────────────────────────────
if (!(d.rand >= 0)) bad.push('링크를 다시 이은 대조군이 안 실려 있다');
else if (!(d.recall > d.rand * 3) && !(d.cosine > d.rand * 3)) {
  bad.push(`링크를 마구 다시 이어도 ${(d.rand * 100).toFixed(1)}% 나온다 (진짜 ${(d.recall * 100).toFixed(1)}%)`
    + ' — 이 잣대는 아무것도 안 재고 있다');
}
console.log(`  ④ 대조군 — 다시 이으면 ${(d.rand * 100).toFixed(1)}% · 지금 방식은 그 ${(d.cosine / Math.max(1e-9, d.rand)).toFixed(1)}배`);

// ── ②③ 예산·연결·정직성 ────────────────────────────────────────────
console.log(`  ② 예산 넘은 시행 ${d.sizeBad} · 확산 반복 ${d.iters}회 · ${d.ms}ms`);
if (d.sizeBad) bad.push(`예산 ${d.S}개를 넘긴 시행이 ${d.sizeBad}개 있다`);
if (!(d.iters > 0 && d.iters <= 20)) bad.push(`확산이 ${d.iters}회 돌았다 — 20회 안에 수렴해야 한다`);
console.log(`  ③ 숨은 이웃 수 오차 ${d.hiddenErr} · 확장 top-3 적중 ${d.top3} (아무 방향 ${d.top3Rand} · ${d.top3Of}회)`
  + ` · **놓친 것 ${d.missed}개**`);
if (d.hiddenErr) bad.push(`「숨은 이웃 수」가 틀린 자리가 ${d.hiddenErr}군데 있다`);
if (d.missed == null) bad.push('놓친 것 원장이 없다 — 「흐리게」를 「안 그리기」로 바꾼 대가를 숨기면 안 된다');

// ── 화면 ────────────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[doi] playwright·번들 중 없는 게 있다 — 화면 확인 건너뜀');
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
  const text = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
  const saysMine = text.includes(`${Math.round(d.recall * 100)}%`);
  const saysCos = text.includes(`가까운 ${d.S}개`) && text.includes(`${Math.round(d.cosine * 100)}%`);
  const saysRand = text.includes(`${Math.round(d.rand * 100)}%`);
  const saysVerdict = d.used ? !/재 보고 \*?\*?안 쓴 것/.test(text) : text.includes('안 쓴다');
  console.log(`  ③ 화면 — 우리 값 ${saysMine ? '○' : '✗'} · 지금 방식 ${saysCos ? '○' : '✗'}`
    + ` · 다시 이은 대조군 ${saysRand ? '○' : '✗'} · 판정 ${saysVerdict ? '○' : '✗'}`);
  if (!saysMine) bad.push('화면이 관심도 회수를 안 적는다');
  if (!saysCos) bad.push('화면이 **지금 방식(가까운 N개)** 값을 안 적는다 — 견줄 것이 없으면 수가 뜻이 없다');
  if (!saysRand) bad.push('화면이 **링크를 다시 이은 대조군**을 안 적는다');
  if (!saysVerdict) bad.push('화면이 쓴다/안 쓴다를 안 적는다 — 진 것을 숨기면 다음 사람이 또 해 본다');
  await browser.close();
}

if (bad.length) {
  console.log('[doi] **무엇을 남길지 제대로 재지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 doiEval·diffuse·pickBudget 을 봐라.');
  process.exit(1);
}
console.log(`[doi] 재 보고 ${d.used ? '골랐다' : '**안 썼다**'} — 지금 방식·확산 없는 판·다시 이은 대조군을 나란히 싣는다`);
