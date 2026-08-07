/**
 * 소리 크기 맞추기를 진짜 소리로 확인한다 (TASK-KL-088)
 *
 * 이 도구는 「했다」는 말이 쉬운 종류다. 파일은 항상 나오고 파형도 항상 그려진다.
 * 진짜로 봐야 할 것은 셋이다:
 *  ① 큰 대목과 작은 대목의 **차이가 실제로 좁아졌는지** (이게 이 도구의 존재 이유)
 *  ② 목표 크기를 **넘지 않았는지** (넘으면 찌그러진다)
 *  ③ 소리가 **뒤집히거나 뭉개지지 않았는지** (부호가 유지되어야 한다)
 *
 * 그래서 작은 소리와 큰 소리를 붙인 시험 음원을 넣고 결과 표본을 직접 잰다.
 *
 * 사용: node scripts/test-audiolevel.mjs
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
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; } };
});
await page.addScriptTag({ content: read('js/widgets/tools/audiolevel.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['audiolevel'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  // 시험 음원: 앞 절반은 아주 작게, 뒤 절반은 크게. 딱 이 도구가 고쳐야 할 모양이다.
  const rate = 44100;
  const seconds = 2;
  const total = rate * seconds;
  const pcm = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const amp = i < total / 2 ? 0.05 : 0.8;
    pcm[i] = Math.sin((2 * Math.PI * 440 * i) / rate) * amp;
  }
  // WAV 로 엮어 위젯에 파일처럼 넣는다
  const len = total * 2 + 44;
  const view = new DataView(new ArrayBuffer(len));
  const w = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); view.setUint32(4, len - 8, true); w(8, 'WAVE'); w(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  w(36, 'data'); view.setUint32(40, total * 2, true);
  for (let i = 0; i < total; i++) view.setInt16(44 + i * 2, pcm[i] * 0x7fff, true);
  const file = new File([view], 'test.wav', { type: 'audio/wav' });

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  const input = host.querySelector('#alFile');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));

  const wait = (test, ms, why) =>
    new Promise((res, rej) => {
      const t0 = Date.now();
      const k = () => {
        if (test()) return res();
        if (Date.now() - t0 > ms) return rej(new Error(why + ' / 안내: ' + host.querySelector('#alStatus').textContent));
        setTimeout(k, 60);
      };
      k();
    });

  await wait(() => host.querySelector('#alEditor').style.display !== 'none', 10000, '음원을 읽지 못했다');

  host.querySelector('#alEven').value = '3'; // 강하게
  host.querySelector('#alEven').dispatchEvent(new Event('input'));
  host.querySelector('#alTarget').value = '-1';
  host.querySelector('#alTarget').dispatchEvent(new Event('input'));
  host.querySelector('#alRun').click();
  await wait(() => !host.querySelector('#alSave').disabled, 20000, '처리가 끝나지 않았다');

  // 결과 파일을 직접 잰다.
  // 이 시험이 보는 것은 **소리 처리 계산**이므로 손실 없는 쪽으로 받는다 (MP3 길은 test-mp3 가 본다).
  // 저장은 형식을 만드느라 비동기다 — 누르자마자 읽으면 아직 아무것도 없다.
  host.querySelector('#alFormat').value = 'wav';
  let outBlob = null;
  const orig = URL.createObjectURL;
  URL.createObjectURL = (b) => { if (b && b.type === 'audio/wav') outBlob = b; return orig(b); };
  host.querySelector('#alSave').click();
  await wait(() => outBlob !== null, 15000, '결과 파일을 얻지 못했다');
  URL.createObjectURL = orig;

  const ctx = new AudioContext();
  const buf = await ctx.decodeAudioData(await outBlob.arrayBuffer());
  const out = buf.getChannelData(0);
  void ctx.close();

  const half = Math.floor(out.length / 2);
  const peakOf = (a, from, to) => { let p = 0; for (let i = from; i < to; i++) p = Math.max(p, Math.abs(a[i])); return p; };
  const quietBefore = 0.05, loudBefore = 0.8;
  const quietAfter = peakOf(out, rate * 0.1, half - rate * 0.1);
  const loudAfter = peakOf(out, half + rate * 0.1, out.length - rate * 0.1);

  const gapBefore = loudBefore / quietBefore; // 16배
  const gapAfter = loudAfter / Math.max(1e-6, quietAfter);
  const target = Math.pow(10, -1 / 20);

  // 부호가 유지되는지 — 사인파의 앞부분이 양수로 시작해야 한다
  let firstNonZero = 0;
  for (let i = 1; i < 200; i++) if (Math.abs(out[i]) > 1e-4) { firstNonZero = out[i]; break; }

  return {
    ok: gapAfter < gapBefore * 0.6 && loudAfter <= target + 0.02 && firstNonZero > 0,
    why: `차이 ${gapBefore.toFixed(1)}배 → ${gapAfter.toFixed(1)}배 (40% 이상 좁아져야 함) · 가장 큰 소리 ${loudAfter.toFixed(3)} (목표 ${target.toFixed(3)} 이하) · 부호 ${firstNonZero > 0 ? '유지' : '뒤집힘'}`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-audiolevel] 소리 크기 맞추기가 제대로 돌지 않는다');
  process.exit(1);
}
console.log('[test-audiolevel] 큰·작은 소리 차이가 실제로 좁아지고 목표를 넘지 않는 것까지 확인');
