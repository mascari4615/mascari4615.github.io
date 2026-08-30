#!/usr/bin/env node
/**
 * audit-atlas-cluster-real. **정말 덩어리인가, 그냥 자른 자리인가** (TASK-KAR-233).
 *
 * 층 수 6, 14, 30 은 **박아 둔 숫자**였다. 한 번도 검증 안 했다. 실루엣으로 재 보니
 * (제 무리 안 거리 vs 가장 가까운 남 무리 거리, 1 이 완벽, 0 이면 무리랄 게 없음)
 * 쏠림을 뺀 벡터에서 **어느 층도 0.06 을 못 넘는다**(6→0.045, 14→0.036, 30→0.054).
 * 즉 통계적으로는 무리가 아니라 **연속된 구름을 자른 구획**이다. 기능은 그대로 두되
 * 화면이 그걸 덩어리라 부르면 없는 경계를 있다고 말하는 셈이라, **말만** 바꿨다.
 *
 * ⚠ 실루엣은 볼록한 무리를 전제하고 고차원에서 약해진다(문헌 명시). 그러니 0.045 니까
 * 나쁘다로 단정하지 않는다. **상대 신호**로만 쓴다: 곡선끼리 견주고, 말을 고른다.
 *
 * 이 자가 보는 것 셋:
 *  ① 실린 실루엣이 **다시 재도 맞나**. 여기서 따로 구현해 다른 표본으로 잰다
 *  ② 성긴 층을 고른 **판단이 곡선과 맞나**. 봉우리가 뚜렷하면 봉우리를, 평평하면 그대로
 *  ③ 화면의 말이 **숫자를 따라가나**. 숫자를 올려 주면 덩어리, 내려 주면 구획
 *
 * ③ 이 관계인 게 핵심이다. 구획이라 적혀 있나로 걸면 그 낱말을 박아 둔 화면도 통과한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
/* ★ **가짜 지도로는 이 자를 못 댄다.** 조용히 통과시키지 않고 **왜 안 도는지 말한다** . 
   건너뛴 검사는 통과한 검사가 아니다. 진짜로 구운 뒤 `npm run atlas` 에서 돈다. */
if (isFake(ATLAS)) { console.log('[cluster-real] 가짜 지도다. 무리라 부르는 근거는 진짜 굽기에서만 잰다'); process.exit(0); }

const CACHE = path.join(KARMOLAB, 'data', '.memo-atlas-cache.json');
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');

if (!fs.existsSync(ATLAS)) {
  console.log('[cluster-real] 지도가 없다. 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const SIL_REAL = 0.15;   // 이보다 낮으면 덩어리가 아니라 **구획**이라 부른다
const bad = [];

// ── ① 실린 실루엣이 다시 재도 맞나 ────────────────────────────────────
/* 굽는 쪽 함수를 빌려 쓰면 자기가 자기를 확인하는 꼴이라 여기서 따로 구현한다.
   표본도 **뽑는 자리를 어긋나게** 잡는다. 같은 자리에서 뽑으면 표본이 만든 값인지
   자료가 만든 값인지 못 가른다.
   여유 0.01 은 재서 정했다: 표본 1200 이면 뽑는 자리를 바꿔도 값이 0.001 안에서 붙는다
   (400 이었을 땐 0.015 씩 흔들려서, 그 여유로는 배선 사고와 표본 잡음을 못 갈랐다). */
const SAMPLE = 1200;

function silhouette(points, assign, offset, pickMask) {
  const step = Math.max(1, Math.floor(points.length / SAMPLE));
  const idx = [];
  if (pickMask) {
    /* 굽는 쪽이 집은 바로 그 글들. 차례도 그쪽 것을 따른다. */
    for (let i = 0; i < points.length; i += 1) if (pickMask[i]) idx.push(i);
  } else {
    for (let i = offset % step; i < points.length && idx.length < SAMPLE; i += step) idx.push(i);
  }
  const dim = points[0].length;
  const d = (a, b) => {
    let s = 0;
    for (let i = 0; i < dim; i += 1) { const t = a[i] - b[i]; s += t * t; }
    return Math.sqrt(s);
  };
  /* **식구는 표본이 아니라 전부다.** 처음엔 뽑은 점들만 서로의 식구로 셌는데, 굽는 쪽은
     무리의 **모든 점**을 식구로 두고 그중 60개씩만 훑는다. 정의가 다르니 값이 어긋났고
     (층 6 에서 0.034 vs 0.023) 그걸 실린 값이 틀렸다로 읽을 뻔했다. 정의를 맞춘다 . 
     셈은 여전히 여기서 따로 한다. */
  const k = Math.max(...assign) + 1;
  const byC = Array.from({ length: k }, () => []);
  points.forEach((p, i) => byC[assign[i]].push(p));
  const meanTo = (p, arr) => {
    if (!arr.length) return Infinity;
    const st = Math.max(1, Math.floor(arr.length / 60));
    let s = 0; let c = 0;
    for (let i = 0; i < arr.length; i += st) {
      if (arr[i] === p) continue;                 // 자기 자신은 뺀다
      s += d(p, arr[i]); c += 1;
    }
    return c ? s / c : Infinity;
  };
  let sum = 0; let n = 0;
  for (const i of idx) {
    const own = byC[assign[i]];
    if (own.length < 2) continue;
    const a = meanTo(points[i], own);
    let b = Infinity;
    for (let c = 0; c < k; c += 1) {
      if (c === assign[i] || !byC[c].length) continue;
      b = Math.min(b, meanTo(points[i], byC[c]));
    }
    if (b === Infinity) continue;
    sum += (b - a) / Math.max(a, b);
    n += 1;
  }
  return n ? sum / n : 0;
}

if (isFake(ATLAS) || !fs.existsSync(CACHE)) {
  console.log('[cluster-real] 벡터 곳간이 없다. ①②는 진짜 굽기에서만 잰다 (지어낸 벡터엔 무리가 없다). 건너뜀');
} else {
  const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  /* **곳간엔 옛 모델 벡터가 같이 산다**. 열쇠가 `<모델>:<해시>` 라 모델이 바뀌어도
     옛 것이 안 지워진다(그게 열쇠에 모델을 적어 둔 이유다). 지금 지도의 글과 가장 많이
     맞물리는 층 하나만 골라 쓴다. 섞어 쓰면 3072차와 384차를 같이 재게 된다. */
  const byTier = new Map();
  for (const key of Object.keys(cache)) {
    const at = key.lastIndexOf(':');
    const tier = at < 0 ? '' : key.slice(0, at);
    const hash = at < 0 ? key : key.slice(at + 1);
    if (!byTier.has(tier)) byTier.set(tier, new Map());
    byTier.get(tier).set(hash, cache[key]);
  }
  const rows0 = atlas.docs.filter((d) => d.hash && Array.isArray(d.levels));
  /* **가장 많이 맞물리는 층을 고르면 안 된다**. 갈아 치운 옛 모델도 같은 1516개를 갖고
     있어서 그쪽을 집어 들었고, 그러곤 실린 값이 안 맞는다고 했다. 지도가 **누가
     그렸는지 적어 두게** 하고, 그 층에서만 집는다. */
  const TIER = atlas.model;
  if (!TIER) bad.push('지도에 **어느 모델이 그렸는지**가 안 적혀 있다 (model). 옛 벡터로 재게 된다');
  const tierMap = byTier.get(TIER) || new Map();
  const vecOf = new Map(rows0.filter((d) => tierMap.has(d.hash)).map((d) => [d.hash, tierMap.get(d.hash)]));
  const rows = rows0.filter((d) => vecOf.has(d.hash));
  const first = rows.length ? vecOf.get(rows[0].hash) : null;
  const DIM = first ? (first.length ?? Object.keys(first).length) : 0;
  const use = rows.filter((d) => {
    const v = vecOf.get(d.hash);
    return (v.length ?? Object.keys(v).length) === DIM;
  });
  console.log(`  (벡터 ${use.length}/${rows0.length}개를 ${TIER} 층에서 찾았다, ${DIM}차)`);
  if (use.length < 200) {
    console.log(`[cluster-real] 벡터가 ${use.length}개뿐. ①②는 건너뜀`);
  } else {
    /* 굽는 쪽과 **같은 손**: 모두가 공유하는 쏠림을 빼고 다시 정규화한 벡터로 잰다.
       이걸 안 빼면 값이 0.24 로 보인다. 그건 모두가 공유하던 방향이 만든 착시고,
       지도를 그린 벡터가 아니다. */
    const raw = use.map((d) => Float64Array.from(Object.values(vecOf.get(d.hash))));
    const mean = new Float64Array(DIM);
    for (const v of raw) for (let i = 0; i < DIM; i += 1) mean[i] += v[i] / raw.length;
    const vecs = raw.map((v) => {
      const w = Float64Array.from(v, (x, i) => x - mean[i]);
      let n = 0; for (const x of w) n += x * x;
      n = Math.sqrt(n) || 1;
      return Float64Array.from(w, (x) => x / n);
    });

    /**
     * ★ 여유(TOL)를 **손으로 고르지 않는다.**
     *
     * 굽는 쪽과 이 자는 **일부러 다른 점을 뽑아** 잰다(굽기 offset 0, 자 offset 층+1) . 
     * 표본이 다르면 값도 조금 다르다. 그래서 0.01 안이면 같다는 박아 둔 상수였고,
     * 글이 1516편에서 1932편으로 늘자 그 상수에 밀려 빨개졌다(0.041 vs 0.031).
     * 이제 **뽑는 자리를 여러 번 옮겨 가며 재서 그 폭을 구하고**, 실린 값이 그 폭 안이면
     * 같다고 본다. 자료가 늘어도 자가 같이 움직인다.
     */
    const levels = atlas.levels || [];
    levels.forEach((lv, li) => {
      if (lv.sil == null) { bad.push(`층 ${lv.k} 에 실루엣이 안 실려 있다`); return; }
      const assign = use.map((d) => d.levels[li] ?? 0);
      /**
       * ★ **굽는 쪽이 뽑은 바로 그 글들로 잰다.**
       *
       * 같은 1200개인 줄 알았는데 실은 서로 다른 1200개였다. 굽기는 자기 차례대로,
       * 이 자는 벡터가 캐시에 있는 것만 걸러 낸 차례대로 앞 1200개를 집었다.
       * 그래서 0.041 대 0.031 로 갈렸고 표본을 옮겨도 안 없어졌다(폭 0). 이제 굽기가
       * 집은 글 id 를 싣고(`silOn`) 이 자가 그 id 로 잰다.
       */
      const onIds = Array.isArray(lv.silOn) ? new Set(lv.silOn) : null;
      if (!onIds) bad.push(`층 ${lv.k}: 굽는 쪽이 **어느 글로 쟀는지**를 안 실었다 (silOn). 같은 것을 재는지 알 수 없다`);
      const tries = onIds
        ? [silhouette(vecs, assign, 0, use.map((d) => onIds.has(d.id)))]
        : [1, 2, 3, 5, 7].map((o) => silhouette(vecs, assign, li + o));
      const mine = tries[0];
      const lo = Math.min(...tries); const hi = Math.max(...tries);
      const tol = onIds ? 0.005 : Math.max(0.005, (hi - lo) * 1.5);
      const gap = Math.abs(mine - lv.sil);
      console.log(`  ① 층 ${lv.k}. 실린 값 ${lv.sil.toFixed(3)}, 다시 재니 ${mine.toFixed(3)}`
        + ` (뽑는 자리를 옮기면 ${lo.toFixed(3)}~${hi.toFixed(3)}, 여유 ${tol.toFixed(3)})`
        + `${gap > tol ? '  ← 안 맞는다' : ''}`);
      if (gap > tol) {
        bad.push(`층 ${lv.k} 의 실린 실루엣(${lv.sil.toFixed(3)})이 다시 재니 ${mine.toFixed(3)} 이다`
          + `. 표본을 옮겨 봐도 ${lo.toFixed(3)}~${hi.toFixed(3)} 라 표본 탓이 아니다`);
      }
    });

    // ── ② 성긴 층을 고른 판단이 곡선과 맞나 ──────────────────────────
    const co = atlas.coarse;
    if (!co || !Array.isArray(co.curve) || !co.curve.length) {
      bad.push('성긴 층을 **어떻게 골랐는지**가 안 실려 있다 (coarse.curve)');
    } else {
      /* 굽는 쪽과 **같은 규칙**을 다시 걸어 본다: 글을 반씩 가른 두 무리에서 봉우리가
         같은 자리이고 둘 다 뚜렷해야 층을 옮긴다. 실린 판단이 이것과 어긋나면 빨갛다. */
      const peak = (key) => {
        const sorted = [...co.curve].sort((x, y) => y[key] - x[key]);
        const mid = sorted[Math.floor(sorted.length / 2)][key];
        return { k: sorted[0].k, clear: sorted[0][key] > mid * 1.2 + 0.01 };
      };
      if (co.curve.some((c) => c.a == null || c.b == null)) {
        bad.push('곡선에 **반씩 가른 두 값**이 없다 (a, b). 한 번만 재면 표본이 만든 봉우리를 못 가른다');
      } else {
        const p1 = peak('a'); const p2 = peak('b');
        const clear = p1.clear && p2.clear && p1.k === p2.k;
        console.log(`  ② 곡선 ${co.curve.map((c) => `${c.k}:${c.a.toFixed(3)}, ${c.b.toFixed(3)}`).join(' ')}`
          + `. 반쪽 봉우리 ${p1.k}${p1.clear ? '뚜렷' : ''} / ${p2.k}${p2.clear ? '뚜렷' : ''}`
          + `, 다시 보니 ${clear ? '뚜렷' : '안 뚜렷'}, 실린 판단 ${co.clear ? '뚜렷' : '안 뚜렷'}, 고른 층 ${co.k}`);
        if (clear !== co.clear) {
          bad.push(`곡선을 다시 보면 봉우리가 ${clear ? '뚜렷한데' : '안 뚜렷한데'} 실린 판단은 반대다`);
        } else if (clear && co.k !== p1.k) {
          bad.push(`봉우리가 뚜렷한데(${p1.k}) 딴 층(${co.k})을 골랐다`);
        } else if (!clear && !co.curve.some((c) => c.k === co.k)) {
          bad.push(`평평한 곡선인데 후보에도 없는 층(${co.k})을 골랐다`);
        }
      }
      const lv0 = (atlas.levels || [])[0];
      const onCurve = co.curve.find((c) => c.k === co.k);
      if (lv0 && onCurve && Math.abs(onCurve.sil - lv0.sil) > 0.01) {
        bad.push(`곡선의 ${co.k} 값(${onCurve.sil.toFixed(3)})과 실린 층 값(${Number(lv0.sil).toFixed(3)})이 다르다`);
      }
    }
  }
}

// ── ③ 화면의 말이 숫자를 따라가나 ─────────────────────────────────────
/* **관계로 건다.** 같은 화면에 숫자만 올렸다 내렸다 하며 낱말이 따라오는지 본다.
   구획이라 적혀 있나로 걸면 그 낱말을 박아 둔 화면도 통과한다. */
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium) {
  console.log('[cluster-real] playwright 가 없다. ③(화면의 말)은 건너뜀');
} else if (!fs.existsSync(BUNDLE)) {
  console.log('[cluster-real] 번들이 없다. ③(화면의 말)은 건너뜀');
} else {
  const bundle = fs.readFileSync(BUNDLE, 'utf8');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

  async function wordsWith(sil) {
    const copy = JSON.parse(JSON.stringify(atlas));
    (copy.levels || []).forEach((l) => { l.sil = sil; });
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
      /* **셸과 같은 길로 얹는다**. 셸은 `tabs[].build` 로만 그린다. 예전엔 여기서
         `render(h)` 를 직접 불렀는데, 그 바람에 위젯이 셸이 안 읽는 모양으로 등록해도
         자들은 전부 초록이었다(2026-08-21, 사람이 열어 보고서야 드러났다). */
      window.__reg['memo-atlas'].tabs[0].build(h);
    });
    await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), undefined, { timeout: 30000 });
    /* **화면 전체를 훑지 않는다**. 덩어리라는 말은 다른 뜻으로도 화면에 놓인다
       (H0 줄의 한 덩어리로 이어져 있다에 걸려 성한 화면이 빨개졌다).
       이 낱말을 만드는 자리는 하나뿐이니(groupWord) 그게 찍히는 **배치 단추**를 본다. */
    const word = await page.evaluate(() => (document.querySelector('#host [data-layout="cluster"]')?.textContent || '').trim());
    await page.close();
    return { blob: word === '덩어리', zone: word === '구획', word };
  }

  const low = await wordsWith(0.02);          // 무리랄 게 없는 층
  const high = await wordsWith(0.62);         // 누가 봐도 무리인 층
  await browser.close();
  console.log(`  ③ 실루엣 0.02 → ${low.zone ? '구획' : ''}${low.blob ? '덩어리' : ''}`
    + `, 0.62 → ${high.zone ? '구획' : ''}${high.blob ? '덩어리' : ''}`);
  if (!low.zone) bad.push('무리랄 게 없는 층(0.02)인데 화면이 구획이라 안 한다');
  if (low.blob) bad.push('무리랄 게 없는 층(0.02)인데 화면이 아직 덩어리라 부른다');
  if (!high.blob) bad.push('누가 봐도 무리인 층(0.62)인데 화면이 덩어리라 안 한다');
}

// ── **왜 안 갈리는지를 요인 이름으로 말하나** (Sedlmair 2012) ──────────
/* 안 갈린다를 한 수로만 말하면 고칠 수가 없다. 갈려 보이느냐는 **여러 요인의 결과**다 . 
   무리 안(크기, 퍼짐, 밀도, 늘어짐, 이상치), 무리 사이(겹침, 굽음).
   ★ 눈금: 요인을 **하나씩만** 흔들면 그 요인만 움직여야 한다. 안 그러면 요인을 못 가르는 셈이다. */
function whyOf(assign, pts) {
  const g = new Map();
  assign.forEach((c, i) => { if (!g.has(c)) g.set(c, []); g.get(c).push(i); });
  const rows = [];
  for (const [, list] of g) {
    const cx = list.reduce((a, i) => a + pts[i][0], 0) / list.length;
    const cy = list.reduce((a, i) => a + pts[i][1], 0) / list.length;
    const ds = list.map((i) => Math.hypot(pts[i][0] - cx, pts[i][1] - cy));
    const spread = ds.reduce((a, b) => a + b, 0) / ds.length;
    let sxx = 0; let syy = 0; let sxy = 0;
    for (const i of list) {
      const dx = pts[i][0] - cx; const dy = pts[i][1] - cy;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    sxx /= list.length; syy /= list.length; sxy /= list.length;
    const tr = sxx + syy; const det = sxx * syy - sxy * sxy;
    const disc = Math.max(0, tr * tr / 4 - det);
    const l1 = tr / 2 + Math.sqrt(disc); const l2 = Math.max(1e-12, tr / 2 - Math.sqrt(disc));
    rows.push({ cx, cy, spread, elong: Math.sqrt(l1 / l2), outlier: ds.filter((d) => d > spread * 2).length / list.length });
  }
  let std = Infinity;
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const d = Math.hypot(rows[i].cx - rows[j].cx, rows[i].cy - rows[j].cy);
      const sp = (rows[i].spread + rows[j].spread) / 2 || 1e-9;
      std = Math.min(std, d / sp);
    }
  }
  const med = (a) => { const q = a.slice().sort((x, y) => x - y); return q[Math.floor(q.length / 2)]; };
  return { std, elong: med(rows.map((r) => r.elong)), outlier: med(rows.map((r) => r.outlier)) };
}
{
  let sd = 21;
  const rnd = () => (sd = (sd * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gs = () => { let s = 0; for (let i = 0; i < 6; i += 1) s += rnd(); return s - 3; };
  const build = ({ gap = 10, sx = 1, sy = 1, out = 0 }) => {
    const pts = []; const asg = [];
    for (let c = 0; c < 3; c += 1) {
      for (let i = 0; i < 60; i += 1) {
        const far = i < 60 * out ? 6 : 1;
        pts.push([c * gap + gs() * sx * far, gs() * sy * far]); asg.push(c);
      }
    }
    return { pts, asg };
  };
  const base = build({});
  const b = whyOf(base.asg, base.pts);
  const closer = build({ gap: 1.5 });
  const longer = build({ sx: 4 });
  const dirty = build({ out: 0.15 });
  const c1 = whyOf(closer.asg, closer.pts);
  const c2 = whyOf(longer.asg, longer.pts);
  const c3 = whyOf(dirty.asg, dirty.pts);
  console.log(`  ⑥ 눈금. 기본: 겹침 ${b.std.toFixed(2)}, 늘어짐 ${b.elong.toFixed(2)}, 이상치 ${(b.outlier * 100).toFixed(1)}%`);
  console.log(`     가깝게만: 겹침 ${c1.std.toFixed(2)} | 늘리기만: 늘어짐 ${c2.elong.toFixed(2)} | 이상치만: ${(c3.outlier * 100).toFixed(1)}%`);
  if (!(c1.std < b.std * 0.5)) bad.push(`무리를 가깝게 했는데 겹침 수가 안 준다 (${b.std.toFixed(2)} → ${c1.std.toFixed(2)})`);
  if (!(c2.elong > b.elong * 1.8)) bad.push(`무리를 늘렸는데 늘어짐 수가 안 는다 (${b.elong.toFixed(2)} → ${c2.elong.toFixed(2)})`);
  if (!(c3.outlier > b.outlier + 0.03)) bad.push(`이상치를 뿌렸는데 이상치 수가 안 는다 (${(b.outlier * 100).toFixed(1)}% → ${(c3.outlier * 100).toFixed(1)}%)`);
  /* ★ **요인이 서로 안 섞여야 한다는 내 가정이 틀렸다.** 표준화 겹침 = 중심 거리 ÷ 퍼짐이라
     **늘리면 겹침 수가 반드시 준다**(10.66 → 3.74). 논문도 그렇게 적는다. 무리 사이 요인은
     대개 무리 안 요인의 변덕에서 나온다(가로 의존). 그러니 걸 것은 수가 안 섞인다가 아니라
     **판정이 흔든 요인을 제대로 부르나**다. */
  const verdict = (w) => (w.std < 1 ? '겹침' : (w.elong > 2.2 ? '늘어짐' : (w.outlier > 0.06 ? '이상치' : (w.std < 2 ? '가까움' : '뚜렷하지 않음'))));
  const got = { near: verdict(c1), elong: verdict(c2), outlier: verdict(c3) };
  console.log(`     판정. 가깝게만 ${got.near}, 늘리기만 ${got.elong}, 이상치만 ${got.outlier}`);
  if (!['겹침', '가까움'].includes(got.near)) bad.push(`무리를 가깝게 했는데 까닭을 ${got.near} 라 한다`);
  if (got.elong !== '늘어짐') bad.push(`무리를 늘렸는데 까닭을 ${got.elong} 라 한다`);
  if (!['이상치', '겹침'].includes(got.outlier)) bad.push(`이상치를 뿌렸는데 까닭을 ${got.outlier} 라 한다`);
}

/* 실린 값. 층마다 까닭이 있고, 그 까닭이 수와 맞나. */
for (const L of atlas.levels || []) {
  const w = L.why;
  if (!w) { bad.push(`층 ${L.k}. 안 갈리는 까닭이 없다 (why)`); continue; }
  const want = w.worst.std < 1 ? '겹침' : (w.elongMed > 2.2 ? '늘어짐' : (w.outlierMed > 0.06 ? '이상치' : (w.worst.std < 2 ? '가까움' : '뚜렷하지 않음')));
  console.log(`  ⑥ 층 ${L.k}. 까닭 ${w.why} (겹침 ${w.worst.std}, 늘어짐 ${w.elongMed}, 이상치 ${(w.outlierMed * 100).toFixed(1)}%) → 다시 세우면 ${want}`);
  if (w.why !== want) bad.push(`층 ${L.k}. 까닭이 ${w.why} 인데 수로 다시 세우면 ${want} 다`);
  if (!(w.worst.std >= 0)) bad.push(`층 ${L.k}. 겹침 수가 ${w.worst.std} 다`);
}

if (bad.length) {
  console.log('[cluster-real] **무리라 부르는 근거가 안 선다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  숫자를 고치지 말고, 층을 고르는 손이나 화면이 쓰는 말을 봐라.');
  process.exit(1);
}
console.log(`[cluster-real] 층마다 잰 값이 맞고, 고른 근거가 실려 있고, 화면의 말이 그 숫자를 따라간다 (경계 ${SIL_REAL})`);
