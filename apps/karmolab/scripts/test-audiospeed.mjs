/**
 * 소리 속도가 길이만 바꾸고 목소리는 그대로 두는지 확인한다 (TASK-KL-088)
 *
 * 길이가 줄어든 것만 재면 절반만 잰 것이다 — 그냥 빨리 돌려도 길이는 줄어든다.
 * 이 도구의 약속은 **높이가 안 변한다**이므로 높이까지 재야 한다.
 *
 * 440Hz 사인파를 넣고 1.5배로 바꾼 뒤
 *  ① 길이가 1/1.5 로 줄었는지
 *  ② 소리의 높이가 그대로 440Hz 인지 (영점 통과 횟수로 잰다)
 *  ③ 대조: 「그냥 빠르게」로 하면 660Hz 로 올라가는지
 *     — 이게 없으면 높이 재는 자가 고장 나 있어도 통과한다.
 *
 * 사용: node scripts/test-audiospeed.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveAppAssets } from './lib/widget-harness.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await serveAppAssets(page, root);
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; }, ensureScript: async () => {} };
});
await page.addScriptTag({ content: read('js/widgets/tools/audiospeed.js') });

const out = await page.evaluate(async () => {
  const HZ = 440;
  const SR = 44100;
  const SECONDS = 4;
  const RATE = 1.5;

  const tool = window.__reg['audiospeed'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  // 440Hz 사인파를 WAV 로 만들어 넣는다 (도구가 파일에서 읽는 길을 그대로 탄다)
  const n = SR * SECONDS;
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.round(Math.sin((2 * Math.PI * HZ * i) / SR) * 20000);
  const head = new ArrayBuffer(44);
  const dv = new DataView(head);
  const put = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  put(0, 'RIFF'); dv.setUint32(4, 36 + pcm.byteLength, true); put(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true); put(36, 'data'); dv.setUint32(40, pcm.byteLength, true);
  const wav = new Blob([head, pcm], { type: 'audio/wav' });

  const input = await window.__karmoWaitIn(host, '#asFile');
  const dt = new DataTransfer();
  dt.items.add(new File([wav], '시험음.wav', { type: 'audio/wav' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  for (let i = 0; i < 100 && !/읽었어요/.test(host.querySelector('#asStatus').textContent); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!/읽었어요/.test(host.querySelector('#asStatus').textContent)) {
    return { ok: false, why: '소리를 못 읽었다: ' + host.querySelector('#asStatus').textContent };
  }

  /** 결과 소리를 되읽어 길이와 높이를 잰다 */
  const measure = async () => {
    const src = host.querySelector('#asPlay').src;
    const buf = await (await fetch(src)).arrayBuffer();
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(buf);
    const d = decoded.getChannelData(0);
    // 높이 = 영점을 위로 지나는 횟수 / 시간. 잔물결에 속지 않게 문턱을 둔다
    let crossings = 0;
    let armed = false;
    for (let i = 0; i < d.length; i++) {
      if (d[i] > 0.15) { if (armed) { crossings++; armed = false; } }
      else if (d[i] < -0.15) armed = true;
    }
    const seconds = decoded.length / decoded.sampleRate;
    void ctx.close();
    return { seconds, hz: crossings / seconds };
  };

  host.querySelector('#asRate').value = String(RATE);
  host.querySelector('#asRate').dispatchEvent(new Event('input'));

  // ① ② 목소리 그대로
  host.querySelector('#asRun').click();
  for (let i = 0; i < 200 && host.querySelector('#asPlay').style.display === 'none'; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const keep = await measure();

  // ③ 대조 — 그냥 빠르게
  host.querySelector('#asKeep').checked = false;
  host.querySelector('#asPlay').style.display = 'none';
  host.querySelector('#asRun').click();
  for (let i = 0; i < 200 && host.querySelector('#asPlay').style.display === 'none'; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const plain = await measure();

  const want = SECONDS / RATE;
  const lenOk = Math.abs(keep.seconds - want) < 0.2;
  const pitchOk = Math.abs(keep.hz - HZ) < 25;
  const controlOk = Math.abs(plain.hz - HZ * RATE) < 40; // 그냥 빠르게는 660Hz 로 올라가야 한다

  return {
    ok: lenOk && pitchOk && controlOk,
    why:
      `길이 ${keep.seconds.toFixed(2)}초 (${want.toFixed(2)} 목표) ${lenOk ? '✓' : '✗'} · ` +
      `높이 ${Math.round(keep.hz)}Hz (440 유지) ${pitchOk ? '✓' : '✗'} · ` +
      `대조 「그냥 빠르게」 ${Math.round(plain.hz)}Hz (660 으로 올라가야) ${controlOk ? '✓' : '✗'}`
  };
});

await browser.close();

console.log(`${out.ok ? '  OK' : '  X '} ${out.why}`);
if (!out.ok) {
  console.error('[test-audiospeed] 길이나 목소리 높이가 약속과 다르다');
  process.exit(1);
}
console.log('[test-audiospeed] 길이만 줄고 목소리 높이는 그대로인 것까지 확인');
