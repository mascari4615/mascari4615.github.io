/**
 * 영업일 계산이 공휴일을 제대로 빼는지 확인한다 (TASK-KL-088)
 *
 * 이 도구의 최악은 **틀린 날짜를 자신 있게 내놓는 것**이다. 사용자는 그 날짜로 기한을 잡는다.
 * 그래서 답을 아는 구간으로 잰다:
 *  ① 2026 추석(9/24~26)이 낀 구간에서 그만큼 밀리는가
 *  ② 담지 않은 해는 「모른다」고 말하는가 (조용히 틀리지 않는가)
 *  ③ 토요일 근무를 켜면 결과가 달라지는가
 *
 * 사용: node scripts/test-workdays.mjs
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
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; } };
});
await page.addScriptTag({ content: read('js/widgets/tools/workdays.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['workdays'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);
  await window.__karmoWaitDrawn(host);
  const waitFor = async (selector, limitMs = 3000) => {
    const start = Date.now();
    while (Date.now() - start < limitMs) {
      const found = host.querySelector(selector);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    return null;
  };

  if (await waitFor('#wdFrom') === null) {
    return { ok: false, why: '위젯이 input 을 그리지 않았다' };
  }

  const set = (id, v, ev = 'input') => {
    const el = host.querySelector(id);
    if (el.type === 'checkbox') el.checked = v;
    else el.value = v;
    el.dispatchEvent(new Event(ev));
  };
  const readOut = () => ({
    out: host.querySelector('#wdOut').textContent,
    skipped: host.querySelector('#wdSkipped').textContent,
    status: host.querySelector('#wdStatus').textContent,
    error: host.querySelector('#wdStatus').className.includes('error')
  });

  // ① 2026 추석(9/24 목 ~ 9/26 토, 10/5 대체) 이 낀 구간
  set('#wdFrom', '2026-09-21');
  set('#wdDays', '5');
  const chuseok = readOut();
  const skippedChuseok = chuseok.skipped.includes('9/24') && chuseok.skipped.includes('9/25');

  // ② 담지 않은 해 — 2030 은 표에 없다
  set('#wdFrom', '2030-01-05');
  const unknown = readOut();

  // ③ 토요일 근무 여부로 결과가 달라지는가
  set('#wdFrom', '2026-11-02');
  set('#wdDays', '10');
  const weekdayOnly = readOut().out;
  set('#wdSat', true, 'change');
  const withSat = readOut().out;
  set('#wdSat', false, 'change');

  return {
    ok: skippedChuseok && unknown.error && weekdayOnly !== withSat,
    why: `추석 뺌 ${skippedChuseok} · 모르는 해 경고 ${unknown.error} (${unknown.status}) · 토요일 켜면 달라짐 ${weekdayOnly !== withSat} (${weekdayOnly} → ${withSat})`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-workdays] 영업일 계산이 공휴일을 제대로 다루지 못한다');
  process.exit(1);
}
console.log('[test-workdays] 공휴일을 빼고, 모르는 해는 모른다고 말하는 것까지 확인');
