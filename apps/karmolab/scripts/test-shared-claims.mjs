/**
 * 공용 모듈이 **적어 둔 약속을 실제로 지키는가** (TASK-KL-277).
 *
 * `rules/quality.md § 설명문이 거짓말이면 아무 검사에도 안 걸린다` 를 이번 세션에 만든
 * 공용 모듈들에 그대로 적용한다. 설명문에 「~한다」고 적은 문장 하나가 검사 하나다.
 * 여기 모은 것은 **틀려도 조용한** 약속들 — 화면은 멀쩡하고 오류도 안 나는 종류다.
 *
 *   `shared/pdf.openForRead`  「같은 파일을 두 번 열 수 있다」
 *   `shared/media.loadAudio`  「같은 파일을 두 번 읽을 수 있다」
 *
 * ⚠ 이 둘의 설명문에는 원래 「사본을 안 넘기면 두 번째가 빈손이 된다」고 적혀 있었는데,
 *   **그 줄을 빼도 이 검사가 안 빨개졌다**(통을 매번 새로 뜨므로). 검사가 못 잡는다는 건
 *   그 약속이 지금은 관측되지 않는다는 뜻이라, 설명문을 실제에 맞춰 고쳤다
 *   (`rules/quality.md § 설명문이 거짓말이면 아무 검사에도 안 걸린다`).
 *   검사는 남긴다 — 「두 번 열 수 있다」 자체는 여전히 지켜야 할 약속이다.
 *   `shared/image.toCanvas`   「늘리지는 않는다」
 *   `shared/image.encode`     「JPG 는 흰 바탕을 깐다」
 *   `shared/text.head`        「반 토막 난 글자를 안 남긴다」
 *
 * 사용: node scripts/test-shared-claims.mjs
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveAppAssets } from './lib/widget-harness.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bundled = await build({
  stdin: {
    contents: `
      import { openForRead } from './src/widgets/tools/shared/pdf';
      import { loadAudio } from './src/widgets/tools/shared/media';
      import { toCanvas, encode } from './src/widgets/tools/shared/image';
      import { head } from './src/widgets/tools/shared/text';
      window.__shared = { openForRead, loadAudio, toCanvas, encode, head };
    `,
    resolveDir: root,
    loader: 'ts'
  },
  bundle: true,
  format: 'iife',
  write: false,
  logLevel: 'silent'
});

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage();
await serveAppAssets(page, root);
await page.goto('http://localhost/');
/* pdf.js 는 진짜로 있어야 한다 — 「두 번 열 수 있나」를 재는 검사이므로 흉내로는 못 잰다.
 * 실제 `ensureScript` 가 하는 일(그 파일을 붙이기)을 여기서 그대로 한다. */
await page.addScriptTag({ path: path.join(root, 'js/vendor/pdfjs.min.js') });
await page.evaluate(() => {
  window.Toolbox = { ensureScript: async () => {}, register() {}, trackUse() {} };
});
await page.addScriptTag({ content: bundled.outputFiles[0].text });

/* 손으로 짠 두 쪽 PDF (다른 검사와 같은 것) */
const tinyPdf = () => {
  const objs = [
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj'
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  for (const o of objs) {
    offsets.push(body.length);
    body += o + '\n';
  }
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += String(off).padStart(10, '0') + ' 00000 n \n';
  body += `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Array.from(Buffer.from(body, 'latin1'));
};

const out = await page.evaluate(async ({ pdfBytes }) => {
  const S = window.__shared;
  const res = {};

  /* ① PDF 를 **두 번** 연다 — 사본을 안 넘기면 두 번째가 빈손이다 */
  try {
    const file = new File([new Uint8Array(pdfBytes)], 'a.pdf', { type: 'application/pdf' });
    const first = await S.openForRead(file);
    const second = await S.openForRead(file);
    res.pdfTwice = `${first.numPages}/${second.numPages}`;
  } catch (e) {
    res.pdfTwice = 'throw: ' + String(e).slice(0, 60);
  }

  /* ② 소리도 두 번 */
  try {
    const rate = 8000;
    const n = rate;
    const head = new DataView(new ArrayBuffer(44));
    const put = (o, s) => [...s].forEach((c, i) => head.setUint8(o + i, c.charCodeAt(0)));
    put(0, 'RIFF'); head.setUint32(4, 36 + n * 2, true); put(8, 'WAVE'); put(12, 'fmt ');
    head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 1, true);
    head.setUint32(24, rate, true); head.setUint32(28, rate * 2, true);
    head.setUint16(32, 2, true); head.setUint16(34, 16, true);
    put(36, 'data'); head.setUint32(40, n * 2, true);
    const pcm = new Int16Array(n);
    for (let i = 0; i < n; i++) pcm[i] = Math.sin((i / rate) * 880 * Math.PI * 2) * 12000;
    const wav = new File([head.buffer, pcm.buffer], 'a.wav', { type: 'audio/wav' });
    const a = await S.loadAudio(wav);
    const b = await S.loadAudio(wav);
    res.audioTwice = `${Math.round(a.duration)}/${Math.round(b.duration)}`;
  } catch (e) {
    res.audioTwice = 'throw: ' + String(e).slice(0, 60);
  }

  /* ③ 작은 그림에 큰 상자를 줘도 안 늘린다 */
  const small = document.createElement('canvas');
  small.width = 20;
  small.height = 10;
  const grown = S.toCanvas(small, { w: 400, h: 400 });
  res.noUpscale = `${grown.width}x${grown.height}`;

  /* ④ JPG 는 흰 바탕 */
  const clear = document.createElement('canvas');
  clear.width = 8;
  clear.height = 8;
  const jpg = await S.encode(clear, 'jpeg', 0.9);
  const bmp = await createImageBitmap(jpg);
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = 8;
  cv.getContext('2d').drawImage(bmp, 0, 0);
  const px = cv.getContext('2d').getImageData(4, 4, 1, 1).data;
  res.jpegBg = `${px[0]},${px[1]},${px[2]}`;

  /* ⑤ 앞머리 자르기가 글자를 반 토막 내지 않는다 */
  res.headCut = S.head('👍'.repeat(20), 7);

  return res;
}, { pdfBytes: tinyPdf() });

check(out.pdfTwice === '1/1', `PDF 를 두 번 열 수 있어야 한다 (지금 ${out.pdfTwice})`);
check(out.audioTwice === '1/1', `소리를 두 번 읽을 수 있어야 한다 (지금 ${out.audioTwice})`);
check(out.noUpscale === '20x10', `작은 그림을 늘리지 않는다 (지금 ${out.noUpscale})`);
check(out.jpegBg === '255,255,255', `JPG 는 흰 바탕을 깐다 (지금 rgb(${out.jpegBg}))`);
check(!/�/.test(out.headCut), `앞머리를 자르며 글자를 쪼개지 않는다 (지금 「${out.headCut}」)`);

process.stdout.write('\n');
await browser.close();
if (failures.length) {
  console.error(`[test-shared-claims] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-shared-claims] 공용 모듈이 적어 둔 약속을 지킨다');
