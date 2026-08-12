/**
 * 글자 가리개가 맞는 것만 지우는지 확인한다 (TASK-KL-088)
 *
 * 「다 지웠다」는 쉬운 쪽이다 — 전부 별표로 만들면 된다. 어려운 쪽은 **안 지워야 할 것을
 * 안 지우는 것**이다. 16자리 주문번호를 카드로 몰거나 날짜를 주민번호로 몰면, 지운 글이
 * 쓸모없어지고 사람들은 그냥 이 도구를 안 쓰게 된다.
 *
 * 그래서 잡아야 할 것과 **절대 잡으면 안 되는 것**을 함께 넣고 둘 다 잰다.
 *
 * 사용: node scripts/test-textredact.mjs
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
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {}, mountTool() { return true; } };
});
await page.addScriptTag({ content: read('js/widgets/tools/textredact.js') });

const out = await page.evaluate(async () => {
  const tool = window.__reg['textredact'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);
  await window.__karmoWaitDrawn(host);
  // 지워져야 하는 것들
  const MUST_GO = [
    ['주민등록번호', '900101-1234567'],
    ['휴대전화', '010-1234-5678'],
    ['이메일', 'someone@example.com'],
    ['카드번호(검사식 통과)', '4111 1111 1111 1111'],
    ['IP', '192.168.0.14'],
    ['토큰', 'ghp_abcdefghijklmnopqrstuvwxyz0123'],
    ['JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r']
  ];
  // 절대 지워지면 안 되는 것들 — 여기가 진짜 시험이다
  const MUST_STAY = [
    ['주문번호(검사식 실패)', '1234567812345678'],
    ['버전·날짜', '2026-08-07'],
    ['숫자만 긴 것', '30000000'],
    ['IP 같지만 범위 초과', '999.1.1.1'],
    ['평범한 문장', '오류가 12번 줄에서 났습니다']
  ];

  const text =
    MUST_GO.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n' +
    MUST_STAY.map(([k, v]) => `${k}: ${v}`).join('\n');

  const inEl = await window.__karmoWaitIn(host, '#txIn');
  inEl.value = text;
  inEl.dispatchEvent(new Event('input'));
  const result = host.querySelector('#txOut').value;

  const leaked = MUST_GO.filter(([, v]) => result.includes(v)).map(([k]) => k);
  const eaten = MUST_STAY.filter(([, v]) => !result.includes(v)).map(([k]) => k);

  // 같은 값이 두 번 나오면 같은 번호를 받아야 한다 (그래야 로그를 따라 읽을 수 있다)
  inEl.value = '접속: 010-1234-5678 / 재시도: 010-1234-5678 / 다른 사람: 010-9999-8888';
  inEl.dispatchEvent(new Event('input'));
  const twice = host.querySelector('#txOut').value;
  const pairOk = (twice.match(/\[전화번호1\]/g) || []).length === 2 && twice.includes('[전화번호2]');

  // 별표 방식은 자릿수를 남겨야 알아볼 수 있다
  host.querySelector('#txStyle').value = 'mask';
  host.querySelector('#txStyle').dispatchEvent(new Event('change'));
  const masked = host.querySelector('#txOut').value;
  const maskOk = masked.includes('***-****-****') && !masked.includes('1234');

  return {
    ok: leaked.length === 0 && eaten.length === 0 && pairOk && maskOk,
    why:
      `놓친 것 ${leaked.length ? leaked.join('·') : '없음'} · ` +
      `잘못 지운 것 ${eaten.length ? eaten.join('·') : '없음'} · ` +
      `같은 값 같은 번호 ${pairOk ? '✓' : '✗'} · 별표 자릿수 유지 ${maskOk ? '✓' : '✗'}`
  };
});

await browser.close();

console.log(`${out.ok ? '  OK' : '  X '} ${out.why}`);
if (!out.ok) {
  console.error('[test-textredact] 개인정보를 놓쳤거나, 지우면 안 되는 것을 지웠다');
  process.exit(1);
}
console.log('[test-textredact] 7종을 지우고 5종은 그대로 두는 것까지 확인');
