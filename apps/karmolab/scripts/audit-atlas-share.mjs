#!/usr/bin/env node
/**
 * audit-atlas-share — **남에게 줘도 되는 판을 만들 수 있나** (TASK-KAR-233).
 *
 * 앞 바퀴에 쟀다: **제목을 가려도 80.3% 드러난다**(우연 22%), **좌표만 줘도 72.5%**.
 * 억제(가리기)는 방어가 아니다. k-익명성(Sweeney)의 답은 **일반화** — 풀어 놓는 항목
 * 하나가 최소 k명을 가리키게 만든다. 우리 판으로 옮기면 개별 자리를 빼고 **격자 칸**만
 * 주고, 글이 k개 미만인 칸은 아예 뺀다.
 *
 * ★ **재 봤고, 못 만들었다.** k 를 1 에서 1500 까지 키워도 공격 적중이 62% → 57% 로만
 * 내려간다(우연 22.4%). 우연에 닿는 건 **칸이 하나**일 때뿐이고, 바로 그때 값어치도
 * 우연과 같아진다(닮은 글이 곁에 100% · 우연 100%). **자리 자체가 새는 것이라 굵게
 * 뭉개는 걸로는 못 막는다 — 공짜가 없다.**
 *
 * ⚠ 이 자의 존재 이유: **사생활만 재고 값어치를 안 재면 「아무것도 안 내보내면 완벽」이
 * 된다.** 그래서 두 곡선을 **같은 표에** 두고, 값어치 쪽 우연 수준도 반드시 함께 잰다.
 *
 * 합격선(재기 **전 바퀴에** 정본 문서에 박아 뒀다):
 *  ① k 마다 격자를 **재서 고른다**(글 90% 이상이 k개 이상 든 칸에 남는 가장 촘촘한 격자)
 *  ② 공격 적중률과 **값어치**(닮은 글이 같은/옆 칸에 남는 비율)를 한 표에
 *  ③ 값어치 쪽에도 **우연 수준**을 나란히 — 굵게 뭉갤수록 우연도 같이 오른다
 *  ④ 쓸 만한 k 가 없으면 **안 만들고 그렇게 적는다**
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

if (!fs.existsSync(ATLAS)) { console.log('[share] 지도가 없다 — 검사 건너뜀'); process.exit(0); }
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const S = atlas.share;
if (!S) {
  if (isFake(ATLAS)) { console.log('[share] 가짜 지도다 — 공유용 판은 진짜 굽기에서만 잰다'); process.exit(0); }
  console.log('[share] **공유용 일반화 표가 없다** (share) — 「가려도 새는데 그럼 뭘 할 수 있나」를 안 물었다');
  process.exit(1);
}

console.log(`  우연 수준 ${(S.chance * 100).toFixed(1)}% · 가린 글 ${S.masked}편`);
for (const r of S.rows) {
  console.log(`  k=${r.k} (격자 ${r.side} · 칸 ${r.cells} · 글 ${(r.keptDocs * 100).toFixed(0)}% 남음)`
    + ` — 공격 ${(r.attack * 100).toFixed(1)}%`
    + ` · 값어치 ${(r.keepNear * 100).toFixed(1)}% (우연 ${(r.randNear * 100).toFixed(1)}%)`);
}
console.log(`  ④ 판정 — ${S.usable ? `**k=${S.pick} 이면 남에게 줄 만하다**` : '**어느 k 로도 안 된다**'}`);

/* ① k 를 여러 개 훑었나 — 하나만 재고 「안 된다」 하면 안 잰 것이다. */
if (!(S.rows.length >= 5)) bad.push(`k 를 ${S.rows.length}가지만 재고 판정했다`);
/* ★ ③ **값어치 쪽 우연 수준이 반드시 있어야 한다** — 이게 이 자의 심장.
   굵게 뭉갤수록 「닮은 글이 곁에」는 저절로 오른다. 우연을 안 적으면 그게 이득처럼 보인다. */
for (const r of S.rows) {
  if (r.randNear == null) { bad.push(`k=${r.k} 에 값어치 쪽 우연 수준이 없다 — 뭉갠 이득과 진짜 이득을 못 가른다`); break; }
}
/* 굵게 뭉갤수록 우연도 올라야 한다 — 안 오르면 셈이 이상하다. */
const first = S.rows[0]; const last = S.rows[S.rows.length - 1];
if (!(last.randNear >= first.randNear)) {
  bad.push(`굵게 뭉갰는데 값어치 쪽 우연이 안 올랐다 (${first.randNear} → ${last.randNear}) — 셈이 이상하다`);
}
/* ② 공격이 **우연 밑으로는 못 간다** — 가면 셈이 깨진 것이다. */
for (const r of S.rows) {
  if (r.attack < S.chance * 0.8) bad.push(`k=${r.k} 에서 공격이 ${r.attack} 로 우연(${S.chance})보다 낮다 — 셈이 깨졌다`);
}
/* ④ 판정이 수와 맞나. */
const ok = S.rows.find((r) => r.attack <= S.chance * 1.15 && r.keepNear > r.randNear * 3);
const should = !!ok;
if (S.usable !== should) {
  bad.push(`「${S.usable ? '줄 만하다' : '안 된다'}」고 적혀 있는데 수는 반대다`);
}
/* ★ 곡선이 **바닥에 닿았는지** — 안 닿았으면 「어느 k 로도 안 된다」는 어림이다. */
const floor = S.rows.find((r) => r.attack <= S.chance * 1.05);
if (!S.usable && !floor) {
  bad.push('공격이 우연 수준까지 내려간 k 가 표에 없다 — k 를 더 키워 봐야 「어느 k 로도 안 된다」고 말할 수 있다');
}
if (floor) console.log(`  ★ 공격이 우연에 닿는 곳 — k=${floor.k} (칸 ${floor.cells}개)`
  + ` · 그때 값어치 ${(floor.keepNear * 100).toFixed(0)}% vs 우연 ${(floor.randNear * 100).toFixed(0)}% (같아진다)`);

// ── 화면 ────────────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[share] playwright·번들 중 없는 게 있다 — 화면 확인 건너뜀');
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
  const saysCurve = text.includes(`${Math.round(S.rows[0].attack * 100)}%`)
    && text.includes(`${Math.round(last.attack * 100)}%`);
  const saysNoFree = /공짜가 없다/.test(text);
  const saysVerdict = S.usable ? !/못 만든 것/.test(text) : /못 만든 것/.test(text);
  console.log(`  화면 — 곡선 ${saysCurve ? '○' : '✗'} · 공짜 없음 ${saysNoFree ? '○' : '✗'} · 판정 ${saysVerdict ? '○' : '✗'}`);
  if (!saysCurve) bad.push('화면이 k 를 키워도 공격이 얼마나 내려가는지 안 적는다');
  if (!saysNoFree) bad.push('화면이 **공짜가 없다**(우연에 닿는 순간 값어치도 우연)를 안 적는다');
  if (!saysVerdict) bad.push('화면이 만들었다/못 만들었다를 안 적는다');
  await browser.close();
}

if (bad.length) {
  console.log('[share] **남에게 줄 판을 제대로 재지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 shareGrid·pickGrid 를 봐라.');
  process.exit(1);
}
console.log(`[share] k 를 ${S.rows[0].k}~${last.k} 로 키워도 공격 ${(S.rows[0].attack * 100).toFixed(0)}%→${(last.attack * 100).toFixed(0)}%`
  + ` (우연 ${(S.chance * 100).toFixed(0)}%) — ${S.usable ? `k=${S.pick} 채택` : '**남에게 줄 판은 못 만든다**'}`);
