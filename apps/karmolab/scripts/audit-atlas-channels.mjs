#!/usr/bin/env node
/**
 * audit-atlas-channels — **채널 예산: 색·모양이 감당할 가짓수를 넘었나** (TASK-KAR-233).
 *
 * 시각 채널에는 순위와 **한계**가 있다(Munzner 의 구별 가능성 원칙): 종류를 나르는 채널
 * (색상·모양)은 감당할 단계 수가 정해져 있고, 자료의 가짓수가 그걸 넘으면 **다른 것이 같아 보인다.**
 *
 * 우리 색은 여덟(Wong)인데 갈래는 **열**이다 → 두 갈래가 나머지 연산으로 남과 같은 색이 된다.
 * 그래도 **(색, 모양) 짝**이 모두 다르면 둘을 같이 보고 가를 수 있다 — 그게 채널을 둘 쓰는 이유다.
 * 그러니 재는 것은 「색이 겹치나」가 아니라 **「짝까지 겹치나」**이고, 색만으로 안 갈리면
 * 화면이 그렇게 말해야 한다(모르면 색만 보고 같은 갈래로 읽는다).
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 채널마다 단계 수를 싣는다 (색·갈래·짝)
 *  ② 색만으로 겹치면 화면이 그렇게 **적는다**
 *  ③ **(색, 모양) 짝은 모두 달라야 한다** — 겹치면 빨갛다
 *  ④ 갈래를 늘려 짝이 겹치게 만들면 빨개진다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
if (!fs.existsSync(ATLAS) || !fs.existsSync(BUNDLE)) {
  console.log('[channels] 지도나 번들이 없다 — 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[channels] playwright 가 없다 — 검사 건너뜀');
  process.exit(0);
}

const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const bundle = fs.readFileSync(BUNDLE, 'utf8');
const bad = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

async function look(mutate) {
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
  await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), { timeout: 30000 });
  await page.click('#host [data-layout="lane"]');
  await page.waitForTimeout(200);
  const out = await page.evaluate(() => ({
    budget: window.__atlasBudget,
    howto: document.querySelector('#host .atlas-howto')?.textContent || '',
    channels: window.__atlasChannels || [],
  }));
  await page.close();
  return out;
}

const now = await look(null);
if (!now.budget) {
  console.log('[channels] **채널 예산이 안 실려 있다** (__atlasBudget)');
  await browser.close();
  process.exit(1);
}
const b = now.budget;
console.log(`  ① 갈래 ${b.groups}가지 · 색 ${b.hues}가지 · 색만으로 겹치는 것 ${b.hueClash} · (색,모양) 짝이 겹치는 것 ${b.pairClash}`);

// ② 색만으로 겹치면 화면이 말하나
const saysClash = /색 겹침|같은 색/.test(now.howto);
console.log(`  ② 화면이 그 사실을 적나 — ${saysClash ? '적는다' : '**안 적는다**'}`);
if (b.hueClash > 0 && !saysClash) bad.push('색만으로 겹치는데 화면이 아무 말도 안 한다 — 사람은 색만 보고 같은 갈래로 읽는다');
if (b.hueClash === 0 && saysClash) bad.push('안 겹치는데 겹친다고 적는다');

// ③ (색, 모양) 짝은 모두 달라야 한다
if (b.pairClash > 0) {
  bad.push(`(색,모양) 짝이 ${b.pairClash}가지 겹친다 — 색도 모양도 같으면 가를 길이 없다`);
}

// ④ 갈래를 늘려 짝이 겹치게 만들면 빨개지나 (자가 진짜 무는지)
const more = await look((a) => {
  /* 갈래를 스물로 늘린다 — 색 여덟·모양 예닐곱이라 짝이 반드시 겹친다.
     이름은 지금 갈래에서 파생시킨다(박아 두지 않는다). */
  const base = a.lanes.slice();
  while (a.lanes.length < 20) a.lanes.push(`${base[a.lanes.length % base.length]}-${a.lanes.length}`);
});
console.log(`  ④ 갈래를 ${more.budget?.groups}가지로 늘리면 — 색 겹침 ${more.budget?.hueClash} · 짝 겹침 ${more.budget?.pairClash}`);
if (!more.budget || more.budget.pairClash === 0) {
  bad.push('갈래를 스물로 늘려도 짝이 안 겹친다고 한다 — 이 자는 채널을 안 세고 있다');
}

await browser.close();

if (bad.length) {
  console.log('[channels] **채널이 감당할 가짓수를 넘었는데 말이 없다**');
  for (const x of bad) console.log('  - ' + x);
  console.log('  색 목록(CLUSTER_COLORS)·모양 표(LANE_SHAPE)·읽는 법 띠를 봐라.');
  process.exit(1);
}
console.log(`[channels] 색 ${b.hues}가지로 갈래 ${b.groups}가지를 나르되, 겹치는 건 말하고 모양으로 가른다`);
