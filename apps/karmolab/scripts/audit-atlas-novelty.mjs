#!/usr/bin/env node
/**
 * audit-atlas-novelty — **새로 생긴 관심사가 있나** (TASK-KAR-233).
 *
 * 시기별 임베딩은 자연 정렬이 안 돼서 orthogonal Procrustes 로 맞춘 뒤 비교하는 게 정석이다
 * (Hamilton 외 ACL 2016). ★ 그런데 **Dubossarsky 외(2017)가 시기를 섞은 대조군을 만들자
 * 기존 연구가 보고한 변화량이 대부분 사라지거나 크게 줄었다.** 그래서 대조군을 먼저 세운다.
 *
 * ⚠ 우리 자료는 낱말이 아니라 **글**이라 「같은 것이 시기별로 어떻게 변했나」를 못 묻는다.
 * 물을 수 있는 건 **「새 글이 어디에 떨어지나」** — 최근 글끼리 뭉치면 새 관심사가 생긴 것이다.
 *
 * ⚠ 그리고 **좌표로 안 잰다.** 자리는 절반이 씨앗이 정한다는 걸 이미 쟀다 — 좌표로 변화를
 * 재면 그 난수를 변화로 읽는다. **이웃 목록**으로 잰다(그 분야도 정렬 후 코사인보다 이웃
 * Jaccard 가 낫다고 보고한다).
 *
 * ★ 실측 — 최근 글의 이웃 중 최근 글이 90.2%(원래 몫 60.9% → **뭉침 1.482배**),
 * **달을 마구 섞으면 1.013배**. 대조군이 정확히 1 에 앉았고 진짜는 뚜렷이 넘는다.
 *
 * 합격선(재기 **전 바퀴에** 정본 문서에 박아 뒀다):
 *  ① 좌표가 아니라 **이웃 목록**으로 잰다
 *  ② **달 무작위 재배정 대조군**을 나란히 — 여기서도 뭉치면 측정 무효
 *  ③ **달을 모르는 글**을 수로 적고 셈에서 뺀다 (숨기면 뭉침이 저절로 부푼다)
 *  ④ 대조군을 못 넘으면 「새 관심사」를 화면에 **안 적고** 그렇게 기록한다
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

if (!fs.existsSync(ATLAS)) { console.log('[novelty] 지도가 없다 — 검사 건너뜀'); process.exit(0); }
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const N = atlas.novelty;
if (!N) {
  if (isFake(ATLAS)) { console.log('[novelty] 가짜 지도다 — 시간 축은 진짜 굽기에서만 잰다'); process.exit(0); }
  console.log('[novelty] **새로 생긴 관심사를 재 본 표가 없다** (novelty) — 시간 축을 안 물었다');
  process.exit(1);
}

console.log(`  ③ 최근 ${N.recentMonths.length}달(${N.recentMonths.join(',')}) · 달을 아는 글 ${N.known}편`
  + ` · **모르는 글 ${N.unknown}편** (${Math.round(N.unknown / (N.known + N.unknown) * 100)}%)`);
console.log(`  ① 최근 글의 이웃 중 최근 글 ${(N.real.near * 100).toFixed(1)}%`
  + ` (원래 몫 ${(N.real.share * 100).toFixed(1)}% → 뭉침 ${N.real.lift}배)`);
console.log(`  ② 대조군 — 달을 마구 섞으면 ${N.shuffled.lift}배`);
console.log(`  ④ 판정 — ${N.clustered ? '**새 관심사가 있다**' : '새 관심사라 부를 것이 없다'}`);

/* ③ 모르는 글을 **적고 있어야** 한다 — 숨기면 뭉침이 저절로 부푼다. */
if (N.unknown == null) bad.push('달을 모르는 글 수가 안 실려 있다 — 숨기면 뭉침이 저절로 부푼다');
if (!(N.known > 200)) bad.push(`달을 아는 글이 ${N.known}편뿐이다 — 재기엔 너무 적다`);
if (!(N.recentMonths?.length >= 1)) bad.push('최근으로 본 달이 없다');

/* ★ ② **대조군이 이 자의 심장** — 달을 섞어도 뭉치면 이웃이 아니라 딴 것을 재고 있다. */
if (N.shuffled?.lift == null) bad.push('달을 섞은 대조군이 안 실려 있다 — 뭉침이 자료의 것인지 못 가른다');
else if (Math.abs(N.shuffled.lift - 1) > 0.2) {
  bad.push(`달을 마구 섞었는데 뭉침이 ${N.shuffled.lift}배 다 — 1 에 앉아야 한다(셈이 이상하다)`);
}
/* ① 이웃으로 쟀나 — 이웃을 몇 개 봤는지 없으면 좌표로 쟀을 수 있다. */
if (!(N.k > 0)) bad.push('이웃을 몇 개 보고 쟀는지가 없다 — 좌표로 잰 것과 못 가른다');
if (!(N.real.share > 0 && N.real.share < 1)) bad.push(`최근 글이 차지하는 몫이 ${N.real.share} 다 — 나눔이 이상하다`);

/* ④ 판정이 수와 맞나. */
const should = N.real.lift > N.shuffled.lift * 1.3 && N.real.lift > 1.2;
if (N.clustered !== should) {
  bad.push(`「${N.clustered ? '있다' : '없다'}」고 적혀 있는데 수는 반대다 (${N.real.lift} vs 대조군 ${N.shuffled.lift})`);
}
if (N.clustered && !(N.lanes?.length)) bad.push('새 관심사가 있다면서 어느 갈래인지 안 적는다');

// ── 화면 ────────────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[novelty] playwright·번들 중 없는 게 있다 — 화면 확인 건너뜀');
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
  await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), { timeout: 30000 });
  const text = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
  const saysLift = text.includes(`${N.real.lift}배`);
  const saysShuf = text.includes(`${N.shuffled.lift}배`);
  const saysUnknown = text.includes(`${N.unknown}편`);
  const saysWhy = /자리가 아니라 이웃으로 쟀다/.test(text);
  console.log(`  화면 — 뭉침 ${saysLift ? '○' : '✗'} · 섞은 대조군 ${saysShuf ? '○' : '✗'}`
    + ` · 모르는 글 ${saysUnknown ? '○' : '✗'} · 왜 이웃으로 재나 ${saysWhy ? '○' : '✗'}`);
  if (!saysLift) bad.push('화면이 뭉침 배수를 안 적는다');
  if (!saysShuf) bad.push('화면이 **달을 섞은 대조군**을 안 적는다 — 1.48배가 큰지 알 수 없다');
  if (!saysUnknown) bad.push('화면이 **달을 모르는 글 수**를 안 적는다 — 셈에서 뺀 것을 숨기면 안 된다');
  if (!saysWhy) bad.push('화면이 **왜 좌표가 아니라 이웃으로 쟀는지**를 안 적는다');
  await browser.close();
}

if (bad.length) {
  console.log('[novelty] **시간 축을 제대로 재지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 noveltyOf 를 봐라.');
  process.exit(1);
}
console.log(`[novelty] 최근 글 뭉침 ${N.real.lift}배 (달을 섞으면 ${N.shuffled.lift}배)`
  + ` — ${N.clustered ? '**새 관심사가 있다**' : '새 관심사라 부를 것이 없다'}`);
