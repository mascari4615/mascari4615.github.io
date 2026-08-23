#!/usr/bin/env node
/**
 * audit-atlas-skeleton-stable — **뼈대가 손잡이가 만든 모양은 아닌가** (TASK-KAR-233).
 *
 * 뼈대(mapper)는 구간 수와 겹침을 사람이 정해야 한다. 그 숫자를 손으로 박아 두면
 * 그림은 나오는데 **그 그림이 데이터인지 내가 고른 숫자인지 알 길이 없다.**
 * 실제로 그랬다: 구간 12 면 4조각, 13 이면 1조각, 18 이면 6조각. 「지도가 몇 조각으로
 * 끊겼다」는 말이 손잡이 한 칸에 뒤집혔다.
 *
 * 그래서 굽는 자리에서 그리드를 쓸어 **흔들어도 안 변하는 자리**를 고르게 했다.
 * 그리고 **그림이 아직 읽히는지**도 같이 본다 — 이음이 서로 넘나들기 시작하면
 * (실타래) 마디를 아무리 잘 골라도 못 읽는다. mapper 관례인 힘 배치를 안 쓰기로 했으니
 * (재 보니 교차 0 vs 4 로 우리 쪽이 나았다) 그 대신 **언제 관례를 꺼내야 하는지**를
 * 이 자가 알려 준다: 교차가 늘면 그때가 힘 배치나 이음 솎기를 꺼낼 시점이다.
 *
 * 이 자는 그 고르기가 정말 됐는지 다시 잰다 — 같은 흔들기(구간 ±1 · 겹침 ±0.05 ·
 * 글 90% 다섯 판)를 걸어, 실린 손잡이가 그리드에서 가장 안 흔들리는 축에 드는지 본다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = atlasPath(HERE);

/* **가짜 지도로는 이 자를 못 댄다** — 손잡이를 진짜 굽기가 골라야 한다.
   그럴 땐 조용히 통과하지 말고 왜 안 도는지 말한다(건너뛴 검사는 통과한 검사가 아니다). */
if (isFake(ATLAS)) {
  console.log('[atlas-skeleton-stable] 가짜 지도다 — 이 자는 진짜 굽기에서만 잰다 (손잡이를 진짜 굽기가 골라야 한다). 건너뜀');
  process.exit(0);
}

if (!fs.existsSync(ATLAS)) {
  console.log('[skeleton] 지도가 아직 없다 — 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const sk = atlas.skeleton;
if (!sk) { console.log('[skeleton] 뼈대가 없다 — 검사 건너뜀'); process.exit(0); }
/* **렌즈도 고른 것인가** — mapper 는 렌즈가 절반이다. 여태 가로축으로 박아 두고
   손잡이만 쓸었는데, 이제 넷을 쓸어 고른다. 「왜 이 렌즈냐」를 표로 실어야 다시 볼 수 있다. */
if (!sk.params?.lens || !Array.isArray(sk.lensTable) || sk.lensTable.length < 2) {
  console.log('[skeleton] **어떤 렌즈로 훑었는지가 안 실려 있다** (params.lens · lensTable)');
  console.log('  mapper 는 렌즈가 절반이다 — 안 적으면 보는 사람은 이 그림이 무엇으로 훑은 건지 모른다.');
  process.exit(1);
}
{
  /* 고르는 규칙을 여기서 다시 건다: 덜 흔들리는 쪽 → 덜 달라지는 쪽 → 마디 많은 쪽. */
  /* 굽는 쪽과 **같은 순서**: 덜 흔들림 → 덜 달라짐 → **그림 자 셋의 등수 평균** → 마디 많음.
     얽힘을 빼고 마디 수만 보면 고리 모양 렌즈(괴짜성)가 이기는데, 그 그림은 이음 53개 중
     30개가 서로를 가로지르는 실타래였다 — 이 자가 그걸 빨갛다고 하면서 동시에
     「그 렌즈를 골랐어야 한다」고 했다. 고르는 잣대와 재는 잣대는 하나여야 한다.

     ★ 그런데 한 번 **어긋났다.** 굽는 쪽이 「얽힘 하나」에서 「얽힘·stress·이웃 지킴의
     **등수 평균**」으로 옮겼는데 이 자는 얽힘만 보고 있었다. 셋이 0 으로 비긴 렌즈 둘에서
     자는 마디 많은 x 를, 굽기는 등수 평균이 나은 y 를 골라 빨개졌다(2026-08-22).
     그래서 **표에 실린 `rank` 를 그대로 쓴다** — 순서를 두 군데 적어 두면 또 갈라진다. */
  const rank = (t) => [t.spread, t.off, t.rank ?? (t.cross ?? 0), -t.n];
  const better = (a, b) => {
    const ra = rank(a); const rb = rank(b);
    for (let i = 0; i < ra.length; i += 1) { if (ra[i] !== rb[i]) return ra[i] < rb[i]; }
    return false;
  };
  const mine = sk.lensTable.find((t) => t.lens === sk.params.lens);
  const beats = sk.lensTable.filter((t) => t !== mine && better(t, mine));
  console.log(`[skeleton] 렌즈 「${sk.params.lens}」 · 표: ` + sk.lensTable.map((t) => `${t.lens}(흔들림 ${t.spread}·달라짐 ${Math.round(t.off * 100)}%·얽힘 ${t.cross ?? '?'}·마디 ${t.n})`).join(' '));
  if (!mine) {
    console.log('[skeleton] **고른 렌즈가 표에 없다** — 표와 그림이 딴 얘기를 한다');
    process.exit(1);
  }
  if (beats.length) {
    console.log(`[skeleton] **표에 더 나은 렌즈가 있는데 안 골랐다**: ${beats.map((t) => t.lens).join(', ')}`);
    process.exit(1);
  }
}

if (!sk.params || !sk.wobble) {
  console.log('[skeleton] **어떤 손잡이로 그렸는지 안 실려 있다**');
  console.log('  손잡이와 흔들림 폭을 같이 실어야 화면에 적을 수 있다 (params · wobble).');
  process.exit(1);
}

const raw = atlas.docs.filter((d) => d.xy).map((d) => ({ id: d.id, x: d.xy[0], y: d.xy[1] }));

/**
 * **실린 렌즈로 매긴다** — 안 그러면 자가 딴 그림을 잰다.
 *
 * 여기서 데었다: 굽는 쪽이 렌즈를 쓸어 「괴짜성」을 골랐는데, 이 자는 여전히 가로축으로
 * 훑고 있었다. 같은 손잡이(16·0.35)가 가로축에서는 흔들림 2·25위, 괴짜성에서는 흔들림 0·1위다.
 * 그래서 성한 지도를 「벼랑에 서 있다」고 했다. 렌즈가 절반이면 자도 렌즈를 알아야 한다.
 *
 * `f` = 구간을 자를 값 · `g` = 구간 안에서 다시 가를 값 (굽는 쪽과 같은 정의).
 */
function lensOf(list, kind) {
  if (kind === 'y') return list.map((q) => ({ ...q, f: q.y, g: q.x }));
  if (kind === '밀도' || kind === '괴짜성') {
    const n = list.length;
    const val = new Float64Array(n);
    if (kind === '괴짜성') {
      for (let i = 0; i < n; i += 1) {
        let s = 0;
        for (let j = 0; j < n; j += 1) s += Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y);
        val[i] = s / n;
      }
    } else {
      const K = 10;
      for (let i = 0; i < n; i += 1) {
        const near = new Float64Array(K).fill(Infinity);
        for (let j = 0; j < n; j += 1) {
          if (i === j) continue;
          const d = Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y);
          if (d >= near[K - 1]) continue;
          let q = K - 1;
          while (q > 0 && near[q - 1] > d) { near[q] = near[q - 1]; q -= 1; }
          near[q] = d;
        }
        let s = 0; let c = 0;
        for (const d of near) if (Number.isFinite(d)) { s += d; c += 1; }
        val[i] = c ? 1 / (s / c + 1e-9) : 0;
      }
    }
    return list.map((q, i) => ({ ...q, f: val[i], g: q.x }));
  }
  return list.map((q) => ({ ...q, f: q.x, g: q.y }));
}

const pts = lensOf(raw, sk.params?.lens || 'x');
if (pts.length < 100) { console.log('[skeleton] 글이 너무 적다 — 건너뜀'); process.exit(0); }

const MIN = sk.params.min ?? 3;
const BINS = [9, 10, 11, 12, 13, 14, 15, 16];
const OVER = [0.2, 0.25, 0.3, 0.35, 0.4];

/** 굽는 쪽과 **같은 손**이어야 한다. 다르면 이 자는 딴 그림을 재는 것이다. */
function shape(p, bins, overlap) {
  if (bins < 2 || overlap < 0) return { n: 0, comp: 0 };
  const xs = p.map((q) => (q.f ?? q.x));
  const lo = Math.min(...xs); const hi = Math.max(...xs);
  const w = (hi - lo) / bins; const ext = w * overlap;
  const sets = [];
  for (let b = 0; b < bins; b += 1) {
    const s = lo + b * w - ext; const e = lo + (b + 1) * w + ext;
    const inBin = p.filter((q) => (q.f ?? q.x) >= s && (q.f ?? q.x) <= e);
    if (inBin.length < MIN) continue;
    const ys = inBin.map((q) => (q.g ?? q.y)).sort((a, z) => a - z);
    const gaps = [];
    for (let i = 1; i < ys.length; i += 1) gaps.push([ys[i] - ys[i - 1], i]);
    gaps.sort((a, z) => z[0] - a[0]);
    const cuts = gaps.slice(0, 2).map((g) => ys[g[1]]).sort((a, z) => a - z);
    const parts = [[], [], []];
    for (const q of inBin) {
      const gv = (q.g ?? q.y);
      parts[gv < cuts[0] ? 0 : (cuts[1] !== undefined && gv < cuts[1] ? 1 : 2)].push(q);
    }
    for (const g of parts) if (g.length >= MIN) sets.push(new Set(g.map((q) => q.id)));
  }
  const par = sets.map((_, i) => i);
  const find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      let sh = 0;
      for (const id of sets[j]) if (sets[i].has(id)) sh += 1;
      if (sh) par[find(i)] = find(j);
    }
  }
  return { n: sets.length, comp: new Set(sets.map((_, i) => find(i))).size };
}

let seed = 11;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
/* **흔드는 손이 같아야 판정이 같다.** 굽는 쪽은 점마다 다섯 번 뽑아 「이 판에 넣을까」를
   정한다(점 하나에 다섯 개 연속). 여기서 판마다 따로 뽑으면 **다른 표본**이 되고, 그러면
   같은 자리인데 흔들림이 0 이었다 1 이었다 한다 — 실제로 그래서 성한 지도가 빨개졌다.
   씨앗도 뽑는 차례도 굽는 쪽과 똑같이 맞춘다. */
const keep = pts.map(() => Array.from({ length: 5 }, () => rnd() > 0.1));
const subs = [];
for (let t = 0; t < 5; t += 1) subs.push(pts.filter((_, i) => keep[i][t]));

function shakeOf(bins, overlap) {
  const here = shape(pts, bins, overlap);
  if (!here.n) return null;
  const comps = [
    shape(pts, bins - 1, overlap), shape(pts, bins + 1, overlap),
    shape(pts, bins, overlap - 0.05), shape(pts, bins, overlap + 0.05),
  ].concat(subs.map((s) => shape(s, bins, overlap))).map((s) => s.comp);
  return {
    comp: here.comp,
    spread: Math.max(...comps) - Math.min(...comps),
    off: comps.filter((c) => c !== here.comp).length / comps.length,
    low: Math.min(...comps), high: Math.max(...comps),
  };
}

const grid = [];
for (const b of BINS) for (const o of OVER) { const r = shakeOf(b, o); if (r) grid.push({ b, o, ...r }); }
const bestSpread = Math.min(...grid.map((g) => g.spread));
const mine = shakeOf(sk.params.bins, sk.params.overlap);
if (!mine) { console.log('[skeleton] 실린 손잡이로는 마디가 하나도 안 나온다'); process.exit(1); }

/* ★ 실린 손잡이는 **쓸어 본 그리드 안**이어야 한다 — 밖이면 잰 값이 아니라 박은 값이다.
   「안정」만으로는 못 잡는다: 구간을 3 으로 밀면 다 한 조각으로 뭉쳐 폭 0 = **1위**가 된다
   (749편 판에서 실측 — 퇴화가 최고 안정으로 읽힌다). 안정은 그리드 안에서만 견준다. */
if (!BINS.includes(sk.params.bins)) {
  console.log(`[skeleton] **실린 구간 ${sk.params.bins} 이 쓸어 본 그리드(${BINS[0]}~${BINS[BINS.length - 1]}) 밖이다** — 잰 값이 아니다`);
  process.exit(1);
}

const rank = grid.filter((g) => g.spread < mine.spread || (g.spread === mine.spread && g.off < mine.off)).length + 1;
console.log(`[skeleton] 실린 손잡이 구간 ${sk.params.bins} · 겹침 ${sk.params.overlap} · 마디 ${sk.nodes.length}`);
console.log(`[skeleton] 흔들면 조각 ${mine.low}~${mine.high} (폭 ${mine.spread} · 달라짐 ${(mine.off * 100).toFixed(0)}%) · 그리드 ${grid.length}자리 중 ${rank}위`);

if (mine.spread > bestSpread) {
  console.log('[skeleton] **더 안 흔들리는 자리가 있는데 벼랑에 서 있다**');
  const top = grid.filter((g) => g.spread === bestSpread).sort((a, b) => a.off - b.off)[0];
  console.log(`  지금 폭 ${mine.spread} · 가장 안 흔들리는 자리는 구간 ${top.b} 겹침 ${top.o} (폭 ${top.spread}).`);
  console.log('  pickSkeletonParams 의 그리드나 고르는 규칙을 봐라.');
  process.exit(1);
}
/* 실린 흔들림 폭이 실제와 다르면 화면에 거짓말을 적게 된다. */
const said = sk.wobble.comp;
if (!Array.isArray(said) || said[0] !== mine.low || said[1] !== mine.high) {
  console.log('[skeleton] **적어 둔 흔들림 폭이 실제와 다르다**');
  console.log(`  실린 값 ${JSON.stringify(said)} · 지금 재면 [${mine.low}, ${mine.high}]`);
  process.exit(1);
}
/* **실타래 검사.** 이음 둘이 서로를 가로지르면 사람은 어느 게 어디로 가는지 못 따라간다.
   지금은 0 이다 — 구간이 x 순서라 이웃 구간끼리만 이어지기 때문. 글이 늘어 한 구간이
   여러 덩어리로 갈리면 여기서 교차가 생긴다. 자리를 마구 섞으면 56(이음의 200%)이 나오니
   이 자는 실제로 잰다. 문턱은 이음 수 대비로 둔다 — 절대 수로 박으면 뼈대가 커질 때 헛돈다. */
const P = sk.nodes.map((n) => n.xy);
const E = sk.links.map(([i, j]) => [i, j]);
const side = (x1, y1, x2, y2, x3, y3) => (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
function crosses(p1, p2, p3, p4) {
  const d1 = side(p3[0], p3[1], p4[0], p4[1], p1[0], p1[1]);
  const d2 = side(p3[0], p3[1], p4[0], p4[1], p2[0], p2[1]);
  const d3 = side(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
  const d4 = side(p1[0], p1[1], p2[0], p2[1], p4[0], p4[1]);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
let crossCount = 0;
for (let i = 0; i < E.length; i += 1) {
  for (let j = i + 1; j < E.length; j += 1) {
    const [a1, b1] = E[i]; const [a2, b2] = E[j];
    /* 한 마디를 같이 쓰는 이음은 거기서 만나는 게 당연하다 — 교차로 안 친다. */
    if (a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2) continue;
    if (crosses(P[a1], P[b1], P[a2], P[b2])) crossCount += 1;
  }
}
/* 마디끼리 너무 붙어도 못 읽는다. 화면 폭의 2% 안에 들면 붙은 것으로 본다. */
const NEAR = 0.04;
let stuck = 0;
for (let i = 0; i < P.length; i += 1) {
  for (let j = i + 1; j < P.length; j += 1) {
    if (Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]) < NEAR) stuck += 1;
  }
}
const crossShare = E.length ? crossCount / E.length : 0;
console.log(`[skeleton] 이음이 서로 넘나드는 곳 ${crossCount} (이음의 ${(crossShare * 100).toFixed(0)}%) · 붙은 마디쌍 ${stuck}`);
const TANGLE = 0.25;
if (crossShare > TANGLE) {
  console.log('[skeleton] **뼈대가 실타래가 됐다** — 어느 이음이 어디로 가는지 못 따라간다');
  console.log(`  교차 ${crossCount} / 이음 ${E.length}. 이제 힘 배치(force)나 이음 솎기를 꺼낼 때다.`);
  console.log('  (2026-08-21 에는 교차 0 이라 힘 배치를 일부러 안 썼다 — 그 판단의 전제가 깨진 것이다.)');
  process.exit(1);
}
if (stuck > Math.max(2, P.length * 0.1)) {
  console.log('[skeleton] **마디가 서로 겹쳐 안 읽힌다**');
  console.log(`  ${stuck}쌍이 화면 폭 ${NEAR * 100}% 안에 붙어 있다 (마디 ${P.length}개).`);
  process.exit(1);
}

console.log('[skeleton] 흔들어도 안 변하는 자리에 서 있고, 흔들림 폭도 제대로 적혀 있다');
