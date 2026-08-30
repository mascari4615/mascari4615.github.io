#!/usr/bin/env node
/**
 * audit-atlas-hops. **흔들림을 글이 아니라 그림으로 보여 주나** (TASK-KAR-233).
 *
 * 우리는 불확실성을 **문장으로만** 적어 왔다(바탕값, 찍기, 붓스트랩 띠, 섞은 대조군).
 * Hullman, Resnick, Adar(PLOS One 2015)의 답은 **분포에서 뽑은 판들을 그대로 보여 주라**다 . 
 * 오차막대, 바이올린보다 순서, 비교 판단이 정확해진다. 실무 값: **한 판 400ms** , 
 * **판 사이 부드러운 전환 없음**, 스무 판이면 8초에 한 바퀴.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 흔든 **스무 판을 그대로** 싣는다 (지금은 살아남은 비율만 실었다)
 *  ② **한 판 400ms**로 돌린다
 *  ③ **사람이 켜야** 돈다, 끄면 원래 그림
 *  ④ 판마다 마디 자리가 **실제로 달라진다**
 *  ⑤ 움직임을 싫어하는 설정이면 **작은 여러 판**으로 대신 보여 준다
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
const WANT_MS = 400;

if (!fs.existsSync(ATLAS) || !fs.existsSync(BUNDLE)) {
  console.log('[hops] 지도나 번들이 없다. 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const hops = atlas.skeleton?.hops;

// ── ①④ 실린 판 ──────────────────────────────────────────────────────
if (!Array.isArray(hops) || !hops.length) {
  if (isFake(ATLAS) || !atlas.skeleton) {
    console.log('[hops] 뼈대나 흔든 판이 없다. 가짜 지도이거나 아직 안 구웠다');
    process.exit(0);
  }
  console.log('[hops] **흔든 판이 안 실려 있다** (skeleton.hops). 흔들림을 글로만 적고 있다');
  process.exit(1);
}
const counts = hops.map((h) => (h.nodes || []).length);
console.log(`  ① 흔든 판 ${hops.length}개, 마디 ${counts.slice(0, 8).join(', ')} ...`
  + ` (진짜 그림은 ${atlas.skeleton.nodes.length})`);
const conf = atlas.skeleton.confidence;
if (conf && hops.length !== conf.runs) {
  bad.push(`판이 ${hops.length}개인데 살아남은 비율은 ${conf.runs}판에서 쟀다. 같은 흔들기여야 한다`);
}
if (hops.some((h) => !Array.isArray(h.nodes) || !Array.isArray(h.links))) bad.push('판 안에 마디나 이음이 없는 것이 있다');

/* ④ 판마다 **실제로 달라져야** 한다. 다 같으면 흔들지 않은 것이다. */
const sig = hops.map((h) => (h.nodes || []).map((n) => `${n[0]},${n[1]}`).join('|'));
const uniq = new Set(sig).size;
const spread = counts.length ? Math.max(...counts) - Math.min(...counts) : 0;
console.log(`  ④ 서로 다른 판 ${uniq}/${hops.length}, 마디 수 널뜀 ${spread}`);
if (uniq < hops.length * 0.8) bad.push(`판 ${hops.length}개 중 서로 다른 것이 ${uniq}개뿐이다. 흔들기가 안 흔들고 있다`);
/* 이음 목록이 마디 수 안에 있어야 한다. 없는 마디를 잇고 있으면 그림이 깨진다. */
let badLink = 0;
for (const h of hops) for (const [i, j] of h.links || []) if (i >= h.nodes.length || j >= h.nodes.length) badLink += 1;
if (badLink) bad.push(`없는 마디를 잇는 이음이 ${badLink}개 있다`);

// ── ②③⑤ 화면 ────────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium) {
  console.log('[hops] playwright 가 없다. 화면 확인 건너뜀');
} else {
  const bundle = fs.readFileSync(BUNDLE, 'utf8');
  const browser = await chromium.launch();

  async function open(reduce) {
    const ctx = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      reducedMotion: reduce ? 'reduce' : 'no-preference',
    });
    const page = await ctx.newPage();
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
    await page.waitForTimeout(150);
    return page;
  }

  const shot = (page) => page.evaluate(() => {
    const cv = document.querySelector('#host .atlas-canvas');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) ink += (d[i] + d[i + 1] + d[i + 2]) * (d[i + 3] / 255);
    return Math.round(ink / 1000);
  });

  /* ③ 사람이 켜야 돈다. 켜기 전엔 멈춰 있어야 한다. */
  const page = await open(false);
  const before = await page.evaluate(() => window.__atlasHops);
  console.log(`  ③ 켜기 전. 돌고 있나 ${before?.on ? '**돈다**' : '안 돈다'} (판 ${before?.frames}개)`);
  if (before?.on) bad.push('켜지도 않았는데 돌고 있다. 움직임은 사람이 켜야 한다');
  if (before?.ms !== WANT_MS) bad.push(`한 판 ${before?.ms}ms 다 (${WANT_MS}ms 여야 한다)`);

  await page.click('#host [data-hops]');
  await untilSettled(page, () => page.evaluate(() => JSON.stringify([window.__atlasScale, window.__atlasVisible, window.__atlasPlaced?.length, window.__atlasLabelBoxes?.length, document.querySelector('#host')?.textContent?.length])));
  const f0 = await page.evaluate(() => window.__atlasHops.frame);
  const ink0 = await shot(page);
  /* 재움-의도: 흐르는 판이 **쌓이라고** 두는 시간이다. 멎기를 기다리면 잴 것이 없어진다. */
  await page.waitForTimeout(WANT_MS * 3 + 120);
  const f1 = await page.evaluate(() => window.__atlasHops.frame);
  const ink1 = await shot(page);
  const steps = (f1 - f0 + hops.length) % hops.length;
  console.log(`  ② ${WANT_MS * 3}ms 동안 판이 ${steps}칸 넘어갔다 (3칸쯤이어야 한다), 그림 ${ink0}→${ink1}`);
  if (steps < 2 || steps > 5) bad.push(`${WANT_MS * 3}ms 에 ${steps}칸 넘어간다. 한 판 ${WANT_MS}ms 가 아니다`);
  if (ink0 === ink1) bad.push('판이 넘어갔는데 그림이 그대로다. 판을 안 그리고 있다');

  /* ③ 끄면 멈춘다. */
  await page.click('#host [data-hops]');
  const g0 = await page.evaluate(() => window.__atlasHops.frame);
  /* 재움-의도: 껐는데도 판이 느는지 보려고 **일부러 흘려보낸다.** */
  await page.waitForTimeout(WANT_MS * 3);
  const g1 = await page.evaluate(() => window.__atlasHops.frame);
  console.log(`  ③ 끄고 ${WANT_MS * 3}ms. 판 ${g0} → ${g1}`);
  if (g0 !== g1) bad.push('껐는데도 판이 계속 넘어간다');
  await page.close();

  /* ⑤ 움직임을 싫어하는 설정. 안 돌리고 늘어놓는다. */
  const quiet = await open(true);
  await quiet.click('#host [data-hops]');
  await untilSettled(quiet, () => quiet.evaluate(() => JSON.stringify([window.__atlasScale, window.__atlasVisible, window.__atlasPlaced?.length, window.__atlasLabelBoxes?.length, document.querySelector('#host')?.textContent?.length])));
  const q0 = await quiet.evaluate(() => window.__atlasHops);
  const qi0 = await shot(quiet);
  /* 재움-의도: 조용한 판에서도 판이 느는지 보려고 흘려보낸다. */
  await quiet.waitForTimeout(WANT_MS * 3);
  const q1 = await quiet.evaluate(() => window.__atlasHops.frame);
  const text = await quiet.evaluate(() => document.querySelector('#host')?.textContent || '');
  await quiet.close();
  console.log(`  ⑤ 움직임 줄이기. 알아챘나 ${q0?.reduced ? '○' : '✗'}, 판 ${q0?.frame} → ${q1}(안 넘어가야 함), 그림 ${qi0}`);
  if (!q0?.reduced) bad.push('움직임을 줄이는 설정을 못 알아챈다');
  if (q0?.frame !== q1) bad.push('움직임을 줄이라고 했는데도 돌린다');
  if (!(qi0 > 0)) bad.push('움직임을 줄이는 설정에서 아무것도 안 그린다. 늘어놓기라도 해야 한다');
  if (!/늘어놨/.test(text)) bad.push('늘어놓는다는 말을 화면이 안 한다');

  await browser.close();
}

if (bad.length) {
  console.log('[hops] **흔들림을 그림으로 못 보여 준다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 hopDraws, memo-atlas.ts 의 drawHops 를 봐라.');
  process.exit(1);
}
console.log(`[hops] 흔든 ${hops.length}판을 한 판 ${WANT_MS}ms 로 돌리고, 움직임을 줄이라면 늘어놓는다`);
