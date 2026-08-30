#!/usr/bin/env node
/**
 * audit-atlas-intrusion. **이 이름들이 읽히나** (TASK-KAR-233).
 *
 * Reading Tea Leaves(Chang, Boyd-Graber, Wang, Gerrish, Blei, NIPS 2009)의 요점:
 * **자동 점수가 높은 모델일수록 사람이 읽기엔 오히려 나쁠 수 있다.** 우리 자는 전부
 * 나눔이 좋은가를 잰다(실루엣, DBCV, HDBSCAN, H0, 눈금 사다리, 이름 적합도) . 
 * **이 무리의 말을 보고 남의 말을 골라낼 수 있나**는 한 번도 안 물었다.
 *
 * 시험: 무리마다 제 낱말 다섯 + **침입자 하나**를 섞고 판정자가 하나를 고른다.
 * 답은 맞춘 비율 하나가 아니라 **찍기(1/6)와의 거리**다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① 맞춘 비율과 **찍기**를 나란히 싣는다. 찍기 없이 적은 비율은 뜻이 없다
 *  ② 판정자는 임베딩이고, **빈도로는 안 풀린다**(순환 금지)
 *  ③ 화면이 둘을 나란히 적는다
 *  ④ **대조군**. 아무 무리의 중심에 대고 물으면 찍기 수준으로 떨어진다
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
const NEAR = 0.1;

if (!fs.existsSync(ATLAS)) {
  console.log('[intrusion] 지도가 없다. 검사 건너뜀');
  process.exit(0);
}
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const it = atlas.intrusion;
if (!it) {
  if (isFake(ATLAS) || atlas.model === 'api') {
    console.log('[intrusion] 침입자 시험이 없다. 가짜 지도이거나 바깥 모델로 구웠다');
    process.exit(0);
  }
  console.log('[intrusion] **침입자 시험이 안 실려 있다** (intrusion)');
  console.log('  나눔이 좋은가만 재고 읽히나는 안 재고 있다. build-memo-atlas.mjs 의 wordIntrusion 을 봐라.');
  process.exit(1);
}

// ── ① 실린 값이 스스로와 맞나 ────────────────────────────────────────
console.log(`  ① 맞춘 비율 ${it.mp}, 찍기 ${it.chance}, ${it.trials}판 (무리 ${it.groups}개, 낱말 ${it.words}+1)`);
const chance = 1 / (it.words + 1);
if (Math.abs(it.chance - Number(chance.toFixed(3))) > 0.002) {
  bad.push(`찍기를 ${it.chance} 라 적었는데 낱말 ${it.words}+1 이면 ${chance.toFixed(3)} 이다`);
}
if (!(it.trials >= 8)) bad.push(`시험이 ${it.trials}판뿐이다. 이 수로는 찍기와 못 가른다`);
if (!(it.mp >= 0 && it.mp <= 1)) bad.push(`맞춘 비율이 ${it.mp} 다`);
/* 판 수로 표현할 수 있는 값인가. 아무 수나 적어 넣으면 여기서 어긋난다. */
const grid = Math.round(it.mp * it.trials);
if (Math.abs(grid / it.trials - it.mp) > 0.002) {
  bad.push(`맞춘 비율 ${it.mp} 는 ${it.trials}판으로 나올 수 없는 수다 (가장 가까운 것 ${(grid / it.trials).toFixed(3)})`);
}

// ── ② 빈도로 풀리면 시험이 순환한다 ──────────────────────────────────
console.log(`  ② 빈도만으로 풀면. 드문 쪽 ${it.dfMp}, 흔한 쪽 ${it.dfHiMp} (찍기 ${it.chance} 이하여야 한다)`);
if (typeof it.dfMp !== 'number' || typeof it.dfHiMp !== 'number') {
  bad.push('빈도로 푸는 판정자를 안 재 봤다. 드문 것 고르기로 풀리는 시험일 수 있다');
} else {
  if (it.dfMp > it.chance) bad.push(`드문 것 고르기로 ${it.dfMp} 를 맞힌다. 시험이 순환한다`);
  if (it.dfHiMp > it.chance) bad.push(`흔한 것 고르기로 ${it.dfHiMp} 를 맞힌다. 시험이 순환한다`);
  if (it.dfMp === 0 && it.dfHiMp === 0) {
    /* 둘 다 정확히 0 이면 빈도가 다 같아서 **맨 앞을 고르고 있는** 것일 수 있다.
       실제로 그랬다: 짚더미만 소문자로 낮추고 낱말은 안 낮춰 빈도가 전부 0 이었다. */
    console.log('     ⚠ 둘 다 정확히 0 이다. 빈도가 다 같아서 늘 맨 앞을 고르는 것은 아닌지 봐라');
  }
}

// ── ④ 대조군. 아무 무리에 대고 물으면 찍기여야 한다 ─────────────────
console.log(`  ④ 아무 무리의 중심에 대고 물으면 ${it.randMp} (찍기 ${it.chance})`);
if (typeof it.randMp !== 'number') bad.push('대조군이 안 실려 있다. 맞춘 비율이 판정자 덕인지 알 수 없다');
else if (Math.abs(it.randMp - it.chance) > NEAR) {
  bad.push(`아무 무리에 대고 물어도 ${it.randMp} 다 (찍기 ${it.chance}). 무리와 상관없이 풀리고 있다`);
}
if (typeof it.randMp === 'number' && it.mp <= it.randMp) {
  bad.push(`제 무리(${it.mp})가 아무 무리(${it.randMp})보다 낫지 않다. 이름이 무리를 안 가리킨다`);
}
console.log(`     → 우리 이름은 찍기의 ${(it.mp / it.chance).toFixed(1)}배`
  + (it.mp > it.chance + 0.05 ? '. 찍기보단 낫지만' : '. **찍기와 다를 게 없다**')
  + ` 열 판에 ${Math.round((1 - it.mp) * 10)}판은 남의 말을 못 골라낸다`);

// ── ③ 화면이 둘을 나란히 적나 ────────────────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[intrusion] playwright, 번들 중 없는 게 있다. 화면 확인 건너뜀');
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
  await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), undefined, { timeout: 30000 });
  const text = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
  await browser.close();
  const pct = Math.round(it.mp * 100);
  const ch = Math.round(it.chance * 100);
  const saysMp = new RegExp(`${pct}%\\s*를 맞`).test(text) || text.includes(`${pct}% 를 맞힌다`);
  const saysChance = new RegExp(`찍기 ${ch}%`).test(text);
  console.log(`  ③ 화면이 적나. 맞춘 비율 ${saysMp ? '○' : '✗'}, 찍기 ${saysChance ? '○' : '✗'}`);
  if (!saysMp) bad.push('화면이 침입자 맞춘 비율을 안 적는다');
  if (!saysChance) bad.push('화면이 **찍기**를 안 적는다. 찍기 없이 적은 비율은 잘 맞힌다로 읽힌다');
}

if (bad.length) {
  console.log('[intrusion] **이름이 읽히는지를 제대로 재고 있지 않다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 wordIntrusion, docFreq 를 봐라.');
  process.exit(1);
}
console.log(`[intrusion] 맞춘 비율 ${it.mp} vs 찍기 ${it.chance}. 빈도로는 안 풀리고, 아무 무리에 대고 물으면 ${it.randMp} 로 떨어진다`);
