/**
 * PDF 가리개가 정말 글자를 없애는지 확인한다 (TASK-KL-088)
 *
 * 이 도구가 존재하는 이유는 「검은 네모를 그려도 글자는 남는다」이다. 그런데 그 실패는
 * 눈으로는 절대 안 보인다 — 결과물이 똑같이 생겼기 때문이다. 그래서 눈이 아니라
 * **만들어진 PDF 에서 글자를 도로 뽑아** 잰다.
 *
 *  ① 비밀 글자가 들어간 PDF 를 만들고 → 그 자리를 가린 뒤 → 결과에서 글자를 뽑아 비밀이 없는지
 *  ② 쪽수가 그대로인지 (그림으로 굽다가 페이지를 잃으면 그것도 사고다)
 *  ③ 비교 대조: 가리지 않은 원본에서는 그 비밀이 실제로 뽑히는지
 *     — 이게 없으면 「원래 못 뽑는 것」을 성공으로 착각한다.
 *
 * 사용: node scripts/test-pdfredact.mjs
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
page.on('console', (m) => {
  if (m.type() === 'error') console.log('    [브라우저]', m.text().slice(0, 120));
});
await serveAppAssets(page, root);
// 일꾼 파일은 진짜 것을 내준다 (나중에 등록한 규칙이 먼저 걸린다)
await page.route('**/pdfjs.worker.min.js', (route) =>
  route.fulfill({ status: 200, contentType: 'text/javascript', body: read('js/vendor/pdfjs.worker.min.js') })
);
await page.goto('http://localhost/');

// 도구가 부르는 라이브러리를 그대로 태운다 (진짜 경로로 재기 위해)
for (const v of ['vendor/pdf-lib.min.js', 'vendor/pdfjs.min.js']) {
  await page.addScriptTag({ content: read('js/' + v) });
}
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = {
    register: (t) => { window.__reg[t.id] = t; },
    trackUse() {},
    mountTool() { return true; },
    // 라이브러리는 이미 올려 뒀다
    ensureScript: async () => {}
  };
});
await page.addScriptTag({ content: read('js/widgets/tools/pdfredact.js') });

const out = await page.evaluate(async () => {
  const SECRET = 'SECRET-4615-DONOTLEAK';
  const tool = window.__reg['pdfredact'];
  if (!tool) return { ok: false, why: '위젯이 등록되지 않았다' };

  // 비밀 글자가 든 2쪽짜리 PDF 를 만든다
  const src = await window.PDFLib.PDFDocument.create();
  const font = await src.embedFont(window.PDFLib.StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) {
    const p = src.addPage([400, 300]);
    p.drawText(i === 0 ? SECRET : 'PAGE-TWO-PLAIN', { x: 40, y: 200, size: 18, font });
  }
  const srcBytes = await src.save();

  /** PDF 에서 글자를 뽑는다 — 도구의 약속을 재는 유일한 방법이다 */
  const textOf = async (bytes) => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
    const doc = await window.pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    let all = '';
    for (let n = 1; n <= doc.numPages; n++) {
      const c = await (await doc.getPage(n)).getTextContent();
      all += c.items.map((i) => i.str).join(' ') + '\n';
    }
    return { text: all, pages: doc.numPages };
  };

  // ③ 대조: 원본에서는 비밀이 정말 뽑히는가
  const before = await textOf(srcBytes);
  if (!before.text.includes(SECRET)) {
    return { ok: false, why: '원본에서 비밀이 안 뽑힌다 — 시험 자체가 아무것도 못 잰다' };
  }

  const host = document.createElement('div');
  document.body.appendChild(host);
  tool.tabs[0].build(host);

  await window.__karmoWaitDrawn(host);
  const input = await window.__karmoWaitIn(host, '#prFile');
  const dt = new DataTransfer();
  dt.items.add(new File([srcBytes], '문서.pdf', { type: 'application/pdf' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  // 캔버스 크기가 잡히는 것은 **그리기 시작**의 신호일 뿐이다 — 다 끝났다는 뜻이 아니다.
  // 준비가 끝났다고 말해 줄 때까지 기다린다. 안 그러면 아직 그리는 중에 끌게 되고,
  // 그때 잡은 것은 뒤이어 끝나는 그리기에 묻힌다.
  for (let i = 0; i < 100 && !/드래그하세요/.test(host.querySelector('#prStatus').textContent); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const canvas = host.querySelector('#prCanvas');
  if (canvas.width < 10) return { ok: false, why: 'PDF 가 안 열렸다' };

  // 비밀 글자 위를 드래그한다. 자리는 그때그때 다시 잰다 (안내 문구가 바뀌면 화면이 밀린다)
  canvas.setPointerCapture = () => {};
  const at = (rx, ry) => {
    const r = canvas.getBoundingClientRect();
    return { clientX: r.left + rx * r.width, clientY: r.top + ry * r.height };
  };
  const send = (t, pt) => canvas.dispatchEvent(new PointerEvent(t, { ...pt, pointerId: 1, bubbles: true }));
  send('pointerdown', at(0.05, 0.25));
  send('pointermove', at(0.95, 0.45));
  send('pointerup', at(0.95, 0.45));
  await new Promise((r) => setTimeout(r, 300));

  // 내려받기를 가로채 결과 바이트를 잡는다
  let captured = null;
  const origCreate = document.createElement.bind(document);
  document.createElement = (tag) => {
    const el = origCreate(tag);
    if (tag === 'a') el.click = async function () { captured = this.href; };
    return el;
  };
  const origUrl = URL.createObjectURL;
  let lastBlob = null;
  URL.createObjectURL = (b) => { lastBlob = b; return origUrl(b); };

  host.querySelector('#prSave').click();
  for (let i = 0; i < 200 && !captured; i++) await new Promise((r) => setTimeout(r, 100));
  document.createElement = origCreate;
  URL.createObjectURL = origUrl;
  if (!lastBlob) return { ok: false, why: '결과 PDF 가 안 만들어졌다: ' + host.querySelector('#prStatus').textContent };

  const after = await textOf(new Uint8Array(await lastBlob.arrayBuffer()));

  return {
    ok: !after.text.includes(SECRET) && after.pages === before.pages,
    why:
      `원본에서 비밀 뽑힘 ✓ · 결과에서 비밀 ${after.text.includes(SECRET) ? '아직 뽑힌다 ✗' : '안 뽑힘 ✓'} · ` +
      `쪽수 ${before.pages} → ${after.pages} · 결과에서 뽑힌 글자 ${after.text.trim().length}자`
  };
});

await browser.close();

console.log(`${out.ok ? '  OK' : '  X '} ${out.why}`);
if (!out.ok) {
  console.error('[test-pdfredact] 가린 PDF 에서 글자가 그대로 뽑힌다 — 이 도구의 존재 이유가 무너진다');
  process.exit(1);
}
console.log('[test-pdfredact] 가린 PDF 에서 비밀이 한 글자도 안 뽑히는 것까지 확인');
