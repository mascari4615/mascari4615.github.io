#!/usr/bin/env node
/**
 * audit-atlas-trail. **궤적이 흐름인가, 튀는 점인가** (TASK-KAR-233).
 *
 * 시간 지도의 근본 문제는 때마다 공간이 달라진다인데 우리는 그걸 안 겪는다 . 
 * 한 판에 한 번 임베딩하고 판이 바뀌면 지난 그림에 포갠다(어긋남 0.000). 기준틀이
 * 하나라, 시간은 다시 그릴 일이 아니라 **얹을 일**이다: 달마다 무게중심을 찍어 잇는다.
 *
 * ★ 여기서 틀리기 제일 쉬운 곳: **글이 적은 달**. 무게중심은 표본이 적으면 튄다.
 * 처음엔 흩어진 정도만 보고 걸렀더니 **글 한 편짜리 달이 오차 0 으로 나와** 가장 못 믿을
 * 점이 가장 확실한 점으로 찍혔다(열한 달). 오차 0 이 아니라 **모름**이다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 달마다 점을 찍고 잇는다
 *  ② **글이 적은 달은 안 찍고 그렇게 말한다**. 찍힌 달은 전부 글 셋 이상이다
 *  ③ 총 이동거리를 **지도 폭 대비 %** 로 적는다
 *  ④ 한 달의 글을 딴 자리로 옮기면 그 달 점이 따라 움직인다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

import { untilSettled } from './lib/settle.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
if (!fs.existsSync(ATLAS) || !fs.existsSync(BUNDLE)) {
  console.log('[trail] 지도나 번들이 없다. 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[trail] playwright 가 없다. 검사 건너뜀');
  process.exit(0);
}

const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const bundle = fs.readFileSync(BUNDLE, 'utf8');
const bad = [];
const MIN_DOCS = 3;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

async function run(mutate) {
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
  await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), undefined, { timeout: 30000 });
  await page.click('#host [data-more]');
  await page.click('#host [data-trail]');
  await untilSettled(page, () => page.evaluate(() => JSON.stringify([window.__atlasScale, window.__atlasVisible, window.__atlasPlaced?.length, window.__atlasLabelBoxes?.length, document.querySelector('#host')?.textContent?.length])));
  const out = await page.evaluate(() => ({
    t: window.__atlasTrail,
    say: document.querySelector('#host .atlas-count')?.textContent || '',
  }));
  await page.close();
  return out;
}

const base = await run(null);
if (!base.t) {
  console.log('[trail] 궤적을 켜도 아무것도 안 나온다');
  await browser.close();
  process.exit(1);
}
console.log(`  ①③ 달 ${base.t.months}개를 이었다, 못 찍은 달 ${base.t.skipped}개, 이동 ${(base.t.moved * 100).toFixed(0)}% (지도 폭 대비)`);
console.log(`     ${base.t.at.join(' → ')}`);
console.log(`     화면: ${base.say.slice(0, 70)}`);
if (base.t.months < 2) bad.push('이을 달이 둘도 안 된다');
if (!base.say.includes(String(base.t.months))) bad.push('화면이 이은 달 수를 안 적는다');
if (!base.say.includes(String(base.t.skipped))) bad.push('화면이 **못 찍은 달**을 안 적는다. 조용히 빼면 없는 흐름이 보인다');
if (!/%/.test(base.say)) bad.push('화면이 이동거리를 % 로 안 적는다');

// ── ② 찍힌 달은 전부 글 셋 이상인가 ──────────────────────────────────
const byMonth = new Map();
for (const d of atlas.docs) {
  if (!d.born || !d.xy) continue;
  byMonth.set(d.born, (byMonth.get(d.born) || 0) + 1);
}
const thin = base.t.at.filter((m) => (byMonth.get(m) || 0) < MIN_DOCS);
console.log(`  ② 찍힌 달의 글 수: ${base.t.at.map((m) => `${m}:${byMonth.get(m) || 0}`).join(' ')}`);
if (thin.length) {
  bad.push(`글이 ${MIN_DOCS}편도 안 되는 달을 찍었다: ${thin.join(', ')}. 그 무게중심은 글 한 편의 자리다`);
}

// ── ④ 한 달의 글을 옮기면 그 달 점이 따라 움직인다 ───────────────────
const target = base.t.at[Math.floor(base.t.at.length / 2)];
const moved = await run((a) => {
  for (const d of a.docs) if (d.born === target && d.xy) d.xy = [0.95, 0.95];
});
const sameLen = moved.t && moved.t.months === base.t.months;
console.log(`  ④ ${target} 글을 한 귀퉁이로 → 이동 ${(base.t.moved * 100).toFixed(0)}% → ${moved.t ? (moved.t.moved * 100).toFixed(0) : '?'}%`);
if (!moved.t || Math.abs(moved.t.moved - base.t.moved) < 0.05) {
  bad.push('한 달을 통째로 옮겨도 궤적이 그대로다. 자리를 안 보고 있다');
}
if (!sameLen) console.log('     (그 달이 옮겨지며 찍힌 달 수도 달라졌다. 흩어짐이 바뀌니 그럴 수 있다)');

await browser.close();

if (bad.length) {
  console.log('[trail] **궤적이 흐름을 안 보여 준다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  달마다 몇 편인지, 평균의 오차를 어떻게 재는지 봐라 (글 한 편은 오차 0 이 아니라 모름이다).');
  process.exit(1);
}
console.log('[trail] 믿을 만한 달만 잇고, 못 찍은 달을 말하고, 움직인 만큼을 수로 적는다');
