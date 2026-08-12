/**
 * 「글자수」가 **사람이 세는 대로** 세는가 (TASK-KL-275).
 *
 * 이 도구를 보는 이유는 트위터 글자수·이력서 자수 제한이다. 그러니 **사람 눈과 같아야** 한다.
 * 예전엔 코드포인트로 셌다 — 가족 이모지 「👨‍👩‍👧」 하나가 **5자**로, NFD 로 풀린 `é` 가 2자로 세어졌다.
 *
 * 사용: node scripts/test-charcount-grapheme.mjs
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
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; }, ensureScript: async () => {}, copyText() {}, getPref: () => '', setPref() {} };
  /* 이 도구는 마스코트(`Mdd`)를 부른다 — 낱개로 띄우는 이 검사판엔 없어서 그리다 멈춘다.
   * 검사하려는 건 세는 수이지 마스코트가 아니므로, **뭘 부르든 아무것도 안 하는** 것으로 채운다
   * (손잡이 이름을 하나씩 맞춰 두면 마스코트가 늘 때마다 이 검사가 깨진다). */
  window.Mdd = new Proxy({}, { get: () => () => {} });
});
await page.addScriptTag({ content: read('js/widgets/tools/charcount.js') });

const out = await page.evaluate(async () => {
  const tool = window.__reg['charcount'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);
  await window.__karmoWaitDrawn(host);
  const input = await window.__karmoWaitIn(host, '#ccInput');

  const measure = async (text) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 120));
    /* 화면에서 「공백 포함」 숫자를 읽는다 — 어느 칸인지는 글로 찾는다(자리는 바뀔 수 있다) */
    const cells = [...host.querySelectorAll('*')].filter((e) => e.children.length === 0);
    const idx = cells.findIndex((e) => /공백\s*포함/.test(e.textContent || ''));
    for (let i = idx; i >= 0 && i < cells.length && i < idx + 3; i++) {
      const n = (cells[i].textContent || '').replace(/[^\d]/g, '');
      if (n && !/공백/.test(cells[i].textContent)) return Number(n);
    }
    return null;
  };

  const cases = [
    ['안녕하세요', 5, '한글 다섯 자'],
    ['👍', 1, '이모지 하나'],
    ['👨‍👩‍👧', 1, '가족 이모지 — 예전엔 5로 셌다'],
    ['🇰🇷', 1, '국기'],
    ['👨‍👩‍👧 안녕 café', 9, '섞인 글']
  ];
  const rows = [];
  for (const [text, want, why] of cases) {
    const got = await measure(text);
    rows.push({ why, want, got, ok: got === want });
  }
  return { ok: rows.every((r) => r.ok), rows };
});

await browser.close();

if (out.rows) out.rows.forEach((r) => console.log(`  ${r.ok ? 'OK' : 'X '} ${r.why} — 기대 ${r.want}, 나온 것 ${r.got}`));
if (!out.ok) {
  console.error('[test-charcount-grapheme] 사람이 세는 수와 다르다');
  process.exit(1);
}
console.log('[test-charcount-grapheme] 이모지·결합 글자를 사람 눈대로 센다');
