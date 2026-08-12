/**
 * 소리 페이드가 「툭」 소리를 실제로 없애는지 확인한다 (TASK-KL-088)
 *
 * 끊김은 시작·끝의 파형이 0 이 아니라서 난다. 그러니 **가장자리 진폭**을 재면 된다.
 *
 *  ① 시작·끝이 최대 진폭인 소리를 넣으면 「툭」 난다고 짚어 주는가
 *  ② 페이드를 넣으면 가장자리 진폭이 실제로 0 에 가까워지는가
 *  ③ 대조: 가운데는 그대로인가 — 전체를 조용하게 만들어 놓고 성공이라 할 수는 없다
 *
 * 사용: node scripts/test-audiofade.mjs
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
await page.addScriptTag({ content: read('js/widgets/tools/audiofade.js') });

const out = await page.evaluate(async () => {
  const SR = 44100;
  const SECONDS = 2;
  const tool = window.__reg['audiofade'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  await window.__karmoWaitDrawn(host);
  // 시작·끝이 최댓값인 사각파에 가까운 소리 — 「툭」이 확실히 나는 최악의 경우
  const n = SR * SECONDS;
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.sin((2 * Math.PI * 200 * i) / SR) >= 0 ? 30000 : -30000;
  const head = new ArrayBuffer(44);
  const dv = new DataView(head);
  const put = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  put(0, 'RIFF'); dv.setUint32(4, 36 + pcm.byteLength, true); put(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true); put(36, 'data'); dv.setUint32(40, pcm.byteLength, true);

  const input = await window.__karmoWaitIn(host, '#afFile');
  const dt = new DataTransfer();
  dt.items.add(new File([new Blob([head, pcm])], '시험음.wav', { type: 'audio/wav' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  for (let i = 0; i < 100 && host.querySelector('#afRun').disabled; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const warned = /「툭」/.test(host.querySelector('#afFound').textContent);

  host.querySelector('#afAuto').click();
  host.querySelector('#afRun').click();
  for (let i = 0; i < 300 && host.querySelector('#afPlay').style.display === 'none'; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const src = host.querySelector('#afPlay').src;
  if (!src) return { ok: false, why: '결과가 안 나왔다: ' + host.querySelector('#afStatus').textContent };

  const ctx = new AudioContext();
  const buf = await ctx.decodeAudioData(await (await fetch(src)).arrayBuffer());
  const d = buf.getChannelData(0);
  const peak = (from, to) => {
    let m = 0;
    for (let i = from; i < to; i++) m = Math.max(m, Math.abs(d[i]));
    return m;
  };
  const edge = Math.round(SR * 0.005); // 앞뒤 5ms
  const first = peak(0, edge);
  const last = peak(d.length - edge, d.length);
  const middle = peak(Math.floor(d.length / 2) - SR / 10, Math.floor(d.length / 2) + SR / 10);
  void ctx.close();

  return {
    ok: warned && first < 0.1 && last < 0.1 && middle > 0.8,
    why:
      `끊김 짚어 줌 ${warned ? '✓' : '✗'} · ` +
      `시작 ${first.toFixed(3)} / 끝 ${last.toFixed(3)} (0.1 미만이어야) ${first < 0.1 && last < 0.1 ? '✓' : '✗'} · ` +
      `가운데 ${middle.toFixed(2)} (0.8 넘어야) ${middle > 0.8 ? '✓' : '✗'}`
  };
});

await browser.close();

console.log(`${out.ok ? '  OK' : '  X '} ${out.why}`);
if (!out.ok) {
  console.error('[test-audiofade] 끊김이 남았거나, 소리 전체를 줄여 버렸다');
  process.exit(1);
}
console.log('[test-audiofade] 가장자리만 잦아들고 가운데는 그대로인 것까지 확인');
