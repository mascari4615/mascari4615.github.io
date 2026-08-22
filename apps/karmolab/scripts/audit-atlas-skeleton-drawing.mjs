#!/usr/bin/env node
/**
 * audit-atlas-skeleton-drawing — **자 하나로 그림을 판정하지 마라** (TASK-KAR-233).
 *
 * 우리는 뼈대 렌즈를 「흔들림 → 달라짐 → **얽힘** → 마디 수」로 골라 왔다. 그런데
 * 2025 논문 하나가 **자 값을 거의 그대로 둔 채 그림을 아무 모양으로나 바꿔 보였다**
 * (「Same Quality Metrics, Different Graph Drawings」) — 자는 아주 나쁜 그림을 아주 좋다고
 * 매길 수 있다. 자 열 개의 지형을 상관으로 훑은 2024 논문(Mooney·Purchase·Wybrow·Kobourov)
 * 은 **stress(전체 충실도)와 얽힘(읽히기)이 서로 싸운다**고 적는다.
 *
 * 그래서 뼈대 그림을 셋으로 잰다:
 *   · **얽힘** — 이음이 서로 넘나든 횟수 (읽히기)
 *   · **stress** — 그린 거리가 그래프 거리(걸음 수)와 맞나. 크기는 맞춰 주고 잰다. 0 이 딱 맞음
 *   · **이웃 지킴** — 그래프 이웃과 그림에서 가까운 마디의 자카드. 1 이 완벽
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 셋을 다 잰다 — 자가 **따로 셈해** 실린 값과 맞는지 본다
 *  ② 화면이 **셋을 다** 적는다 (하나만 적으면 「좋은 그림」으로 읽힌다)
 *  ③ 렌즈 고르기가 셋을 다 보고 고른다 — 표에 셋과 등수가 있고, 등수가 표와 맞는다
 *  ④ **얽힘을 그대로 둔 채 그림을 망가뜨리면** stress·이웃 지킴이 무너진다
 *
 * ★ **④ 를 재 보니 내 예상이 틀렸고, 그게 이 자의 핵심이 됐다.** 마디를 한 줄에 늘어놓으면
 * 얽힘은 그대로 0 이고 이웃 지킴은 8배 무너지는데(0.690 → 0.082), **stress 는 오히려
 * 좋아진다**(0.214 → 0.097). 우리 뼈대가 거의 사슬이라 걸음 수가 줄 번호와 같이 늘기
 * 때문이다. 즉 **얽힘만이 아니라 stress 만 봐도** 이 그림은 좋은 그림으로 지나간다.
 * 그래서 자는 「셋이 다 무너진다」가 아니라 **「적어도 하나가 잡는다 + 못 잡은 자를 말한다」**
 * 를 건다. 자가 죽지 않았는지는 ④-나(자리 마구 섞기)에서 셋 다 걸어 확인한다.
 *
 * ★ 그 뒤 바퀴에서 마디 자리를 **매어 둔 채 stress 줄이기**로 다시 잡았다. 그래서 하나 더 건다:
 * ⑤ **자리를 다시 잡았으면 화면이 반드시 말한다** — 뼈대 마디는 원래 지도 자리에 찍혀
 * 있었고, 옮겨 놓고 안 적으면 사람은 뼈대와 뜻자리를 같은 지도로 읽는다. 그리고
 * **단조 수렴** — 판마다 stress 가 줄어야 한다(늘어난 판이 있으면 셈이 틀린 것이다).
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

/* ── 굽는 쪽과 **같은 정의, 셈은 따로** ────────────────────────────────── */
function graphDist(n, links) {
  const adj = Array.from({ length: n }, () => []);
  for (const [i, j] of links) { adj[i].push(j); adj[j].push(i); }
  const D = Array.from({ length: n }, () => new Float64Array(n).fill(Infinity));
  for (let s = 0; s < n; s += 1) {
    D[s][s] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h += 1) {
      for (const nx of adj[q[h]]) if (!Number.isFinite(D[s][nx])) { D[s][nx] = D[s][q[h]] + 1; q.push(nx); }
    }
  }
  return { D, adj };
}

function stressOf(P, D) {
  const n = P.length;
  let a = 0; let b = 0; let pairs = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = D[i][j];
      if (!Number.isFinite(d) || d === 0) continue;
      const e = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]);
      const w = 1 / (d * d);
      a += w * d * e; b += w * e * e; pairs += 1;
    }
  }
  const scale = b > 0 ? a / b : 1;
  let num = 0; let den = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = D[i][j];
      if (!Number.isFinite(d) || d === 0) continue;
      const e = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]) * scale;
      const w = 1 / (d * d);
      num += w * (e - d) * (e - d); den += w * d * d;
    }
  }
  return { stress: den > 0 ? num / den : null, pairs };
}

function neighborKeep(P, adj) {
  const n = P.length;
  let sum = 0; let counted = 0;
  for (let i = 0; i < n; i += 1) {
    const k = adj[i].length;
    if (!k) continue;
    const order = [];
    for (let j = 0; j < n; j += 1) {
      if (j === i) continue;
      order.push([Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]), j]);
    }
    order.sort((x, z) => x[0] - z[0]);
    const drawn = new Set(order.slice(0, k).map((o) => o[1]));
    let inter = 0;
    for (const j of drawn) if (adj[i].includes(j)) inter += 1;
    sum += inter / (drawn.size + k - inter); counted += 1;
  }
  return counted ? sum / counted : null;
}

function crossingsOf(P, links) {
  const side = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const hit = (p1, p2, p3, p4) => {
    const d1 = side(p3[0], p3[1], p4[0], p4[1], p1[0], p1[1]);
    const d2 = side(p3[0], p3[1], p4[0], p4[1], p2[0], p2[1]);
    const d3 = side(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    const d4 = side(p1[0], p1[1], p2[0], p2[1], p4[0], p4[1]);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  let n = 0;
  for (let i = 0; i < links.length; i += 1) {
    for (let j = i + 1; j < links.length; j += 1) {
      const [a1, b1] = links[i]; const [a2, b2] = links[j];
      if (a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2) continue;
      if (hit(P[a1], P[b1], P[a2], P[b2])) n += 1;
    }
  }
  return n;
}

/** 그림 하나를 셋으로 잰다. */
function measure(P, links) {
  const { D, adj } = graphDist(P.length, links);
  const st = stressOf(P, D);
  return { cross: crossingsOf(P, links), stress: st.stress, pairs: st.pairs, np: neighborKeep(P, adj) };
}

if (!fs.existsSync(ATLAS)) {
  console.log('[skeleton-draw] 지도가 없다 — 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const sk = atlas.skeleton;
if (!sk || !Array.isArray(sk.nodes) || sk.nodes.length < 5) {
  console.log(`[skeleton-draw] 뼈대가 없거나 너무 작다 — ${isFake(ATLAS) ? '가짜 지도다 · ' : ''}검사 건너뜀`);
  process.exit(0);
}

const P = sk.nodes.map((n) => n.xy);
const E = (sk.links || []).map(([i, j]) => [i, j]);

// ── ① 셋을 다 재고, 자가 따로 셈해도 같은가 ──────────────────────────
const mine = measure(P, E);
console.log(`  ① 다시 재면 — 얽힘 ${mine.cross} · stress ${mine.stress.toFixed(4)} (쌍 ${mine.pairs}개)`
  + ` · 이웃 지킴 ${mine.np.toFixed(4)}`);
const dr = sk.draw;
if (!dr) {
  bad.push('그림 자 셋이 안 실려 있다 (skeleton.draw) — 얽힘만 보고 있다');
} else {
  console.log(`     실린 값 — 얽힘 ${dr.cross} · stress ${dr.stress} · 이웃 지킴 ${dr.np}`);
  if (dr.cross !== mine.cross) bad.push(`실린 얽힘 ${dr.cross} 이 다시 재면 ${mine.cross} 이다`);
  if (Math.abs((dr.stress ?? -1) - mine.stress) > 0.005) bad.push(`실린 stress ${dr.stress} 가 다시 재면 ${mine.stress.toFixed(4)} 이다`);
  if (Math.abs((dr.np ?? -1) - mine.np) > 0.005) bad.push(`실린 이웃 지킴 ${dr.np} 가 다시 재면 ${mine.np.toFixed(4)} 이다`);
  if (dr.pairs !== mine.pairs) bad.push(`stress 를 잰 쌍 수가 다르다 (실린 ${dr.pairs} · 다시 세면 ${mine.pairs})`);
}

// ── ⑤ 자리를 다시 잡았으면 화면이 말하나 · 단조 수렴 ──────────────────
const an = sk.draw?.anchored;
if (!an) {
  bad.push('자리를 다시 잡았는지 안 잡았는지가 안 실려 있다 (draw.anchored)');
} else {
  /* ★ **「옮겼다」는 표시를 믿지 않는다.** 표시만 지워도 숨겨지기 때문이다(망가뜨림 판이
     그걸 보여 줬다 — 자가 못 잡았다). 원래 자리가 같이 실려 있으니 **자가 직접 잰다**. */
  const b0 = an.before?.xy;
  if (!Array.isArray(b0) || b0.length !== P.length) {
    bad.push('원래 자리가 안 실려 있다 (draw.anchored.before.xy) — 「옮겼다」를 자가 못 재고 표시만 믿게 된다');
  } else {
    const span = (Math.max(...b0.map((p) => p[0])) - Math.min(...b0.map((p) => p[0]))
      + Math.max(...b0.map((p) => p[1])) - Math.min(...b0.map((p) => p[1]))) / 2;
    let sum = 0;
    for (let i = 0; i < P.length; i += 1) sum += Math.hypot(P[i][0] - b0[i][0], P[i][1] - b0[i][1]);
    const realMoved = span > 0 ? sum / P.length / span : 0;
    console.log(`  ⑤ 자가 직접 잰 옮김 ${(realMoved * 100).toFixed(1)}% (실린 값 ${(an.moved * 100).toFixed(1)}%)`);
    if (realMoved > 0.01 && !an.used) {
      bad.push(`마디가 ${(realMoved * 100).toFixed(0)}% 옮겨졌는데 「안 옮겼다」로 적혀 있다 — 화면이 입을 다문다`);
    }
    if (Math.abs(realMoved - an.moved) > 0.02) {
      bad.push(`실린 옮김 ${an.moved} 이 다시 재면 ${realMoved.toFixed(4)} 이다`);
    }
  }
  console.log(`  ⑤ 자리 다시 잡기 — ${an.used ? `썼다 (λ ${an.lambda} · ${(an.moved * 100).toFixed(1)}% 옮김)` : '안 썼다'}`
    + ` · 후보 ${an.table.length}가지 · 늘어난 판 ${an.rose}`);
  if (an.used) {
    /* ★ 자취는 **실제로 줄이는 값**(stress + λ·앵커)이다. 평범한 stress 만 재면 λ>0 에서
       정당하게 오르는 것을 「셈이 틀렸다」로 읽는다 — 이 자가 한 번 그렇게 헛빨개졌다. */
    if (an.rose !== 0) bad.push(`줄이는 값이 ${an.rose}번 늘었다 — 단조 수렴이 깨졌다(셈이 틀렸다)`);
    if (!(an.moved > 0)) bad.push('썼다면서 마디가 하나도 안 움직였다');
    if (Array.isArray(an.trail) && an.trail.length > 1) {
      const down = an.trail.every((v, i) => i === 0 || v <= an.trail[i - 1] + 1e-9);
      console.log(`     자취 ${an.trail.slice(0, 5).join(' → ')}${down ? '' : ' ← **늘어난 자리 있음**'}`);
      if (!down) bad.push('실린 자취에서 stress 가 늘어난 자리가 있다');
    }
    const bf = an.before;
    const worse = (mine.cross > bf.cross ? 1 : 0) + (mine.stress > bf.stress ? 1 : 0) + (mine.np < bf.np ? 1 : 0);
    console.log(`     전후 — 얽힘 ${bf.cross}→${mine.cross} · stress ${bf.stress}→${mine.stress.toFixed(4)}`
      + ` · 이웃 지킴 ${bf.np}→${mine.np.toFixed(4)} (나빠진 자 ${worse}개)`);
    if (worse >= 2) bad.push(`자리를 다시 잡았는데 세 자 중 ${worse}개가 나빠졌다 — 안 썼어야 한다`);
  }
}

// ── ③ 렌즈 고르기가 셋을 다 보나 ─────────────────────────────────────
const tb = sk.lensTable;
if (!Array.isArray(tb) || !tb.length) {
  bad.push('렌즈 표가 없다 — 「왜 이 렌즈냐」를 다시 볼 수 없다');
} else {
  const missing = tb.filter((t) => typeof t.stress !== 'number' || typeof t.np !== 'number' || typeof t.rank !== 'number');
  console.log(`  ③ 렌즈 ${tb.length}가지 — ` + tb.map((t) => `${t.lens}(얽힘 ${t.cross}·stress ${t.stress}·이웃 ${t.np}·등수 ${t.rank})`).join(' '));
  if (missing.length) {
    bad.push(`렌즈 표 ${missing.length}줄에 stress·이웃 지킴·등수가 없다 — 얽힘만 보고 골랐다는 뜻이다`);
  } else {
    /* 등수 평균을 **여기서 다시 매긴다** — 박아 넣은 수면 어긋난다. */
    const rank = (key, lowLo) => {
      const idx = tb.map((_, i) => i).sort((x, z) => (lowLo ? tb[x][key] - tb[z][key] : tb[z][key] - tb[x][key]));
      const r = new Array(tb.length).fill(0);
      idx.forEach((v, pos) => { r[v] = pos; });
      return r;
    };
    const rc = rank('cross', true); const rs = rank('stress', true); const rn = rank('np', false);
    const off = tb.filter((t, i) => Math.abs(t.rank - (rc[i] + rs[i] + rn[i]) / 3) > 0.005);
    if (off.length) bad.push(`실린 등수 평균이 ${off.length}줄에서 표와 어긋난다 (${off.map((t) => t.lens).join('·')})`);
    /* 고른 렌즈가 사다리(흔들림 → 달라짐 → 등수 → 마디)를 따랐나. */
    const chosen = tb.find((t) => t.lens === (sk.params?.lens || 'x'));
    const better = tb.filter((t) => t.spread < chosen.spread
      || (t.spread === chosen.spread && (t.off < chosen.off
        || (t.off === chosen.off && (t.rank < chosen.rank || (t.rank === chosen.rank && t.n > chosen.n))))));
    if (better.length) bad.push(`「${chosen.lens}」를 골랐는데 사다리로는 ${better.map((t) => t.lens).join('·')} 가 앞선다`);
  }
}

// ── ④ 얽힘을 그대로 둔 채 그림을 망가뜨린다 ───────────────────────────
/* 마디를 **한 줄에 늘어놓는다.** 이음이 다 한 직선 위에 놓이므로 **얽힘은 그대로 0**
   인데, 그린 거리도 이웃도 그래프와 아무 상관이 없어진다. 이게 「같은 자 값, 다른 그림」이다. */
const line = P.map((_, i) => [i, 0]);
const flat = measure(line, E);
console.log(`  ④-가 마디를 한 줄에 늘어놓으면 — 얽힘 ${flat.cross} (우리 ${mine.cross})`
  + ` · stress ${flat.stress.toFixed(4)} (우리 ${mine.stress.toFixed(4)})`
  + ` · 이웃 지킴 ${flat.np.toFixed(4)} (우리 ${mine.np.toFixed(4)})`);
/* ★ **여기서 내 예상이 틀렸고, 그게 이 자의 핵심이 됐다.**
   「stress 도 같이 무너질 것」이라 박아 뒀는데 실측은 반대다 — 한 줄 그림의 stress 는
   0.097 로 우리 그림(0.214)보다 **좋다**. 우리 뼈대가 거의 사슬이라 걸음 수가 줄 번호와
   같이 늘기 때문이다. 즉 **stress 만 봐도 이 그림을 좋다고 한다.**
   그러니 자는 「셋이 다 무너진다」를 걸면 안 된다. 걸어야 할 것은
   **「적어도 하나는 잡는다」와 「어느 자가 못 잡았는지 말한다」** 이다. */
if (!(flat.np < mine.np * 0.5)) {
  bad.push(`한 줄로 늘어놓아도 이웃 지킴이 ${flat.np.toFixed(3)} 이다 (우리 ${mine.np.toFixed(3)})`
    + ' — 이 그림을 잡는 자가 하나도 없다');
}
const blind = [];
if (flat.cross <= mine.cross) blind.push('얽힘');
if (flat.stress <= mine.stress) blind.push('stress');
console.log(`     → 이 그림을 **못 잡는 자: ${blind.length ? blind.join('·') : '없음'}**`
  + ` · 잡는 자: 이웃 지킴 (${(mine.np / flat.np).toFixed(1)}배 무너짐)`);
if (blind.length) console.log('     그래서 셋을 다 적는다 — 하나만 적으면 이 그림이 좋은 그림으로 지나간다.');

/* ④-나 **자리를 마구 섞으면** 셋이 다 나빠져야 한다 — 하나라도 안 나빠지면 그 자는 죽어 있다. */
let seed = 5;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const lo = [Math.min(...P.map((p) => p[0])), Math.min(...P.map((p) => p[1]))];
const hi = [Math.max(...P.map((p) => p[0])), Math.max(...P.map((p) => p[1]))];
const shuf = measure(P.map(() => [lo[0] + rnd() * (hi[0] - lo[0]), lo[1] + rnd() * (hi[1] - lo[1])]), E);
console.log(`  ④-나 자리를 마구 섞으면 — 얽힘 ${shuf.cross} · stress ${shuf.stress.toFixed(4)}`
  + ` · 이웃 지킴 ${shuf.np.toFixed(4)}`);
if (shuf.cross <= mine.cross + 10) bad.push(`자리를 마구 섞어도 얽힘이 ${shuf.cross} 이다 — 얽힘 자가 죽어 있다`);
if (!(shuf.stress > mine.stress * 1.5)) bad.push(`자리를 마구 섞어도 stress 가 ${shuf.stress.toFixed(3)} 이다 — stress 자가 죽어 있다`);
if (!(shuf.np < mine.np * 0.5)) bad.push(`자리를 마구 섞어도 이웃 지킴이 ${shuf.np.toFixed(3)} 이다 — 이웃 지킴 자가 죽어 있다`);

// ── ② 화면이 셋을 다 적나 ────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE) || !dr) {
  console.log('[skeleton-draw] playwright·번들·실린 값 중 없는 게 있다 — 화면 확인 건너뜀');
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
  const saysCross = new RegExp(`얽힘 ${dr.cross}`).test(text);
  const saysStress = text.includes(String(dr.stress));
  const saysNp = new RegExp(`이웃 지킴 ${Math.round((dr.np ?? 0) * 100)}%`).test(text);
  if (an?.used) {
    const saysMoved = new RegExp(`${Math.round(an.moved * 100)}%`).test(text) && /자리를 다시 잡/.test(text);
    console.log(`  ⑤ 화면이 「자리를 다시 잡았다」를 적나 — ${saysMoved ? '○' : '✗'}`);
    if (!saysMoved) bad.push('자리를 다시 잡아 놓고 화면이 안 적는다 — 뼈대와 뜻자리를 같은 지도로 읽게 된다');
  }
  console.log(`  ② 화면이 적나 — 얽힘 ${saysCross ? '○' : '✗'} · stress ${saysStress ? '○' : '✗'} · 이웃 지킴 ${saysNp ? '○' : '✗'}`);
  if (!saysCross || !saysStress || !saysNp) {
    bad.push('화면이 그림 자 셋을 다 안 적는다 — 하나만 적으면 나쁜 그림도 좋아 보인다');
  }
}

if (bad.length) {
  console.log('[skeleton-draw] **뼈대 그림을 자 하나로 판정하고 있다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 stressOf·neighborKeep·pickSkeletonParams 를 봐라.');
  process.exit(1);
}
console.log(`[skeleton-draw] 얽힘 ${mine.cross} · stress ${mine.stress.toFixed(3)} · 이웃 지킴 ${mine.np.toFixed(3)} — 셋을 재고 셋을 다 적는다`);
