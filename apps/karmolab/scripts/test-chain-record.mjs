/**
 * **녹음, 녹화한 것이 다음 도구로 이어지는가** (TASK-KL-298).
 *
 * 녹음 다음에 하는 일은 거의 늘 앞뒤 자르기, 화면 녹화 다음은 구간 자르기, GIF다.
 * 그런데 두 도구가 결과를 **이어서에 안 내놓고** 있어서, 방금 받은 파일을 다시 올려야 했다 . 
 * 재료 화면을 만들어 둔 값어치가 거기서 반쯤 사라진다.
 *
 * 여기서 재는 것: 만든 결과가 `Toolbox.offerNext` 로 **실제로 놓이는가**.
 * (녹음이 대표다. 같은 배선을 화면 녹화, 사진 뽑기, 가리개, 글 뽑기, 자막, 바꾸기, 코드 사진, 
 *  바코드에도 넣었다. 하나가 서면 나머지도 같은 모양이라 함께 산다.)
 *
 * 사용: node scripts/test-chain-record.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveAppAssets } from './lib/widget-harness.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const page = await browser.newPage();
await serveAppAssets(page, root);
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.__offered = [];
  window.Toolbox = {
    register: (t) => { window.__reg[t.id] = t; },
    trackUse() {}, mountTool() { return true; }, ensureScript: async () => {}, copyText() {}, onHandoff() {},
    offerNext: (anchor, item) => { window.__offered.push({ name: item && item.name, from: item && item.from, size: item && item.blob && item.blob.size }); }
  };
  window.Mdd = new Proxy({}, { get: () => () => {} });
});
await page.addScriptTag({ content: read('js/widgets/tools/voicerec.js') });

const BUDGET_MS = Number(process.env.KL_CHAINREC_BUDGET_MS || 60000);
await page.addInitScript((ms) => { window.__budgetMs = ms; }, BUDGET_MS);
await page.evaluate((ms) => { window.__budgetMs = ms; }, BUDGET_MS);
const out = await page.evaluate(async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  window.__reg['voicerec'].tabs[0].build(host);
  await window.__karmoWaitDrawn(host);

  const rec = host.querySelector('#vrStart');
  if (!rec) return { ok: false, why: '녹음 단추가 없다' };
  rec.click();
  await new Promise((r) => setTimeout(r, 1200));
  const stop = host.querySelector('#vrStop');
  if (stop) stop.click();
  /* 인코딩까지 기다린다. 상한은 부르는 쪽이 정한다 (바쁜 기계에서 12초는 모자랐다) */
  const budget = Number(window.__budgetMs || 60000) / 100;
  for (let i = 0; i < budget; i += 1) {
    if (host.querySelector('#vrSave') && !host.querySelector('#vrSave').disabled) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (host.querySelector('#vrSave')?.disabled) return { ok: false, tooSlow: true, why: '인코딩이 상한 안에 안 끝났다' };
  const save = host.querySelector('#vrSave');
  if (!save) return { ok: false, why: '저장 단추가 없다' };
  /* MP3 압축기는 바깥 파일을 받아 와야 해서 이 검사판에는 없다. 재려는 건 이어지는가이지
   * 압축이 아니므로 WAV 로 맞춘다(첫 판에 MP3 압축기를 불러오지 못했습니다로 빨갰다). */
  const fmt = host.querySelector('#vrFormat');
  if (fmt) {
    fmt.value = 'wav';
    fmt.dispatchEvent(new Event('change', { bubbles: true }));
  }
  window.__offered.length = 0;
  save.click();
  for (let i = 0; i < budget; i += 1) {
    if (window.__offered.length) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!window.__offered.length) return { ok: false, tooSlow: true, why: '저장이 상한 안에 안 끝났다' };
  return { ok: true, offered: window.__offered.slice(), saveDisabled: save.disabled, status: (host.querySelector('#vrStatus')||{}).textContent };
});

await browser.close();

/* ★ **못 잰 것과 고장은 다르다** (2026-08-29 실측). 이 검사는 통짜(한 번에 열여섯)에서만
   빨갰고 혼자 돌리면 3초에 초록이었다. 녹음, 인코딩이 시간 예산을 쓰는 자리라, 기계가
   바쁘면 상한을 못 지킨다. 그걸 빨강으로 세면 사람이 곧 게이트를 안 믿는다.
   상한은 KL_CHAINREC_BUDGET_MS 로 늘릴 수 있고, 넘으면 CANNOT-RUN(2). */
if (out.tooSlow) {
  console.error(`[test-chain-record] CANNOT-RUN. ${out.why} (상한 ${Math.round(BUDGET_MS / 1000)}초)`);
  console.error('  기계가 바빠 못 잰 것이다. 빨강이 아니다 (KL_CHAINREC_BUDGET_MS 로 늘릴 수 있다).');
  process.exit(2);
}
check(out.ok, `녹음 화면이 도는가 (${out.why || ''})`);
check(out.offered?.length === 1, `녹음한 것을 이어서에 내놓는다 (지금 ${JSON.stringify(out.offered)})`);
check(out.offered?.[0]?.from === 'voicerec', '어느 도구가 만든 것인지 밝힌다');
check((out.offered?.[0]?.size || 0) > 0, '빈 것이 아니라 실제 소리가 놓인다');

process.stdout.write('\n');
if (failures.length) {
  console.error(`[test-chain-record] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-chain-record] 녹음한 것이 다음 도구로 이어진다');
