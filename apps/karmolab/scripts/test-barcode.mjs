/**
 * 바코드가 규격대로 만들어지는지 확인한다 (TASK-KL-088)
 *
 * 바코드는 눈으로 봐서는 맞는지 알 수 없다 — 줄무늬는 다 비슷해 보인다. 라벨을 다 뽑고 나서야
 * 안 읽히는 걸 아는 게 최악이라, 밖에서 가져온 사실과 구조 불변식으로 잰다.
 *
 *  ① 표준 예시값: 590123412345 의 검사 숫자는 7 이다 (EAN-13 규격의 공개된 예시)
 *  ② 구조: EAN-13 은 막대가 정확히 95개, 앞뒤가 101, 한가운데가 01010
 *  ③ 그려진 픽셀이 그 막대와 맞는가 — 계산만 맞고 그림이 틀리면 소용없다
 *  ④ 여백(quiet zone)이 양옆에 남는가 — 없으면 스캐너가 시작을 못 찾는다
 *  ⑤ 못 만드는 값(검사 숫자 틀림·한글)은 그리지 않고 이유를 말해 주는가
 *
 * 사용: node scripts/test-barcode.mjs
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
await page.addScriptTag({ content: read('js/widgets/tools/barcode.js') });

const out = await page.evaluate(async () => {
  const tool = window.__reg['barcode'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  const canvas = await window.__karmoWaitIn(host, '#bcCanvas');
  const setKind = (k) => host.querySelector(`#bcKind [data-kind="${k}"]`).click();
  const setValue = (v) => {
    const el = host.querySelector('#bcValue');
    el.value = v;
    el.dispatchEvent(new Event('input'));
  };
  const statusText = () => host.querySelector('#bcStatus').textContent;

  // ① 표준 예시값의 검사 숫자 — 화면에 적히는 값으로 확인한다
  setKind('ean13');
  setValue('590123412345');
  const checkOk = /5901234123457/.test(statusText());

  // ③④ 그려진 픽셀에서 막대를 되읽는다 (계산이 아니라 그림을 본다)
  const unit = Number(host.querySelector('#bcWidth').value);
  const ctx = canvas.getContext('2d');
  const mid = 20; // 막대 한가운데 높이
  const row = ctx.getImageData(0, mid, canvas.width, 1).data;
  const isBlack = (x) => row[x * 4] < 128;
  // 여백: 왼쪽·오른쪽 끝은 반드시 흰색이어야 한다
  const quietOk = !isBlack(2) && !isBlack(canvas.width - 3);
  // 막대 문자열 되읽기 — 여백을 건너뛴 첫 검은 점부터 unit 간격으로
  let first = 0;
  while (first < canvas.width && !isBlack(first)) first++;
  let bits = '';
  for (let x = first + Math.floor(unit / 2); x < canvas.width; x += unit) bits += isBlack(x) ? '1' : '0';
  bits = bits.replace(/0+$/, '');

  // ② 구조 불변식
  const lenOk = bits.length === 95;
  const guardOk = bits.startsWith('101') && bits.endsWith('101') && bits.slice(45, 50) === '01010';

  // ⑤ 못 만드는 값
  setValue('5901234123458'); // 검사 숫자가 틀린 13자리
  const badCheck = /검사 숫자가 맞지 않습니다/.test(statusText()) && canvas.width < 10;
  setKind('code128');
  setValue('한글은안됨');
  const badKo = /한글 X|영문·숫자·기호만/.test(statusText()) && canvas.width < 10;

  return {
    ok: checkOk && lenOk && guardOk && quietOk && badCheck && badKo,
    why:
      `검사 숫자 7 ${checkOk ? '✓' : '✗'} · 막대 ${bits.length}개(95) ${lenOk ? '✓' : '✗'} · ` +
      `앞뒤·가운데 표식 ${guardOk ? '✓' : '✗'} · 양옆 여백 ${quietOk ? '✓' : '✗'} · ` +
      `틀린 검사숫자 거절 ${badCheck ? '✓' : '✗'} · 한글 거절 ${badKo ? '✓' : '✗'}`
  };
});

await browser.close();

console.log(`${out.ok ? '  OK' : '  X '} ${out.why}`);
if (!out.ok) {
  console.error('[test-barcode] 규격에 안 맞는 바코드다 — 스캐너가 못 읽는다');
  process.exit(1);
}
console.log('[test-barcode] 표준 예시·구조·여백·거절까지 확인');
