/**
 * 표 바꾸기가 내용을 지키는지 확인한다 (TASK-KL-088)
 *
 * 이 도구는 **틀려도 결과가 그럴듯하다** — 칸이 밀리거나 따옴표 안의 쉼표에서 쪼개져도
 * 표 모양은 나온다. 그래서 왕복을 재는 게 유일하게 확실하다:
 * 엑셀 붙여넣기 → 마크다운 → 다시 넣기 → CSV 로, 내용이 그대로여야 한다.
 *
 * 한글 세로줄 맞추기도 본다 — 한글을 한 칸으로 세면 줄이 어긋난다.
 *
 * 사용: node scripts/test-tableconv.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveAppAssets } from './lib/widget-harness.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
await serveAppAssets(page, root);
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; }, copyText: () => Promise.resolve() };
});
await page.addScriptTag({ content: read('js/widgets/tools/tableconv.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['tableconv'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  await window.__karmoWaitDrawn(host);
  const convert = (text, to) => {
    host.querySelector('#tcIn').value = text;
    host.querySelector('#tcTo').value = to;
    host.querySelector('#tcTo').dispatchEvent(new Event('change'));
    host.querySelector('#tcIn').dispatchEvent(new Event('input'));
    return { out: host.querySelector('#tcOut').value, stats: host.querySelector('#tcStats').textContent };
  };

  // 엑셀에서 복사한 모양 (탭 구분) — 한글과 쉼표 포함
  const excel = ['이름\t설명\t값', '가나다\t쉼표, 포함\t10', '라마\t짧음\t20'].join('\n');

  const md = convert(excel, 'md');
  const excelSeen = md.stats.includes('엑셀');

  // 마크다운을 다시 넣어 CSV 로 — 내용이 그대로여야 한다
  const csv = convert(md.out, 'csv');
  const mdSeen = csv.stats.includes('마크다운');
  const lines = csv.out.split('\n');
  const roundTrip =
    lines[0] === '이름,설명,값' &&
    lines[1] === '가나다,"쉼표, 포함",10' &&
    lines[2] === '라마,짧음,20';

  // 세로줄 맞추기 — 한글을 두 칸으로 세야 각 줄 길이가 같아진다
  const mdLines = md.out.split('\n');
  const same = mdLines.every((l) => [...l].reduce((w, c) => w + (/[가-힣]/.test(c) ? 2 : 1), 0) === [...mdLines[0]].reduce((w, c) => w + (/[가-힣]/.test(c) ? 2 : 1), 0));

  // 칸 수가 어긋나면 알려 주는가
  const ragged = convert('a\tb\tc\nd\te', 'csv');
  const warned = host.querySelector('#tcStatus').className.includes('error');

  return {
    ok: excelSeen && mdSeen && roundTrip && same && warned,
    why: `엑셀 인식 ${excelSeen} · 마크다운 인식 ${mdSeen} · 왕복 보존 ${roundTrip} · 세로줄 맞음 ${same} · 칸 어긋남 경고 ${warned}`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-tableconv] 표 바꾸기가 내용을 지키지 못한다');
  process.exit(1);
}
console.log('[test-tableconv] 왕복해도 내용이 그대로이고 한글 세로줄도 맞는 것 확인');
