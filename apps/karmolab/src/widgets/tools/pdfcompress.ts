/**
 * PDF 용량 줄이기 (TASK-KL-088)
 *
 * 메일이나 제출 창구가 「10MB 이하」를 요구하는데 스캔한 PDF 가 40MB인 상황이 흔하다.
 * 그 파일에 주민번호나 계약 내용이 들어 있어도 사람들은 낯선 사이트에 올린다 — 다른 방법을 모르니까.
 *
 * 방식: 각 쪽을 그림으로 다시 그려 JPEG 로 담고 PDF 를 새로 엮는다. 이게 **되돌릴 수 없는 거래**라
 * 숨기지 않는다 — 글자를 더는 선택·검색할 수 없다. 대신 스캔 문서(원래 그림)에는 손해가 거의 없다.
 * 그래서 넣자마자 **글자가 들어 있는 PDF인지 먼저 알려 주고**, 첫 쪽 미리보기로 화질을 눈으로 고르게 한다.
 */
import { acceptPastedFiles } from './shared/paste';

import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  interface TextContent {
    items: Array<{ str?: string }>;
  }
  interface PdfPage {
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
    getTextContent: () => Promise<TextContent>;
  }
  interface PdfDoc {
    numPages: number;
    getPage: (n: number) => Promise<PdfPage>;
  }
  interface PdfJs {
    getDocument: (o: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
    GlobalWorkerOptions: { workerSrc: string };
  }
  interface PdfLib {
    PDFDocument: {
      create: () => Promise<{
        addPage: (size: [number, number]) => { drawImage: (img: unknown, o: { x: number; y: number; width: number; height: number }) => void };
        embedJpg: (b: ArrayBuffer | Uint8Array) => Promise<unknown>;
        save: () => Promise<Uint8Array>;
      }>;
    };
  }

  const size = (n: number): string =>
    n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n >= 1024 ? `${(n / 1024).toFixed(0)}KB` : `${n}B`;

  Toolbox.register({
    id: 'pdfcompress',
    title: 'PDF 용량 줄이기',
    category: 'tool',
    // 다른 도구가 만든 PDF 를 그대로 받는다 (TASK-KL-133) — 「이어서」 줄이 이 표시를 보고 고른다.
    accepts: ['application/pdf'],
    desc: '스캔 PDF 의 용량을 줄입니다. 화질을 미리 보고 고를 수 있고, 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9 16h6M12 11v3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10.5 13.2 12 14.7l1.5-1.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '용량 줄이기',
        /* 도구의 *자기 화면*은 스크립트가 그린다 — 말을 받아온 **뒤에** 그린다.
           안 기다리고 그리면 화면에 열쇠 이름이 그대로 뜬다 (qrread 에서 확인한 것과 같다). */
        build: function (container: HTMLElement): void {
          void loadNamespace('pdfcompress').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    /* 화면에 넣는 말은 그대로 붙이지 않는다 — 번역 글에 꺾쇠가 들어와도 화면이 안 깨지게. */
    const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          container.innerHTML = `
            <div class="tool-drop" id="pcDrop">
              <input type="file" id="pcFile" accept="application/pdf" hidden>
              ${esc(t('pdfcompress.drop'))}
            </div>

            <div id="pcEditor" style="display:none;">
              <div class="cc-stats" id="pcStats" style="margin-top:var(--space-lg);"></div>
              <div class="tool-status" id="pcWarn" style="display:none;"></div>

              <div class="field-group" style="margin-top:var(--space-lg);">
                <div class="tool-grid-2">
                  <div>
                    <div class="tool-sublabel">${esc(t('pdfcompress.label.quality'))} <span id="pcQualityVal" class="range-value">70</span></div>
                    <input type="range" id="pcQuality" aria-label="${esc(t('pdfcompress.label.quality'))}" min="30" max="95" value="70">
                  </div>
                  <div>
                    <div class="tool-sublabel">${esc(t('pdfcompress.label.resolution'))} <span id="pcScaleVal" class="range-value">${esc(t('pdfcompress.scale.mid'))}</span></div>
                    <input type="range" id="pcScale" aria-label="${esc(t('pdfcompress.label.resolution'))}" min="1" max="4" step="1" value="2">
                  </div>
                </div>
              </div>

              <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
                <button class="btn btn-ghost" id="pcPreview">${esc(t('pdfcompress.btn.preview'))}</button>
                <button class="btn btn-primary" id="pcRun">${esc(t('pdfcompress.btn.run'))}</button>
                <button class="btn btn-ghost" id="pcSave" disabled>${esc(t('pdfcompress.btn.save'))}</button>
              </div>

              <div id="pcShot" style="display:none;">
                <div class="tool-sublabel">${esc(t('pdfcompress.shot.caption'))}</div>
                <img id="pcShotImg" alt="${esc(t('pdfcompress.shot.alt'))}" style="max-width:100%; border-radius:8px; background:#fff;">
              </div>
            </div>

            <div class="tool-status" id="pcStatus">${esc(t('pdfcompress.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#pcDrop');
          const fileInput = $<HTMLInputElement>('#pcFile');
          const editor = $<HTMLElement>('#pcEditor');
          const stats = $<HTMLElement>('#pcStats');
          const warn = $<HTMLElement>('#pcWarn');
          const status = $<HTMLElement>('#pcStatus');
          const qualityEl = $<HTMLInputElement>('#pcQuality');
          const scaleEl = $<HTMLInputElement>('#pcScale');
          const saveBtn = $<HTMLButtonElement>('#pcSave');

          const SCALES: Array<[number, string]> = [
            [1, t('pdfcompress.scale.low')],
            [1.5, t('pdfcompress.scale.mid')],
            [2, t('pdfcompress.scale.high')],
            [3, t('pdfcompress.scale.max')]
          ];

          let file: File | null = null;
          let pdfjs: PdfJs | null = null;
          let pdflib: PdfLib | null = null;
          let doc: PdfDoc | null = null;
          let made: Blob | null = null;
          let hasText = false;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          async function loadPdfjs(): Promise<PdfJs> {
            if (pdfjs) return pdfjs;
            say(t('pdfcompress.status.loadingReader'));
            await Toolbox.ensureScript?.('vendor/pdfjs.min');
            const g = (window as unknown as { pdfjsLib: PdfJs }).pdfjsLib;
            if (!g) throw new Error(t('pdfcompress.error.readerFailed'));
            g.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
            pdfjs = g;
            return g;
          }

          async function loadPdfLib(): Promise<PdfLib> {
            if (pdflib) return pdflib;
            await Toolbox.ensureScript?.('vendor/pdf-lib.min');
            const g = (window as unknown as { PDFLib: PdfLib }).PDFLib;
            if (!g) throw new Error(t('pdfcompress.error.writerFailed'));
            pdflib = g;
            return g;
          }

          function scaleOf(): number {
            return SCALES[parseInt(scaleEl.value, 10) - 1][0];
          }

          function refreshLabels(): void {
            $<HTMLElement>('#pcQualityVal').textContent = qualityEl.value;
            $<HTMLElement>('#pcScaleVal').textContent = SCALES[parseInt(scaleEl.value, 10) - 1][1];
          }

          /** 한 쪽을 그림으로 그린다. 배율은 화면 픽셀 기준이라 그대로 해상도가 된다. */
          async function renderPage(n: number): Promise<{ canvas: HTMLCanvasElement; w: number; h: number }> {
            const lib = await loadPdfjs();
            if (!doc) doc = await lib.getDocument({ data: await (file as File).arrayBuffer() }).promise;
            const page = await doc.getPage(n);
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: scaleOf() });
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(viewport.width);
            canvas.height = Math.round(viewport.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error(t('pdfcompress.error.noCanvas'));
            // 투명 배경을 그냥 두면 JPEG 에서 검게 나온다
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            return { canvas, w: base.width, h: base.height };
          }

          const toJpeg = (canvas: HTMLCanvasElement): Promise<Blob> =>
            new Promise((resolve, reject) => {
              canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error(t('pdfcompress.error.rasterFailed')))),
                'image/jpeg',
                parseInt(qualityEl.value, 10) / 100
              );
            });

          async function load(f: File): Promise<void> {
            file = f;
            doc = null;
            made = null;
            saveBtn.disabled = true;
            $<HTMLElement>('#pcShot').style.display = 'none';
            editor.style.display = '';
            say(t('pdfcompress.status.inspecting', { name: f.name }));
            try {
              const lib = await loadPdfjs();
              doc = await lib.getDocument({ data: await f.arrayBuffer() }).promise;
              // 글자가 들어 있는 문서면 이 도구가 그 글자를 그림으로 바꿔 버린다 — 먼저 알려야 한다
              const first = await doc.getPage(1);
              const text = await first.getTextContent();
              hasText = text.items.map((i) => i.str || '').join('').trim().length > 40;
              stats.innerHTML =
                stat(t('pdfcompress.stat.originalSize'), size(f.size), true) +
                stat(t('pdfcompress.stat.pages'), t('pdfcompress.stat.pagesValue', { n: doc.numPages })) +
                stat(t('pdfcompress.stat.kind'), hasText ? t('pdfcompress.kind.text') : t('pdfcompress.kind.scan'));
              if (hasText) {
                warn.style.display = '';
                warn.className = 'tool-status error';
                warn.textContent = t('pdfcompress.warn.textLoss');
              } else {
                warn.style.display = 'none';
              }
              say(t('pdfcompress.status.pickQuality'), 'ok');
            } catch (e) {
              say(t('pdfcompress.error.open', { message: (e as Error).message }), 'error');
            }
          }

          async function preview(): Promise<void> {
            if (!file) return;
            say(t('pdfcompress.status.drawingFirst'));
            const { canvas } = await renderPage(1);
            const blob = await toJpeg(canvas);
            $<HTMLImageElement>('#pcShotImg').src = URL.createObjectURL(blob);
            $<HTMLElement>('#pcShot').style.display = '';
            // 첫 쪽 크기 × 쪽 수 = 전체 어림. 다 만들고 나서 실망하는 걸 막는다.
            const guess = blob.size * (doc?.numPages || 1);
            say(t('pdfcompress.status.estimate', { guess: size(guess), original: size(file.size) }), 'ok');
          }

          async function run(): Promise<void> {
            if (!file || !doc) {
              say(t('pdfcompress.status.needFile'), 'error');
              return;
            }
            const maker = await loadPdfLib();
            const outDoc = await maker.PDFDocument.create();
            for (let n = 1; n <= doc.numPages; n++) {
              say(t('pdfcompress.status.working', { n, total: doc.numPages }));
              const { canvas, w, h } = await renderPage(n);
              const jpeg = await toJpeg(canvas);
              const img = await outDoc.embedJpg(await jpeg.arrayBuffer());
              // 원래 쪽 크기를 그대로 써야 인쇄 규격(A4 등)이 안 틀어진다
              outDoc.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
            }
            const bytes = await outDoc.save();
            made = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
            saveBtn.disabled = false;

            const before = file.size;
            const after = made.size;
            const pct = Math.round(Math.abs(1 - after / before) * 100);
            stats.innerHTML =
              stat(t('pdfcompress.stat.originalSize'), size(before)) +
              stat(t('pdfcompress.stat.newSize'), size(after), true) +
              stat(t('pdfcompress.stat.change'), after < before ? t('pdfcompress.change.smaller', { pct }) : after > before ? t('pdfcompress.change.bigger', { pct }) : t('pdfcompress.change.same'));
            // 이미 잘 압축된 PDF 는 오히려 커진다 — 성공이라 우기면 안 된다
            if (after >= before) {
              say(t('pdfcompress.status.noGain', { before: size(before), after: size(after) }), 'error');
            } else {
              say(t('pdfcompress.status.done', { before: size(before), after: size(after), pct }), 'ok');
            }
            Toolbox.trackUse?.('compress');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) void load(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 「PDF 를 합쳤다 → 이어서 용량 줄이기」에서 사람이 파일을 다시 고르지 않게 하는 자리다.
           * 한 번만 집어 간다 — 두 번 집으면 같은 파일이 다시 들어와 방금 한 일을 덮는다. */
            Toolbox.onHandoff?.('pdfcompress', (f: File) => void load(f));
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            const f = e.dataTransfer?.files?.[0];
            if (f) void load(f);
          });
          // 캡처나 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { void load(files[0]); }, (f: File) => f.type === 'application/pdf');
          [qualityEl, scaleEl].forEach((el) => el.addEventListener('input', refreshLabels));
          refreshLabels();

          $<HTMLButtonElement>('#pcPreview').onclick = () => {
            void preview().catch((err: Error) => say(t('pdfcompress.error.preview', { message: err.message }), 'error'));
          };
          $<HTMLButtonElement>('#pcRun').onclick = () => {
            void run().catch((err: Error) => say(t('pdfcompress.error.run', { message: err.message }), 'error'));
          };
          saveBtn.onclick = () => {
            if (!made || !file) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(made);
            a.download = file.name.replace(/\.pdf$/i, '') + t('pdfcompress.file.suffix');
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say(t('pdfcompress.status.saved'), 'ok');
            // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
            Toolbox.offerNext?.(status, { blob: made, name: a.download, from: 'pdfcompress' });
          };
  }
})();
