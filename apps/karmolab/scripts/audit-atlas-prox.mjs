#!/usr/bin/env node
/**
 * audit-atlas-prox. **이 덩어리를 보고 새 글이 여기 속하는지 알아맞힐 수 있나** (TASK-KAR-233).
 *
 * ProxAnn(ACL 2025)의 결론: **응집도, NPMI, 순도 같은 자동 잣대는 쓸모와 상관이 약하다.**
 * 우리는 그런 잣대를 여덟 개 쌓아 놓고 지도를 **쓰는 방식**은 안 재고 있었다.
 * 규약: 무리마다 **대표 글 몇 편만** 보고 갈래를 잡고(① 갈래 정하기), **남겨 둔 글**에
 * 그걸 적용해 가려내고(② 맞음), 대표성 순으로 세워 모델 자신의 차례와 견준다(③ 차례).
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 대표 글은 **판단에서 뺀다**. 안 빼면 제가 만든 갈래로 저를 맞히는 순환이다
 *  ② **맞음** 정확도를 **찍기와 나란히** 싣는다
 *  ③ **차례**를 켄달 τ 로 싣는다
 *  ④ 배정을 마구 섞으면 둘 다 찍기로 떨어진다
 *  ⑤ 화면이 새 글이 여기 속하는지 알아맞힐 수 있는 정도로 적는다
 *
 * ★ 이 자는 실린 값을 **다시 못 잰다**. 지도 파일에 임베딩이 안 실려 있기 때문이다
 * (일부러 그렇다: 크기, 비공개). 대신 **셈 자체를 지어낸 자료로 눈금 맞추고**, 실린 값이
 * 스스로 어긋나지 않는지와 화면이 찍기를 같이 적는지를 건다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

import { untilSettled } from './lib/settle.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
const bad = [];
const REP = 5;

/* ── 굽는 쪽과 **같은 정의, 셈은 따로** ────────────────────────────────── */
function proxUse(assign, vecs, seed0 = 555) {
  const dim = vecs[0].length;
  const cos = (x, y) => { let s = 0; for (let i = 0; i < dim; i += 1) s += x[i] * y[i]; return s; };
  const unit = (v) => { let n = 0; for (const t of v) n += t * t; n = Math.sqrt(n) || 1; return v.map((t) => t / n); };
  const groups = new Map();
  assign.forEach((c, i) => {
    if (c == null) return;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(i);
  });
  let seed = seed0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const aucs = [];
  for (const [c, idx] of groups) {
    if (idx.length < REP + 3) continue;
    const center = unit(idx.reduce((a, i) => { for (let t = 0; t < dim; t += 1) a[t] += vecs[i][t]; return a; }, new Array(dim).fill(0)));
    const byCenter = idx.slice().sort((x, y) => cos(vecs[y], center) - cos(vecs[x], center));
    const reps = byCenter.slice(0, REP);
    const held = byCenter.slice(REP);
    if (held.length < 3) continue;
    const cat = unit(reps.reduce((a, i) => { for (let t = 0; t < dim; t += 1) a[t] += vecs[i][t]; return a; }, new Array(dim).fill(0)));
    const others = [];
    for (const [c2, idx2] of groups) if (c2 !== c) others.push(...idx2);
    if (others.length < held.length) continue;
    const negs = []; const taken = new Set();
    while (negs.length < held.length && taken.size < others.length) {
      const pick = others[Math.floor(rnd() * others.length)];
      if (taken.has(pick)) continue;
      taken.add(pick); negs.push(pick);
    }
    const pos = held.map((i) => cos(vecs[i], cat));
    const neg = negs.map((i) => cos(vecs[i], cat));
    let win = 0;
    for (const pv of pos) for (const nv of neg) win += pv > nv ? 1 : (pv === nv ? 0.5 : 0);
    aucs.push(win / (pos.length * neg.length));
  }
  if (!aucs.length) return null;
  return { groups: aucs.length, auc: aucs.reduce((a, b) => a + b, 0) / aucs.length };
}

// ── ④ 눈금 (지도가 없어도 돈다) ───────────────────────────────────────
{
  let seed = 17;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i += 1) s += rnd(); return s - 3; };
  const DIM = 24;
  const vecs = []; const assign = [];
  for (let c = 0; c < 5; c += 1) {
    const center = Array.from({ length: DIM }, () => gauss());
    for (let i = 0; i < 30; i += 1) {
      const v = center.map((t) => t + gauss() * 0.25);
      let n = 0; for (const t of v) n += t * t; n = Math.sqrt(n) || 1;
      vecs.push(v.map((t) => t / n)); assign.push(c);
    }
  }
  const good = proxUse(assign, vecs);
  const shuffled = assign.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
  }
  const rand = proxUse(shuffled, vecs);
  console.log(`  ④ 눈금. 또렷이 갈린 다섯: AUC ${good.auc.toFixed(3)}, 배정을 섞으면 ${rand.auc.toFixed(3)} (찍기 0.5)`);
  if (good.auc < 0.9) bad.push(`또렷이 갈린 자료에서도 AUC ${good.auc.toFixed(2)} 다. 셈이 틀렸다`);
  /* 섞은 배정은 찍기 **아래로** 조금 치우치는 게 정상이다. 대표 글을 한가운데에 가까운 것
     으로 고르므로 남겨 둔 글은 그 갈래에서 먼 쪽만 남기 때문. 지어낸 자료는 수가 적어
     그 치우침이 더 크다(실측 0.419, 진짜 지도는 1900편에 0.507~0.527). 그래서 0.15 로 둔다. */
  if (Math.abs(rand.auc - 0.5) > 0.15) bad.push(`배정을 마구 섞었는데 AUC ${rand.auc.toFixed(2)} 다 (찍기 0.5). 대표 글 고르기가 순환한다`);
}

// ── ①②③ 실린 값 ────────────────────────────────────────────────────
if (!fs.existsSync(ATLAS)) {
  console.log('[prox] 지도가 없다. 실린 값, 화면 확인 건너뜀');
} else {
  const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
  const px = atlas.prox;
  if (!px || !Array.isArray(px.rows) || !px.rows.length) {
    if (isFake(ATLAS)) console.log('[prox] 가짜 지도다. 써 보는 잣대는 진짜 굽기에서만 잰다');
    else bad.push('진짜 지도인데 **써 보는 잣대가 안 실려 있다** (prox). 나눔이 좋은가만 재고 있다');
  } else {
    for (const r of px.rows) {
      console.log(`  ① 층 ${r.k}. 대표 ${r.reps}편, 무리 ${r.groups}개, AUC ${r.auc}`
        + ` (섞으면 ${r.randAuc}), 차례 τ ${r.tau}, 가장 나쁜 무리 ${r.worst}`);
      if (r.reps !== REP) bad.push(`층 ${r.k} 의 대표 글 수가 ${r.reps} 다 (${REP} 여야 한다)`);
      if (!(r.auc >= 0 && r.auc <= 1)) bad.push(`층 ${r.k} 의 AUC 가 ${r.auc} 다`);
      if (!(r.worst <= r.auc + 1e-9)) bad.push(`층 ${r.k}. 가장 나쁜 무리(${r.worst})가 평균(${r.auc})보다 좋다`);
      if (typeof r.randAuc !== 'number') bad.push(`층 ${r.k}. 섞은 대조군이 없다 (찍기 옆에 놓을 것이 없다)`);
      else {
        if (Math.abs(r.randAuc - 0.5) > 0.1) bad.push(`층 ${r.k}. 배정을 섞었는데 AUC ${r.randAuc} 다 (찍기 0.5)`);
        if (!(r.auc > r.randAuc + 0.2)) {
          bad.push(`층 ${r.k}. 성한 배정(${r.auc})이 섞은 것(${r.randAuc})보다 별로 안 낫다`
            + '. 대표 글로는 새 글을 못 가린다');
        }
      }
      if (typeof r.tau !== 'number' || r.tau < -1 || r.tau > 1) bad.push(`층 ${r.k}. 차례 τ 가 ${r.tau} 다`);
    }

    // ⑤ 화면이 찍기와 함께 적나
    let chromium;
    try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
    if (!chromium || !fs.existsSync(BUNDLE)) {
      console.log('[prox] playwright, 번들 중 없는 게 있다. 화면 확인 건너뜀');
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
      await untilSettled(page, () => page.evaluate(() => JSON.stringify([window.__atlasScale, window.__atlasVisible, window.__atlasPlaced?.length, window.__atlasLabelBoxes?.length, document.querySelector('#host')?.textContent?.length])));
      const text = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
      await browser.close();
      const shownK = atlas.levels?.[0]?.k;
      const row = px.rows.find((r) => r.k === shownK);
      if (!row) bad.push(`화면이 보여 주는 층(${shownK})에 써 보는 잣대 줄이 없다`);
      else {
        const saysAuc = text.includes(`${Math.round(row.auc * 100)}% 를 가려낸다`);
        const saysChance = /찍기 50%/.test(text);
        const saysRand = text.includes(`${Math.round((row.randAuc ?? 0.5) * 100)}%`);
        /* **순환을 인정하는 한 줄**까지 건다. 판정자가 지도를 만든 그 셈이다. */
        const saysSelf = /판정자가 이 지도를 만든 그 셈/.test(text);
        console.log(`  ⑤ 화면. 가려낸 정도 ${saysAuc ? '○' : '✗'}, 찍기 ${saysChance ? '○' : '✗'}`
          + `, 섞은 값 ${saysRand ? '○' : '✗'}, 순환 밝힘 ${saysSelf ? '○' : '✗'}`);
        if (!saysAuc) bad.push('화면이 가려낸 정도를 안 적는다');
        if (!saysChance) bad.push('화면이 **찍기**를 안 적는다. 92% 만 보면 대단해 보인다');
        if (!saysRand) bad.push('화면이 섞은 대조군 값을 안 적는다');
        if (!saysSelf) bad.push('화면이 **판정자가 지도를 만든 그 셈이라는 것**을 안 밝힌다. 완전한 바깥인 척하게 된다');
      }
    }
  }
}

if (bad.length) {
  console.log('[prox] **써 보는 잣대가 서지 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 proxUse 를 봐라.');
  process.exit(1);
}
console.log('[prox] 대표 글 몇 편으로 갈래를 잡고 남겨 둔 글에 대 보며, 찍기와 섞은 값을 나란히 적는다');
