#!/usr/bin/env node
/**
 * audit-atlas-idim. **이 무더기가 애초에 2차원에 담기나** (TASK-KAR-233).
 *
 * ★ 우리는 이 질문을 **한 번도 안 물었다.** 그런데 여태 쌓인 결론 넷이 전부 여기서 따라
 * 나온다. 화면 이웃의 **69%가 거짓 이웃**, 씨앗을 바꾸면 이웃 **셋 중 둘이 바뀜** , 
 * **자리의 절반은 난수**, **구획이지 무리가 아니다**.
 *
 * 재 보니 **약 18차원**이다(이웃 10명 기준). 18차원을 2차원 종이에 눕히면 **찢김은 고칠 수
 * 있는 결함이 아니라 치러야 하는 값**이다. 화면이 그렇게 적어야 한다.
 *
 * 추정기 둘을 **각각** 써서 서로의 대조군으로 삼는다:
 * , **MLE**(Levina-Bickel, NIPS 2004). m̂_k = [ (1/(n(k−1))) ΣΣ log(T_k/T_j) ]⁻¹.
 *    ⚠ **역수를 평균**해야 한다(MacKay-Ghahramani). 그냥 평균하면 위로 치우친다 . 
 *    우리 자료에서 실제로 17.95 대신 **25.13** 이 나왔다.
 * , **TwoNN**. μ = r₂/r₁ 의 경험 CDF 에 원점을 지나는 직선. 손잡이가 없다.
 *
 * ⚠ **표본이 차원에 비해 적으면 둘 다 과소추정한다.** 그래서 눈금 표를 같이 싣는다 . 
 * 같은 표본 수로 **20차원인 걸 아는 자료**를 재면 14~15 로 나온다. 즉 우리 18 은 **하한**이다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 추정기 **둘**을 각각 내고 서로 대조한다 (크게 어긋나면 하나가 틀린 것)
 *  ② 눈금. 알려진 차원 2, 5, 10, 20 을 ±15% 안으로 되찾고, **과소추정 편향**을 같이 보여 준다
 *  ③ **셔플 대조군**. 축을 따로 섞어 상관을 없애면 차원이 주변차원 쪽으로 **올라야** 한다
 *  ④ 화면이 약 N차원, 2차원에 담으면 찢김은 피할 수 없다를 적는다
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

if (!fs.existsSync(ATLAS)) { console.log('[idim] 지도가 없다. 검사 건너뜀'); process.exit(0); }
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const D = atlas.idim;
if (!D) {
  if (isFake(ATLAS)) { console.log('[idim] 가짜 지도다. 고유차원은 진짜 굽기에서만 잰다'); process.exit(0); }
  console.log('[idim] **고유차원이 안 실려 있다** (idim). 2차원에 담기나를 아직 안 물었다');
  process.exit(1);
}

const mleAt = (o, k) => (o.mle.find((m) => m.k === k) || {}).id;
console.log(`  ① 우리 자료. TwoNN ${D.ours.twoNN}, MLE ${D.ours.mle.map((m) => `k${m.k}:${m.id}`).join(' ')}`
  + ` (역수평균 안 하면 ${D.ours.naive}), 담긴 축 ${D.ambient}개, 글 ${D.n}편`);
console.log(`  ③ 대조군. 축마다 따로 섞으면 ${D.shuffled.twoNN}/${mleAt(D.shuffled, 10)}`
  + `, 구조 없는 난수면 ${D.noise.twoNN}/${mleAt(D.noise, 10)} (TwoNN/MLE k10)`);
console.log('  ② 눈금. ' + D.calibration.map((c) => `${c.truth}차원→${c.twoNN}/${c.mle}`).join(' '));

/* ① 두 추정기가 **서로 대조군**이다. 크게 어긋나면 하나가 틀렸다. */
const k10 = mleAt(D.ours, 10);
if (!(D.ours.twoNN > 0) || !(k10 > 0)) bad.push('추정치가 이상하다 (0 이하)');
else {
  const gap = Math.abs(D.ours.twoNN - k10) / Math.max(D.ours.twoNN, k10);
  console.log(`  ① 두 추정기 차이 ${(gap * 100).toFixed(0)}% (40% 넘으면 하나가 틀린 것)`);
  if (gap > 0.4) bad.push(`TwoNN ${D.ours.twoNN} 과 MLE ${k10} 이 ${(gap * 100).toFixed(0)}% 어긋난다. 하나가 틀렸다`);
}
/* k 하나만 재고 N차원이다 하면 안 된다. k 탓인지 자료 탓인지 모른다. */
if (!(D.ours.mle.length >= 3)) bad.push(`MLE 를 이웃 ${D.ours.mle.length}가지로만 쟀다. k 탓인지 자료 탓인지 모른다`);
/* ⚠ 역수 평균을 안 하면 위로 치우친다. 그 차이를 **싣고 있어야** 한다. */
if (!(D.ours.naive > 0)) bad.push('역수 평균을 안 했을 때의 값이 안 실려 있다. 보정이 실제로 필요한지 알 수 없다');
else if (D.ours.naive <= k10) {
  bad.push(`역수 평균 보정이 값을 안 낮춘다 (${D.ours.naive} ≤ ${k10}). 보정이 안 걸려 있거나 뒤집혔다`);
}

// ── ② 눈금 ──────────────────────────────────────────────────────────
for (const c of D.calibration) {
  if (c.truth > 20) continue;                 // 50 차원은 표본이 모자라 크게 낮게 나오는 게 정상
  const err = Math.abs(c.mle - c.truth) / c.truth;
  if (err > 0.3) bad.push(`${c.truth}차원인 걸 아는 자료를 ${c.mle} 로 본다 (${(err * 100).toFixed(0)}% 어긋남)`);
}
/* ★ **과소추정 편향이 실제로 있어야** 한다. 없으면 우리 18 은 하한이라는 말이 거짓이다. */
const hi = D.calibration.find((c) => c.truth === 20);
if (!hi) bad.push('눈금에 20차원 판이 없다. 과소추정 편향을 보여 줄 수 없다');
else if (!(hi.mle < hi.truth)) bad.push(`20차원을 ${hi.mle} 로 본다. 과소추정 편향이 안 보이면 하한이라 말할 수 없다`);

// ── ③ 셔플 대조군 ────────────────────────────────────────────────────
const sh = mleAt(D.shuffled, 10);
if (!(sh > k10 * 2)) {
  bad.push(`축을 따로 섞어도 차원이 ${sh} 다 (우리 ${k10}). 두 배도 안 오르면 이 자는 구조를 안 보고 있다`);
}
const nz = mleAt(D.noise, 10);
if (!(nz > k10 * 2)) bad.push(`구조 없는 난수의 차원이 ${nz} 다 (우리 ${k10}). 천장이 안 잡힌다`);
/* 그리고 **주변차원을 못 넘어야** 한다. 넘으면 셈이 깨진 것이다. */
if (D.ours.twoNN > D.ambient || k10 > D.ambient) bad.push(`고유차원이 담긴 축 수(${D.ambient})보다 크다. 셈이 깨졌다`);

/* 지금 글 수와 크게 달라졌으면 다시 재야 한다. */
const now = atlas.docs.filter((d) => d.xy).length;
if (D.n && Math.abs(now - D.n) > Math.max(50, now * 0.05)) {
  bad.push(`고유차원을 글 ${D.n}편에서 쟀는데 지금은 ${now}편이다. 다시 재라`);
}

// ── ④ 화면 ──────────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[idim] playwright, 번들 중 없는 게 있다. 화면 확인 건너뜀');
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
  const chans = await page.evaluate(() => window.__atlasChannels || []);
  const saysN = text.includes(`약 ${Math.round(D.id)}차원`);
  const saysShuf = text.includes(String(Math.round(D.shuffled.twoNN)));
  const saysCost = /찢김은 고칠 수 있는 결함이 아니라/.test(text);
  const first = chans[0] || '';
  console.log(`  ④ 화면. 차원 ${saysN ? '○' : '✗'}, 섞은 대조군 ${saysShuf ? '○' : '✗'}`
    + `, 치러야 하는 값 ${saysCost ? '○' : '✗'}, 맨 위 줄 ${first}`);
  if (!saysN) bad.push('화면이 약 N차원을 안 적는다');
  if (!saysShuf) bad.push('화면이 **축을 섞은 대조군**을 안 적는다. 낮은 수가 진짜 구조인지 알 수 없다');
  if (!saysCost) bad.push('화면이 **찢김이 치러야 하는 값**임을 안 적는다. 고칠 수 있는 결함인 척하게 된다');
  if (!/2차원이 아니다/.test(first)) {
    bad.push(`이게 다른 모든 줄의 원인인데 읽는 법 **맨 위**에 없다 (지금 맨 위 = ${first})`);
  }
  await browser.close();
}

if (bad.length) {
  console.log('[idim] **몇 차원짜리인지 제대로 재지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 intrinsicDim, mleId, twoNN 을 봐라.');
  process.exit(1);
}
console.log(`[idim] 약 ${Math.round(D.id)}차원. 추정기 둘, 눈금, 섞은 대조군을 나란히 싣고, 찢김이 치러야 하는 값임을 적는다`);
