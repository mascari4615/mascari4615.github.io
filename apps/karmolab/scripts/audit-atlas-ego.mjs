#!/usr/bin/env node
/**
 * audit-atlas-ego. **이 글 둘레가 둘레인가, 그냥 통짜인가** (TASK-KAR-233).
 *
 * 옵시디언은 그래프를 둘로 나눈다: 통짜와 **이 글 둘레**(깊이 N). 사람들이 공통으로
 * 말하는 게 있다. **글이 늘면 통짜 그래프는 못 쓰게 된다.** 우리도 1908편이 됐다.
 *
 * 우리에겐 옵시디언에 없는 게 있다: 이웃이 **두 종류**다. 내가 적어 둔 **링크**와
 * 뜻으로 가까운 **닮은 글**. 둘 다 걸어가되 **갈라서 센다**.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 깊이 1, 2, 3 에서 남는 점 수가 **단조로 늘고** 화면에 적힌다
 *  ② 깊이 2 에서 남는 점이 전체의 **20% 미만** (그 위면 둘레가 아니라 통짜다)
 *  ③ 고른 글이 없으면 렌즈는 **꺼져 있다**(그리고 그렇게 말한다)
 *  ④ **링크 이웃과 닮은 글 이웃을 갈라서** 센다
 *
 * ⚠ 시작점 하나로 재면 그 글 사정을 재는 것이다. **여러 글에서 시작해** 최악을 본다.
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
  console.log('[ego] 지도나 번들이 없다. 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[ego] playwright 가 없다. 검사 건너뜀');
  process.exit(0);
}

const WIDE_AT = 0.20;          // 깊이 2 가 이보다 넓으면 둘레가 아니다
const atlasText = fs.readFileSync(ATLAS, 'utf8');
const atlas = JSON.parse(atlasText);
const bundle = fs.readFileSync(BUNDLE, 'utf8');
const total = atlas.docs.length;
const bad = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
await page.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.endsWith('/data/memo-atlas.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: atlasText });
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

// ── ③ 고른 글이 없으면 꺼져 있다 ─────────────────────────────────────
await page.click('#host [data-ego]');
await untilSettled(page, () => page.evaluate(() => window.__atlasEgo ?? null));
const none = await page.evaluate(() => ({
  ego: window.__atlasEgo,
  say: document.querySelector('#host .atlas-count')?.textContent || '',
}));
console.log(`  ③ 고른 글 없이 켜면 → ${none.ego ? '**둘레가 잡힌다**' : '안 잡힌다'}, 화면: ${none.say.slice(0, 40)}`);
if (none.ego) bad.push('고른 글이 없는데 둘레가 잡힌다. 무엇의 둘레인지 알 수 없다');
if (!/고른|누르|Enter/.test(none.say)) bad.push('고른 글이 없을 때 화면이 그 사실을 말하지 않는다');
/* 껐다. 다시 0 으로 돌린다(3번 더 누르면 한 바퀴) */
for (let i = 0; i < 3; i += 1) { await page.click('#host [data-ego]'); await page.waitForTimeout(60); }

// ── ①②④ 여러 글에서 시작해 재 본다 ────────────────────────────────
/* 시작점은 지도에서 고르게 뽑는다. 손으로 박으면 글이 바뀌는 날 검사가 거짓으로 빨개진다. */
const step = Math.max(1, Math.floor(total / 6));
const starts = atlas.docs.filter((d, i) => i % step === 0 && Array.isArray(d.near) && d.near.length).slice(0, 6);
let worstD2 = 0;
for (const d of starts) {
  const rows = await page.evaluate(async ({ id }) => {
    const box = document.querySelector('#host [data-ego]');
    /* 글 고르기 = 낭독기 표의 단추가 아니라 **실제 고름**이 필요하다. 창구로 고른다. */
    window.__atlasPick?.(id);
    const out = [];
    for (let k = 1; k <= 3; k += 1) {
      box.click();
      await new Promise((r) => setTimeout(r, 120));
      out.push({ ...window.__atlasEgo, say: document.querySelector('#host .atlas-count')?.textContent || '' });
    }
    box.click();                        // 한 바퀴 돌려 끈다
    await new Promise((r) => setTimeout(r, 60));
    return out;
  }, { id: d.id });
  if (!rows[0] || rows.some((r) => !r || r.kept == null)) {
    bad.push(`${String(d.title).slice(0, 20)}에서 둘레를 못 잡았다`);
    continue;
  }
  const [a, b, c] = rows;
  const pct = (n) => `${((n / total) * 100).toFixed(1)}%`;
  console.log(`  ①② ${String(d.title).slice(0, 22)} → 1칸 ${a.kept}(${pct(a.kept)}), 2칸 ${b.kept}(${pct(b.kept)}), 3칸 ${c.kept}(${pct(c.kept)})`
    + `, 갈라 세기 2칸: 링크 ${b.byLink}, 닮은 글 ${b.byNear}`);
  if (!(a.kept < b.kept && b.kept < c.kept)) bad.push(`${String(d.title).slice(0, 18)}에서 깊이를 늘려도 안 늘어난다 (${a.kept}, ${b.kept}, ${c.kept})`);
  if (!a.say.includes(String(a.kept))) bad.push('화면이 남는 글 수를 안 적는다');
  if (b.byLink == null || b.byNear == null) bad.push('링크 이웃과 닮은 글 이웃을 안 가른다');
  worstD2 = Math.max(worstD2, b.kept / total);
}
console.log(`  ② 깊이 2 가 가장 넓었던 글 = 전체의 ${(worstD2 * 100).toFixed(1)}% (문턱 ${(WIDE_AT * 100).toFixed(0)}%)`);
if (worstD2 >= WIDE_AT) bad.push(`깊이 2 가 전체의 ${(worstD2 * 100).toFixed(1)}% 를 남긴다. 둘레가 아니라 통짜다`);

await browser.close();

if (bad.length) {
  console.log('[ego] **둘레가 둘레 노릇을 못 한다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  이웃 걷기(링크 + 닮은 글)나 깊이 손잡이를 봐라.');
  process.exit(1);
}
console.log('[ego] 고른 글에서 깊이만큼만 남고, 링크와 닮은 글을 갈라서 센다');
