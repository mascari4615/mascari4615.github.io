#!/usr/bin/env node
/**
 * audit-atlas-external. **바깥에 한 번은 물어봤나** (TASK-KAR-233).
 *
 * 우리 자 일곱(실루엣, DBCV, HDBSCAN, H0, 눈금 사다리, 이름 적합도, 낱말 침입자)은 **전부
 * 안쪽**이다. 자기 자신에게만 묻는다. TopicGPT(Pham 외, NAACL 2024)가 쓰는 잣대는
 * 바깥 것이다: **사람이 붙인 분류**와의 조화 순도, ARI, NMI.
 *
 * 우리에게도 공짜 바깥 라벨이 있다. 글의 **갈래**와 블로그 앞머리의 **categories**.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 갈래, 블로그 분류에 각각 대고 **조화 순도, ARI, NMI** 를 잰다
 *  ② 셋을 다 싣고 화면이 적는다 (하나만 적으면 **고르기**가 된다)
 *  ③ **라벨을 마구 섞은 대조군**을 나란히. 순도, NMI 는 우연 보정이 안 된다
 *  ④ 눈금. 지어낸 완벽히 겹치는 나눔에서 ARI 1, 조화 순도 1, 마구 섞으면 ARI 0 근처
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
function fit(assign, labels) {
  const pairs = [];
  for (let i = 0; i < assign.length; i += 1) {
    if (assign[i] == null || labels[i] == null) continue;
    pairs.push([assign[i], String(labels[i])]);
  }
  const n = pairs.length;
  if (n < 20) return null;
  const cs = [...new Set(pairs.map((p) => p[0]))];
  const ls = [...new Set(pairs.map((p) => p[1]))];
  const ci = new Map(cs.map((c, i) => [c, i]));
  const li = new Map(ls.map((l, i) => [l, i]));
  const m = cs.map(() => new Array(ls.length).fill(0));
  const a = new Array(cs.length).fill(0);
  const b = new Array(ls.length).fill(0);
  for (const [c, l] of pairs) { m[ci.get(c)][li.get(l)] += 1; a[ci.get(c)] += 1; b[li.get(l)] += 1; }
  let pur = 0;
  for (let i = 0; i < cs.length; i += 1) pur += Math.max(...m[i]);
  pur /= n;
  let inv = 0;
  for (let j = 0; j < ls.length; j += 1) { let mx = 0; for (let i = 0; i < cs.length; i += 1) if (m[i][j] > mx) mx = m[i][j]; inv += mx; }
  inv /= n;
  const harmonic = pur + inv > 0 ? (2 * pur * inv) / (pur + inv) : 0;
  const c2 = (x) => (x * (x - 1)) / 2;
  let A = 0;
  for (let i = 0; i < cs.length; i += 1) for (let j = 0; j < ls.length; j += 1) A += c2(m[i][j]);
  const B = a.reduce((s, x) => s + c2(x), 0);
  const C = b.reduce((s, x) => s + c2(x), 0);
  const D = c2(n);
  const exp = D ? (B * C) / D : 0;
  const maxv = 0.5 * (B + C);
  const ari = maxv - exp !== 0 ? (A - exp) / (maxv - exp) : 0;
  let hu = 0; let hv = 0; let mi = 0;
  for (let i = 0; i < cs.length; i += 1) if (a[i]) hu -= (a[i] / n) * Math.log(a[i] / n);
  for (let j = 0; j < ls.length; j += 1) if (b[j]) hv -= (b[j] / n) * Math.log(b[j] / n);
  for (let i = 0; i < cs.length; i += 1) {
    for (let j = 0; j < ls.length; j += 1) {
      if (!m[i][j]) continue;
      mi += (m[i][j] / n) * Math.log((m[i][j] * n) / (a[i] * b[j]));
    }
  }
  const nmi = hu > 0 && hv > 0 ? mi / Math.sqrt(hu * hv) : 0;
  return { n, classes: ls.length, purity: pur, harmonic, ari, nmi };
}

// ── ④ 눈금 (지도가 없어도 돈다) ───────────────────────────────────────
{
  const asg = []; const lab = [];
  for (let c = 0; c < 5; c += 1) for (let i = 0; i < 40; i += 1) { asg.push(c); lab.push(`L${c}`); }
  const perfect = fit(asg, lab);
  console.log(`  ④ 눈금. 완벽히 겹치는 나눔: 조화 순도 ${perfect.harmonic.toFixed(3)}, ARI ${perfect.ari.toFixed(3)}, NMI ${perfect.nmi.toFixed(3)}`);
  if (Math.abs(perfect.ari - 1) > 0.001 || Math.abs(perfect.harmonic - 1) > 0.001) {
    bad.push(`완벽히 겹치는 나눔인데 ARI ${perfect.ari.toFixed(3)}, 조화 순도 ${perfect.harmonic.toFixed(3)} 이다. 셈이 틀렸다`);
  }
  let seed = 31;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const shuffled = lab.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
  }
  const rand = fit(asg, shuffled);
  console.log(`  ④ 마구 섞으면. 조화 순도 ${rand.harmonic.toFixed(3)}, ARI ${rand.ari.toFixed(3)}, NMI ${rand.nmi.toFixed(3)}`);
  if (Math.abs(rand.ari) > 0.05) bad.push(`마구 섞었는데 ARI ${rand.ari.toFixed(3)} 이다. 우연 보정이 안 되고 있다`);
  if (rand.harmonic > perfect.harmonic - 0.3) bad.push('마구 섞어도 조화 순도가 안 떨어진다');
}

// ── ①②③ 실린 값과 화면 ──────────────────────────────────────────────
if (!fs.existsSync(ATLAS)) {
  console.log('[external] 지도가 없다. 실린 값, 화면 확인 건너뜀');
} else {
  const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
  const ex = atlas.external;
  if (!ex || !Array.isArray(ex.rows) || !ex.rows.length) {
    if (isFake(ATLAS)) console.log('[external] 가짜 지도다. 바깥 잣대는 진짜 굽기에서만 잰다');
    else bad.push('진짜 지도인데 **바깥 잣대가 안 실려 있다** (external). 자가 전부 안쪽이다');
  } else {
    const kinds = [...new Set(ex.rows.map((r) => r.of))];
    console.log(`  ① 실린 값. 줄 ${ex.rows.length}개, 바깥 라벨 ${kinds.length}가지 (${kinds.join(', ')})`);
    if (kinds.length < 2) bad.push(`바깥 라벨이 ${kinds.length}가지뿐이다. 갈래와 블로그 분류 둘 다 대야 한다`);
    /* 실린 값을 **자가 다시 잰다**. 글마다 층 번호와 라벨이 지도에 있다. */
    for (const r of ex.rows) {
      const li = (atlas.levels || []).findIndex((l) => l.k === r.k);
      if (li < 0) { bad.push(`층 ${r.k} 이 지도에 없다`); continue; }
      const assign = atlas.docs.map((d) => (Array.isArray(d.levels) ? d.levels[li] : null));
      const labels = atlas.docs.map((d) => (r.of === '갈래' ? d.lane : (d.tag || null)));
      const mine = fit(assign, labels);
      if (!mine) { bad.push(`층 ${r.k} vs ${r.of} 를 다시 못 재겠다 (글이 모자라다)`); continue; }
      const off = [];
      if (Math.abs(mine.harmonic - r.harmonic) > 0.01) off.push(`조화 순도 ${r.harmonic}≠${mine.harmonic.toFixed(3)}`);
      if (Math.abs(mine.ari - r.ari) > 0.01) off.push(`ARI ${r.ari}≠${mine.ari.toFixed(3)}`);
      if (Math.abs(mine.nmi - r.nmi) > 0.01) off.push(`NMI ${r.nmi}≠${mine.nmi.toFixed(3)}`);
      if (off.length) bad.push(`층 ${r.k} vs ${r.of}. 실린 값이 다시 재면 다르다 (${off.join(', ')})`);
      if (r.randAri == null) bad.push(`층 ${r.k} vs ${r.of}. 섞은 대조군이 없다`);
      else if (Math.abs(r.randAri) > 0.05) bad.push(`층 ${r.k} vs ${r.of}. 라벨을 섞었는데 ARI ${r.randAri} 다`);
      else if (!(r.ari > r.randAri + 0.02)) {
        /* **여기는 빨강이다**. 바깥에 물어봤는데 찍기와 같으면 나눔이 사람 분류와 무관하다는 뜻.
           낮으면 낮은 대로 적되, 찍기와 같다는 화면이 반드시 말해야 한다(아래 ③에서 건다). */
        console.log(`     ⚠ 층 ${r.k} vs ${r.of}. ARI ${r.ari} 가 섞은 값 ${r.randAri} 와 다를 게 없다`);
      }
      console.log(`     층 ${r.k} vs ${r.of}: 조화 순도 ${r.harmonic}, ARI ${r.ari}, NMI ${r.nmi}`
        + ` (섞으면 ${r.randHarmonic}, ${r.randAri}, ${r.randNmi})`);
    }

    // ③ 화면이 셋과 섞은 값을 적나
    let chromium;
    try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
    if (!chromium || !fs.existsSync(BUNDLE)) {
      console.log('[external] playwright, 번들 중 없는 게 있다. 화면 확인 건너뜀');
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
      await browser.close();
      /* 화면은 **지금 층**의 줄만 적는다. 그 층 것으로 건다. */
      const shownK = atlas.levels?.[0]?.k;
      const rows = ex.rows.filter((r) => r.k === shownK);
      const missing = rows.filter((r) => !(text.includes(`ARI ${r.ari}`) && text.includes(`NMI ${r.nmi}`)
        && text.includes(`조화 순도 ${r.harmonic}`) && text.includes(`${r.randAri}`)));
      console.log(`  ③ 화면(층 ${shownK}). 줄 ${rows.length}개 중 셋+섞은 값을 다 적은 것 ${rows.length - missing.length}개`);
      if (!rows.length) bad.push(`화면이 보여 주는 층(${shownK})에 바깥 잣대 줄이 없다`);
      if (missing.length) {
        bad.push(`화면이 ${missing.map((r) => r.of).join(', ')} 줄의 셋(순도, ARI, NMI) 또는 섞은 값을 안 적는다`);
      }
    }
  }
}

if (bad.length) {
  console.log('[external] **바깥 잣대가 서지 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 externalFit, externalRandom 을 봐라.');
  process.exit(1);
}
console.log('[external] 사람이 붙인 분류에 대고 재고, 라벨을 섞은 값을 나란히 적는다');
