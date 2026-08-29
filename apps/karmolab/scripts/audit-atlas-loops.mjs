#!/usr/bin/env node
/**
 * audit-atlas-loops. **뼈대의 고리(H1)가 자료의 것인가** (TASK-KAR-233).
 *
 * 우리는 H0(조각)만 재 왔다. mapper 에서 진짜 자랑거리는 **고리**. 이 갈래로 나갔다가
 * 저 갈래로 돌아온다는 순환이다. 용수철 배치를 지속 호몰로지로 푸는 연구(arXiv 2208.06927)
 * 도 H1 을 찾아 강조하는 힘을 따로 건다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 고리 수를 **오일러**로 세고(이음 − 마디 + 조각) 각 고리를 **실제 마디 열**로 뽑는다
 *  ② 화면이 고리 N개, 가장 짧은 고리는 마디 몇 개를 적고, 켜면 굵게 그린다
 *  ③ **눈금을 바꿔도 사는지** 확인한다
 *  ④ 자. 지어낸 **원형**에서 고리 1개, **나무 모양**에서 0개
 *
 * ★ **재 보니 자랑거리가 아니었다.** 우리 뼈대의 고리는 9개인데 **자리를 마구 섞은 점이
 * 21개**를 낸다. 겹치는 구간으로 잇는 셈이라 아무 점 무더기에서도 고리가 난다.
 * 그래서 이 자는 고리가 있나가 아니라 **고리 수를 대조군과 나란히 적나**를 건다.
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

/* ── 굽는 쪽과 **같은 정의, 셈은 따로** ────────────────────────────────── */
function loopsOf(V, E) {
  const adj = Array.from({ length: V }, () => []);
  E.forEach(([i, j], e) => { adj[i].push([j, e]); adj[j].push([i, e]); });
  const seen = new Array(V).fill(false);
  let comps = 0;
  for (let s = 0; s < V; s += 1) {
    if (seen[s]) continue;
    comps += 1; seen[s] = true;
    const q = [s];
    for (let h = 0; h < q.length; h += 1) for (const [nx] of adj[q[h]]) if (!seen[nx]) { seen[nx] = true; q.push(nx); }
  }
  return { rank: E.length - V + comps, comps };
}

// ── ④ 눈금 (지도가 없어도 돈다) ───────────────────────────────────────
{
  const ring = [];
  for (let i = 0; i < 8; i += 1) ring.push([i, (i + 1) % 8]);
  const r1 = loopsOf(8, ring);
  const tree = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]];
  const r2 = loopsOf(7, tree);
  console.log(`  ④ 눈금. 원형 여덟: 고리 ${r1.rank}개, 나무 일곱: 고리 ${r2.rank}개`);
  if (r1.rank !== 1) bad.push(`원형에서 고리가 ${r1.rank}개다 (1개여야 한다)`);
  if (r2.rank !== 0) bad.push(`나무에서 고리가 ${r2.rank}개다 (0개여야 한다)`);
}

// ── ①②③ 실린 값과 화면 ──────────────────────────────────────────────
if (!fs.existsSync(ATLAS)) {
  console.log('[loops] 지도가 없다. 실린 값, 화면 확인 건너뜀');
} else {
  const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
  const sk = atlas.skeleton;
  const h1 = sk?.h1;
  if (!h1) {
    if (isFake(ATLAS) || !sk) console.log('[loops] 뼈대나 고리가 없다. 가짜 지도이거나 아직 안 구웠다');
    else bad.push('진짜 뼈대인데 **고리가 안 실려 있다** (skeleton.h1). H0 만 재고 H1 은 안 재고 있다');
  } else {
    const V = sk.nodes.length;
    const E = sk.links.map(([i, j]) => [i, j]);
    const mine = loopsOf(V, E);
    console.log(`  ① 다시 세면. 고리 ${mine.rank}개 (이음 ${E.length} − 마디 ${V} + 조각 ${mine.comps})`
      + `, 실린 값 ${h1.rank}개(조각 ${h1.comps})`);
    if (mine.rank !== h1.rank) bad.push(`실린 고리 수 ${h1.rank} 가 다시 세면 ${mine.rank} 이다`);
    if (mine.comps !== h1.comps) bad.push(`실린 조각 수 ${h1.comps} 가 다시 세면 ${mine.comps} 이다`);

    /* 뽑아 둔 고리가 **정말 닫힌 길**인가. 이어진 마디쌍이 다 이음 목록에 있어야 한다. */
    const has = new Set(E.map(([i, j]) => `${Math.min(i, j)}-${Math.max(i, j)}`));
    let broken = 0;
    for (const lp of h1.loops || []) {
      if (!Array.isArray(lp) || lp.length < 3) { broken += 1; continue; }
      for (let i = 0; i < lp.length; i += 1) {
        const a = lp[i]; const b = lp[(i + 1) % lp.length];
        if (a === b || !has.has(`${Math.min(a, b)}-${Math.max(a, b)}`)) { broken += 1; break; }
      }
    }
    console.log(`  ① 뽑아 둔 고리 ${(h1.loops || []).length}개 중 닫히지 않은 것 ${broken}개`
      + `, 가장 짧은 것 마디 ${h1.shortest}개`);
    if (broken) bad.push(`뽑아 둔 고리 ${broken}개가 실제로는 안 닫힌다. 없는 이음을 지나간다`);
    if ((h1.loops || []).length && h1.shortest !== h1.loops[0].length) {
      bad.push(`가장 짧은 고리 길이(${h1.shortest})가 목록과 다르다 (${h1.loops[0].length})`);
    }

    /* ★ **대조군**. 이게 이 자의 핵심이다. */
    if (!h1.rand || typeof h1.rand.rank !== 'number') {
      bad.push('마구 섞은 점의 고리 수가 안 실려 있다. 그것 없이 고리 N개는 아무 뜻이 없다');
    } else {
      console.log(`  ① 자리를 마구 섞으면 고리 ${h1.rand.rank}개 (마디 ${h1.rand.nodes}, 이음 ${h1.rand.links})`
        + ` → ${h1.rank > h1.rand.rank * 1.5 ? '우리 쪽이 뚜렷이 많다' : '**아무 점 무더기에서도 이만큼 난다**'}`);
    }

    /* ③ 눈금을 바꿔도 고리가 있나. */
    const lb = sk.tower?.loopByBins;
    if (!Array.isArray(lb) || !lb.length) bad.push('눈금마다 고리 수가 안 실려 있다 (tower.loopByBins)');
    else {
      const withLoops = lb.filter((c) => c.loops > 0).length;
      console.log(`  ③ 눈금마다 고리. ${lb.map((c) => `${c.bins}:${c.loops}`).join(' ')} (있는 눈금 ${withLoops}/${lb.length})`);
      if (lb.some((c) => typeof c.loops !== 'number' || c.loops < 0)) bad.push('눈금마다 고리 수에 이상한 값이 있다');
    }

    // ② 화면
    let chromium;
    try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
    if (!chromium || !fs.existsSync(BUNDLE)) {
      console.log('[loops] playwright, 번들 중 없는 게 있다. 화면 확인 건너뜀');
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
      await page.click('#host [data-more]');
      await page.click('#host [data-layout="skeleton"]');
      await untilSettled(page, () => page.evaluate(() => JSON.stringify([window.__atlasScale, window.__atlasVisible, window.__atlasPlaced?.length, window.__atlasLabelBoxes?.length, document.querySelector('#host')?.textContent?.length])));
      const text = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
      const saysN = text.includes(`${h1.rank}개`) && text.includes(`마디 ${h1.shortest}개를 돈다`);
      const saysRand = h1.rand ? text.includes(`${h1.rand.rank}개`) : true;
      console.log(`  ② 화면이 적나. 고리 수, 가장 짧은 것 ${saysN ? '○' : '✗'}, 마구 섞은 점의 고리 수 ${saysRand ? '○' : '✗'}`);
      if (!saysN) bad.push('화면이 고리 N개, 가장 짧은 것은 마디 몇 개를 안 적는다');
      if (!saysRand) bad.push('화면이 **마구 섞은 점의 고리 수**를 안 적는다. 고리가 있다가 발견처럼 읽힌다');

      /* 켜면 실제로 그리나. 화면 픽셀이 아니라 그린 개수를 낸다. */
      await page.click('#host [data-loop]');
      await untilSettled(page, () => page.evaluate(() => JSON.stringify([window.__atlasScale, window.__atlasVisible, window.__atlasPlaced?.length, window.__atlasLabelBoxes?.length, document.querySelector('#host')?.textContent?.length])));
      const drawn = await page.evaluate(() => window.__atlasLoopsDrawn);
      console.log(`  ② 켜면 그리나. 굵게 그린 고리 ${drawn}개`);
      if (!(drawn > 0)) bad.push('고리를 켰는데 아무것도 안 그린다');
      await browser.close();
    }
  }
}

if (bad.length) {
  console.log('[loops] **고리를 제대로 세지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 loopsOf, memo-atlas.ts 의 drawSkeleton 을 봐라.');
  process.exit(1);
}
console.log('[loops] 오일러로 세고, 닫힌 길로 뽑고, 마구 섞은 점의 고리 수를 나란히 적는다');
