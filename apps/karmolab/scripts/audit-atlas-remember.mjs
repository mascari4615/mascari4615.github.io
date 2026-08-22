#!/usr/bin/env node
/**
 * audit-atlas-remember — **다른 기계에서도 지도를 볼 수 있나** (TASK-KAR-233).
 *
 * 지도 데이터엔 글 제목·경로가 다 들어 있어 공개 레포에 못 담는다. 그래서 「각자 굽고
 * 브라우저가 그 파일을 읽는다」로 두 층을 만들어 뒀는데, **그 길을 한 번도 안 밟아 봤다.**
 *
 * 게다가 손잡이를 기억하는 길(`showOpenFilePicker`)은 **크롬 계열만** 된다 —
 * 파이어폭스·사파리·아이폰에는 없다. 즉 폰에서는 언제나 **폴백 길**이고, 폴백은
 * 내용을 브라우저 저장소에 넣는데 그 저장소는 자리가 모자라면 **말없이 지워진다.**
 *
 * 그래서 이 자는 **손잡이가 없는 브라우저인 척**하고 폴백 길만 밟는다:
 *  - 파일을 골라 넣으면 지도가 뜨나
 *  - **새로 연 판에서도** 뜨나 (기억이 실제로 남았나)
 *  - 「지워질 수 있다」를 화면에 말하나
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
const ATLAS = atlasPath(HERE);

if (!fs.existsSync(ATLAS) || !fs.existsSync(BUNDLE)) {
  console.log('[remember] 지도나 번들이 없다 — 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[remember] playwright 가 없다 — 검사 건너뜀');
  process.exit(0);
}

const bundle = fs.readFileSync(BUNDLE, 'utf8');
const browser = await chromium.launch();
/* 한 창을 계속 쓴다 — 저장소가 남아 있는지 보려면 같은 오리진이어야 한다. */
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const errors = [];

async function openWidget() {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url());
    /* **레포에 지도가 없는 척** 한다 — 그래야 기억해 둔 것을 읽는 길로 간다. */
    if (u.pathname.endsWith('/data/memo-atlas.json')) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
  });
  await page.goto('http://localhost/');
  await page.evaluate(() => {
    /* 손잡이를 기억 못 하는 브라우저인 척 — 폰이 늘 이 길이다. */
    delete window.showOpenFilePicker;
    window.__reg = {};
    window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {} };
  });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    const h = document.createElement('div');
    h.id = 'host'; h.style.width = '1100px'; h.style.height = '700px';
    document.body.appendChild(h);
    /* **셸과 같은 길로 얹는다** — 셸은 `tabs[].build` 로만 그린다. 예전엔 여기서
         `render(h)` 를 직접 불렀는데, 그 바람에 위젯이 셸이 안 읽는 모양으로 등록해도
         자들은 전부 초록이었다(2026-08-21, 사람이 열어 보고서야 드러났다). */
      window.__reg['memo-atlas'].tabs[0].build(h);
  });
  return page;
}

const bad = [];
const first = await openWidget();
await first.waitForTimeout(400);
const empty = await first.evaluate(() => !!document.querySelector('#host .atlas-pick'));
console.log(`[remember] 지도 없이 열면 → ${empty ? '「내 지도 불러오기」 단추가 뜬다' : '아무 말도 없다(고장)'}`);
if (!empty) bad.push('지도가 없을 때 불러오기 단추가 안 뜬다');

/* 파일을 골라 넣는다 — 평범한 파일 고르기 길. */
const chooser = first.waitForEvent('filechooser');
await first.click('#host .atlas-pick');
await (await chooser).setFiles(ATLAS);
await first.waitForFunction(() => !!window.__atlasPlaced, { timeout: 20000 }).catch(() => {});
await first.waitForFunction(() => (document.querySelector('#host .atlas-kept')?.textContent || '').length > 0, { timeout: 5000 }).catch(() => {});
const shown = await first.evaluate(() => ({
  dots: (window.__atlasPlaced || []).length,
  kept: document.querySelector('#host .atlas-kept')?.textContent || '',
}));
console.log(`[remember] 파일을 넣으면 → 점 ${shown.dots}개 · 화면 말: ${shown.kept || '(없음)'}`);
if (!shown.dots) bad.push('파일을 넣어도 지도가 안 뜬다');
if (!shown.kept) bad.push('기억해 뒀다는 말도, 지워질 수 있다는 말도 안 한다');

/* 새 판을 연다 — 기억이 진짜 남았나. */
await first.close();
const second = await openWidget();
await second.waitForFunction(() => !!window.__atlasPlaced, { timeout: 20000 }).catch(() => {});
/* 화면 말은 저장소에 물어본 뒤에 뜬다 — 바로 읽으면 아직 비어 있다(그렇게 한 번 헛읽었다). */
await second.waitForFunction(() => (document.querySelector('#host .atlas-kept')?.textContent || '').length > 0, { timeout: 5000 }).catch(() => {});
const again = await second.evaluate(() => ({
  dots: (window.__atlasPlaced || []).length,
  kept: document.querySelector('#host .atlas-kept')?.textContent || '',
}));
console.log(`[remember] 새로 열면 → 점 ${again.dots}개 · 화면 말: ${again.kept || '(없음)'}`);
if (!again.dots) bad.push('새로 열면 기억해 둔 지도가 안 뜬다');
if (!again.kept) bad.push('새로 열었을 때 기억 상태를 말 안 한다');

await browser.close();
if (errors.length) {
  console.log('[remember] 브라우저가 오류를 뱉었다:');
  for (const e of errors.slice(0, 3)) console.log('   ' + e);
  process.exit(1);
}
if (bad.length) {
  console.log('[remember] **다른 기계에서는 이 지도를 못 본다**');
  for (const x of bad) console.log('  - ' + x);
  process.exit(1);
}
console.log('[remember] 손잡이를 못 쓰는 브라우저에서도 넣고, 다시 열어도 남아 있다');
