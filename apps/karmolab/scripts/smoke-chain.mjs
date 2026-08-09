/**
 * 묶어 쓰기 화면이 **진짜 도는가** (해자① / TASK-KL-205 후속)
 *
 * `test-core` 는 알맹이만 본다 — 가짜 손을 주고 규칙을 확인한다. 그건 「계산이 맞다」까지다.
 * 화면은 다르다: 번들에 알맹이 표가 실려 있어야 하고, 버튼이 그걸 불러야 하고, 결과가 줄로
 * 그려져야 한다. 그 사슬 중 하나만 끊겨도 **알맹이 시험은 전부 초록**이다.
 *
 * 그래서 진짜 번들을 브라우저에 실어 **눌러 본다**. 값은 OpenSSL 과 맞춘다.
 * 잘못된 도구 이름도 넣어 본다 — 오류가 화면에 뜨는지가 「빈 화면」과 갈리는 자리다.
 *
 * 사용: node scripts/smoke-chain.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* 볼 대상이 아직 없으면 「못 돌렸다」다 — 배포 길목에서 이걸 실패로 세면 안 된다. */
const NEEDED = ['js/vendor/crypto-js.min.js', 'js/widgets/tools/chain.js'];
const missing = NEEDED.filter((rel) => fs.existsSync(path.join(root, rel)) === false);
if (missing.length > 0) {
  console.log(`[chain-smoke] CANNOT-RUN(건너뜀) — 번들이 아직 없다: ${missing.join(' · ')}`);
  console.log('  `node build.mjs` 뒤에 돌려라.');
  process.exit(0);
}
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  console.error('[chain-smoke] CANNOT-RUN — 브라우저를 못 띄웠다. `npx playwright install chromium` 이 필요하다.');
  console.error(String(error?.message ?? error).split(String.fromCharCode(10))[0]);
  process.exit(1);
}
const page = await browser.newPage();
await page.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
await page.goto('http://localhost/');
/*
 * 말 묶음을 미리 박는다 — **진짜 페이지가 하는 그대로**다(`window.__KARMO_I18N`, 머리말에 박힘).
 * 이걸 안 하면 화면이 `chain.unknownTool` 같은 열쇠를 그대로 뱉는데, 그건 이 검사의 하네스가
 * 만든 상태지 제품의 상태가 아니다 — 검사가 제품을 헐뜯게 된다.
 */
const koChain = JSON.parse(read('i18n/ko/chain.json'));
await page.evaluate((cat) => {
  window.__KARMO_LOCALE = 'ko';
  window.__KARMO_I18N = { ko: { chain: cat } };
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {}, mountTool() { return true; } };
  window.Mdd = { linePreset() {} };
}, koChain);
await page.addScriptTag({ content: read('js/vendor/crypto-js.min.js') });
await page.addScriptTag({ content: read('js/widgets/tools/chain.js') });
const out = await page.evaluate(async () => {
  const tool = window.__reg['chain'];
  if (!tool) return { missing: true };
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);
  const wait = async (sel, ms = 5000) => {
    const until = Date.now() + ms;
    for (;;) {
      const el = host.querySelector(sel);
      if (el) return el;
      if (Date.now() > until) return null;
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  const ta = await wait('#chSteps');
  if (!ta) return { timedOut: true };
  ta.value = JSON.stringify([
    { tool: 'base64', op: 'encode', args: { text: 'KarmoLab' } },
    { tool: 'hashgen', op: 'text', args: { text: '$1', algo: 'SHA256' } }
  ]);
  host.querySelector('#chRun').click();
  await new Promise((r) => setTimeout(r, 200));
  const rows = [...host.querySelectorAll('.tool-list-row')].map((r) => r.textContent);
  // 나쁜 단계도 눌러 본다 — 오류가 화면에 뜨는지
  ta.value = '[{"tool":"nope","op":"go","args":{}}]';
  host.querySelector('#chRun').click();
  await new Promise((r) => setTimeout(r, 200));
  return { rows, err: host.querySelector('#chSay').textContent };
});
await browser.close();
const crypto = await import('node:crypto');
const b64 = Buffer.from('KarmoLab', 'utf8').toString('base64');
const want = crypto.createHash('sha256').update(b64).digest('hex');
const fails = [];
if (out.missing) fails.push('chain 위젯이 등록되지 않았다');
if (out.timedOut) fails.push('화면이 안 그려졌다');
if (!out.rows || out.rows.length !== 2) fails.push(`단계 줄이 2개여야 하는데 ${out.rows?.length}`);
if (!out.rows?.[1]?.includes(want)) fails.push(`2번째 결과가 OpenSSL 값과 다르다: ${out.rows?.[1]}`);
if (!/모르는 도구/.test(out.err ?? '')) fails.push(`모르는 도구를 화면이 안 알려 준다: ${out.err}`);
if (fails.length) { console.error('[chain-smoke] 실패:'); fails.forEach((f) => console.error('  - ' + f)); process.exit(1); }
console.log(`[chain-smoke] 화면에서 2단계 실행 — base64→hashgen 값이 OpenSSL 과 일치, 잘못된 도구는 화면에 알림`);
