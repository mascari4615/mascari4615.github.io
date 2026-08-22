#!/usr/bin/env node
/**
 * audit-atlas-suggest — **「이어야 할 둘」이 정말 맞나** (TASK-KAR-233).
 *
 * Swanson 의 ABC 모델(literature-based discovery)은 서로 인용하지 않는 두 문헌을 잇는다.
 * 우리 판으로 옮기면 **뜻으로 가까운데 사람이 쓴 링크가 없는 쌍**이 「이어야 하는데 안 이은 것」.
 *
 * ⚠ 이 분야의 **고질병 둘**을 그대로 물려받는다 —
 *  · **후보 폭증**: 우리도 **통틀어 186만 쌍**이다. 순위 없이 「찾았다」는 무의미하다
 *  · **평가 불가**: 진짜 발견이면 정답이 아직 없다
 *
 * 그래서 평가를 **시간으로 자른다**(그 분야의 표준 우회) — 최근 달에 쓰인 사람 링크를 숨기고
 * 그 전 자료만으로 후보를 낸 뒤, **숨긴 링크가 몇 등이었나**를 본다.
 *
 * ★ 실측 — 숨긴 789개 중 **상위 10등 안에 14.2%**(상위 1: 3.5% · 상위 50: 33.2% · MAP 0.0752).
 * **아무 순서로 늘어놓으면 상위 10 안에 0.4%**(MAP 0.0021) — MAP 기준 **36배**.
 *
 * ★★ 가는 길에 굽는 차례의 버그를 하나 잡았다: **생일을 임베딩 뒤에 채우고 있었다.** 그래서
 * 그 앞에서 도는 자들에겐 블로그 글만 생일이 있었고, 링크의 달이 **0가지**로 나왔다.
 *
 * 합격선(재기 **전 바퀴에** 정본 문서에 박아 뒀다):
 *  ① 평가는 **시간으로 자른다** — 최근 링크를 숨기고 그 전 자료만으로 후보
 *  ② 잣대는 **P@k · MAP** — 「찾았다」가 아니라 「몇 등」
 *  ③ **아무 순서** 대조군을 나란히
 *  ④ **후보 수를 반드시 적는다** — 너무 많으면 그 자체가 결과다
 *  ⑤ 제안에 **확률**을 붙일 거면 그 확률이 **실제와 맞는지**(보정) 먼저 잰다
 *
 * ★★★ **확률은 안 붙였다.** 「이건 2% 맞습니다」를 붙이면 수락률은 오르지만 결정은 안
 * 좋아질 수 있다 — 추천 설명의 목표 중 **설득력과 효과는 서로 어긋난다**(Tintarev & Masthoff).
 * 그래서 숨긴 링크를 반으로 갈라 확률을 만들고 다른 반으로 채점했더니, 우리 확률의
 * 어긋남(ECE) **0.00067** 이 **늘 같은 확률을 부르는 것(0.000354)보다 나빴다.**
 * Brier 는 우리가 조금 낫다 — **날카롭지만 덜 맞는다**는 뜻이다. 그래서 등수만 적는다.
 *
 * ⚠ 가는 길에 잣대를 한 번 고쳤다: ECE 를 **등폭 칸**으로 재면 우리 확률이 전부 1% 밑이라
 * 죄다 첫 칸에 들어가 어떤 예측기든 0 에 붙는다(둘 다 0.00007). **등량 칸(분위)**로 바꿔야
 * 갈린다 — 보정 문헌의 표준 처방이다.
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

if (!fs.existsSync(ATLAS)) { console.log('[suggest] 지도가 없다 — 검사 건너뜀'); process.exit(0); }
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const S = atlas.suggest;
if (!S) {
  if (isFake(ATLAS)) { console.log('[suggest] 가짜 지도다 — 이어야 할 둘은 진짜 굽기에서만 잰다'); process.exit(0); }
  console.log('[suggest] **「이어야 할 둘」을 재 본 표가 없다** (suggest)');
  process.exit(1);
}
if (S.skipped) {
  console.log(`[suggest] **못 쟀다** — ${S.skipped}`);
  console.log('  링크에 달이 붙어야 시간으로 자를 수 있다. 생일을 임베딩보다 먼저 채우는지 봐라.');
  process.exit(1);
}

const at = (o, k) => (o.p.find((x) => x.k === k) || {}).rate ?? 0;
console.log(`  ① 시간 절단 — 사람 링크 ${S.pairs}개 중 최근 ${S.cutMonths.join(',')} 의 ${S.test}개를 숨기고`
  + ` 나머지 ${S.known}개만 보고 후보를 냈다`);
console.log(`  ④ 후보 — 한 글당 ${S.pool}개 · 통틀어 ${Math.round(S.pairsAll / 1000)}천 쌍 (순위는 위 ${S.max}등까지)`);
console.log(`  ② 숨긴 링크가 몇 등 — ${S.real.p.map((x) => `상위 ${x.k}: ${(x.rate * 100).toFixed(1)}%`).join(' · ')}`
  + ` · MAP ${S.real.map}`);
console.log(`  ③ 아무 순서면 — ${S.rand.p.map((x) => `상위 ${x.k}: ${(x.rate * 100).toFixed(1)}%`).join(' · ')}`
  + ` · MAP ${S.rand.map}`);

/* ① 시간으로 **실제로** 잘랐나 — 숨긴 게 없으면 평가가 아니다. */
if (!(S.test > 50)) bad.push(`숨긴 링크가 ${S.test}개뿐이다 — 시간으로 자른 평가라 할 수 없다`);
if (!(S.known > 50)) bad.push(`후보를 낼 때 쓴 링크가 ${S.known}개뿐이다`);
if (!(S.cutMonths?.length)) bad.push('어느 달을 숨겼는지가 없다');

/* ④ ★ **후보 수가 이 자의 심장** — 안 적으면 「찾았다」가 발견처럼 읽힌다. */
if (!(S.pool > 100)) bad.push(`한 글당 후보가 ${S.pool}개다 — 잘라 낸 수를 적고 있지 않은지 봐라`);
if (S.pairsAll == null) bad.push('통틀어 몇 쌍인지가 없다 — 후보 폭증을 안 적으면 「찾았다」가 발견처럼 읽힌다');

/* ②③ 우연 수준이 살아 있나 — 아무 순서가 잘 맞히면 잣대가 헛돈다. */
if (S.rand?.map == null) bad.push('아무 순서 대조군이 안 실려 있다');
else if (!(S.rand.map < 0.02)) bad.push(`아무 순서인데 MAP 이 ${S.rand.map} 다 — 대조군이 너무 잘 맞힌다(셈이 이상하다)`);
for (const x of S.real.p) {
  const r = at(S.rand, x.k);
  if (x.rate < r) bad.push(`상위 ${x.k} 에서 진짜(${x.rate})가 아무 순서(${r})보다 못하다`);
}

/* 판정이 수와 맞나. */
const should = S.real.map > S.rand.map * 3 && at(S.real, 5) > at(S.rand, 5) * 3;
if (S.useful !== should) {
  bad.push(`「${S.useful ? '내놓을 만하다' : '아니다'}」고 적혀 있는데 수는 반대다 (MAP ${S.real.map} vs ${S.rand.map})`);
}

/* ⑤ 보정 — 확률을 붙일 만한지 재고, **아니면 안 붙였는지** 확인한다. */
if (!S.calib) bad.push('확률을 붙일 만한지 안 쟀다 (calib) — 그럴듯한 수를 그냥 붙이게 된다');
else {
  const C = S.calib;
  console.log(`  ⑤ 보정 — 등수 칸별 확률 ${C.rate.map((v) => (v * 100).toFixed(1)).join('/')}%`
    + ` (바탕 ${(C.baseRate * 100).toFixed(2)}%) · ECE ${C.ours.ece} vs 늘 같은 확률 ${C.flat.ece}`
    + ` · Brier ${C.ours.brier} vs ${C.flat.brier} → ${C.better ? '적을 만하다' : '**안 적는다**'}`);
  if (C.flat?.ece == null) bad.push('늘 같은 확률을 부르는 대조군이 없다 — 우리 확률이 나은지 알 수 없다');
  /* ★ 등량 칸으로 안 재면 ECE 가 둘 다 0 에 붙어 아무것도 못 가른다. */
  if (C.ours.ece === C.flat.ece) {
    bad.push(`두 ECE 가 똑같다 (${C.ours.ece}) — 칸을 등폭으로 나눠 아무것도 못 가르고 있지 않은지 봐라`);
  }
  const should = C.ours.ece < C.flat.ece && C.ours.brier <= C.flat.brier;
  if (C.better !== should) bad.push(`「${C.better ? '적을 만하다' : '안 적는다'}」고 적혀 있는데 수는 반대다`);
  /* 등수가 오르면 확률이 내려가야 한다 — 안 그러면 순위가 뜻이 없다. */
  const first = C.rate[0]; const last = C.rate[C.rate.length - 1];
  if (!(first > last * 2)) bad.push(`첫 칸 확률(${first})이 마지막 칸(${last})의 두 배도 안 된다 — 순위가 확률과 무관하다`);
}

// ── 화면 ────────────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[suggest] playwright·번들 중 없는 게 있다 — 화면 확인 건너뜀');
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
  const saysRank = text.includes(`${Math.round(at(S.real, 10) * 100)}%`);
  const saysRand = text.includes(`${S.rand.map}`);
  const saysPool = text.includes(`${S.pool}개`) && text.includes(`${Math.round(S.pairsAll / 1000)}천 쌍`);
  const saysHow = /이만큼 중 몇 등/.test(text);
  const saysCalib = !S.calib || (text.includes(String(S.calib.ours.ece)) && text.includes(String(S.calib.flat.ece)));
  const saysConflict = !S.calib || /설득력과 효과는 서로 어긋난다/.test(text);
  if (!saysCalib) bad.push('화면이 **확률이 맞는지 잰 수(ECE)** 와 대조군을 안 적는다');
  if (!saysConflict) bad.push('화면이 **설득력과 효과가 어긋난다**를 안 적는다 — 그럴듯한 수가 설명처럼 읽힌다');
  console.log(`  화면 — 등수 ${saysRank ? '○' : '✗'} · 아무 순서 ${saysRand ? '○' : '✗'}`
    + ` · 후보 수 ${saysPool ? '○' : '✗'} · 읽는 법 ${saysHow ? '○' : '✗'}`);
  if (!saysRank) bad.push('화면이 숨긴 링크의 등수를 안 적는다');
  if (!saysRand) bad.push('화면이 **아무 순서 대조군**을 안 적는다');
  if (!saysPool) bad.push('화면이 **후보 수**를 안 적는다 — 「찾았다」가 발견처럼 읽힌다');
  if (!saysHow) bad.push('화면이 **「이만큼 중 몇 등」으로 읽어라**를 안 적는다');
  await browser.close();
}

if (bad.length) {
  console.log('[suggest] **「이어야 할 둘」을 제대로 재지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 linkSuggest 를 봐라.');
  process.exit(1);
}
console.log(`[suggest] 시간으로 잘라 재니 숨긴 링크가 상위 10 안에 ${(at(S.real, 10) * 100).toFixed(0)}%`
  + ` (아무 순서면 ${(at(S.rand, 10) * 100).toFixed(0)}%) · 후보는 ${Math.round(S.pairsAll / 1000)}천 쌍`);
