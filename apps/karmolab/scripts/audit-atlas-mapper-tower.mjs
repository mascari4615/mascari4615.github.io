#!/usr/bin/env node
/**
 * audit-atlas-mapper-tower — **눈금을 하나 고른 그림인가, 여러 눈금에서 사는 조각인가** (TASK-KAR-233).
 *
 * 보통 mapper 는 덮개를 **한 눈금**으로 잡은 한 장면만 준다. Multiscale Mapper
 * (Dey·Mémoli·Wang, SODA 2016)는 구간 길이를 바꿔 가며 **덮개의 탑**을 쌓아 mapper 를
 * 지속 모듈로 만든다 — 여러 눈금에 걸쳐 살아남는 특징이 진짜고, **한 눈금에서만 나타나는
 * 특징은 눈금이 만든 것**이다.
 *
 * 우리가 지속을 재던 축은 둘뿐이었다: 반지름(H0)과 표본·눈금 밀기(마디 신뢰도).
 * 정작 mapper 고유의 축인 **눈금 수**로는 한 번도 안 재 봤다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 눈금마다 지어 층을 잇고 **조각의 태어남·죽음 표**를 싣는다
 *  ② 화면이 「이 조각은 눈금 A~B 에서 산다」를 적는다
 *  ③ **한 눈금에서만 사는 조각**은 그렇게 표시한다
 *  ④ 자로 문다 — 지어낸 갈린 셋은 사다리 전 구간에서 조각 셋을 유지하고,
 *     자리를 마구 섞은 점은 눈금마다 조각 수가 널뛴다
 *
 * ★ **④ 의 「셋」이 틀렸다.** 지어낸 덩어리 셋에서 조각은 **넷**이 나온다 — 우리 mapper 가
 * 구간 안에서 **세로로 한 번 더 가르기** 때문이다(가장 크게 벌어진 두 자리). 즉 조각 수는
 * 덩어리 수가 아니다. 사다리가 물어야 할 것은 **「눈금을 바꿔도 그 수가 그대로냐」**이지
 * 그 수가 몇이냐가 아니다. 그래서 합격선을 **「널뜀 0 · 갈라지거나 죽는 막대 0」**으로
 * 고쳐 박았다(마구 섞으면 널뛰고 전 구간 막대가 줄어든다 — 그건 그대로 건다).
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
const MIN = 3;

/* ── 굽는 쪽과 **같은 정의, 셈은 따로** ────────────────────────────────── */
function binGroups(pts, bins, overlap, min) {
  const xs = pts.map((p) => p.f);
  const lo = Math.min(...xs); const hi = Math.max(...xs);
  const w = (hi - lo) / bins; const ext = w * overlap;
  const out = [];
  for (let b = 0; b < bins; b += 1) {
    const s = lo + b * w - ext; const e = lo + (b + 1) * w + ext;
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

function componentSets(pts, bins, overlap) {
  const sets = binGroups(pts, bins, overlap, MIN).map((g) => new Set(g.map((p) => p.id)));
  const par = sets.map((_, i) => i);
  const find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      let shared = false;
      for (const id of sets[j]) if (sets[i].has(id)) { shared = true; break; }
      if (shared) par[find(i)] = find(j);
    }
  }
  const byRoot = new Map();
  sets.forEach((st, i) => {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, new Set());
    for (const id of st) byRoot.get(r).add(id);
  });
  return [...byRoot.values()].sort((a, b) => b.size - a.size);
}

/** 눈금마다 조각 수 + 어른 규칙으로 이은 막대. */
function tower(pts, binList, overlap) {
  const levels = binList.map((bins) => ({ bins, comps: componentSets(pts, bins, overlap) }));
  const parent = levels.map(() => []);
  for (let k = 1; k < levels.length; k += 1) {
    levels[k].comps.forEach((c, i) => {
      let best = -1; let bestN = 0;
      levels[k - 1].comps.forEach((p, j) => {
        let inter = 0;
        for (const id of c) if (p.has(id)) inter += 1;
        if (inter > bestN) { bestN = inter; best = j; }
      });
      parent[k][i] = bestN > 0 ? best : -1;
    });
  }
  const bars = [];
  const chain = levels.map((L) => new Array(L.comps.length).fill(-1));
  for (let k = levels.length - 1; k >= 0; k -= 1) {
    levels[k].comps.forEach((c, i) => {
      if (chain[k][i] < 0) {
        chain[k][i] = bars.length;
        bars.push({ from: levels[k].bins, to: levels[k].bins, span: 1, size: c.size, died: null });
      }
    });
    if (k === 0) break;
    const kids = new Map();
    levels[k].comps.forEach((c, i) => {
      const p = parent[k][i];
      if (p < 0) return;
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p).push(i);
    });
    for (const [p, list] of kids) {
      list.sort((a, b) => levels[k].comps[b].size - levels[k].comps[a].size);
      const elder = list[0];
      const bar = bars[chain[k][elder]];
      chain[k - 1][p] = chain[k][elder];
      bar.from = levels[k - 1].bins; bar.span += 1;
      bar.size = Math.max(bar.size, levels[k - 1].comps[p].size);
      for (const y of list.slice(1)) bars[chain[k][y]].died = levels[k - 1].bins;
    }
  }
  const out = bars.slice().sort((x, z) => z.span - x.span || z.size - x.size);
  return {
    counts: levels.map((L) => ({ bins: L.bins, comps: L.comps.length })),
    bars: out,
    full: out.filter((b) => b.span === binList.length).length,
    once: out.filter((b) => b.span === 1).length,
  };
}

// ── ④ 눈금과 대조 (지도가 없어도 돈다) ────────────────────────────────
const BINS = [8, 10, 12, 14, 16, 20, 24];
{
  let seed = 13;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i += 1) s += rnd(); return s - 3; };
  /* 렌즈 값(f)에서 **또렷이 갈린 세 덩어리** — 눈금을 어떻게 잡아도 셋이어야 한다. */
  const pts = [];
  for (let c = 0; c < 3; c += 1) {
    for (let i = 0; i < 150; i += 1) pts.push({ id: `p${pts.length}`, f: c * 40 + gauss() * 0.7, g: gauss() * 0.7 });
  }
  const t = tower(pts, BINS, 0.3);
  const spreadT = Math.max(...t.counts.map((c) => c.comps)) - Math.min(...t.counts.map((c) => c.comps));
  console.log(`  ④ 눈금 — 갈린 셋: ` + t.counts.map((c) => `${c.bins}:${c.comps}`).join(' ')
    + ` | 널뜀 ${spreadT} · 전 구간을 사는 조각 ${t.full}개`);
  /* ★ **덩어리 셋인데 조각은 넷이다.** 「셋이 나와야 한다」로 박아 뒀다가 잡혔다 — 우리 mapper 는
     구간 안에서 **세로로 한 번 더 가른다**(가장 크게 벌어진 두 자리). 그래서 조각 수는 덩어리
     수가 아니다. 사다리가 물어야 할 것은 **「눈금을 바꿔도 그 수가 그대로냐」**이지 그 수가
     몇이냐가 아니다. 그래서 합격선을 「널뜀 0 · 갈라지거나 죽는 막대 0」으로 고쳐 박는다. */
  if (spreadT !== 0) bad.push(`갈린 셋인데 눈금마다 조각 수가 널뛴다 (${t.counts.map((c) => c.comps).join('·')})`);
  if (t.full !== t.counts[0].comps) {
    bad.push(`갈린 셋인데 전 구간을 사는 조각이 ${t.full}개뿐이다 (눈금마다 ${t.counts[0].comps}개)`);
  }

  /* 자리를 마구 섞으면 눈금마다 널뛰어야 한다 — 안 널뛰면 이 셈은 구조를 안 보는 것이다. */
  const mixed = pts.map((p) => ({ id: p.id, f: gauss() * 40, g: gauss() * 40 }));
  const tm = tower(mixed, BINS, 0.3);
  const spread = Math.max(...tm.counts.map((c) => c.comps)) - Math.min(...tm.counts.map((c) => c.comps));
  console.log(`  ④ 마구 섞으면 — ` + tm.counts.map((c) => `${c.bins}:${c.comps}`).join(' ')
    + ` | 널뜀 ${spread} · 전 구간을 사는 조각 ${tm.full}개`);
  if (spread === 0 && tm.full === t.full) {
    bad.push('마구 섞은 점도 갈린 셋과 똑같이 나온다 — 사다리가 아무것도 안 보고 있다');
  }
  console.log(`     (덩어리는 셋인데 조각은 ${t.counts[0].comps}개다 — 구간 **안에서 세로로 또 가르기** 때문이다.`
    + ' 사다리가 묻는 것은 그 수가 몇이냐가 아니라 **눈금을 바꿔도 그대로냐**이다)');
}

// ── ①②③ 실린 값과 화면 ──────────────────────────────────────────────
if (!fs.existsSync(ATLAS)) {
  console.log('[tower] 지도가 없다 — 실린 값·화면 확인 건너뜀');
} else {
  const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
  const tw = atlas.skeleton?.tower;
  if (!tw) {
    if (isFake(ATLAS) || !atlas.skeleton) console.log('[tower] 뼈대나 사다리가 없다 — 가짜 지도이거나 아직 안 구웠다');
    else bad.push('진짜 뼈대인데 **눈금 사다리가 안 실려 있다** (skeleton.tower) — 눈금 하나로 그린 한 장면이다');
  } else {
    console.log('  ① 실린 값 — ' + tw.counts.map((c) => `${c.bins}:${c.comps}조각`).join(' ')
      + ` | 전 구간 ${tw.full}개 · 눈금 하나짜리 ${tw.once}개`);
    console.log('     막대 — ' + tw.bars.slice(0, 6).map((b) => `${b.from}~${b.to}(${b.span}층·글 ${b.size})`).join(' · '));
    if (!Array.isArray(tw.bars) || !tw.bars.length) bad.push('막대가 없다 — 「어느 눈금에서 사나」를 다시 볼 수 없다');
    if (!Array.isArray(tw.counts) || tw.counts.length < 3) bad.push('사다리가 세 층도 안 된다 — 그건 사다리가 아니다');
    else {
      /* ① 막대와 조각 수가 서로 맞나 — 가장 성긴 눈금의 조각 수 = 거기까지 산 막대 수. */
      const coarse = tw.counts[0];
      const alive = tw.bars.filter((b) => b.from === coarse.bins).length;
      if (alive !== coarse.comps) {
        bad.push(`가장 성긴 눈금(${coarse.bins})의 조각이 ${coarse.comps}개인데 거기까지 산 막대는 ${alive}개다`);
      }
      /* 막대 수 = 모든 층의 조각 수 합에서 이어진 만큼을 뺀 것. 층마다 최소 하나는 살아야 한다. */
      const bySpan = tw.bars.filter((b) => b.span > tw.counts.length).length;
      if (bySpan) bad.push(`층 수(${tw.counts.length})보다 오래 산 막대가 ${bySpan}개다 — 셈이 틀렸다`);
      /* ③ 눈금 하나에서만 사는 조각을 「없다」고 뭉개지 않았나. */
      const onceHere = tw.bars.filter((b) => b.span === 1).length;
      if (onceHere !== tw.once) bad.push(`눈금 하나짜리 조각 수(${tw.once})가 막대와 다르다 (다시 세면 ${onceHere})`);
    }

    // ② 화면이 적나
    let chromium;
    try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
    if (!chromium || !fs.existsSync(BUNDLE)) {
      console.log('[tower] playwright·번들 중 없는 게 있다 — 화면 확인 건너뜀');
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
      await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), { timeout: 30000 });
      await page.click('#host [data-layout="skeleton"]');
      await page.waitForTimeout(250);
      const text = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
      await browser.close();
      const lo = tw.counts[0].bins; const hi = tw.counts[tw.counts.length - 1].bins;
      const saysRange = new RegExp(`눈금 ${lo}\\s*~\\s*${hi}|구간 수를 ${lo}~${hi}`).test(text);
      const saysFull = new RegExp(`조각 ${tw.full}개는`).test(text) || new RegExp(`전 구간을 사는 조각 ${tw.full}개`).test(text);
      console.log(`  ② 화면이 「눈금 ${lo}~${hi} 사다리 · 전 구간 ${tw.full}개」를 적나 —`
        + ` 구간 ${saysRange ? '○' : '✗'} · 전 구간 조각 수 ${saysFull ? '○' : '✗'}`);
      if (!saysRange || !saysFull) {
        bad.push('화면이 눈금 사다리를 안 적는다 — 눈금 하나로 그린 한 장면이 자료의 모양으로 읽힌다');
      }
    }
  }
}

if (bad.length) {
  console.log('[tower] **눈금 하나로 그린 그림을 자료의 모양이라 하고 있다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 mapperTower · memo-atlas.ts 의 읽는 법 띠를 봐라.');
  process.exit(1);
}
console.log('[tower] 눈금을 바꿔 가며 다시 지어도 사는 조각을 가려내고, 화면이 그 구간을 적는다');
