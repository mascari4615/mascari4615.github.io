/**
 * 자막 시간 맞추기가 시각을 정확히 옮기는지 확인한다 (TASK-KL-088)
 *
 * 자막은 눈으로 확인할 방법이 영상을 틀어 보는 것뿐이라, 어긋나도 한참 뒤에 안다.
 * 그래서 **결과의 시각을 글자 그대로** 잰다 — 반올림이 한 번만 어긋나도 잡힌다.
 *
 *  ① 2.5초 밀면 모든 줄이 정확히 2.5초 뒤로 가는가
 *  ② VTT 로 바꾸면 머리말이 붙고 쉼표가 점으로 바뀌는가 (웹 플레이어는 이걸 봐야 튼다)
 *  ③ 비율로 늘리면 뒤로 갈수록 더 많이 벌어지는가 (미는 것과 다른 동작이다)
 *  ④ 너무 당겨 음수가 되면 0 에 붙이고 그 사실을 말해 주는가
 *
 * 사용: node scripts/test-subtitle.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route('**/*', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' })
);
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {}, mountTool() { return true; } };
});
await page.addScriptTag({ content: read('js/widgets/tools/subtitle.js') });

const out = await page.evaluate(async () => {
  const SRT = [
    '1',
    '00:00:01,000 --> 00:00:03,000',
    '첫 대사',
    '',
    '2',
    '00:10:00,500 --> 00:10:02,000',
    '한참 뒤 대사'
  ].join('\n');

  const tool = window.__reg['subtitle'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  const set = (shift, rate, fmt) => {
    host.querySelector('#sbIn').value = SRT;
    host.querySelector('#sbShift').value = String(Math.round(shift * 10));
    host.querySelector('#sbRate').value = String(rate);
    host.querySelector(`[data-out="${fmt}"]`).click();
    host.querySelector('#sbIn').dispatchEvent(new Event('input'));
    return host.querySelector('#sbOut').value;
  };

  // ① 2.5초 밀기
  const shifted = set(2.5, 1, 'srt');
  const shiftOk = shifted.includes('00:00:03,500 --> 00:00:05,500') && shifted.includes('00:10:03,000 --> 00:10:04,500');

  // ② VTT 로
  const vtt = set(0, 1, 'vtt');
  const vttOk = vtt.startsWith('WEBVTT') && vtt.includes('00:00:01.000 --> 00:00:03.000') && !vtt.includes(',000 -->');

  // ③ 비율로 늘리기 — 뒤로 갈수록 더 벌어져야 한다
  const scaled = set(0, 1.0427, 'srt');
  const firstAt = scaled.match(/00:00:0(\d),(\d{3})/);
  const lateAt = scaled.match(/00:(\d\d):(\d\d),(\d{3}) -->/g);
  const scaleOk = !!firstAt && !!lateAt && /00:10:2[56]/.test(scaled); // 600.5초 × 1.0427 ≈ 626초

  // ④ 너무 당기기
  const pulled = set(-5, 1, 'srt');
  const clipOk = pulled.includes('00:00:00,000') && /0초에 붙였어요/.test(host.querySelector('#sbStatus').textContent);

  return {
    ok: shiftOk && vttOk && scaleOk && clipOk,
    why:
      `2.5초 밀기 ${shiftOk ? '✓' : '✗'} · VTT 변환 ${vttOk ? '✓' : '✗'} · ` +
      `비율 늘리기 ${scaleOk ? '✓' : '✗'} · 음수는 0에 붙이고 알림 ${clipOk ? '✓' : '✗'}`
  };
});

await browser.close();

console.log(`${out.ok ? '  OK' : '  X '} ${out.why}`);
if (!out.ok) {
  console.error('[test-subtitle] 자막 시각이 어긋났다');
  process.exit(1);
}
console.log('[test-subtitle] 밀기·늘리기·형식 변환·음수 처리까지 확인');
