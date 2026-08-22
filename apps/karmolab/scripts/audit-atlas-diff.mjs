#!/usr/bin/env node
/**
 * audit-atlas-diff — **밀도 차가 진짜 차이인가, 그냥 「어느 쪽이 많나」인가** (TASK-KAR-233).
 *
 * 갈래 색으로는 「어디에 무엇이 있나」까지만 보인다. 밀도 **차**는 그 다음을 묻는다:
 * 「블로그엔 썼는데 메모엔 없는 자리」(생각을 안 적어 둔 곳) · 「메모만 무성하고 글로는
 * 안 낸 자리」(안 꺼낸 것). 이 지도를 만든 이유에 가장 가까운 질문이다.
 *
 * ★ 여기서 틀리기 제일 쉬운 곳: **정규화를 안 하면** 블로그 374 vs 메모 1534 라 메모가
 * 모든 칸을 이긴다 — 그러면 그 그림은 밀도 차가 아니라 「어느 쪽이 더 많나」를 다시 그린 것이다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① **정규화한다** — 한쪽을 열 배로 불려도 판정이 안 뒤집힌다
 *  ② 화면이 「A 진한 칸 N · B 진한 칸 M · 반반 K」를 적는다
 *  ③ **눈금** — 지어낸 자료에서 A만 있는 칸은 A 색, 반반 칸은 중립
 *  ④ 한 무리를 딴 자리로 옮기면 그림이 따라 변한다
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
  console.log('[diff] 지도나 번들이 없다 — 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[diff] playwright 가 없다 — 검사 건너뜀');
  process.exit(0);
}

const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const bundle = fs.readFileSync(BUNDLE, 'utf8');
const bad = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

/** 지도를 하나 띄우고 「밀도 차」를 한 번 켠 뒤 값을 읽는다. */
async function run(mutate, clicks = 1) {
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
  await page.click('#host [data-more]');
  for (let i = 0; i < clicks; i += 1) { await page.click('#host [data-diff]'); await page.waitForTimeout(160); }
  const out = await page.evaluate(() => ({
    d: window.__atlasDiff,
    say: document.querySelector('#host .atlas-count')?.textContent || '',
  }));
  await page.close();
  return out;
}

// ── ②  있는 그대로 ───────────────────────────────────────────────────
const base = await run(null);
console.log(`  ② 「${base.d?.mode}」 → ${base.d?.a} 진한 칸 ${base.d?.aCells} · ${base.d?.b} ${base.d?.bCells} · 반반 ${base.d?.mixCells}`);
console.log(`     화면: 「${base.say.slice(0, 60)}」`);
if (!base.d) bad.push('밀도 차를 켜도 아무것도 안 나온다');
else {
  for (const n of [base.d.aCells, base.d.bCells, base.d.mixCells]) {
    if (!base.say.includes(String(n))) { bad.push('화면이 세 수를 다 안 적는다'); break; }
  }
  if (!base.d.aCells) bad.push(`${base.d.a} 쪽이 진한 칸이 하나도 없다 — 견줌이 한쪽으로 죽었다`);
}

// ── ① 정규화 — 한쪽을 열 배로 불려도 판정이 안 뒤집힌다 ──────────────
/* **같은 자리에** 복사해 넣는다. 밀도(자리별 비율)는 그대로여야 하므로 판정도 그대로여야 한다.
   정규화를 안 하면 불린 쪽이 모든 칸을 먹는다. */
const blown = await run((a) => {
  const blog = a.docs.filter((d) => d.lane === '블로그');
  for (let k = 0; k < 9; k += 1) for (const d of blog) a.docs.push({ ...d, id: `x${k}/${d.id}`, twin: null });
  a.count = a.docs.length; a.embedded = a.docs.length;
});
console.log(`  ① 블로그를 열 배로 → ${blown.d?.a} ${blown.d?.aCells} · ${blown.d?.b} ${blown.d?.bCells} (원래 ${base.d?.aCells} · ${base.d?.bCells})`);
if (!blown.d) bad.push('열 배로 불리니 밀도 차가 안 나온다');
else {
  const drift = Math.abs(blown.d.aCells - (base.d?.aCells ?? 0)) + Math.abs(blown.d.bCells - (base.d?.bCells ?? 0));
  if (drift > Math.max(6, (base.d?.aCells ?? 0) * 0.15)) {
    bad.push(`한쪽을 열 배로 불렸더니 판정이 ${drift}칸 달라졌다 — 무리 크기로 안 나누고 있다`);
  }
}

// ── ④ 한 무리를 딴 자리로 옮기면 그림이 변한다 ───────────────────────
const moved = await run((a) => {
  for (const d of a.docs) if (d.lane === '블로그' && d.xy) { d.xy = [0.9, 0.9]; }
});
console.log(`  ④ 블로그를 한 귀퉁이로 몰면 → ${moved.d?.a} ${moved.d?.aCells} · ${moved.d?.b} ${moved.d?.bCells}`);
if (!moved.d || moved.d.aCells === base.d?.aCells) {
  bad.push('한 무리를 통째로 옮겨도 그림이 그대로다 — 자리를 안 보고 있다');
}

// ── ③ 눈금 — A만 있는 칸은 A 색, 반반 칸은 중립 ─────────────────────
/* 지어낸 자료: A 는 절반이 왼쪽 위 · 절반이 가운데, B 는 절반이 오른쪽 아래 · 절반이 가운데.
   **가운데 칸은 두 무리에서 각각 절반씩**이라 정규화하면 정확히 반반이 된다.
   (처음엔 A 절반 vs B 전부를 같은 칸에 두고 「반반」이라 불렀는데, 그건 1:2 다 —
    자를 고치기 전에 **자가 쓰는 자료부터** 반반인지 봐야 했다.) */
const cal = await run((a) => {
  a.docs.forEach((d, i) => {
    const mine = i % 2 === 0;
    d.lane = mine ? '블로그' : '룰';
    const own = mine ? [-0.9, -0.9] : [0.9, 0.9];
    d.xy = (i % 4 < 2) ? own : [0, 0];
  });
});
console.log(`  ③ 눈금(A만 한 귀퉁이 · 나머지는 반반) → A ${cal.d?.aCells} · B ${cal.d?.bCells} · 반반 ${cal.d?.mixCells}`);
if (!cal.d || cal.d.aCells < 1) bad.push('A 만 있는 칸을 A 쪽으로 안 센다');
if (!cal.d || cal.d.mixCells < 1) bad.push('반반인 칸을 반반으로 안 센다');

await browser.close();

if (bad.length) {
  console.log('[diff] **밀도 차가 차이를 안 보여 준다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  무리 크기로 나누는지(정규화), 격자가 자리를 제대로 세는지 봐라.');
  process.exit(1);
}
console.log('[diff] 무리 크기로 나눠 견주고, 자리를 따라 변하고, 화면이 그 수를 적는다');
