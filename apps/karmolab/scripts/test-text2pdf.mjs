/**
 * 글 → PDF 가 한글을 지키고 쪽을 제대로 나누는지 확인한다 (TASK-KL-088)
 *
 * 이 도구의 존재 이유는 **한글이 안 깨지는 것**이다. PDF 기본 글꼴에는 한글이 없어,
 * 흔한 구현은 네모(□)만 찍히거나 오류를 낸다 — 그런데 파일은 멀쩡히 나온다.
 *
 * 그래서 결과 PDF 를 **다시 그려 잉크를 센다**. 글자가 안 그려지면 잉크가 거의 없다.
 * 긴 글을 넣어 쪽이 늘어나는지도 본다(한 쪽에 다 욱여넣으면 뒤가 잘린다).
 *
 * 사용: node scripts/test-text2pdf.mjs
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
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; }, ensureScript: () => Promise.resolve() };
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
});
await page.addScriptTag({ content: read('js/widgets/tools/text2pdf.js') });

const result = await page.evaluate(async () => {
  const tool = window.__reg['text2pdf'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);
  for (let i = 0; host.children.length === 0 && i < 320; i++) await new Promise((r) => setTimeout(r, 25));

  const wait = (test, ms, why) =>
    new Promise((res, rej) => {
      const t0 = Date.now();
      const k = () => {
        if (test()) return res();
        if (Date.now() - t0 > ms) return rej(new Error(why + ' / 안내: ' + host.querySelector('#t2Status').textContent));
        setTimeout(k, 70);
      };
      k();
    });

  const grab = async (text) => {
    host.querySelector('#t2Text').value = text;
    host.querySelector('#t2Text').dispatchEvent(new Event('input'));
    let out = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => { if (b && b.type === 'application/pdf') out = b; return orig(b); };
    host.querySelector('#t2Run').click();
    await wait(() => out !== null, 20000, 'PDF 가 만들어지지 않았다');
    URL.createObjectURL = orig;
    return out;
  };

  // 잉크를 센다 — 글자가 안 그려지면 거의 0 이다
  const inkOf = async (blob, pageNo) => {
    const doc = await window.pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
    const p = await doc.getPage(pageNo);
    const vp = p.getViewport({ scale: 1 });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const c = cv.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, cv.width, cv.height);
    await p.render({ canvasContext: c, viewport: vp }).promise;
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 120) dark++;
    return { dark, pages: doc.numPages, w: Math.round(vp.width), h: Math.round(vp.height) };
  };

  // ① 한글·이모지가 실제로 그려지는가
  const korean = await grab('안녕하세요. 이 문장은 한글이 깨지지 않는지 보기 위한 것입니다.\n가나다라마바사 아자차카타파하 🎉');
  const k = await inkOf(korean, 1);

  // ② 긴 글은 쪽이 늘어나는가
  const long = await grab(Array.from({ length: 200 }, (_, i) => `${i + 1}번째 줄입니다. 한글로 적힌 긴 문서를 여러 쪽으로 나누는지 봅니다.`).join('\n'));
  const l = await inkOf(long, 2);

  const a4 = Math.abs(k.w - 595) < 3 && Math.abs(k.h - 842) < 3;
  return {
    ok: k.dark > 300 && a4 && l.pages > 1 && l.dark > 300,
    why: `한글 잉크 ${k.dark} (300 초과) · 규격 ${k.w}x${k.h} (595x842) · 긴 글 ${l.pages}쪽 · 2쪽 잉크 ${l.dark}`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-text2pdf] 글 → PDF 가 제대로 돌지 않는다');
  process.exit(1);
}
console.log('[test-text2pdf] 한글이 그려지고 A4 로 쪽이 나뉘는 것까지 확인');
