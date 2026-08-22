#!/usr/bin/env node
/**
 * audit-atlas-taskdoi — **일깨움에 필요한 건 지도인가 편집 이력인가** (TASK-KAR-233).
 *
 * Mylyn/Mylar(Kersten & Murphy, FSE 2006)는 요소마다 **얼마나 자주·최근에 건드렸나**로
 * 관심도를 매기고 다른 것이 오르면 옛것을 **감쇠**시킨다. 우리에겐 상호작용 로그가 없지만
 * **git 이 그 자취다.**
 *
 * ★ 앞 바퀴에서 「곧 다시 손댈 글」을 **지도로** 짚으니 0% 였다. git 으로 다시 재니
 * 상위 10편 중 **90%**(바탕 9.5% · 아무거나 0%). 그런데 거기에 **이웃을 섞으면 70% 로
 * 떨어진다** — **이 일에 지도는 아무것도 안 보탠다.** 지도의 패배지만 적어야 할 패배다.
 *
 * ⚠ 후속 연구의 경고대로 **자취에는 잡음이 있다.** 우리 판의 잡음은 **일괄 커밋**이다
 * (이름 바꾸기·대량 이관). 커밋 5782개 중 26개(파일 2153개분)를 뺐고, **거른 양을 적는다.**
 *
 * ⚠ 그리고 **앞 시기 이벤트만** 쓴다 — 최근 달은 아예 안 본다. 앞 바퀴에서 「같은 시기」
 * 신호가 80% 를 맞혔지만 그건 예측이 아니라 번짐이었다.
 *
 * 합격선:
 *  ① git 커밋을 편집 이벤트로 — 잦기+최근성+감쇠
 *  ② **잡음(일괄 커밋)을 걸러 내고 거른 양을 적는다**
 *  ③ 앞 시기만 쓰고, 우연·바탕을 나란히
 *  ④ **지도가 보태는지 따로 잰다** — 안 보태면 그렇게 적는다
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

if (!fs.existsSync(ATLAS)) { console.log('[taskdoi] 지도가 없다 — 검사 건너뜀'); process.exit(0); }
const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
const D = atlas.taskDoi;
if (!D) {
  if (isFake(ATLAS)) { console.log('[taskdoi] 가짜 지도다 — 상호작용 DOI 는 진짜 굽기에서만 잰다'); process.exit(0); }
  console.log('[taskdoi] **상호작용 DOI 표가 없다** (taskDoi)');
  process.exit(1);
}
if (D.skipped) { console.log(`[taskdoi] 못 쟀다 — ${D.skipped}`); process.exit(1); }

const r = (o) => o[0].rate;
console.log(`  ② 잡음 — 커밋 ${D.events}개 중 ${D.dropped}개를 일괄 커밋으로 뺐다`
  + ` (한 커밋 ${D.bulkCut}개 초과 · 파일 ${D.droppedFiles}개분) · 앞 시기 이벤트 ${D.pastEvents}개`);
console.log(`  ①③ 상위 ${D.ks.join('/')}편 적중 — DOI ${D.doi.map((x) => (x.rate * 100).toFixed(0)).join('/')}%`
  + ` · 잦기만 ${(r(D.freq) * 100).toFixed(0)}% · 아무거나 ${(r(D.chance) * 100).toFixed(0)}%`
  + ` (바탕 ${(D.base * 100).toFixed(1)}%)`);
console.log(`  ④ 지도가 보태나 — 이웃만 ${(r(D.near) * 100).toFixed(0)}%`
  + ` · 섞으면 ${(r(D.both) * 100).toFixed(0)}% · 글 자체만 ${(r(D.doi) * 100).toFixed(0)}%`
  + ` → ${D.mapAdds ? '보탠다' : '**안 보탠다**'}`);

if (!(D.events > 500)) bad.push(`커밋이 ${D.events}개뿐이다 — 자취라 하기 어렵다`);
/* ★ ② **거른 양이 이 자의 심장** — 안 적으면 잡음을 안 걸렀는지 알 수 없다. */
if (D.dropped == null || D.droppedFiles == null) {
  bad.push('일괄 커밋을 얼마나 걸렀는지가 없다 — 자취의 잡음을 안 다뤘는지 알 수 없다');
} else if (!(D.dropped > 0)) {
  bad.push(`일괄 커밋을 하나도 안 걸렀다 — 문턱 ${D.bulkCut}개가 너무 높은지 봐라`);
}
if (!(D.pastEvents > 100)) bad.push(`앞 시기 이벤트가 ${D.pastEvents}개뿐이다`);
if (!(D.base > 0 && D.base < 1)) bad.push(`바탕 비율이 ${D.base} 다`);
/* ③ 우연이 살아 있나. */
if (r(D.chance) > D.base * 1.5) bad.push(`아무거나 짚어도 ${r(D.chance)} 다 (바탕 ${D.base}) — 대조군이 이상하다`);
/* 판정이 수와 맞나. */
const should = r(D.doi) > Math.max(r(D.chance), D.base) * 1.5;
if (D.useful !== should) bad.push(`「${D.useful ? '쓸 만하다' : '못 쓴다'}」고 적혀 있는데 수는 반대다`);
const addsShould = r(D.both) > r(D.doi) + 0.02;
if (D.mapAdds !== addsShould) {
  bad.push(`「지도가 ${D.mapAdds ? '보탠다' : '안 보탠다'}」고 적혀 있는데 수는 반대다`
    + ` (섞으면 ${r(D.both)} vs 글 자체만 ${r(D.doi)})`);
}
/* 감쇠가 일을 하는지도 적혀 있어야 한다 — 잦기만과 같으면 그렇게 말해야 한다. */
if (D.freq == null) bad.push('잦기만 쓴 판이 없다 — 감쇠가 일을 하는지 알 수 없다');

let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium || !fs.existsSync(BUNDLE)) {
  console.log('[taskdoi] playwright·번들 중 없는 게 있다 — 화면 확인 건너뜀');
} else {
  const bundle = fs.readFileSync(BUNDLE, 'utf8');
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await page.route('**/*', (q) => {
    const u = new URL(q.request().url());
    if (u.pathname.endsWith('/data/memo-atlas.json')) {
      return q.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(atlas) });
    }
    return q.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
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
  const saysRate = text.includes(`${Math.round(r(D.doi) * 100)}%`);
  const saysDrop = text.includes(`${D.dropped}개`);
  const saysAdds = D.mapAdds ? true : /지도는 아무것도 안 보탠다/.test(text);
  console.log(`  화면 — 적중률 ${saysRate ? '○' : '✗'} · 거른 양 ${saysDrop ? '○' : '✗'} · 지도 몫 ${saysAdds ? '○' : '✗'}`);
  if (!saysRate) bad.push('화면이 적중률을 안 적는다');
  if (!saysDrop) bad.push('화면이 **일괄 커밋을 얼마나 걸렀는지**를 안 적는다');
  if (!saysAdds) bad.push('화면이 **지도가 안 보탠다**를 안 적는다 — 진 것을 숨기면 안 된다');
  await browser.close();
}

if (bad.length) {
  console.log('[taskdoi] **지도가 보태는지 제대로 재지도, 제대로 말하지도 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  build-memo-atlas.mjs 의 interactions·doiRevisit 를 봐라.');
  process.exit(1);
}
console.log(`[taskdoi] 편집 이력으로 ${(r(D.doi) * 100).toFixed(0)}% (바탕 ${(D.base * 100).toFixed(0)}%)`
  + ` · 이웃을 섞으면 ${(r(D.both) * 100).toFixed(0)}% — ${D.mapAdds ? '지도가 보탠다' : '**지도는 안 보탠다**'}`);
