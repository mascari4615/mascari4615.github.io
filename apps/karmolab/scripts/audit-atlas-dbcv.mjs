#!/usr/bin/env node
/**
 * audit-atlas-dbcv. **밀도로 재도 무리가 아닌가** (TASK-KAR-233).
 *
 * 실루엣만으로 무리가 아니라 구획이라 적어 뒀는데, 문헌이 못 박는다:
 * **거리 기반 지표(실루엣, 던)는 밀도 기반 구조 검증에 직접 쓸 수 없다**
 * (Moulavi 외 2014, DBCV 논문의 출발점). 우리 지도가 딱 그 모양. 연속된 구름에
 * 빽빽한 자리. 그러니 실루엣 0.03~0.06 은 무리가 없다가 아니라
 * **이 자로는 못 잰다** 일 수도 있었다. 성질이 다른 자를 하나 더 달았다.
 *
 * 이 자가 보는 것 넷 (합격선은 재기 **전에** 박아 뒀다):
 *  ① 실린 DBCV 가 **다시 재도 맞나** (곳간 벡터로 여기서 따로 잰다)
 *  ② **눈금이 맞나**. 지어낸 자료로: 뚜렷이 갈린 세 덩어리 > 0.5, 자른 구름 < 0.1
 *  ③ **라벨을 마구 섞으면 떨어지나** (안 떨어지면 아무것도 안 재는 자다)
 *  ④ 화면의 말이 **자 둘을 같이** 따라가나. 둘 다 낮을 때만 구획,
 *     엇갈리면 덩어리라 하되 엇갈린다고 적는다
 *
 * ⚠ DBCV 는 구현마다 값이 갈린다고 알려져 있다. **남의 숫자와 직접 견주지 않는다** . 
 * 지어낸 눈금과 우리 층끼리만 견준다. 그래서 ②가 이 자의 뼈대다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
const CACHE = path.join(KARMOLAB, 'data', '.memo-atlas-cache.json');
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');

if (!fs.existsSync(ATLAS)) {
  console.log('[dbcv] 지도가 없다. 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const SIL_REAL = 0.15;
const DBCV_REAL = 0.3;
const bad = [];

/* 굽는 쪽 함수를 빌려 오면 자기가 자기를 확인이 된다. 여기서 따로 구현한다.
   같은 정의(R dbscan 판): 내부 마디 = 무리 나무에서 차수 2 이상, 3점 미만 무리는 잡음. */
function distMatrix(vecs) {
  const n = vecs.length; const dim = vecs[0].length;
  const D = new Float32Array(n * n);
  for (let i = 0; i < n; i += 1) {
    const a = vecs[i];
    for (let j = i + 1; j < n; j += 1) {
      const b = vecs[j];
      let s = 0;
      for (let k = 0; k < dim; k += 1) { const t = a[k] - b[k]; s += t * t; }
      const d = Math.sqrt(s);
      D[i * n + j] = d; D[j * n + i] = d;
    }
  }
  return D;
}

function dbcv(vecs, assign, D = null) {
  const n = vecs.length; const dim = vecs[0].length;
  const dist = D || distMatrix(vecs);
  const k = Math.max(...assign) + 1;
  const groups = Array.from({ length: k }, () => []);
  assign.forEach((c, i) => { if (c >= 0) groups[c].push(i); });
  const info = groups.map((members) => {
    if (members.length < 3) return null;
    const core = new Map();
    for (const o of members) {
      let max = -Infinity; const logs = [];
      for (const q of members) {
        if (q === o) continue;
        const d = dist[o * n + q];
        const l = -dim * Math.log(d > 0 ? d : 1e-12);
        logs.push(l); if (l > max) max = l;
      }
      if (!logs.length) { core.set(o, Infinity); continue; }
      let s = 0; for (const l of logs) s += Math.exp(l - max);
      core.set(o, Math.exp(-(max + Math.log(s) - Math.log(logs.length)) / dim));
    }
    const inT = new Set([members[0]]); const rest = new Set(members.slice(1));
    const edges = [];
    while (rest.size) {
      let best = null; let bw = Infinity;
      for (const a of inT) {
        for (const b of rest) {
          const w = Math.max(core.get(a), core.get(b), dist[a * n + b]);
          if (w < bw) { bw = w; best = [a, b]; }
        }
      }
      if (!best) break;
      edges.push([best[0], best[1], bw]);
      inT.add(best[1]); rest.delete(best[1]);
    }
    const deg = new Map(members.map((m) => [m, 0]));
    for (const [a, b] of edges) { deg.set(a, deg.get(a) + 1); deg.set(b, deg.get(b) + 1); }
    const internal = members.filter((m) => deg.get(m) > 1);
    const pool = new Set(internal.length >= 2 ? internal : members);
    let dsc = 0;
    for (const [a, b, w] of edges) if (pool.has(a) && pool.has(b) && w > dsc) dsc = w;
    if (!dsc) for (const [, , w] of edges) if (w > dsc) dsc = w;
    return { members, core, pool: [...pool], dsc };
  });
  let total = 0;
  for (let i = 0; i < k; i += 1) {
    const ci = info[i]; if (!ci) continue;
    let dspc = Infinity;
    for (let j = 0; j < k; j += 1) {
      if (i === j || !info[j]) continue;
      for (const a of ci.pool) {
        for (const b of info[j].pool) {
          const w = Math.max(ci.core.get(a), info[j].core.get(b), dist[a * n + b]);
          if (w < dspc) dspc = w;
        }
      }
    }
    if (dspc === Infinity) continue;
    total += (ci.members.length / n) * ((dspc - ci.dsc) / Math.max(dspc, ci.dsc));
  }
  return total;
}

// ── ② 눈금이 맞나 (지어낸 자료. 진짜 지도가 없어도 이건 돈다) ─────────
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const gauss = () => { let s = 0; for (let i = 0; i < 6; i += 1) s += rnd(); return s - 3; };
const CAL_DIM = 64;
{
  const vecs = []; const assign = [];
  for (let c = 0; c < 3; c += 1) {
    const center = Array.from({ length: CAL_DIM }, () => (c === 0 ? 0 : gauss()) * 3);
    for (let i = 0; i < 100; i += 1) {
      vecs.push(Float64Array.from({ length: CAL_DIM }, (_, d) => center[d] + gauss() * 0.2));
      assign.push(c);
    }
  }
  const sep = dbcv(vecs, assign);
  const cloudV = []; const cloudA = [];
  for (let i = 0; i < 300; i += 1) {
    cloudV.push(Float64Array.from({ length: CAL_DIM }, () => gauss()));
    cloudA.push(i % 3);
  }
  const cloud = dbcv(cloudV, cloudA);
  console.log(`  ② 눈금. 뚜렷이 갈린 셋 ${sep.toFixed(3)} (0.5 넘어야), 자른 구름 ${cloud.toFixed(3)} (0.1 밑이어야)`);
  if (sep <= 0.5) bad.push(`뚜렷이 갈린 세 덩어리인데 ${sep.toFixed(3)} 밖에 안 나온다. 자가 무리를 못 알아본다`);
  if (cloud >= 0.1) bad.push(`그냥 자른 구름인데 ${cloud.toFixed(3)} 이 나온다. 자가 아무 나눔이나 칭찬한다`);
}

// ── ①③ 우리 지도 (진짜 굽기에서만) ─────────────────────────────────
if (isFake(ATLAS) || !fs.existsSync(CACHE)) {
  console.log('[dbcv] 벡터 곳간이 없다. ①③은 진짜 굽기에서만 잰다 (지어낸 벡터엔 밀도가 없다). 건너뜀');
} else {
  const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const TIER = atlas.model;
  if (!TIER) bad.push('지도에 어느 모델이 그렸는지가 안 적혀 있다 (model)');
  const m = new Map();
  for (const key of Object.keys(cache)) {
    const at = key.lastIndexOf(':');
    if (key.slice(0, at) === TIER) m.set(key.slice(at + 1), cache[key]);
  }
  const use = atlas.docs.filter((d) => d.hash && Array.isArray(d.levels) && m.has(d.hash));
  if (use.length < 200) {
    console.log(`[dbcv] 벡터가 ${use.length}개뿐. ①③은 건너뜀`);
  } else {
    const raw = use.map((d) => Float64Array.from(Object.values(m.get(d.hash))));
    const DIM = raw[0].length; const mean = new Float64Array(DIM);
    for (const v of raw) for (let i = 0; i < DIM; i += 1) mean[i] += v[i] / raw.length;
    const vecs = raw.map((v) => {
      const w = Float64Array.from(v, (x, i) => x - mean[i]);
      let n = 0; for (const x of w) n += x * x;
      n = Math.sqrt(n) || 1;
      return Float64Array.from(w, (x) => x / n);
    });
    const D = distMatrix(vecs);
    const TOL = 0.05;   /* 전수라 표본 잡음은 없다. 남는 건 글 차례가 달라 생기는
                           나무 가지 동률 차이뿐. 자릿수가 뒤집히면 배선 사고다. */
    (atlas.levels || []).forEach((lv, li) => {
      if (lv.dbcv == null) { bad.push(`층 ${lv.k} 에 DBCV 가 안 실려 있다`); return; }
      const assign = use.map((d) => d.levels[li] ?? 0);
      const mine = dbcv(vecs, assign, D);
      const gap = Math.abs(mine - lv.dbcv);
      console.log(`  ① 층 ${lv.k}. 실린 값 ${lv.dbcv.toFixed(3)}, 다시 재니 ${mine.toFixed(3)}${gap > TOL ? '  ← 안 맞는다' : ''}`);
      if (gap > TOL) bad.push(`층 ${lv.k} 의 실린 DBCV(${lv.dbcv.toFixed(3)})가 다시 재니 ${mine.toFixed(3)} 이다`);
    });
    /* ③ **라벨을 마구 섞으면 떨어져야 한다.** 안 떨어지면 이 자는 아무것도 안 재는 것이다.
       (우리 층은 이미 음수라 떨어질 자리가 없다가 될 수 있으니 **차이**로 본다.) */
    const li0 = 0;
    const real = (atlas.levels || [])[li0];
    if (real && real.dbcv != null) {
      const k = real.k;
      const shuffled = use.map(() => Math.floor(rnd() * k));
      const mixed = dbcv(vecs, shuffled, D);
      console.log(`  ③ 라벨 마구 섞음(${k}) → ${mixed.toFixed(3)} (지금 층 ${real.dbcv.toFixed(3)})`);
      if (mixed >= real.dbcv - 0.05) {
        bad.push(`라벨을 마구 섞어도 값이 안 떨어진다 (${mixed.toFixed(3)} vs ${real.dbcv.toFixed(3)}). 이 자는 나눔을 안 보고 있다`);
      }
    }
  }
}

// ── ④ 화면의 말이 자 둘을 같이 따라가나 ───────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[dbcv] playwright 나 번들이 없다. ④(화면의 말)은 건너뜀');
} else {
  const bundle = fs.readFileSync(BUNDLE, 'utf8');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  async function screenWith(sil, dv) {
    const copy = JSON.parse(JSON.stringify(atlas));
    (copy.levels || []).forEach((l) => { l.sil = sil; l.dbcv = dv; });
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
    /* **화면 전체를 훑지 않는다**. 덩어리는 다른 뜻으로도 화면에 놓인다(H0 줄 등).
       이 낱말을 만드는 자리는 하나뿐이니(groupWord) 그게 찍히는 **배치 단추**를 보고,
       엇갈림은 읽는 법 띠에서 본다. */
    const out = await page.evaluate(() => ({
      word: (document.querySelector('#host [data-layout="cluster"]')?.textContent || '').trim(),
      howto: document.querySelector('#host .atlas-howto')?.textContent || '',
    }));
    await page.close();
    return { zone: out.word === '구획', blob: out.word === '덩어리', mixed: out.howto.includes('엇갈림'), word: out.word };
  }
  const both = await screenWith(0.02, -0.3);     // 둘 다 무리 아니다
  const real = await screenWith(0.62, 0.8);      // 둘 다 무리다
  const split = await screenWith(0.02, 0.8);     // 엇갈림
  await browser.close();
  const say = (r) => `${r.zone ? '구획' : ''}${r.blob ? '덩어리' : ''}${r.mixed ? '+엇갈림' : ''}`;
  console.log(`  ④ 둘 다 낮음 → ${say(both)}, 둘 다 높음 → ${say(real)}, 엇갈림 → ${say(split)}`);
  if (!both.zone || both.blob) bad.push('자 둘 다 무리 아니다인데 화면이 구획이라 안 한다');
  if (!real.blob || real.zone) bad.push('자 둘 다 무리다인데 화면이 덩어리라 안 한다');
  if (!split.blob || split.zone) bad.push('자가 엇갈리는데 화면이 한쪽만 골라 구획이라 한다');
  if (!split.mixed) bad.push('자가 엇갈리는데 화면이 그 사실을 안 적는다');
  if (both.mixed || real.mixed) bad.push('자가 안 엇갈리는데 화면이 엇갈린다고 적는다');
}

if (bad.length) {
  console.log('[dbcv] **밀도로 재는 자가 안 선다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  셈법(전점 핵심거리, 상호도달거리, 무리 안 나무)이나 화면이 쓰는 말을 봐라.');
  process.exit(1);
}
console.log('[dbcv] 눈금이 맞고, 실린 값이 다시 재도 맞고, 화면이 자 둘을 같이 따라간다');
