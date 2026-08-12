/**
 * PDF 용량 줄이기를 진짜 PDF 로 끝까지 돌려 본다 (TASK-KL-088)
 *
 * 이 도구가 조용히 어긋날 자리:
 *  ① 쪽이 빠지거나 늘어남 — 결과는 열리는데 내용이 다르다
 *  ② 쪽 크기가 바뀜 — 인쇄하면 A4 가 아니게 된다
 *  ③ 줄었다고 말하는데 실제로는 안 줆
 * 셋 다 오류가 안 난다. 그래서 결과 PDF 를 다시 열어 **쪽 수·쪽 크기·용량**을 직접 잰다.
 *
 * 사용: node scripts/test-pdfcompress.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
// 위젯이 무거운 처리기를 부를 때 쓰는 길(ensureScript)을 우리가 대신 채워 준다.
// pdf.js 는 별도 일꾼 파일을 반드시 받아 간다 — 없으면 PDF 를 아예 못 연다.
// 네트워크는 안 쓰되, 그 경로만은 진짜 파일을 돌려준다.
/* ★ `/apps/karmolab/js/**` 는 디스크의 진짜 산출물로 준다 (2026-08-12).
 *   위젯 build() 가 말 묶음(i18n)을 받아 온 뒤에 그리므로, 껍데기만 주면 `#pcFile` 이 null 이라
 *   「Cannot set properties of null」로 죽는다 — 제품이 아니라 검사가 굶긴 것이다.
 *   (자매 검사들과 같은 처방. 여기는 pdfjs 일꾼을 따로 먹여야 해서 공용 하네스 대신 직접 적는다.) */
await page.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (url.href.includes('pdfjs.worker')) {
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: read('js/vendor/pdfjs.worker.min.js') });
  }
  const rel = url.pathname.replace(/^\/apps\/karmolab\//, '');
  if (rel !== url.pathname) {
    try {
      return route.fulfill({
        status: 200,
        contentType: rel.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'application/json; charset=utf-8',
        body: read(rel)
      });
    } catch { /* 없는 파일이면 아래 껍데기로 */ }
  }
  return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
});
await page.addInitScript(() => { window.__KARMO_LOCALE = 'ko'; });
await page.goto('http://localhost/');

const pdfLibSrc = read('js/vendor/pdf-lib.min.js');
const pdfjsSrc = read('js/vendor/pdfjs.min.js');
await page.addScriptTag({ content: pdfLibSrc });
await page.addScriptTag({ content: pdfjsSrc });

await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = {
    register: (t) => { window.__reg[t.id] = t; },
    trackUse() {},
    mountTool() { return true; },
    // 처리기는 이미 붙여 두었다 — 위젯이 부르면 그냥 넘어가면 된다
    ensureScript: () => Promise.resolve()
  };
  // 일꾼 파일 자리를 실제와 같은 경로로 둔다 (위 route 가 진짜 파일을 돌려준다)
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
});
await page.addScriptTag({ content: read('js/widgets/tools/pdfcompress.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['pdfcompress'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  // 시험용 PDF: 잘 안 눌리는 사진 같은 그림을 넣어 줄어들 여지를 만든다.
  const makePdf = async () => {
    const cv = document.createElement('canvas');
    cv.width = 900; cv.height = 1200;
    const ctx = cv.getContext('2d');
    let s = 12345;
    const img = ctx.createImageData(cv.width, cv.height);
    for (let i = 0; i < cv.width * cv.height; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      img.data[i * 4] = s & 0xff;
      img.data[i * 4 + 1] = (s >> 8) & 0xff;
      img.data[i * 4 + 2] = (s >> 16) & 0xff;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const jpeg = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.98));
    const doc = await window.PDFLib.PDFDocument.create();
    const embedded = await doc.embedJpg(await jpeg.arrayBuffer());
    for (let i = 0; i < 3; i++) {
      const p = doc.addPage([595, 842]); // A4
      p.drawImage(embedded, { x: 0, y: 0, width: 595, height: 842 });
    }
    return new Blob([await doc.save()], { type: 'application/pdf' });
  };

  const src = await makePdf();
  const file = new File([src], 'test.pdf', { type: 'application/pdf' });

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  /* build() 는 말 묶음을 받아 온 뒤에 그린다 — 그려질 때까지 기다린다(sleep 아님). */
  const waitDrawn = async (ms = 8000) => {
    const until = Date.now() + ms;
    for (;;) {
      if (host.children.length > 0) return;
      if (Date.now() > until) throw new Error('build() 뒤 아무것도 안 그려졌다 — 기다리는 말 묶음이 안 온다');
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  await waitDrawn();

  const input = host.querySelector('#pcFile');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));

  const wait = (test, ms, why) =>
    new Promise((res, rej) => {
      const t0 = Date.now();
      const k = () => {
        if (test()) return res();
        if (Date.now() - t0 > ms) return rej(new Error(why + ' / 마지막 안내: ' + host.querySelector('#pcStatus').textContent));
        setTimeout(k, 80);
      };
      k();
    });

  await wait(() => !host.querySelector('#pcRun').disabled && host.querySelector('#pcStats').textContent.includes('쪽'), 20000, 'PDF 를 읽지 못했다');

  host.querySelector('#pcQuality').value = '55';
  host.querySelector('#pcQuality').dispatchEvent(new Event('input'));
  host.querySelector('#pcRun').click();
  await wait(() => !host.querySelector('#pcSave').disabled, 60000, '줄이기가 끝나지 않았다');

  // 위젯이 뭐라고 적든 파일이 진실이다. 결과 PDF 자체를 얻으려고 저장 클릭을 가로챈다.
  let outBlob = null;
  const origCreate = URL.createObjectURL;
  URL.createObjectURL = (b) => { if (b && b.type === 'application/pdf') outBlob = b; return origCreate(b); };
  host.querySelector('#pcSave').click();
  URL.createObjectURL = origCreate;
  if (!outBlob) return { ok: false, why: '결과 파일을 얻지 못했다' };

  const head = new Uint8Array(await outBlob.slice(0, 5).arrayBuffer());
  const magic = String.fromCharCode(...head);
  const outDoc = await window.pdfjsLib.getDocument({ data: await outBlob.arrayBuffer() }).promise;
  const p1 = await outDoc.getPage(1);
  const vp = p1.getViewport({ scale: 1 });

  const sameSize = Math.abs(vp.width - 595) < 2 && Math.abs(vp.height - 842) < 2;
  return {
    ok: magic === '%PDF-' && outDoc.numPages === 3 && sameSize && outBlob.size < src.size,
    why: `형식 ${magic} · 쪽 ${outDoc.numPages}/3 · 첫 쪽 ${Math.round(vp.width)}x${Math.round(vp.height)} (595x842 여야 함) · ${(src.size / 1024).toFixed(0)}KB → ${(outBlob.size / 1024).toFixed(0)}KB`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-pdfcompress] PDF 줄이기가 제대로 돌지 않는다');
  process.exit(1);
}
console.log('[test-pdfcompress] 쪽 수·쪽 크기를 지키면서 용량이 주는 것까지 확인');
