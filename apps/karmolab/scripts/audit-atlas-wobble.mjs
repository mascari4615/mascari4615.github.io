#!/usr/bin/env node
/**
 * audit-atlas-wobble — **이 자리가 자료의 것인가, 난수의 것인가** (TASK-KAR-233).
 *
 * ★ 우리 자 쉰 몇 개는 **전부 씨앗 하나 위의 점추정**이었다. 「꿋꿋함 0.121 · 봉우리 2개 ·
 * 거짓 이웃 69%」 — **밴드 없는 소수점 세 자리는 근거 없는 정밀도**다. 비선형 차원축소는
 * 초기 난수 때문에 매판 다른 국소최적에 빠지므로(MCE, arXiv 2503.08103 / 텍스트 공간화
 * 민감도, arXiv 2407.17876), 판 하나를 「지도」라 부르는 건 표본 하나를 모집단이라 부르는 것이다.
 *
 * ★★ **재 보니 반쯤 씨앗의 것이다.** 씨앗만 바꿔 12판을 구우면 점이 화면 대각선의
 * **4.6%** 씩 움직인다(90분위 8.1%). 구조가 아예 없는 난수 벡터로 구우면 8.5% 니 우리 쪽이
 * **덜** 움직이긴 하지만 그 **0.54배** — 사전에 박은 통과선(≤0.33)을 못 넘고 조건부 구간
 * (0.33~0.6, **표기 의무**)에 앉는다. 즉 **자리의 절반쯤은 난수가 정한다.**
 *
 * ★★★ **그런데 이웃은 자료의 것이다.** 화면 이웃 여덟 중 판을 바꿔도 그대로인 비율이
 * 33.8% 인데 구조 없는 벡터에서는 0.5% 다 — **66배**. 그래서 결론은 「지도가 쓸모없다」가
 * 아니라 **「어디에 있나로 읽지 말고 누구 옆에 있나로 읽어라」** 이고, 화면이 그렇게 적는다.
 *
 * ★ 이 자를 세우면서 **내 겹치기(Procrustes) 코드의 부호 버그를 0b 가 잡았다** — 알려진
 * 배치를 44% 어긋나게 되돌리고 있었고, 그 위에서 잰 첫 떨림(비 1.78)은 전부 무효였다.
 * 그리고 ②도 처음엔 **엉뚱한 걸 재고 있었다**: 「앞 k판끼리의 평균 거리」는 판 수와 무관한
 * 모집단 값이라 k 를 늘려도 안 준다. 논문이 말한 건 **k판으로 만든 합의 지도끼리**의 거리다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다 — 재고 나서 문턱을 만지지 않았다):
 *  0b 합성 진실 — 알려진 배치를 돌리고·뒤집고·옮기고·키운 판들에서 겹치기가 원배치를 되찾는다
 *  ① 떨림 비(실측/구조없음) ≤ 0.33 통과 · 0.33~0.6 조건부(표기 의무) · **>0.6 빨강 + 라벨 강등**
 *  ② 판을 늘리면 판끼리 **단조로** 모이고, m=12 가 m=2 대비 ≥50% 줄어든다
 *  ③ 이웃 유지율이 **구조 없는 벡터의 여러 배** — 이게 아니면 지도가 통째로 난수다
 *  ④ 화면이 이 수들을 **맨 위에** 적고 「저기 있다」가 아니라 「이 옆에 있다」로 읽으라 한다
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
const OK_RATIO = 0.33;      // 이 밑이면 「자리는 자료의 것」
const WARN_RATIO = 0.6;     // 이 위면 「자리는 씨앗의 것」 — 라벨 강등

/* ── 0b 합성 진실 — 겹치기(Procrustes)가 성한지 지도 없이 먼저 본다 ───────── */
function fitTo(A, B) {
  const n = A.length;
  const mA = [0, 0]; const mB = [0, 0];
  for (let i = 0; i < n; i += 1) { mA[0] += A[i][0] / n; mA[1] += A[i][1] / n; mB[0] += B[i][0] / n; mB[1] += B[i][1] / n; }
  let sxx = 0; let sxy = 0; let syx = 0; let syy = 0; let na = 0;
  for (let i = 0; i < n; i += 1) {
    const ax = A[i][0] - mA[0]; const ay = A[i][1] - mA[1];
    const bx = B[i][0] - mB[0]; const by = B[i][1] - mB[1];
    sxx += ax * bx; sxy += ax * by; syx += ay * bx; syy += ay * by;
    na += ax * ax + ay * ay;
  }
  /* ★ 부호를 틀렸다가 합성 진실 검사(0b)에 걸렸다 — 알려진 배치를 44% 어긋나게
     되돌리고 있었고, 그 위에서 잰 떨림은 전부 무효였다.
     Σ bᵀ R a = c(sxx+syy) + s(**sxy − syx**) 를 최대로 하는 c,s 다. */
  const c = sxx + syy; const s = sxy - syx;
  const n1 = Math.hypot(c, s) || 1;
  const R = [[c / n1, -s / n1], [s / n1, c / n1]];
  const c2 = sxx - syy; const s2 = syx + sxy;
  const n2 = Math.hypot(c2, s2) || 1;
  const Rf = [[c2 / n2, s2 / n2], [s2 / n2, -c2 / n2]];
  const apply = (M) => A.map((p) => {
    const ax = p[0] - mA[0]; const ay = p[1] - mA[1];
    return [M[0][0] * ax + M[0][1] * ay, M[1][0] * ax + M[1][1] * ay];
  });
  const err = (P) => {
    let e = 0;
    for (let i = 0; i < n; i += 1) {
      const bx = B[i][0] - mB[0]; const by = B[i][1] - mB[1];
      e += (P[i][0] - bx) ** 2 + (P[i][1] - by) ** 2;
    }
    return e;
  };
  const P1 = apply(R); const P2 = apply(Rf);
  const use = err(P1) <= err(P2) ? P1 : P2;
  let num = 0;
  for (let i = 0; i < n; i += 1) {
    const bx = B[i][0] - mB[0]; const by = B[i][1] - mB[1];
    num += use[i][0] * bx + use[i][1] * by;
  }
  const k = na > 1e-12 ? num / na : 1;
  return use.map((p) => [p[0] * k + mB[0], p[1] * k + mB[1]]);
}
{
  let sd = 4615;
  const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  const g = () => { const u = Math.max(1e-9, rnd()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const truth = [];
  for (let c = 0; c < 5; c += 1) {
    const cx = rnd() * 2 - 1; const cy = rnd() * 2 - 1;
    for (let i = 0; i < 120; i += 1) truth.push([cx + g() * 0.08, cy + g() * 0.08]);
  }
  /* 돌리고·뒤집고·옮기고·키운 판을 만들어, 겹치기가 원배치를 되찾는지 본다. */
  let worst = 0;
  for (let t = 0; t < 6; t += 1) {
    const th = rnd() * Math.PI * 2; const flip = t % 2 ? -1 : 1;
    const sc = 0.5 + rnd() * 2; const tx = rnd() * 4 - 2; const ty = rnd() * 4 - 2;
    const moved = truth.map(([x, y]) => [
      (Math.cos(th) * x - Math.sin(th) * y) * sc * flip + tx,
      (Math.sin(th) * x + Math.cos(th) * y) * sc + ty,
    ]);
    const back = fitTo(moved, truth);
    let e = 0;
    for (let i = 0; i < truth.length; i += 1) e = Math.max(e, Math.hypot(back[i][0] - truth[i][0], back[i][1] - truth[i][1]));
    worst = Math.max(worst, e);
  }
  /* 배치의 대각선을 1로 놓고 잰다 — 「화면 대각선의 몇 %」와 같은 단위. */
  let lo = [Infinity, Infinity]; let hi = [-Infinity, -Infinity];
  for (const [x, y] of truth) { lo = [Math.min(lo[0], x), Math.min(lo[1], y)]; hi = [Math.max(hi[0], x), Math.max(hi[1], y)]; }
  const dia = Math.hypot(hi[0] - lo[0], hi[1] - lo[1]);
  const rel = worst / dia;
  console.log(`  0b 합성 진실 — 돌리고·뒤집고·옮기고·키운 판을 되돌리면 최악 어긋남 ${(rel * 100).toFixed(3)}% (1% 이내여야)`);
  if (!(rel < 0.01)) bad.push(`겹치기가 알려진 배치를 ${(rel * 100).toFixed(2)}% 어긋나게 되돌린다 — 떨림을 재기 전에 이것부터 고쳐야 한다`);
}

if (!fs.existsSync(ATLAS)) { console.log('[wobble] 지도가 없다 — 검사 건너뜀'); process.exit(0); }
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const w = atlas.wobble;
if (!w) {
  if (isFake(ATLAS)) { console.log('[wobble] 가짜 지도다 — 씨앗 떨림은 진짜 굽기에서만 잰다'); process.exit(0); }
  console.log('[wobble] **씨앗 떨림이 안 실려 있다** (wobble) — 자 전부가 씨앗 하나 위 점추정인 채다');
  console.log('  굽기에 `--씨앗` 을 주면 잰다 (판 하나가 20여 초라 늘 돌지는 않는다).');
  process.exit(1);
}

const dia = Math.SQRT2;    // 자리는 0~1 두 축이라 대각선이 √2
const pct = (v) => (v / dia * 100).toFixed(1) + '%';
console.log(`  ① 떨림 — ${w.m}판 · 중앙값 ${pct(w.med)} (90분위 ${pct(w.p90)})`
  + ` · **구조 없는 벡터면 ${pct(w.nullMed)}** → 비 ${w.ratio}`);
console.log(`  ③ 이웃 유지 — ${(w.keep * 100).toFixed(1)}% (10분위 ${(w.keepP10 * 100).toFixed(1)}%`
  + ` · 구조 없는 벡터면 ${(w.nullKeep * 100).toFixed(2)}% → ${Math.round(w.keep / Math.max(1e-9, w.nullKeep))}배)`);
console.log(`  ② 판을 늘리면 ${w.at.map((c) => `${c.m}판:${c.gap}`).join(' ')}`
  + ` · 반씩 갈라 낸 가운데 자리끼리 ${w.splitGap} (판 둘만 견주면 ${w.single})`);

/* **옛날 값으로 말하고 있나** — 글 수가 크게 달라졌으면 다시 재야 한다. */
const now = atlas.docs.filter((d) => d.xy).length;
if (w.n && Math.abs(now - w.n) > Math.max(50, now * 0.05)) {
  bad.push(`떨림을 글 ${w.n}편에서 쟀는데 지금은 ${now}편이다 — 다시 재라 (\`--씨앗\`)`);
}
if (!(w.m >= 8)) bad.push(`판이 ${w.m}개뿐이다 — 논문의 꺾이는 지점이 m≈10 이라 그 위여야 한다`);

/* ② 판을 늘리면 모여야 한다 — 안 모이면 「가운데 자리」라는 게 없는 것이다. */
for (let i = 1; i < w.at.length; i += 1) {
  if (w.at[i].gap > w.at[i - 1].gap + 1e-9) {
    bad.push(`판을 ${w.at[i - 1].m}→${w.at[i].m}개로 늘렸는데 더 벌어진다 (${w.at[i - 1].gap} → ${w.at[i].gap})`);
  }
}
const drop = w.at.length >= 2 ? 1 - w.at[w.at.length - 1].gap / Math.max(1e-9, w.at[0].gap) : 0;
console.log(`  ② 판을 늘려 줄어든 폭 ${(drop * 100).toFixed(0)}% (50% 이상이어야)`);
if (!(drop >= 0.5)) bad.push(`판을 늘려도 ${(drop * 100).toFixed(0)}% 밖에 안 모인다`);

/* ③ 이웃까지 난수면 이 지도는 통째로 난수다 — 그건 자가 반드시 잡아야 한다. */
if (!(w.keep > w.nullKeep * 5)) {
  bad.push(`이웃 유지율 ${w.keep} 이 구조 없는 벡터(${w.nullKeep})의 다섯 배도 안 된다`
    + ' — 이웃 관계마저 난수라면 이 지도는 볼 것이 없다');
}

/* ① **사전에 박은 문턱**. 재고 나서 만지지 않는다 — 나쁘면 나쁘다고 적는 게 이 자의 일이다. */
const verdict = w.ratio <= OK_RATIO ? '자리는 자료의 것'
  : w.ratio <= WARN_RATIO ? '자리가 반쯤 씨앗의 것 (표기 의무)'
    : '**자리는 씨앗의 것** — 화면이 그렇게 말해야 한다';
console.log(`  ① 판정 — ${verdict} (문턱 ${OK_RATIO} / ${WARN_RATIO})`);

// ── ④ 화면이 강등된 말을 하나 ────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[wobble] playwright·번들 중 없는 게 있다 — 화면 확인 건너뜀');
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
  const chans = await page.evaluate(() => window.__atlasChannels || []);
  const saysMove = text.includes(pctOf(w.med)) && text.includes(pctOf(w.nullMed));
  const saysKeep = text.includes(`${(w.keep * 100).toFixed(0)}%`);
  const saysHow = /이 옆에 있다/.test(text) && /씨앗/.test(text);
  const first = chans[0] || '';
  console.log(`  ④ 화면 — 움직인 양·대조군 ${saysMove ? '○' : '✗'} · 이웃 유지 ${saysKeep ? '○' : '✗'}`
    + ` · 읽는 법 ${saysHow ? '○' : '✗'} · 맨 위 줄 「${first}」`);
  if (!saysMove) bad.push('화면이 **움직인 양과 구조 없는 벡터 대조군**을 안 적는다');
  if (!saysKeep) bad.push('화면이 이웃 유지율을 안 적는다 — 「믿을 것은 이웃뿐」의 근거가 사라진다');
  if (!saysHow) bad.push('화면이 **「저기 있다」가 아니라 「이 옆에 있다」로 읽어라**를 안 적는다');
  /**
   * ★ 맨 위 한 자리를 놓고 **자 둘이 싸웠다** — 이 자는 「자리는 씨앗의 것」을, 고유차원 자는
   * 「이 무더기는 2차원이 아니다」를 맨 위에 요구했다. 정리 = **원인이 먼저, 증상이 다음.**
   * 18차원을 2차원에 눕히는 것이 원인이고 씨앗 떨림은 그 증상이다. 그래서 이 자는
   * **맨 위 세 줄 안**만 요구한다.
   */
  const top3 = chans.slice(0, 3).join(' | ');
  if (w.ratio > 0.33 && !/자리는 (반쯤 )?씨앗이 정한다/.test(top3)) {
    bad.push(`자리가 씨앗의 것인데(비 ${w.ratio}) 그 경고가 읽는 법 **맨 위 세 줄** 안에 없다 (지금: ${top3})`);
  }
  await browser.close();

  function pctOf(v) { return (v / Math.SQRT2 * 100).toFixed(1) + '%'; }
}

if (bad.length) {
  console.log('[wobble] **자리가 자료의 것인지 재지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 seedWobble·wobbleOf·fitTo 를 봐라.');
  process.exit(1);
}
console.log(`[wobble] ${w.m}판을 구워 재고, ${verdict.replace(/\*/g, '')} 를 화면이 그대로 적는다`);
