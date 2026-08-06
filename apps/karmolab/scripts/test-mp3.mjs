/**
 * MP3 로 저장하는 길이 진짜로 도는지 확인한다 (TASK-KL-088)
 *
 * 압축기를 붙였다는 사실만으로는 아무것도 증명되지 않는다. 조용히 어긋날 자리:
 *  ① 파일은 나오는데 MP3 가 아님 (머리말이 틀림)
 *  ② 길이가 원본과 다름 (덩어리 단위를 잘못 넣으면 뒤가 잘린다)
 *  ③ 소리가 비었음 (무음이 나와도 파일 크기는 그럴듯하다)
 * 그래서 만든 MP3 를 **브라우저에게 다시 해독시켜** 길이와 소리를 잰다.
 *
 * 사용: node scripts/test-mp3.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route('**/*', (route) => {
  // 위젯이 압축기를 부르는 그 경로로 진짜 파일을 돌려준다
  if (route.request().url().includes('lame.min')) {
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: read('js/vendor/lame.min.js') });
  }
  return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
});
await page.goto('http://localhost/');

await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = {
    register: (t) => { window.__reg[t.id] = t; },
    trackUse() {},
    mountTool() { return true; },
    ensureScript: (p) =>
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/apps/karmolab/js/' + p + '.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('못 불러옴: ' + p));
        document.head.appendChild(s);
      })
  };
});
// 공용 소리 모듈을 시험용으로만 묶어 올린다. 위젯이 부르는 것과 **같은 원본**이라,
// 제품 코드에 시험용 통로를 뚫지 않고도 진짜 코드를 잰다.
const bundled = await esbuild.build({
  stdin: {
    contents: "import { encodeAudio } from './src/widgets/tools/shared/media'; window.__karmoMediaTest = { encodeAudio };",
    resolveDir: root,
    loader: 'ts'
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: ['es2020'],
  platform: 'browser'
});
await page.addScriptTag({ content: bundled.outputFiles[0].text });

const result = await page.evaluate(async () => {
  const ctx = new AudioContext();
  const rate = 44100;
  const seconds = 2;
  const buf = ctx.createBuffer(1, rate * seconds, rate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.5;

  const mod = window.__karmoMediaTest;
  if (!mod) return { ok: false, why: '시험용 통로가 없다' };

  const blob = await mod.encodeAudio(buf, 'mp3');
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  // MP3 는 0xFF 로 시작하는 프레임 머리말(또는 ID3)로 시작한다
  const looksMp3 = head[0] === 0xff || (head[0] === 0x49 && head[1] === 0x44);

  const back = await ctx.decodeAudioData(await blob.arrayBuffer());
  const bd = back.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < bd.length; i += 11) peak = Math.max(peak, Math.abs(bd[i]));
  void ctx.close();

  const wav = await mod.encodeAudio(buf, 'wav');
  return {
    ok: looksMp3 && Math.abs(back.duration - seconds) < 0.25 && peak > 0.2 && blob.size < wav.size / 3,
    why: `형식 ${looksMp3 ? 'MP3' : '아님'} · 길이 ${back.duration.toFixed(2)}초 (원본 ${seconds}초) · 소리 ${(peak * 100).toFixed(0)}% · 용량 ${(blob.size / 1024).toFixed(0)}KB (WAV ${(wav.size / 1024).toFixed(0)}KB 의 1/3 미만이어야 함)`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-mp3] MP3 저장이 제대로 돌지 않는다');
  process.exit(1);
}
console.log('[test-mp3] MP3 로 만들고 다시 해독해 길이·소리·용량까지 확인');
