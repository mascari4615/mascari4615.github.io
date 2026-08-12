/**
 * 비밀번호 도구가 제대로 재고 만드는지 확인한다 (TASK-KL-088)
 *
 * 「강함」이라고 말해 주기는 쉽다. 틀려도 아무도 모른다 — 그래서 다음을 실제로 잰다:
 *  ① 약한 것을 약하다고 하는가 (password123 이 「강함」이면 그 도구는 해롭다)
 *  ② 긴 무작위를 강하다고 하는가
 *  ③ 만든 비밀번호가 **매번 다르고** 고른 길이·글자 종류를 지키는가
 *  ④ 헷갈리는 글자 빼기가 실제로 빠지는가
 *
 * 사용: node scripts/test-passgen.mjs
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
await page.addScriptTag({ content: read('js/widgets/tools/passgen.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['passgen'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  // 만들기 탭
  const makeHost = document.createElement('div');
  document.body.appendChild(makeHost);
  tool.tabs[0].build(makeHost);

  const setLen = (n) => {
    makeHost.querySelector('#pgLen').value = String(n);
    makeHost.querySelector('#pgLen').dispatchEvent(new Event('input'));
    return makeHost.querySelector('#pgOut').textContent;
  };

  const a = setLen(24);
  const b = setLen(24);
  const lengthOk = a.length === 24 && b.length === 24;
  const differs = a !== b; // 매번 같으면 무작위가 아니다

  // 헷갈리는 글자 빼기가 실제로 도는가 (기본 켜짐)
  const many = Array.from({ length: 12 }, () => setLen(48)).join('');
  const noAmbig = !/[lIO01]/.test(many);

  // 확인 탭
  const checkHost = document.createElement('div');
  document.body.appendChild(checkHost);
  tool.tabs[1].build(checkHost);
  const judge = (pw) => {
    const input = checkHost.querySelector('#pcIn');
    input.value = pw;
    input.dispatchEvent(new Event('input'));
    return {
      label: checkHost.querySelector('#pcStats').textContent,
      why: checkHost.querySelector('#pcWhy').textContent
    };
  };

  const weak = judge('password123');
  const weak2 = judge('qwerty2024');
  const strong = judge(a + 'Zq7!');

  return {
    ok:
      lengthOk &&
      differs &&
      noAmbig &&
      weak.label.includes('약함') &&
      weak.why.includes('흔한 낱말') &&
      weak2.why.includes('자판') &&
      (strong.label.includes('강함') || strong.label.includes('아주 강함')),
    why: `길이 ${lengthOk} · 매번 다름 ${differs} · 헷갈리는 글자 없음 ${noAmbig} · password123 → ${weak.label.slice(0, 12)} · qwerty2024 약점 [${weak2.why.slice(0, 20)}] · 긴 무작위 → ${strong.label.slice(0, 14)}`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-passgen] 비밀번호 도구가 제대로 재지 못한다');
  process.exit(1);
}
console.log('[test-passgen] 약한 것을 약하다 하고, 만든 것이 매번 다른 것까지 확인');
