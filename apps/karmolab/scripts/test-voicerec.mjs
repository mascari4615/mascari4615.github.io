/**
 * 목소리 녹음 위젯을 가짜 마이크로 끝까지 돌려 본다 (TASK-KL-088)
 *
 * 녹음은 「버튼이 눌리고 시간이 흐르는」 것만으로는 아무것도 증명되지 않는다.
 * 진짜 사고는 **아무 소리도 안 담겼는데 성공처럼 보이는 것**이다.
 * 그래서 브라우저에 가짜 마이크(소리가 나오는)를 물리고, 결과가
 * ① WAV 로 나오는지 ② 길이가 있는지 ③ **실제로 소리가 담겼는지**(무음 아님) 를 본다.
 *
 * 사용: node scripts/test-voicerec.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveAppAssets } from './lib/widget-harness.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// 가짜 마이크: 크로미움이 만들어 주는 시험용 소리(비프)를 마이크 입력으로 넣는다.
const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
});
const page = await browser.newPage();
await serveAppAssets(page, root);
await page.goto('http://localhost/');

await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; } };
});
await page.addScriptTag({ content: read('js/widgets/tools/voicerec.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['voicerec'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);
  await window.__karmoWaitDrawn(host);
  host.querySelector('#vrStart').click();

  const wait = (test, ms, why) =>
    new Promise((res, rej) => {
      const t0 = Date.now();
      const k = () => {
        if (test()) return res();
        if (Date.now() - t0 > ms) return rej(new Error(why));
        setTimeout(k, 60);
      };
      k();
    });

  const stopBtn = await window.__karmoWaitIn(host, '#vrStop');
  await wait(() => !stopBtn.disabled, 8000, '녹음이 시작되지 않았다');
  await new Promise((r) => setTimeout(r, 1500)); // 1.5초 담는다
  stopBtn.click();

  const preview = host.querySelector('#vrPreview');
  await wait(() => preview.src && preview.src.startsWith('blob:'), 15000, '녹음 결과가 나오지 않았다');

  const blob = await (await fetch(preview.src)).blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) + String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);

  // 진짜 소리가 담겼는지 — 표본을 해독해 가장 큰 값을 본다. 무음이면 0 에 가깝다.
  const AC = window.AudioContext;
  const ctx = new AC();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const ch = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < ch.length; i += 7) peak = Math.max(peak, Math.abs(ch[i]));
  void ctx.close();

  return {
    ok: tag === 'RIFFWAVE' && buf.duration > 0.5 && peak > 0.02,
    why: `형식 ${tag} · 길이 ${buf.duration.toFixed(2)}초 · 가장 큰 소리 ${(peak * 100).toFixed(0)}% (RIFFWAVE·0.5초 초과·2% 초과여야 함)`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-voicerec] 녹음이 제대로 담기지 않는다');
  process.exit(1);
}
console.log('[test-voicerec] 가짜 마이크로 녹음해 WAV 가 나오고 소리도 담기는 것까지 확인');
