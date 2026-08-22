#!/usr/bin/env node
/**
 * audit-atlas-revisit — **이 지도를 실제로 쓰게 되나** (TASK-KAR-233).
 *
 * 개인 정보관리 쪽 고전(Barreau & Nardi, SIGCHI Bulletin 1995)은 냉정하다 — 정보는 셋이고
 * (덧없는 것 · 일하는 것 · **묵힌 것**), **묵힌 것은 거의 안 본다.** 사람들은 **자리로 찾고
 * 검색은 최후 수단**이며, 자리의 진짜 기능은 검색이 아니라 **일깨움**이다. 그리고 결정적으로
 * **정교한 분류 체계는 번번이 버려졌다.**
 *
 * 우리 지도가 정확히 「묵힌 것을 위한 정교한 분류 체계」다. 그래서 **git 을 정답으로** 재 봤다 —
 * **다시 손댄 글**이 곧 「사용자가 실제로 돌아온 글」이다.
 *
 * ★ **결과도 냉정했다.**
 *  · 2019~2025년 글의 다시 손댄 비율이 **전부 0%**. 2026년만 54%. **묵힌 것은 정말 안 본다**
 *  · 「곧 다시 손댈 글」을 **앞 시기 정보만으로** 짚으면 상위 10편 중 **0%** (바탕 11.5%)
 *  · 우리가 만들어 둔 **「묻힌 글」로 짚어도 0%** — 우리 기능이 이 일에는 안 듣는다
 *  · 이웃이 **같은 시기에** 움직였나로 짚으면 80% 지만, 그건 앞날을 맞힌 게 아니라
 *    **지금 손대는 일이 이웃으로 번진다**는 뜻이다 — 판정에 쓰면 안 된다
 *
 * 합격선(재기 **전 바퀴에** 정본 문서에 박아 뒀다):
 *  ① git 의 **다시 손댄 글**을 정답으로 쓴다
 *  ② **나이별 재방문율**을 낸다 — 「묵힌 것은 안 본다」가 우리에게도 맞나
 *  ③ 예측은 **앞 시기 정보만** — 같은 시기 신호는 예측이 아니다(갈라서 둘 다 적는다)
 *  ④ 못 맞히면 **그렇게 적는다** — 「일깨움에도 안 쓰인다」도 결과다
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

if (!fs.existsSync(ATLAS)) { console.log('[revisit] 지도가 없다 — 검사 건너뜀'); process.exit(0); }
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const R = atlas.revisit;
if (!R) {
  if (isFake(ATLAS)) { console.log('[revisit] 가짜 지도다 — 쓰이는지는 진짜 굽기에서만 잰다'); process.exit(0); }
  console.log('[revisit] **쓰이는지를 재 본 표가 없다** (revisit) — 「이 지도가 쓰이나」를 안 물었다');
  process.exit(1);
}
if (R.skipped) { console.log(`[revisit] 못 쟀다 — ${R.skipped}`); process.exit(1); }

const at = (o) => o.hits[0].rate;
console.log(`  ① 최근 ${R.recentMonths.join(',')} 전에 태어난 글 ${R.older}편 중 ${R.back}편`
  + ` (${(R.base * 100).toFixed(1)}%)이 최근에 다시 손대졌다`);
console.log(`  ② 나이별 — ${R.ages.map((a) => `${a.year}:${(a.rate * 100).toFixed(0)}%(${a.all})`).join(' ')}`);
console.log(`  ③ 상위 ${R.ks[0]}편 적중 — **앞 때만 ${(at(R.strict) * 100).toFixed(0)}%**`
  + ` · 같은 때 ${(at(R.ours) * 100).toFixed(0)}%(예측 아님)`
  + ` · 묻힌 글 ${(at(R.buried) * 100).toFixed(0)}% · 아무거나 ${(at(R.chance) * 100).toFixed(0)}%`);
console.log(`  ④ 판정 — ${R.useful ? '**일깨움에 쓸 만하다**' : '**일깨움에도 못 쓴다**'}`);

/* ① 정답이 실제로 있나. */
if (!(R.older > 100)) bad.push(`최근 전에 태어난 글이 ${R.older}편뿐이다 — 재기엔 너무 적다`);
if (!(R.back > 5)) bad.push(`다시 손댄 글이 ${R.back}편뿐이다 — 정답이 거의 없다`);
if (!(R.base > 0 && R.base < 1)) bad.push(`바탕 비율이 ${R.base} 다 — 셈이 이상하다`);

/* ② 나이별이 있어야 「묵힌 것은 안 본다」를 말할 수 있다. */
if (!(R.ages?.length >= 3)) bad.push('나이별 재방문율이 없다 — 「묵힌 것은 안 본다」를 확인할 수 없다');

/* ★ ③ **같은 때 신호를 판정에 쓰면 안 된다** — 이 자의 심장. */
if (R.strict == null) bad.push('앞 시기 정보만 쓴 예측이 없다 — 같은 때 신호를 예측이라 부르게 된다');
if (!(R.prevMonths?.length)) bad.push('앞 시기로 무엇을 썼는지가 없다');
const should = at(R.strict) > Math.max(at(R.chance), R.base) * 1.5;
if (R.useful !== should) {
  bad.push(`「${R.useful ? '쓸 만하다' : '못 쓴다'}」고 적혀 있는데 수는 반대다`
    + ` (앞 때만 ${at(R.strict)} vs 아무거나 ${at(R.chance)} · 바탕 ${R.base})`);
}
/* 같은 때 신호가 앞 때보다 훨씬 높으면, 그건 예측이 아니라 번짐이다 — 그 사실을 적었는지는
   화면에서 본다. 여기서는 **두 수가 다 실려 있는지**만 본다. */
if (R.ours == null) bad.push('같은 때 신호가 안 실려 있다 — 왜 예측이 아닌지 보여 줄 수 없다');

// ── ④ 화면 ──────────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[revisit] playwright·번들 중 없는 게 있다 — 화면 확인 건너뜀');
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
  const saysOld = /묵힌 글은 정말로 안 본다/.test(text);
  const saysStrict = text.includes(`${Math.round(at(R.strict) * 100)}%`);
  const saysSpread = /지금 손대는 일이 이웃으로 번진다/.test(text);
  const saysBuried = text.includes(`${Math.round(at(R.buried) * 100)}%`);
  console.log(`  ④ 화면 — 묵힌 글 ${saysOld ? '○' : '✗'} · 앞 때만 ${saysStrict ? '○' : '✗'}`
    + ` · 번짐 설명 ${saysSpread ? '○' : '✗'} · 우리 기능 성적 ${saysBuried ? '○' : '✗'}`);
  if (!saysOld) bad.push('화면이 **묵힌 글은 안 본다**를 안 적는다');
  if (!saysStrict) bad.push('화면이 **앞 시기 정보만 쓴 성적**을 안 적는다');
  if (!saysSpread) bad.push('화면이 **같은 때 신호는 예측이 아니다**를 안 적는다 — 80% 가 예측처럼 읽힌다');
  if (!saysBuried) bad.push('화면이 **우리가 만든 「묻힌 글」의 성적**을 안 적는다 — 안 듣는 기능을 숨기면 안 된다');
  await browser.close();
}

if (bad.length) {
  console.log('[revisit] **쓰이는지를 제대로 재지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 revisitCheck 를 봐라.');
  process.exit(1);
}
console.log(`[revisit] 묵힌 글은 안 본다(옛 글 재방문 0%) · 앞 때만으로 짚으면 ${(at(R.strict) * 100).toFixed(0)}%`
  + ` (바탕 ${(R.base * 100).toFixed(0)}%) — ${R.useful ? '쓸 만하다' : '**일깨움에도 못 쓴다**'}`);
