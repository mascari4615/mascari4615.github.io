/**
 * PDF 쪽 번호가 맞는 장에만 들어가는지 확인한다 (TASK-KL-088)
 *
 * 번호는 글자를 그림으로 그려 넣는다(PDF 기본 글꼴이 한글을 못 담는다). 그래서 글자 추출로는
 * 못 잰다 — 페이지를 그려서 **잉크가 어디 있는지** 본다.
 *
 *  ① 건너뛰기 0일 때: 모든 장의 아래쪽에 잉크가 생기는가
 *  ② 표지 1장 건너뛸 때: 첫 장은 깨끗하고 나머지에만 생기는가
 *     — 표지에 「1」이 찍히면 대부분 문서를 다시 만들어야 한다. 여기가 진짜 시험이다.
 *  ③ 대조: 넣기 전 원본 아래쪽은 비어 있는가 (아니면 아무거나 잉크로 세고 있는 것이다)
 *
 * 사용: node scripts/test-pdfpagenum.mjs
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
await page.route('**/pdfjs.worker.min.js', (route) =>
  route.fulfill({ status: 200, contentType: 'text/javascript', body: read('js/vendor/pdfjs.worker.min.js') })
);
await page.goto('http://localhost/');
for (const v of ['vendor/pdf-lib.min.js', 'vendor/pdfjs.min.js']) {
  await page.addScriptTag({ content: read('js/' + v) });
}
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; }, ensureScript: async () => {} };
});
await page.addScriptTag({ content: read('js/widgets/tools/pdfpagenum.js') });

const out = await page.evaluate(async () => {
  const tool = window.__reg['pdfpagenum'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);
  await window.__karmoWaitDrawn(host);
  // 3장짜리 빈 문서 (아래쪽은 비어 있어야 대조가 성립한다)
  const src = await window.PDFLib.PDFDocument.create();
  for (let i = 0; i < 3; i++) src.addPage([400, 500]);
  const srcBytes = await src.save();

  window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
  /** 각 장의 아래 20% 에 잉크가 있는지 */
  const inkBottom = async (bytes) => {
    const doc = await window.pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    const marks = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n);
      // 크게 그려서 잰다 — 원래 크기로는 11pt 숫자가 점 열 몇 개라 문턱을 못 세운다
      const vp = p.getViewport({ scale: 3 });
      const cv = document.createElement('canvas');
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await p.render({ canvasContext: ctx, viewport: vp }).promise;
      const y0 = Math.floor(cv.height * 0.8);
      const d = ctx.getImageData(0, y0, cv.width, cv.height - y0).data;
      let dark = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 200) dark++;
      marks.push(dark);
    }
    return marks;
  };

  const before = await inkBottom(srcBytes);

  // 내려받기를 가로채 결과를 잡는다
  const runWith = async (skip) => {
    const input = await window.__karmoWaitIn(host, '#pnFile');
    const dt = new DataTransfer();
    dt.items.add(new File([srcBytes], '문서.pdf', { type: 'application/pdf' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    for (let i = 0; i < 100 && !/장짜리 문서예요/.test(host.querySelector('#pnStatus').textContent); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    host.querySelector('#pnSkip').value = String(skip);
    host.querySelector('#pnSkip').dispatchEvent(new Event('input'));

    let blob = null;
    const origUrl = URL.createObjectURL;
    URL.createObjectURL = (b) => { blob = b; return origUrl(b); };
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = origCreate(tag);
      if (tag === 'a') el.click = () => {};
      return el;
    };
    host.querySelector('#pnRun').click();
    for (let i = 0; i < 200 && !/번호를 넣었어요/.test(host.querySelector('#pnStatus').textContent); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    URL.createObjectURL = origUrl;
    document.createElement = origCreate;
    if (!blob) return null;
    return inkBottom(new Uint8Array(await blob.arrayBuffer()));
  };

  const all = await runWith(0);
  const skipped = await runWith(1);
  if (!all || !skipped) return { ok: false, why: '결과 PDF 가 안 만들어졌다: ' + host.querySelector('#pnStatus').textContent };

  const cleanBefore = before.every((v) => v === 0);
  const allMarked = all.every((v) => v > 20);
  const coverClean = skipped[0] === 0 && skipped[1] > 20 && skipped[2] > 20;

  return {
    ok: cleanBefore && allMarked && coverClean,
    why:
      `넣기 전 아래쪽 ${before.join(',')} (모두 0이어야) ${cleanBefore ? '✓' : '✗'} · ` +
      `전부 넣기 ${all.join(',')} ${allMarked ? '✓' : '✗'} · ` +
      `표지 건너뛰기 ${skipped.join(',')} (첫 장 0이어야) ${coverClean ? '✓' : '✗'}`
  };
});

await browser.close();

console.log(`${out.ok ? '  OK' : '  X '} ${out.why}`);
if (!out.ok) {
  console.error('[test-pdfpagenum] 번호가 빠졌거나, 건너뛰라는 표지에 찍혔다');
  process.exit(1);
}
console.log('[test-pdfpagenum] 표지를 건너뛰고 본문에만 번호가 들어가는 것까지 확인');
