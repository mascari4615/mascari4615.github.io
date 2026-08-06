/**
 * PDF 글자 뽑기가 읽을 수 있는 모양으로 나오는지 확인한다 (TASK-KL-088)
 *
 * 「글자가 나왔다」로는 부족하다. 이 기능이 조용히 망가지는 방식은 순서다 —
 * PDF 는 글자 조각을 아무 순서로나 담을 수 있어, 좌표를 안 보면 줄이 뒤섞이거나
 * 아래에서 위로 나온다. 글자 수는 그대로라 눈치채기 어렵다.
 *
 * 그래서 순서를 아는 PDF 를 만들어 넣고 **줄 순서가 그대로인지**, 그리고
 * 글자 없는 PDF 에서 **빈 결과를 성공이라 하지 않는지**까지 본다.
 *
 * 사용: node scripts/test-pdf2text.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route('**/*', (route) => {
  if (route.request().url().includes('pdfjs.worker')) {
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: read('js/vendor/pdfjs.worker.min.js') });
  }
  return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
});
await page.goto('http://localhost/');

await page.addScriptTag({ content: read('js/vendor/pdf-lib.min.js') });
await page.addScriptTag({ content: read('js/vendor/pdfjs.min.js') });
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = {
    register: (t) => { window.__reg[t.id] = t; },
    trackUse() {},
    mountTool() { return true; },
    copyText: () => Promise.resolve(),
    ensureScript: () => Promise.resolve()
  };
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
});
await page.addScriptTag({ content: read('js/widgets/tools/pdf2text.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['pdf2text'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  const LINES = ['Alpha one', 'Bravo two', 'Charlie three', 'Delta four'];

  // 글자가 든 PDF — 일부러 **아래 줄부터** 그린다. 좌표를 안 보면 순서가 뒤집힌다.
  const makeTextPdf = async () => {
    const doc = await window.PDFLib.PDFDocument.create();
    const font = await doc.embedFont(window.PDFLib.StandardFonts.Helvetica);
    const p = doc.addPage([400, 300]);
    const ys = [80, 130, 180, 230]; // 아래→위
    for (let i = 0; i < LINES.length; i++) {
      p.drawText(LINES[LINES.length - 1 - i], { x: 40, y: ys[i], size: 14, font });
    }
    return new Blob([await doc.save()], { type: 'application/pdf' });
  };

  // 글자가 없는 PDF (스캔 문서 흉내) — 사각형만 그린다
  const makeEmptyPdf = async () => {
    const doc = await window.PDFLib.PDFDocument.create();
    const p = doc.addPage([400, 300]);
    p.drawRectangle({ x: 20, y: 20, width: 360, height: 260, color: window.PDFLib.rgb(0.8, 0.8, 0.8) });
    return new Blob([await doc.save()], { type: 'application/pdf' });
  };

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  const wait = (test, ms, why) =>
    new Promise((res, rej) => {
      const t0 = Date.now();
      const k = () => {
        if (test()) return res();
        if (Date.now() - t0 > ms) return rej(new Error(why + ' / 안내: ' + host.querySelector('#ptStatus').textContent));
        setTimeout(k, 70);
      };
      k();
    });

  // 함정: 「편집 화면이 보이는가」로 기다리면 안 된다 — 첫 파일 때 이미 보이므로 두 번째는
  // 즉시 통과해 **앞 문서를 다시 재게 된다**(실제로 그렇게 헛다리를 짚었다).
  // 새 문서가 실렸다는 안내가 뜰 때까지 기다린다.
  const feed = async (blob, name) => {
    const st = host.querySelector('#ptStatus');
    st.textContent = '';
    const dt = new DataTransfer();
    dt.items.add(new File([blob], name, { type: 'application/pdf' }));
    const input = host.querySelector('#ptFile');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    await wait(() => st.textContent.includes('쪽 범위를 정하고'), 15000, 'PDF 를 열지 못했다');
  };

  // ① 순서가 지켜지는가
  await feed(await makeTextPdf(), 'text.pdf');
  host.querySelector('#ptMark').checked = false;
  host.querySelector('#ptOut').value = '';
  host.querySelector('#ptRun').click();
  await wait(() => host.querySelector('#ptOut').value.trim().length > 0, 20000, '글자가 나오지 않았다');
  const got = host.querySelector('#ptOut').value.trim().split('\n').map((s) => s.trim()).filter(Boolean);
  const orderOk = LINES.every((l, i) => (got[i] || '').includes(l.split(' ')[0]));

  // ② 글자 없는 PDF 를 성공이라 하지 않는가
  await feed(await makeEmptyPdf(), 'scan.pdf');
  host.querySelector('#ptOut').value = '';
  const status = host.querySelector('#ptStatus');
  status.textContent = '';
  host.querySelector('#ptRun').click();
  // 고정 시간 기다리기는 성급하다 — 처리가 끝났다는 **신호**를 기다린다.
  // (실제로 1.5초 기다렸다가 아직 안 끝난 상태를 「경고 안 함」으로 잘못 읽었다)
  await wait(() => status.textContent.length > 0 && !status.textContent.includes('찾는 중'), 20000, '두 번째 처리가 끝나지 않았다');
  const warned = status.className.includes('error') && status.textContent.includes('글자가 없');

  return {
    ok: orderOk && warned,
    why: `줄 순서 ${orderOk ? '지켜짐' : '뒤섞임'} (${got.slice(0, 4).join(' / ')}) · 글자 없는 PDF 경고 ${warned ? '함' : '안 함'}`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-pdf2text] PDF 글자 뽑기가 제대로 돌지 않는다');
  process.exit(1);
}
console.log('[test-pdf2text] 줄 순서 복원과 스캔 문서 안내까지 확인');
