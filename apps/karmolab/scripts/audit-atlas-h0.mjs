#!/usr/bin/env node
/**
 * audit-atlas-h0. **나누지 않고 본 조각 몇 개가 맞나** (TASK-KAR-233).
 *
 * 실루엣(거리), DBCV(밀도), HDBSCAN(안정성)은 다 이 **나눔**이 좋은가를 잰다.
 * 지속 호몰로지는 나누지 않는다. 반지름을 키우며 조각(H0)이 **언제 합쳐지는지**를 적는다.
 * 오래 버티는 막대가 진짜 구조, 짧은 막대는 잡음(정본: 대각선에서 먼 점이 진짜다).
 *
 * 우리 지도의 답: **또렷이 갈리는 자리가 없다**(가장 큰 낙차 1.008배). 넷째 자도
 * 구획이지 무리가 아니다에 동의한 것이다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① **눈금**. 지어낸 자료(뚜렷이 갈린 세 덩어리)에서 긴 막대 **셋**이 나온다
 *  ② 우리 지도의 막대가 실려 있고 화면이 그 답을 적는다
 *  ③ 문턱을 **박지 않고** 낙차에서 고른다 (같은 규칙을 여기서 다시 걸어 본다)
 *  ④ 점을 마구 섞으면 긴 막대가 사라진다
 *
 * ★ 그 뒤 바퀴에서 **문턱을 붓스트랩 띠로** 바꿨다(Fasy 2014). 그래서 하나 더 건다:
 * ⑤ **띠가 실려 있고, 판정이 띠와 낙차로 다시 서는가.**
 * 정본을 그대로 쓰면 안 됐다. 대각선에서 띠보다 멀면 신호로 세니 **갈린 셋도 아무 구름도
 * 똑같이 185개**가 신호로 나왔다(우리 H0 는 최소신장나무 가지라 막대 뭉치가 0 근처가 아니다).
 * 그래서 띠는 **잡음의 크기**로 쓰고 판정은 **낙차 > 띠**로 한다. 눈금으로 확인했다.
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
  console.log('[h0] 지도가 없다. 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const bad = [];
const CLEAR = 1.5;

/** 거리 위 최소신장나무의 가지 무게 = H0 가 죽는 때. (굽는 쪽과 같은 정의, 셈은 따로.) */
function h0(points) {
  const n = points.length;
  const dim = points[0].length;
  const d = (a, b) => {
    let s = 0;
    for (let i = 0; i < dim; i += 1) { const t = a[i] - b[i]; s += t * t; }
    return Math.sqrt(s);
  };
  const inT = new Uint8Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const edges = [];
  let cur = 0; inT[0] = 1;
  for (let step = 1; step < n; step += 1) {
    let pick = -1; let pw = Infinity;
    for (let j = 0; j < n; j += 1) {
      if (inT[j]) continue;
      const w = d(points[cur], points[j]);
      if (w < best[j]) best[j] = w;
      if (best[j] < pw) { pw = best[j]; pick = j; }
    }
    if (pick < 0) break;
    inT[pick] = 1; edges.push(best[pick]); cur = pick;
  }
  const bars = edges.sort((a, b) => b - a).slice(0, 30);
  let cutAt = 0; let drop = 1;
  for (let i = 0; i < bars.length - 1; i += 1) {
    const r = bars[i] / (bars[i + 1] || 1e-9);
    if (r > drop) { drop = r; cutAt = i + 1; }
  }
  /* **조각 수 = 긴 막대 수 + 1**. 막대는 합쳐지는 사건이지 조각이 아니다.
     (처음엔 막대 수를 조각 수로 세서 지어낸 세 덩어리를 둘이라 했다.) */
  const clear = drop >= CLEAR;
  return { bars, drop, long: clear ? cutAt : 0, pieces: clear ? cutAt + 1 : 0, clear };
}

// ── ① 눈금 (지어낸 자료. 지도가 없어도 돈다) ─────────────────────────
{
  let seed = 3;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i += 1) s += rnd(); return s - 3; };
  const DIM = 12;
  const pts = [];
  for (let c = 0; c < 3; c += 1) {
    const center = Array.from({ length: DIM }, () => gauss() * 6);
    for (let i = 0; i < 80; i += 1) pts.push(Float64Array.from({ length: DIM }, (_, t) => center[t] + gauss() * 0.2));
  }
  const r = h0(pts);
  console.log(`  ① 눈금. 갈린 셋 → 조각 ${r.pieces}개 (긴 막대 ${r.long}, 낙차 ${r.drop.toFixed(2)}배)`);
  if (!r.clear || r.pieces !== 3) bad.push(`지어낸 세 덩어리를 ${r.clear ? r.pieces : 0}개로 본다. 나누지 않고 세는 손이 틀렸다`);

  /* ④ 같은 점을 마구 흩으면 긴 막대가 사라져야 한다. */
  const mixed = pts.map(() => Float64Array.from({ length: DIM }, () => gauss() * 6));
  const rm = h0(mixed);
  console.log(`  ④ 마구 흩으면 → 조각 ${rm.pieces}개 (낙차 ${rm.drop.toFixed(2)}배)`);
  if (rm.clear && rm.pieces >= 3) bad.push('마구 흩은 점에서도 조각 셋을 본다. 아무 데서나 구조를 찾는다');
}

// ── ⑤ 붓스트랩 띠. 눈금과 실린 값 ────────────────────────────────────
/** 띠를 잡음 크기로 쓰고 **낙차 > 띠**로 판정한다 (굽는 쪽과 같은 규칙, 셈은 따로). */
function byBand(bars, band) {
  const head = bars.slice(0, 30);
  let gap = 0; let at = 0;
  for (let i = 0; i < head.length - 1; i += 1) {
    const g = head[i] - head[i + 1];
    if (g > gap) { gap = g; at = i + 1; }
  }
  return { gap, long: gap > band ? at : 0 };
}
{
  /* 눈금. 띠를 아는 값으로 주고 판정만 본다(재표본은 굽는 쪽에서 이미 돌린다). */
  const blobs = [30.107, 29.42, 0.582, 0.581, 0.58, 0.579];
  const cloud = [15.527, 15.278, 15.103, 14.934, 14.9, 14.88];
  const b1 = byBand(blobs, 0.375);
  const b2 = byBand(cloud, 9.956);
  console.log(`  ⑤ 눈금. 갈린 셋 모양: 낙차 ${b1.gap.toFixed(2)} > 띠 0.375 → 긴 막대 ${b1.long}개 (조각 ${b1.long + 1})`
    + `, 구름 모양: 낙차 ${b2.gap.toFixed(2)} ≤ 띠 9.956 → 긴 막대 ${b2.long}개`);
  if (b1.long !== 2) bad.push(`갈린 셋 모양에서 긴 막대가 ${b1.long}개다 (2개여야 조각 3이 된다)`);
  if (b2.long !== 0) bad.push(`구름 모양에서 긴 막대가 ${b2.long}개다 (0개여야 한다)`);
}

// ── ⑥ 이상치에 덜 흔들리는 답(DTM). 이게 실제로 이기는가 ─────────────
/* ★ **이 눈금이 이 기능의 존재 이유다.** 이상치를 뿌리면 순수 거리 H0 는 무너지고
   DTM H0 는 조각 셋을 지켜야 한다. 안 그러면 DTM 을 얹을 까닭이 없다.
   (처음엔 **태어남을 빼먹어** 둘이 똑같이 무너졌다. DTM 여과에서 점은 제 DTM 값에서
   태어나고, 그게 바로 이상치를 죽이는 장치다.) */
function dtmOf2(dist, n, m) {
  const k = Math.max(1, Math.ceil(m * n));
  const out = new Float64Array(n);
  const near = new Float64Array(k);
  for (let i = 0; i < n; i += 1) {
    near.fill(Infinity);
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const d = dist[i * n + j];
      if (d >= near[k - 1]) continue;
      let q = k - 1;
      while (q > 0 && near[q - 1] > d) { near[q] = near[q - 1]; q -= 1; }
      near[q] = d;
    }
    let s = 0; let c = 0;
    for (const d of near) if (Number.isFinite(d)) { s += d * d; c += 1; }
    out[i] = c ? Math.sqrt(s / c) : 0;
  }
  return out;
}
function barsOf2(n, dist, dtm) {
  const inT = new Uint8Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const edges = [];
  let cur = 0; inT[0] = 1;
  for (let step = 1; step < n; step += 1) {
    let pick = -1; let pw = Infinity;
    for (let j = 0; j < n; j += 1) {
      if (inT[j]) continue;
      const w = dtm ? Math.max(dtm[cur], dtm[j], dist[cur * n + j]) : dist[cur * n + j];
      if (w < best[j]) { best[j] = w; from[j] = cur; }
      if (best[j] < pw) { pw = best[j]; pick = j; }
    }
    if (pick < 0) break;
    inT[pick] = 1; edges.push([best[pick], from[pick], pick]); cur = pick;
  }
  if (!dtm) return edges.map((e) => e[0]).sort((a, b) => b - a);
  edges.sort((a, b) => a[0] - b[0]);
  const par = new Int32Array(n); const birth = new Float64Array(n);
  for (let i = 0; i < n; i += 1) { par[i] = i; birth[i] = dtm[i]; }
  const find = (x) => { let r = x; while (par[r] !== r) { par[r] = par[par[r]]; r = par[r]; } return r; };
  const out = [];
  for (const [w, a, b] of edges) {
    const ra = find(a); const rb = find(b);
    if (ra === rb) continue;
    const young = birth[ra] > birth[rb] ? ra : rb;
    const old = young === ra ? rb : ra;
    out.push(w - birth[young]);
    par[young] = old;
    if (birth[young] < birth[old]) birth[old] = birth[young];
  }
  return out.sort((a, b) => b - a);
}
{
  let seed = 77;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gs = () => { let s = 0; for (let i = 0; i < 6; i += 1) s += rnd(); return s - 3; };
  const DIM = 10;
  const make = (extra) => {
    const P = []; const C = [];
    for (let c = 0; c < 3; c += 1) C.push(Array.from({ length: DIM }, () => gs() * 10));
    for (let i = 0; i < 240; i += 1) { const c = C[i % 3]; P.push(c.map((t) => t + gs() * 0.25)); }
    for (let i = 0; i < extra; i += 1) P.push(Array.from({ length: DIM }, () => gs() * 10));
    const nn = P.length;
    const d = new Float64Array(nn * nn);
    for (let i = 0; i < nn; i += 1) {
      for (let j = i + 1; j < nn; j += 1) {
        let s = 0;
        for (let t = 0; t < DIM; t += 1) { const q = P[i][t] - P[j][t]; s += q * q; }
        const v = Math.sqrt(s); d[i * nn + j] = v; d[j * nn + i] = v;
      }
    }
    return { d, nn };
  };
  const gapAt = (list) => {
    const h = list.slice(0, 30);
    let g = 0; let at = 0;
    for (let i = 0; i < h.length - 1; i += 1) { const q = h[i] - h[i + 1]; if (q > g) { g = q; at = i + 1; } }
    return at;
  };
  for (const extra of [0, 10]) {
    const { d, nn } = make(extra);
    const plainAt = gapAt(barsOf2(nn, d, null));
    const dtmAt = gapAt(barsOf2(nn, d, dtmOf2(d, nn, 0.05)));
    console.log(`  ⑥ 눈금. 갈린 셋 + 이상치 ${extra}개: 순수 거리 자리 ${plainAt}, DTM 자리 ${dtmAt} (2 여야 조각 3)`);
    if (dtmAt !== 2) bad.push(`이상치 ${extra}개에서 DTM 이 자리 ${dtmAt} 라 한다 (2 여야 한다). DTM 이 제 몫을 못 한다`);
    if (extra > 0 && plainAt === 2) {
      console.log('     (순수 거리도 견뎠다. 이상치가 약하다는 뜻이니 눈금을 더 세게 잡아야 한다)');
    }
  }
}

// ── ②③ 실린 값 ──────────────────────────────────────────────────────
const st = atlas.h0;
if (!st) {
  if (isFake(ATLAS)) {
    console.log('[h0] 가짜 지도다. H0 는 진짜 굽기에서만 잰다. ②③ 건너뜀');
  } else {
    bad.push('진짜 지도인데 **H0 막대가 안 실려 있다** (h0)');
  }
} else {
  const bt = st.boot;
  if (!bt) bad.push('붓스트랩 띠가 안 실려 있다 (h0.boot). 문턱이 아직 지어낸 값이다');
  else {
    console.log(`  ⑤ 실린 띠. 재표본 ${bt.B}판, 95% 분위수 ${bt.c} → 띠 ${bt.band}`
      + `, 낙차 ${bt.gap} → 긴 막대 ${bt.long}개 [띠 밖 점을 그냥 세면 ${bt.naive}개]`);
    if (!(bt.B >= 20)) bad.push(`재표본이 ${bt.B}판뿐이다. 분위수를 못 믿는다`);
    /* 두 수 다 소수 넷째 자리로 **반올림해서 실린다**. 각각 최대 5e-5 어긋나므로
       두 배 하면 1.5e-4 까지 벌어진다. 1e-6 으로 재다가 1.1725 vs 1.1726 으로 빨개졌다.
       자릿수보다 촘촘한 잣대는 자료가 아니라 반올림을 재는 것이다. */
    if (Math.abs(bt.band - 2 * bt.c) > 2.5e-4) bad.push(`띠(${bt.band})가 분위수의 두 배(${2 * bt.c})가 아니다`);
    const again = byBand(st.bars || [], bt.band);
    if (Math.abs(again.gap - bt.gap) > 0.002) bad.push(`실린 낙차 ${bt.gap} 가 다시 재면 ${again.gap.toFixed(4)} 이다`);
    if (again.long !== bt.long) bad.push(`실린 판정(긴 막대 ${bt.long}개)이 다시 걸면 ${again.long}개다`);
    if (bt.long !== st.signal) bad.push(`h0.signal(${st.signal})이 띠 판정(${bt.long})과 다르다`);
  }
  const dm = st.dtm;
  if (!dm) bad.push('이상치에 덜 흔들리는 답(DTM)이 안 실려 있다 (h0.dtm)');
  else {
    console.log(`  ⑥ 실린 DTM. 손잡이 ${dm.ms.length}가지, 띠 ${dm.band}`
      + `, 낙차 ${dm.rows.map((r) => r.gap).join(', ')} → 갈린다고 나온 손잡이 ${dm.split}`);
    if (dm.rows.length !== dm.ms.length) bad.push('DTM 손잡이 수와 줄 수가 다르다');
    const again = dm.rows.filter((r) => dm.band != null && r.gap > dm.band).length;
    if (again !== dm.split) bad.push(`갈린다고 나온 손잡이 수(${dm.split})가 다시 세면 ${again} 이다`);
    for (const r of dm.rows) {
      if (r.k !== Math.max(1, Math.ceil(r.m * (atlas.count || 0))) && r.k < 1) bad.push(`m ${r.m} 의 k 가 이상하다 (${r.k})`);
      if (!(r.gap >= 0) || !(r.top >= 0)) bad.push(`m ${r.m} 줄에 이상한 값이 있다`);
    }
  }
  console.log(`  ② 실린 값. ${st.clear ? `오래 버틴 조각 ${st.pieces}개` : '또렷이 갈리는 자리 없음'}`
    + ` (낙차 ${st.drop}배, 문턱 ${st.at})`);
  console.log(`     막대: ${(st.bars || []).slice(0, 8).join(' ')}`);
  if (!Array.isArray(st.bars) || st.bars.length < 5) bad.push('막대가 안 실려 있다. 왜 그 답이냐를 다시 볼 수 없다');
  else {
    /* ③ 같은 규칙을 실린 막대에 다시 건다. */
    let cutAt = 0; let drop = 1;
    for (let i = 0; i < st.bars.length - 1; i += 1) {
      const r = st.bars[i] / (st.bars[i + 1] || 1e-9);
      if (r > drop) { drop = r; cutAt = i + 1; }
    }
    const clear = drop >= CLEAR;
    console.log(`  ③ 실린 막대로 규칙을 다시 걸면. ${clear ? `${cutAt}개` : '갈리는 자리 없음'} (낙차 ${drop.toFixed(3)}배)`);
    if (clear !== st.clear) bad.push(`실린 판단(${st.clear ? '갈린다' : '안 갈린다'})이 막대와 어긋난다`);
    else if (clear && cutAt + 1 !== st.pieces) bad.push(`실린 조각 수(${st.pieces})가 막대와 어긋난다 (다시 세면 ${cutAt + 1})`);
  }
}

// ── ② 화면이 그 답을 적나 ────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE) || !st) {
  console.log('[h0] playwright, 번들, H0 중 없는 게 있다. 화면 확인 건너뜀');
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
  const said = st.clear ? text.includes(String(st.pieces)) && /조각/.test(text) : /또렷이 안 갈린|한 덩어리로 이어/.test(text);
  console.log(`  ② 화면이 그 답을 적나. ${said ? '적는다' : '**안 적는다**'}`);
  if (!said) bad.push('화면이 나누지 않고 본 답을 안 적는다');
}

if (bad.length) {
  console.log('[h0] **나누지 않고 센 조각 수가 안 선다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  최소신장나무(거리)나 낙차 고르는 규칙을 봐라.');
  process.exit(1);
}
console.log('[h0] 눈금이 맞고, 실린 막대가 규칙과 맞고, 화면이 그 답을 적는다');
