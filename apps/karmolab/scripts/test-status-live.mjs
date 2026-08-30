/**
 * 상태 한 줄이 **화면낭독기에 읽히는가** (TASK-KL-291).
 *
 * 다 됐습니다, 이 파일은 못 엽니다는 **화면이 안 바뀐 채 글자만 갈린다**. 눈으로 보는
 * 사람에겐 보이지만 `aria-live` 가 없으면 화면낭독기는 **아무 말도 안 한다**. 누른 뒤에
 * 아무 반응이 없는 것과 같다. 실측(2026-08-13) 도구 126개 중 `aria-live` 는 **2곳**뿐이었다.
 *
 * 여기서 재는 것: 공용 상태 줄을 쓰는 도구가 **실제로 읽히는 표시를 달고 있는가**.
 *
 * 사용: node scripts/test-status-live.mjs
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

const browser = await chromium.launch();
const page = await browser.newPage();
await serveAppAssets(page, root);
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; }, ensureScript: async () => {}, copyText() {}, onHandoff() {} };
  window.Mdd = new Proxy({}, { get: () => () => {} });
});

/* 재료마다 하나씩 + **손잡이를 안 바꾸고 표시만 붙인 쪽**(`markLive`) 하나.
 * 두 길이 다 읽히는지 봐야 48곳은 손잡이로, 48곳은 표시로가 사실이 된다. */
for (const id of ['imgresize', 'pdfcrop', 'audiofade', 'aspect']) {
  await page.addScriptTag({ content: read(`js/widgets/tools/${id}.js`) });
}

const out = await page.evaluate(async () => {
  const res = {};
  for (const [id, sel] of [
    ['imgresize', '#irStatus'],
    ['pdfcrop', '#pcStatus'],
    ['audiofade', '#afStatus'],
    ['aspect', '#asStatus']
  ]) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    window.__reg[id].tabs[0].build(host);
    await window.__karmoWaitDrawn(host);
    const el = host.querySelector(sel) || host.querySelector('.tool-status');
    res[id] = el
      ? { live: el.getAttribute('aria-live'), role: el.getAttribute('role'), tag: el.tagName }
      : null;
  }
  return res;
});

await browser.close();

for (const [id, r] of Object.entries(out)) {
  check(!!r, `${id}: 상태 줄이 있다`);
  check(r && r.live === 'polite', `${id}: 읽히게 표시돼 있다 (지금 aria-live=${r && r.live})`);
  check(r && r.role === 'status', `${id}: 무엇을 읽는 자리인지 밝힌다 (지금 role=${r && r.role})`);
}

process.stdout.write('\n');
if (failures.length) {
  console.error(`[test-status-live] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-status-live] 상태 한 줄이 화면낭독기에 읽힌다');
