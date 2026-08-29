/**
 * 결과를 **눌러서 복사**할 수 있는가 (TASK-KL-297).
 *
 * 도구가 글을 내놓으면 사람이 다음에 하는 일은 거의 늘 다른 데 옮겨 적기다.
 * 결과를 보여 주는 도구 41개 중 14개에 복사가 없었고, 그중 **글을 내놓는 셋**을 이번에 고쳤다.
 * 여기서 재는 것: 그 자리가 눌리는가, **자판으로도** 되는가, 낭독기가 이름을 아는가.
 *
 * 사용: node scripts/test-copyable.mjs
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
  window.__copied = [];
  window.Toolbox = {
    register: (t) => { window.__reg[t.id] = t; },
    trackUse() {},
    mountTool() { return true; },
    ensureScript: async () => {},
    onHandoff() {},
    /* 실제 클립보드는 헤드리스에서 막히니, 도구가 **부르는지**를 본다 */
    copyText: (v) => { window.__copied.push(v); }
  };
  window.Mdd = new Proxy({}, { get: () => () => {} });
});
await page.addScriptTag({ content: read('js/widgets/tools/timecalc.js') });

const out = await page.evaluate(async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  window.__reg['timecalc'].tabs[0].build(host);
  await window.__karmoWaitDrawn(host);
  const el = host.querySelector('#tcResult');
  if (!el) return { found: false };
  el.textContent = '3시간 20분';

  window.__copied.length = 0;
  el.click();
  const byClick = window.__copied.slice();

  window.__copied.length = 0;
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const byKey = window.__copied.slice();

  return {
    found: true,
    byClick,
    byKey,
    role: el.getAttribute('role'),
    label: el.getAttribute('aria-label'),
    tabindex: el.getAttribute('tabindex'),
    live: el.getAttribute('aria-live')
  };
});

await browser.close();

check(out.found, '결과 자리가 있다');
check(out.byClick?.[0] === '3시간 20분', `눌러서 복사된다 (지금 ${JSON.stringify(out.byClick)})`);
check(out.byKey?.[0] === '3시간 20분', `**자판으로도** 복사된다 (지금 ${JSON.stringify(out.byKey)})`);
check(out.tabindex === '0', '자판으로 닿는다');
check(!!out.label, `무엇을 하는 자리인지 이름이 있다 (지금 ${out.label})`);
check(out.live === 'polite', '결과가 바뀌면 읽힌다');

process.stdout.write('\n');
if (failures.length) {
  console.error(`[test-copyable] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-copyable] 결과를 눌러서, 자판으로 복사할 수 있다');
