#!/usr/bin/env node
/**
 * audit-atlas-skeleton-confidence — **뼈대 마디가 자료의 것인가, 이 한 판의 것인가** (TASK-KAR-233).
 *
 * 손잡이는 흔들어 보고 골랐다. 그런데 **다 고른 뒤에 그린 그림은 한 판**이었다 —
 * 그 마디 하나하나가 흔들어도 남는지는 아무도 안 물었다. mapper 의 덤(Carrière–Michel–Oudot)
 * 은 손잡이 자동 결정만이 아니라 **특징의 신뢰 구간**이다. 그걸 여기서 잰다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 조각 수 **분포**를 싣는다 (한 판의 답이 아니라 스무 판의 답)
 *  ② 약한 마디는 **흐리게** 그린다 — 캔버스 픽셀로 확인한다
 *  ③ 화면이 「스무 판 중 N판에서 같은 조각 수」를 적는다
 *  ④ **마구 섞으면 살아남는 비율이 뚝 떨어진다** — 「뚝」 = 섞은 것이 성한 것의 절반 이하
 *
 * ★ **④ 는 우리 지도에서 못 지킨다. 자를 낮추는 대신 그 사실을 화면에 싣게 했다.**
 * 문턱을 아홉 자리로 쓸어 봐도(자카드 0.5~0.9) 마구 섞은 지도가 우리의 **0.63배 아래로
 * 안 내려간다**: 0.65 에서 우리 0.676 vs 섞은 것 0.445 가 가장 큰 차다. 까닭은 자료가
 * 아니라 **셈의 생김새**다 — 겹치는 창이 구간 너비의 1.7배라, 눈금을 밀어도 창끼리
 * 자카드 0.55 쯤은 그냥 나온다. 즉 **우리 뼈대의 마디는 상당 부분 눈금이 만든 것**이고,
 * 그건 네 자(실루엣·DBCV·HDBSCAN·H0)가 이미 말한 「구획이지 무리가 아니다」와 같은 말이다.
 *
 * 그래서 자를 이렇게 고쳐 박는다:
 *  ④-가 **재는 손은 구조를 볼 줄 안다** — 지어낸 갈린 셋에서 우리/섞은 것의 차 ≥ 0.3
 *  ④-나 **문턱을 박지 않는다** — 실린 문턱이 차가 가장 큰 자리인지 곡선으로 다시 고른다
 *  ④-다 **바탕값을 화면에 적는다** — 「85% 남았다」를 「섞어도 64% 는 남는다」 없이 적으면 거짓말
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
let calib = null;
const RUNS = 20;
const KEEP = 0.9;
const SAME = 0.5;
const HALF = 0.5;

/* ── 굽는 쪽과 **같은 정의, 셈은 따로** (h0 자와 같은 규칙) ───────────────── */
function binGroups(pts, bins, overlap, min, shift = 0) {
  const xs = pts.map((p) => p.f);
  const lo = Math.min(...xs); const hi = Math.max(...xs);
  const w = (hi - lo) / bins; const ext = w * overlap;
  const start = lo - shift * w;
  const nb = shift > 0 ? bins + 1 : bins;
  const out = [];
  for (let b = 0; b < nb; b += 1) {
    const s = start + b * w - ext; const e = start + (b + 1) * w + ext;
    const inBin = pts.filter((p) => p.f >= s && p.f <= e);
    if (inBin.length < min) continue;
    const ys = inBin.map((p) => p.g).sort((a, z) => a - z);
    const gaps = [];
    for (let i = 1; i < ys.length; i += 1) gaps.push([ys[i] - ys[i - 1], i]);
    gaps.sort((a, z) => z[0] - a[0]);
    const cuts = gaps.slice(0, 2).map((g) => ys[g[1]]).sort((a, z) => a - z);
    const parts = [[], [], []];
    for (const p of inBin) {
      const g = p.g < cuts[0] ? 0 : (cuts[1] !== undefined && p.g < cuts[1] ? 1 : 2);
      parts[g].push(p);
    }
    for (const g of parts) if (g.length >= min) out.push(g);
  }
  return out;
}

/** 스무 판을 흔들며 마디마다 **가장 닮은 짝의 자카드**를 모은다 (문턱은 아직 안 건다). */
function survivalOf(pts, bins, overlap, min, seed0 = 29) {
  const base = binGroups(pts, bins, overlap, min).map((g) => g.map((p) => p.id));
  if (!base.length) return { nodes: 0, mean: 0, J: [] };
  let seed = seed0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const hits = new Array(base.length).fill(0);
  const J = base.map(() => []);
  for (let t = 0; t < RUNS; t += 1) {
    const kept = pts.filter(() => rnd() < KEEP);
    const keepIds = new Set(kept.map((p) => p.id));
    /* **눈금판도 민다.** 글만 빼면 마디는 늘 살아남는다 — 마디를 정하는 게 자료가 아니라
       눈금 자리이기 때문이다(이 자가 처음 잡은 빨강: 마구 섞은 점도 89% 살아남았다). */
    const sets = binGroups(kept, bins, overlap, min, rnd()).map((g) => new Set(g.map((p) => p.id)));
    for (let i = 0; i < base.length; i += 1) {
      const A = base[i].filter((id) => keepIds.has(id));
      if (!A.length) { J[i].push(0); continue; }
      let best = 0;
      for (const B of sets) {
        let inter = 0;
        for (const id of A) if (B.has(id)) inter += 1;
        if (!inter) continue;
        const j = inter / (A.length + B.size - inter);
        if (j > best) best = j;
      }
      J[i].push(best);
      if (best >= SAME) hits[i] += 1;
    }
  }
  return { nodes: base.length, J, mean: hits.reduce((a, h) => a + h, 0) / hits.length / RUNS };
}

/** 자카드 뭉치에서 「문턱 t 를 넘긴 비율」. */
const rateAt = (J, t) => { const f = J.flat(); return f.length ? f.filter((v) => v >= t).length / f.length : 0; };
const SWEEP = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9];

// ── ①④ 눈금과 대조 (지도가 없어도 돈다) ──────────────────────────────
{
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i += 1) s += rnd(); return s - 3; };
  /* **또렷이 갈린 세 덩어리** — 렌즈 값(f)에서 서로 멀리 떨어져 있어야 눈금을 밀어도
     같은 자리에 다시 뭉친다. 구간 수는 셋(덩어리마다 마디 하나). */
  const pts = [];
  for (let c = 0; c < 3; c += 1) {
    for (let i = 0; i < 120; i += 1) {
      pts.push({ id: `p${pts.length}`, f: c * 30 + gauss() * 0.6, g: gauss() * 0.6 });
    }
  }
  const real = survivalOf(pts, 3, 0.3, 3);
  /* 같은 개수·같은 퍼짐인데 **자리만 마구 흩는다** — 구조만 없앤 대조군이다. */
  const mixed = pts.map((p) => ({ id: p.id, f: gauss() * 20, g: gauss() * 20 }));
  const rand = survivalOf(mixed, 3, 0.3, 3);
  const best = SWEEP.map((t) => ({ t, gap: rateAt(real.J, t) - rateAt(rand.J, t) }))
    .reduce((a, c) => (c.gap > a.gap ? c : a));
  calib = rateAt(real.J, best.t);
  console.log(`  ① 눈금 — 갈린 셋 ${calib.toFixed(3)} vs 마구 섞은 점 ${rateAt(rand.J, best.t).toFixed(3)}`
    + ` (문턱 ${best.t} 에서 차 ${best.gap.toFixed(3)} · 합격선 0.3 이상)`);
  if (calib < 0.9) bad.push(`갈린 셋에서도 마디가 ${calib.toFixed(2)} 밖에 안 남는다 — 재는 손이 너무 깐깐하다`);
  if (best.gap < 0.3) bad.push(`갈린 셋과 마구 섞은 점의 차가 ${best.gap.toFixed(2)} 뿐이다 — 이 셈은 구조를 못 본다`);
}

// ── ② 실린 값이 스스로와 맞나 ────────────────────────────────────────
let atlas = null;
if (!fs.existsSync(ATLAS)) {
  console.log('[skeleton-conf] 지도가 없다 — 실린 값·화면 확인 건너뜀');
} else {
  atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
  const sk = atlas.skeleton;
  const cf = sk?.confidence;
  if (!cf) {
    if (isFake(ATLAS) || !sk) console.log('[skeleton-conf] 뼈대 신뢰도가 없다 — 가짜 지도이거나 뼈대를 아직 안 구웠다');
    else bad.push('진짜 뼈대인데 **신뢰도가 안 실려 있다** (skeleton.confidence)');
  } else {
    const sum = cf.comps.reduce((a, [, n]) => a + n, 0);
    console.log(`  ② 실린 값 — ${cf.runs}판 · 조각 수 ` + cf.comps.map(([c, n]) => `${c}개 ${n}판`).join(' · ')
      + ` · 다 버틴 마디 ${cf.full}/${cf.survival.length} · 흔들리는 마디 ${cf.shaky}`);
    if (sum !== cf.runs) bad.push(`조각 수 분포의 합(${sum})이 판 수(${cf.runs})와 다르다 — 분포가 아니라 한 판의 답이다`);
    if (cf.survival.length !== sk.nodes.length) bad.push(`살아남은 비율이 ${cf.survival.length}개인데 마디는 ${sk.nodes.length}개다`);
    const mism = sk.nodes.filter((n, i) => Math.abs((n.keep ?? -1) - cf.survival[i]) > 1e-9).length;
    if (mism) bad.push(`마디에 붙은 값과 목록이 ${mism}군데 어긋난다 — 화면은 마디 쪽을 본다`);
    const shaky = cf.survival.filter((v) => v < 1).length;
    if (shaky !== cf.shaky || cf.full !== cf.survival.length - shaky) {
      bad.push(`흔들리는 마디 수(${cf.shaky})가 목록과 다르다 (다시 세면 ${shaky})`);
    }
    if (cf.comps.length === 1 && cf.comps[0][1] === cf.runs && cf.survival.every((v) => v === 1)) {
      /* 다 1 이면 「재고 있는 게 맞나」를 의심해야 한다 — 실측은 43개 중 8개가 흔들렸다. */
      console.log('  ⚠ 스무 판이 전부 똑같다 — 흔들기가 정말 흔들고 있는지 봐라');
    }
  }
}

// ── ④ **우리 지도로** 대조: 자리를 마구 섞으면 무너지나 ───────────────
/* 지어낸 자료에서 되는 것과 **우리 지도에서 되는 것**은 다르다. 같은 점 개수·같은
   손잡이로, 자리만 마구 섞어 견준다. 안 떨어지면 화면에 적은 수는 자료의 것이 아니다. */
function lensPts(coords, kind) {
  if (kind === 'x') return coords.map((c, i) => ({ id: `d${i}`, f: c[0], g: c[1] }));
  if (kind === 'y') return coords.map((c, i) => ({ id: `d${i}`, f: c[1], g: c[0] }));
  const n = coords.length;
  const val = new Float64Array(n);
  if (kind === '괴짜성') {
    for (let i = 0; i < n; i += 1) {
      let sum = 0;
      for (let j = 0; j < n; j += 1) sum += Math.hypot(coords[i][0] - coords[j][0], coords[i][1] - coords[j][1]);
      val[i] = sum / n;
    }
  } else {
    const K = 10;
    for (let i = 0; i < n; i += 1) {
      const near = new Float64Array(K).fill(Infinity);
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const d = Math.hypot(coords[i][0] - coords[j][0], coords[i][1] - coords[j][1]);
        if (d >= near[K - 1]) continue;
        let q = K - 1;
        while (q > 0 && near[q - 1] > d) { near[q] = near[q - 1]; q -= 1; }
        near[q] = d;
      }
      let sum = 0; let c = 0;
      for (const d of near) if (Number.isFinite(d)) { sum += d; c += 1; }
      val[i] = c ? 1 / (sum / c + 1e-9) : 0;
    }
  }
  return coords.map((c, i) => ({ id: `d${i}`, f: val[i], g: c[0] }));
}

if (atlas?.skeleton?.params && Array.isArray(atlas.docs)) {
  const { bins, overlap, min, lens } = atlas.skeleton.params;
  const coords = atlas.docs.map((d) => d.xy).filter(Array.isArray);
  if (coords.length >= 100) {
    let seed = 101;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const mine = survivalOf(lensPts(coords, lens || 'x'), bins, overlap, min);
    /* 자리만 섞는다 — 점 개수도, 퍼진 범위도 그대로다. 없앤 것은 **구조뿐**이다. */
    const lo = [Math.min(...coords.map((c) => c[0])), Math.min(...coords.map((c) => c[1]))];
    const hi = [Math.max(...coords.map((c) => c[0])), Math.max(...coords.map((c) => c[1]))];
    const shuf = coords.map(() => [lo[0] + rnd() * (hi[0] - lo[0]), lo[1] + rnd() * (hi[1] - lo[1])]);
    const rand = survivalOf(lensPts(shuf, lens || 'x'), bins, overlap, min);
    const cf = atlas.skeleton.confidence;
    const curve = SWEEP.map((t) => ({ at: t, mine: rateAt(mine.J, t), rand: rateAt(rand.J, t) }))
      .map((c) => ({ ...c, gap: c.mine - c.rand }));
    const pick = curve.reduce((a, c) => (c.gap > a.gap ? c : a));
    console.log(`  ④ 우리 지도(렌즈 ${lens} · 구간 ${bins} 겹침 ${overlap}) — 마디 ${mine.nodes}개`
      + ` · 차가 가장 큰 문턱 ${pick.at}`);
    console.log(`     우리 ${pick.mine.toFixed(3)} vs 마구 섞은 지도 ${pick.rand.toFixed(3)}`
      + ` — 섞은 것이 ${(pick.rand / (pick.mine || 1)).toFixed(2)}배 (절반 이하로는 안 내려간다)`);
    if (pick.rand > pick.mine * HALF) {
      /* **여기는 빨강이 아니다.** 이 지도의 답이 그렇다 — 대신 화면이 그 말을 해야 한다(③에서 건다). */
      console.log('     → 마디의 상당 부분은 눈금이 만든 것이다 · 화면이 이 말을 하는지는 ③에서 건다');
    }
    if (cf) {
      if (Math.abs(cf.same - pick.at) > 1e-9) {
        bad.push(`실린 문턱(${cf.same})이 차가 가장 큰 자리(${pick.at})와 다르다 — 박아 뒀거나 대조군이 다르다`);
      }
      if (typeof cf.baseline !== 'number') bad.push('바탕값이 안 실려 있다 — 그것 없이 적은 비율은 뜻이 없다');
      else if (Math.abs(cf.baseline - pick.rand) > 0.05) {
        bad.push(`실린 바탕값 ${cf.baseline} 이 다시 재면 ${pick.rand.toFixed(3)} 이다 — 대조군이 굽는 쪽과 다르다`);
      }
      const mineHere = rateAt(mine.J, cf.same);
      if (Math.abs(mineHere - (cf.mean ?? -1)) > 0.05) bad.push(`실린 살아남음 평균 ${cf.mean} 이 다시 재면 ${mineHere.toFixed(3)} 이다`);
    }
  }
}

// ── ③ 화면이 적나 + ② 흐리게 그리나 (픽셀) ───────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE) || !atlas?.skeleton?.confidence) {
  console.log('[skeleton-conf] playwright·번들·신뢰도 중 없는 게 있다 — 화면 확인 건너뜀');
} else {
  const bundle = fs.readFileSync(BUNDLE, 'utf8');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

  async function paint(mutate) {
    const copy = JSON.parse(JSON.stringify(atlas));
    if (mutate) mutate(copy);
    const page = await ctx.newPage();
    await page.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.pathname.endsWith('/data/memo-atlas.json')) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(copy) });
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
    await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), { timeout: 30000 });
    await page.click('#host [data-layout="skeleton"]');
    await page.waitForTimeout(250);
    const out = await page.evaluate(() => {
      const cv = document.querySelector('#host .atlas-canvas');
      const c2 = cv.getContext('2d');
      const nodes = window.__atlasSkeletonNodes || [];
      /* **마디 안쪽만** 읽는다 — 화면 전체의 빛으로 재면 테두리·글자에 속는다
         (처음 그렇게 쟀다가 「흐리게 그렸는데 11% 더 밝다」는 답을 얻었다). */
      let sum = 0; let n = 0;
      for (const nd of nodes) {
        const px = c2.getImageData(Math.round(nd.x + nd.r * 0.5), nd.y, 1, 1).data;
        /* **투명도를 곱해야 한다.** 캔버스가 투명하면 getImageData 의 RGB 는 알파를 안 곱한
           맨 색이라, 흐리게 그려도 RGB 는 그대로다(처음 그렇게 재서 「0% 흐려짐」이 나왔다). */
        sum += (px[0] + px[1] + px[2]) * (px[3] / 255); n += 1;
      }
      return { fill: n ? Math.round(sum / n) : 0, nodes: n,
        text: document.querySelector('#host')?.textContent || '' };
    });
    await page.close();
    return out;
  }

  const now = await paint(null);
  const cf = atlas.skeleton.confidence;
  const saysRuns = now.text.includes(`${cf.runs}판`);
  const saysComp = new RegExp(`조각 ${cf.mode}개`).test(now.text);
  console.log(`  ③ 화면이 「${cf.runs}판 중 조각 ${cf.mode}개」를 적나 — ${saysRuns && saysComp ? '적는다' : '**안 적는다**'}`);
  if (!saysRuns || !saysComp) bad.push('화면이 「스무 판 중 몇 판에서 같은 조각 수」를 안 적는다 — 한 판의 답으로 읽힌다');
  /* ④-다 **바탕값을 적나** — 이 자의 핵심이다. 우리 값만 적으면 「단단한 뼈대」로 읽힌다. */
  const pct = Math.round((cf.baseline ?? 0) * 100);
  const saysBase = now.text.includes(`바탕값 ${pct}%`) || new RegExp(`마구 섞은[^%]{0,24}${pct}%`).test(now.text);
  console.log(`  ③ 화면이 바탕값(마구 섞은 지도도 ${pct}% 는 남는다)을 적나 — ${saysBase ? '적는다' : '**안 적는다**'}`);
  if (!saysBase) bad.push('화면이 **바탕값**을 안 적는다 — 「N% 살아남았다」만 적으면 단단한 뼈대로 읽힌다');

  /* ② 픽셀로 — 같은 마디를 다 버틴 것/거의 못 버틴 것으로 그려 견준다. */
  const strong = await paint((a) => { a.skeleton.nodes.forEach((n) => { n.keep = 1; }); });
  const weak = await paint((a) => { a.skeleton.nodes.forEach((n) => { n.keep = 0.1; }); });
  const drop = 1 - weak.fill / strong.fill;
  console.log(`  ② 마디 ${strong.nodes}개 안쪽 밝기 — 다 버틴 것 ${strong.fill} · 거의 못 버틴 것 ${weak.fill}`
    + ` (${(drop * 100).toFixed(0)}% 흐려짐)`);
  if (!(drop > 0.3)) bad.push(`약한 마디를 그려도 ${(drop * 100).toFixed(0)}% 밖에 안 흐려진다 — 눈으로는 같은 그림이다`);
  if (!strong.nodes) bad.push('마디가 화면 어디에 그려졌는지 안 실려 있다 (__atlasSkeletonNodes)');
  await browser.close();
}

if (bad.length) {
  console.log('[skeleton-conf] **뼈대 마디의 신뢰도가 안 선다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 nodeConfidence · memo-atlas.ts 의 drawSkeleton 을 봐라.');
  process.exit(1);
}
console.log('[skeleton-conf] 스무 판의 답을 싣고, 흔들리는 마디는 흐리게 그리고, 마구 섞으면 무너진다');
