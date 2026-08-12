/**
 * PDF 여백 자르기가 제대로 잘라내는지 확인한다 (TASK-KL-088)
 *
 * 「잘랐다」는 페이지가 작아졌다는 뜻이지만, 작아지기만 하면 안 된다 — **내용이 남아 있어야**
 * 한다. 너무 바짝 자르면 글자가 잘리고, 그건 눈으로 열어 보기 전엔 모른다.
 *
 *  ① 넓은 여백에 작은 글씨만 있는 문서를 잘랐을 때 페이지가 실제로 작아지는가
 *  ② 자른 뒤에도 글자가 그대로 뽑히는가 (그림으로 굽지 않았다는 뜻이기도 하다)
 *  ③ 대조: 이미 꽉 찬 문서는 거의 안 자르는가 — 아니면 아무 문서나 깎고 있는 것이다
 *
 * 사용: node scripts/test-pdfcrop.mjs
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
await page.addScriptTag({ content: read('js/widgets/tools/pdfcrop.js') });

const out = await page.evaluate(async () => {
  const MARK = 'INSIDE-THE-MARGINS';
  const tool = window.__reg['pdfcrop'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };
  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';

  /** 여백이 넓은 문서 / 꽉 찬 문서를 만든다 */
  const makePdf = async (full) => {
    const d = await window.PDFLib.PDFDocument.create();
    const font = await d.embedFont(window.PDFLib.StandardFonts.Helvetica);
    const p = d.addPage([400, 500]);
    if (full) {
      // 진짜로 가장자리까지 채운다. 글줄만 쌓으면 폭이 100pt 뿐이라 「꽉 찬 문서」가 아니다 —
      // 처음에 그렇게 만들어 놓고 도구가 제대로 자른 것을 실패로 읽었다.
      p.drawRectangle({ x: 6, y: 6, width: 388, height: 488, borderWidth: 2, borderColor: window.PDFLib.rgb(0, 0, 0) });
      for (let y = 20; y < 480; y += 20) p.drawText(MARK, { x: 12, y, size: 10, font });
    } else {
      p.drawText(MARK, { x: 170, y: 250, size: 8, font }); // 한가운데 작게
    }
    return d.save();
  };

  const crop = async (bytes) => {
    const input = await window.__karmoWaitIn(host, '#pcFile');
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], '문서.pdf', { type: 'application/pdf' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    for (let i = 0; i < 200 && host.querySelector('#pcRun').disabled; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    let blob = null;
    const origUrl = URL.createObjectURL;
    URL.createObjectURL = (b) => { blob = b; return origUrl(b); };
    const origCreate = document.createElement.bind(document);
    document.createElement = (t) => { const el = origCreate(t); if (t === 'a') el.click = () => {}; return el; };
    host.querySelector('#pcRun').click();
    for (let i = 0; i < 200 && !/장을 잘랐어요|자르지 못했어요/.test(host.querySelector('#pcStatus').textContent); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    URL.createObjectURL = origUrl;
    document.createElement = origCreate;
    if (!blob) return null;
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const p = await doc.getPage(1);
    const vp = p.getViewport({ scale: 1 });
    const txt = (await p.getTextContent()).items.map((i) => i.str).join(' ');
    return { w: Math.round(vp.width), h: Math.round(vp.height), hasText: txt.includes(MARK) };
  };

  const sparse = await crop(await makePdf(false));
  const full = await crop(await makePdf(true));
  if (!sparse || !full) return { ok: false, why: '결과 PDF 가 안 만들어졌다: ' + host.querySelector('#pcStatus').textContent };

  const shrank = sparse.w < 250 && sparse.h < 300;
  const keptText = sparse.hasText;
  const fullKept = full.w > 340 && full.h > 430; // 꽉 찬 문서는 거의 안 깎여야 한다

  return {
    ok: shrank && keptText && fullKept,
    why:
      `여백 넓은 문서 400x500 → ${sparse.w}x${sparse.h} ${shrank ? '✓' : '✗'} · ` +
      `자른 뒤 글자 ${keptText ? '그대로 뽑힘 ✓' : '사라짐 ✗'} · ` +
      `대조(꽉 찬 문서) → ${full.w}x${full.h} ${fullKept ? '✓' : '✗'}`
  };
});

await browser.close();

console.log(`${out.ok ? '  OK' : '  X '} ${out.why}`);
if (!out.ok) {
  console.error('[test-pdfcrop] 안 잘렸거나, 자르면서 글자를 잃었거나, 꽉 찬 문서까지 깎았다');
  process.exit(1);
}
console.log('[test-pdfcrop] 여백만 걷어내고 글자는 그대로 남는 것까지 확인');
