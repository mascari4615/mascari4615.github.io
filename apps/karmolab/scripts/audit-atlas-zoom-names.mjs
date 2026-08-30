#!/usr/bin/env node
/**
 * audit-atlas-zoom-names. **당겼을 때 여기가 어디인지 알 수 있나**를 잰다 (TASK-KAR-233).
 *
 * 덩어리 이름은 무리 한가운데 **한 점**에만 붙는다. 멀리서는 그게 맞는데, 당기면 그
 * 한 점이 화면 밖으로 나가 버린다. 점만 보이고 여기가 무슨 자리인지 모른다.
 * 진짜 브라우저에서 당기고 **밀고 다니며** 재 보니 8배에서 화면의 **52%가 이름 0개**였다.
 * (제자리에서 당기기만 하면 늘 뭐가 보인다. 빈 화면은 밀고 다닐 때 나온다. 처음에
 * 여덟 자리만 보고 멀쩡한데 할 뻔했다.)
 *
 * 그래서 칸마다 이름을 구워 둔다(자리 이름). 이 자는 그게 **정말 화면에 뜨는지** 본다:
 * 화면 밖 이름표는 안 센다. 그리고 겹치면 못 읽으므로 겹침도 같이 본다.
 *
 * ★ **한 번 죽었다 살아난 자다.** 덩어리 이름의 닻을 보이는 글들의 무게중심으로 고치자
 * 배율 8에서도 덩어리 이름이 따라오게 됐고, 그래서 **칸 이름을 통째로 지워도 빈 자리가
 * 0곳**이 됐다. 물기 harness 가 칸 이름을 지운다를 못 잡는 걸로 들켰다. 빈 자리가
 * 없다만 보면 **칸 이름이 있으나 없으나 초록**이다. 그래서 이제 **칸 이름 자체가 살아
 * 있는지**를 따로 건다: 구워졌나, 실제로 화면에 뜨나. 있는 것을 지웠는데 아무 자도
 * 안 빨개지는 구조는 검사가 아니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath, isFake } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
const ATLAS = atlasPath(HERE);

/* **가짜 지도로는 이 자를 못 댄다**. 가짜는 진짜만큼 촘촘하지 않아 8배에서 빈 자리가 생긴다.
   조용히 통과하지 말고 왜 안 도는지 말한다. */
if (isFake(ATLAS)) {
  console.log('[atlas-zoom-names] 가짜 지도다. 이 자는 진짜 굽기에서만 잰다 (가짜는 진짜만큼 촘촘하지 않아 8배에서 빈 자리가 생긴다). 건너뜀');
  process.exit(0);
}

if (!fs.existsSync(ATLAS) || !fs.existsSync(BUNDLE)) {
  console.log('[zoom-names] 지도나 번들이 없다. 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[zoom-names] playwright 가 없다. 검사 건너뜀');
  process.exit(0);
}

const WHEELS = 19;        // 휠 한 번 = 1.12배 → 최대 배율(8배)까지
const SPOTS = 7;          /* 7x7 = 49 자리. **4x4 로는 모자란다**. 같은 지도를
                             16자리로 재면 이름 0개 0%, 45자리로 재면 13% 가 나왔다.
                             표본이 적으면 자가 그날 운에 따라 문다 말다 한다(2026-08-21). */
const STEP = 260;         // 한 번에 미는 거리(px)
const ALLOW = 0.1;        // 이름 0개인 자리가 이보다 많으면 빨개진다

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const atlas = fs.readFileSync(ATLAS, 'utf8');
const bakedTiles = (JSON.parse(atlas).tiles || []).length;
await page.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.endsWith('/data/memo-atlas.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: atlas });
  return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
});
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {} };
});
await page.addScriptTag({ content: fs.readFileSync(BUNDLE, 'utf8') });
await page.evaluate(() => {
  const h = document.createElement('div');
  h.id = 'host'; h.style.width = '1200px'; h.style.height = '760px';
  document.body.appendChild(h);
  /* **셸과 같은 길로 얹는다**. 셸은 `tabs[].build` 로만 그린다. 예전엔 여기서
         `render(h)` 를 직접 불렀는데, 그 바람에 위젯이 셸이 안 읽는 모양으로 등록해도
         자들은 전부 초록이었다(2026-08-21, 사람이 열어 보고서야 드러났다). */
      window.__reg['memo-atlas'].tabs[0].build(h);
});
await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), undefined, { timeout: 30000 });
const box = await (await page.$('#host .atlas-canvas')).boundingBox();

async function zoomTo() {
  await page.keyboard.press('Home');
  await page.waitForTimeout(50);
  for (let k = 0; k < WHEELS; k += 1) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -240);
  }
}
async function dragBy(dx, dy) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(90);
}

let seen = 0; let blank = 0; let clusterBlank = 0; let overlaps = 0; let scale = 0;
let tileSpots = 0; let tileBoxes = 0;
for (let i = 0; i < SPOTS; i += 1) {
  for (let j = 0; j < SPOTS; j += 1) {
    await zoomTo();
    await dragBy((i - (SPOTS - 1) / 2) * STEP, (j - (SPOTS - 1) / 2) * STEP);
    const r = await page.evaluate(() => {
      const cv = document.querySelector('#host .atlas-canvas');
      const on = (x) => x[0] + x[2] > 0 && x[1] + x[3] > 0 && x[0] < cv.width && x[1] < cv.height;
      return {
        cl: (window.__atlasLabelBoxes || []).filter(on),
        ti: (window.__atlasTileBoxes || []).filter(on),
        v: window.__atlasVisible ?? 0,
        s: window.__atlasScale ?? 1,
      };
    });
    /* 글이 거의 없는 자리는 원래 이름이 없어도 된다. 빈 들판이다. */
    if (r.v < 10) continue;
    seen += 1; scale = r.s;
    if (!r.cl.length) clusterBlank += 1;
    if (r.ti.length) { tileSpots += 1; tileBoxes += r.ti.length; }
    if (!r.cl.length && !r.ti.length) blank += 1;
    const all = [...r.cl, ...r.ti];
    for (let a = 0; a < all.length; a += 1) {
      for (let b = a + 1; b < all.length; b += 1) {
        const p = all[a]; const q = all[b];
        if (!(p[0] + p[2] < q[0] || q[0] + q[2] < p[0] || p[1] + p[3] < q[1] || q[1] + q[3] < p[1])) overlaps += 1;
      }
    }
  }
}
await browser.close();

if (!seen) {
  console.log('[zoom-names] 글이 10개 넘는 자리를 못 찾았다. 지도가 비었나');
  process.exit(1);
}
console.log(`[zoom-names] 배율 ${scale.toFixed(2)}, 밀어 본 자리 ${seen}`);
console.log(`  덩어리 이름만이면 이름 0개인 자리 ${clusterBlank} (${(clusterBlank / seen * 100).toFixed(0)}%)`);
console.log(`  자리 이름까지 켜면 ${blank} (${(blank / seen * 100).toFixed(0)}%), 겹침 ${overlaps}`);
console.log(`  자리 이름이 실제로 뜬 자리 ${tileSpots}/${seen} (이름표 ${tileBoxes}개), 구워 둔 칸 묶음 ${bakedTiles}`);
if (errors.length) {
  console.log('[zoom-names] 브라우저가 오류를 뱉었다:');
  for (const e of errors.slice(0, 3)) console.log('   ' + e);
  process.exit(1);
}
if (overlaps) {
  console.log('[zoom-names] **이름표가 겹친다**. 겹친 글씨보다 없는 글씨가 낫다');
  process.exit(1);
}
/* ★ **칸 이름 자체가 살아 있나**. 빈 자리 0은 덩어리 이름만으로도 나므로 그것만
   보면 칸 이름을 지워도 초록이다. 구워졌는지와 실제로 뜨는지를 따로 건다. */
if (!bakedTiles) {
  console.log('[zoom-names] **칸 이름이 안 구워졌다** (tiles). 덩어리 이름이 화면 밖으로 나간 자리를 메울 것이 없다');
  console.log('  build-memo-atlas.mjs 의 칸 이름 굽기를 봐라.');
  process.exit(1);
}
if (!tileSpots) {
  console.log(`[zoom-names] **칸 이름을 구워 놓고 한 자리도 안 띄운다** (묶음 ${bakedTiles}개, 밀어 본 ${seen}곳 전부 0개)`);
  console.log('  memo-atlas.ts 의 drawCells. 배율에 맞는 칸을 고르는 자리를 봐라.');
  process.exit(1);
}
if (blank / seen > ALLOW) {
  console.log('[zoom-names] **당기면 여기가 어디인지 모른다**');
  console.log(`  글이 있는 자리 ${seen}곳 중 ${blank}곳에 이름이 하나도 안 뜬다.`);
  console.log('  굽는 쪽에서 칸 이름(tiles)이 나왔는지, 위젯이 배율에 맞는 칸을 고르는지 봐라.');
  process.exit(1);
}
console.log('[zoom-names] 당겨서 밀고 다녀도 이름이 따라온다');
