/**
 * **화면낭독기·키보드로 쓸 수 있나**를 잰다 — a11y (2026-08-16)
 *
 * 왜 만드나: 우리에게 접근성 검사가 여럿 있지만(`audit:input-labels`·`audit:iconbtn`·
 * `test:contrast`·`audit:mouse-only`) **전부 소스를 읽는 정적 검사**다. 화면이 실제로
 * 그려진 뒤 무엇이 깨지는지는 아무도 안 봤다 — 대비는 물려받은 배경색에서 결정되고,
 * 이름표는 JS 가 만든 줄에서 빠지고, 랜드마크는 셸이 조립한 뒤에야 판정된다.
 * 정적 검사가 초록이어도 화면은 빨갈 수 있다. LCP·CLS·INP 와 같은 얘기다.
 *
 * axe-core 를 페이지에 넣어 돌린다(배포물에는 안 들어간다 — 여기서만 주입).
 * 판마다 **어긴 규칙과 그 개수**를 낸다. 총점은 안 낸다 — 총점은 무엇을 고칠지 안 알려 준다.
 *
 * 사용: node scripts/measure-live-a11y.mjs [주소...] [--json]
 *       기본은 첫 화면 + 도구 한 장 + 도구 목록.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const AXE = path.join('node_modules', 'axe-core', 'axe.min.js');
const args = process.argv.slice(2).filter((a) => a.startsWith('--') === false);
const BASE = 'https://blog.mascari4615.com/karmolab/';
const URLS = args.length ? args : [BASE, `${BASE}t/`, `${BASE}?t=passgen`];
const VIEW = { width: 390, height: 844 };

if (fs.existsSync(AXE) === false) {
  console.log(`[live-a11y] 못 돌림 — axe-core 가 없다 (${AXE}). npm i -D axe-core`);
  process.exit(2);   // 못 잰 것은 통과가 아니다
}
const axeSource = fs.readFileSync(AXE, 'utf8');

let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  console.log(`[live-a11y] 못 돌림 — 브라우저를 못 띄운다 (${String(err).split('\n')[0].slice(0, 80)})`);
  process.exit(2);
}

let totalViolations = 0;
let pagesMeasured = 0;
for (const url of URLS) {
  const ctx = await browser.newContext({ viewport: VIEW });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  } catch (err) {
    console.log(`${url}\n  못 열었다 — ${String(err.message).split('\n')[0].slice(0, 70)}`);
    await ctx.close();
    continue;
  }
  await page.waitForTimeout(2500);   // 늦게 오는 조각까지 화면에 붙은 뒤에 본다
  await page.addScriptTag({ content: axeSource });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length,
      help: v.help, sample: (v.nodes[0]?.target || []).join(' ') }));
  });
  await ctx.close();
  pagesMeasured++;

  const n = res.reduce((a, v) => a + v.n, 0);
  totalViolations += n;
  console.log(`\n${url}  — 어긴 자리 ${n}개 (규칙 ${res.length}종)`);
  for (const v of res.sort((a, b) => b.n - a.n)) {
    console.log(`  ${String(v.n).padStart(3)}개  [${v.impact}] ${v.id} — ${v.help}`);
    console.log(`         예: ${v.sample.slice(0, 90)}`);
  }
}
await browser.close();

if (pagesMeasured === 0) {
  console.log('\n[live-a11y] 못 쟀다 — 한 장도 못 열었다.');
  process.exit(2);
}
console.log(`\n[live-a11y] ${pagesMeasured}장 · 어긴 자리 ${totalViolations}개`);
console.log('  (0 이 목표다. impact=critical/serious 부터 본다.)');
