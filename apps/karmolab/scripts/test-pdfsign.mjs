/**
 * PDF 서명이 고른 자리에 제대로 들어가는지 확인한다 (TASK-KL-088)
 *
 * 조용히 어긋나는 자리가 둘이다:
 *  ① **위아래 뒤집힘** — PDF 의 y 는 아래에서 위로 커진다. 화면 좌표를 그대로 쓰면
 *     위쪽을 눌렀는데 아래에 찍힌다. 파일은 멀쩡히 나오고 오류도 없다.
 *  ② 엉뚱한 쪽에 들어감 — 쪽 번호를 1부터 세느냐 0부터 세느냐에서 어긋난다.
 *
 * 그래서 결과 PDF 를 **다시 그려 픽셀을 본다** — 누른 자리 근처에만 잉크가 있어야 한다.
 *
 * 사용: node scripts/test-pdfsign.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
/* ★ `/apps/karmolab/js/**` 는 디스크의 진짜 산출물로 준다 (2026-08-12) — 자매 검사들과 같은 처방.
 *   위젯 build() 가 말 묶음을 받아 온 뒤에 그리므로, 껍데기만 주면 화면이 영영 안 그려진다. */
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
await page.addScriptTag({ content: read('js/vendor/pdf-lib.min.js') });
await page.addScriptTag({ content: read('js/vendor/pdfjs.min.js') });
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = {
    register: (t) => { window.__reg[t.id] = t; },
    trackUse() {},
    mountTool() { return true; },
    ensureScript: () => Promise.resolve()
  };
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
});
await page.addScriptTag({ content: read('js/widgets/tools/pdfsign.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['pdfsign'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  // 빈 2쪽짜리 PDF
  const src = await (async () => {
    const doc = await window.PDFLib.PDFDocument.create();
    doc.addPage([400, 600]);
    doc.addPage([400, 600]);
    return new Blob([await doc.save()], { type: 'application/pdf' });
  })();

  const host = document.createElement('div');
  document.body.appendChild(host);
  host.style.width = '900px'; // 미리보기 크기가 잡히도록 먼저 넓혀 둔다
  tool.tabs[0].build(host);
  for (let i = 0; host.children.length === 0 && i < 320; i++) await new Promise((r) => setTimeout(r, 25));

  const wait = (test, ms, why) =>
    new Promise((res, rej) => {
      const t0 = Date.now();
      const k = () => {
        if (test()) return res();
        if (Date.now() - t0 > ms) return rej(new Error(why + ' / 안내: ' + host.querySelector('#psStatus').textContent));
        setTimeout(k, 70);
      };
      k();
    });

  const dt = new DataTransfer();
  dt.items.add(new File([src], 'contract.pdf', { type: 'application/pdf' }));
  const input = host.querySelector('#psFile');
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  // 화면이 보이는 것만으로는 부족하다 — 여는 일이 아직 끝나지 않았는데 서명을 넣으면,
  // 뒤늦게 뜨는 「서명을 그리고…」 안내가 우리 결과를 덮어써 실패로 보인다(실제로 그랬다).
  await wait(
    () => host.querySelector('#psStatus').textContent.includes('놓을 자리를 누르세요') && host.querySelector('#psView').width > 10,
    15000,
    'PDF 를 열지 못했다'
  );

  // 서명 대신 또렷한 검은 사각형 그림을 넣는다 (그리기 경로 대신 그림 경로를 태운다)
  const sig = document.createElement('canvas');
  sig.width = 120; sig.height = 60;
  const sctx = sig.getContext('2d');
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, 120, 60);
  const sigBlob = await new Promise((r) => sig.toBlob(r, 'image/png'));
  const dt2 = new DataTransfer();
  dt2.items.add(new File([sigBlob], 'sig.png', { type: 'image/png' }));
  const imgInput = host.querySelector('#psImg');
  imgInput.files = dt2.files;
  imgInput.dispatchEvent(new Event('change'));
  await wait(() => host.querySelector('#psStatus').textContent.includes('서명으로 넣었어요'), 8000, '서명 그림이 들어가지 않았다');

  // 2쪽의 **위쪽 1/4** 지점을 누른다 — 뒤집히면 아래에 찍힌다
  host.querySelector('#psPage').value = '2';
  host.querySelector('#psPage').dispatchEvent(new Event('input'));
  await new Promise((r) => setTimeout(r, 600));
  const view = host.querySelector('#psView');
  const r = view.getBoundingClientRect();
  view.dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.25, bubbles: true }));
  host.querySelector('#psSize').value = '30';
  host.querySelector('#psSize').dispatchEvent(new Event('input'));

  let outBlob = null;
  const orig = URL.createObjectURL;
  URL.createObjectURL = (b) => { if (b && b.type === 'application/pdf') outBlob = b; return orig(b); };
  host.querySelector('#psRun').click();
  await wait(() => outBlob !== null, 20000, '서명 넣기가 끝나지 않았다');
  URL.createObjectURL = orig;

  // 결과를 다시 그려 잉크 위치를 본다
  const doc = await window.pdfjsLib.getDocument({ data: await outBlob.arrayBuffer() }).promise;
  const inkOf = async (n) => {
    const p = await doc.getPage(n);
    const vp = p.getViewport({ scale: 1 });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const c = cv.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, cv.width, cv.height);
    await p.render({ canvasContext: c, viewport: vp }).promise;
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    let dark = 0, sumY = 0;
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        if (d[(y * cv.width + x) * 4] < 100) { dark++; sumY += y; }
      }
    }
    return { dark, avgY: dark ? sumY / dark / cv.height : -1 };
  };

  const p1 = await inkOf(1);
  const p2 = await inkOf(2);

  return {
    ok: doc.numPages === 2 && p1.dark < 50 && p2.dark > 500 && p2.avgY > 0.12 && p2.avgY < 0.4,
    why: `쪽 ${doc.numPages} · 1쪽 잉크 ${p1.dark} (없어야 함) · 2쪽 잉크 ${p2.dark} · 세로 위치 ${p2.avgY.toFixed(2)} (누른 0.25 근처여야 함)`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-pdfsign] 서명이 고른 자리에 들어가지 않는다');
  process.exit(1);
}
console.log('[test-pdfsign] 고른 쪽의 누른 자리에 서명이 들어가는 것까지 확인');
