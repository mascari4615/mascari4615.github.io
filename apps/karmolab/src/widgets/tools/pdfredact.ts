/**
 * PDF 가리개. 문서에서 개인정보 지우기 (TASK-KL-088)
 *
 * PDF 에 검은 네모를 그려 가리는 방법이 널리 쓰이는데, **그건 가려지지 않는다.** 네모는 글자
 * 위에 얹힌 그림일 뿐이고 글자는 파일 안에 그대로 남는다. 복사, 붙여넣기 한 번이면 다 나온다.
 * 기관들이 문서를 유출한 사고 상당수가 이 방식이었다.
 *
 * 그래서 이 도구는 다르게 한다. **페이지를 그림으로 다시 굽는다.**
 *  - 각 페이지를 그려 낸 뒤 가릴 자리를 지우고, 그 그림으로 PDF 를 새로 만든다.
 *  - 그 결과 글자를 고를 수 없게 된다. 그게 안전한 이유이므로 미리 분명히 말해 준다.
 *  - 가린 자리뿐 아니라 그 페이지의 **모든 글자 데이터**가 사라진다. 숨은 메모, 주석 포함.
 */
import { fileSize as size } from './shared/media';
import { escapeHtml as esc } from './shared/text';
import { statCell } from './shared/stats';
import { statusLine } from './shared/say';
import { wireDrop } from './shared/drop-well';

import { t, loadNamespace } from '../../lib/i18n';
import { createPdf, download, loadPdfJs, loadPdfLib, openForEdit, openForRead, pdfBlob, renderPage, suffixName, type PDFLib, type PdfJs, type PdfJsDoc, type PdfLibDoc, type PdfPage } from './shared/pdf';
import { encode } from './shared/image';

(function (): void {
  interface Box { page: number; x: number; y: number; w: number; h: number }


  Toolbox.register({
    id: 'pdfredact',
    // 다른 도구가 만든 PDF 를 그대로 받는다 (TASK-KL-133)
    accepts: ['application/pdf'],
    title: t('widgets.pdfredact.title', undefined, 'PDF 가리개'),
    category: 'file',
    desc: t(
      'widgets-desc.pdfredact.desc',
      undefined,
      'PDF 에서 개인정보를 지웁니다. 검은 네모를 얹는 게 아니라 글자 자체를 없앱니다'
    ),
    layout: 'wide',
    icon: '<path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="8" y="12" width="7" height="3.5" rx="0.8" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: t('pdfredact.tab', undefined, 'PDF 가리기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('pdfredact').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-section-end tool-status" id="prWarn">
              ${esc(t('pdfredact.warn'))}
            </div>

            <div class="tool-drop" id="prDrop">
              <input type="file" id="prFile" accept="application/pdf,.pdf" hidden>
              <span>${esc(t('pdfredact.drop'))}</span>
            </div>

            <div class="field-group" id="prControls" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('pdfredact.label.page'))} <span id="prPageVal" class="range-value">1 / 1</span></div>
                  <input type="range" id="prPage" aria-label="페이지" min="1" max="1" value="1">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('pdfredact.label.scale'))} <span id="prScaleVal" class="range-value">${esc(
                    t('pdfredact.scale.normal')
                  )}</span></div>
                  <input type="range" id="prScale" aria-label="선명도" min="1" max="3" step="0.5" value="2">
                </div>
              </div>
            </div>

            <div id="prStage" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-sublabel">${esc(t('pdfredact.label.drag'))}</div>
              <canvas id="prCanvas" style="max-width:100%; border-radius:var(--radius-xl); display:block; cursor:crosshair; border:1px solid rgba(128,128,128,0.25); touch-action:none;"></canvas>
            </div>

            <div class="cc-stats" id="prStats"></div>

            <div class="tool-actions">
              <button class="btn btn-primary" id="prSave" disabled>${esc(t('pdfredact.btn.save'))}</button>
              <button class="btn btn-ghost" id="prUndo" disabled>${esc(t('pdfredact.btn.undo'))}</button>
            </div>

            <div class="tool-status" id="prStatus">${esc(t('pdfredact.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const canvas = $<HTMLCanvasElement>('#prCanvas');
          const status = $<HTMLElement>('#prStatus');
          const stats = $<HTMLElement>('#prStats');
          const pageEl = $<HTMLInputElement>('#prPage');
          const scaleEl = $<HTMLInputElement>('#prScale');
          const saveBtn = $<HTMLButtonElement>('#prSave');
          const undoBtn = $<HTMLButtonElement>('#prUndo');

          let bytes: ArrayBuffer | null = null;
          let doc: PdfJsDoc | null = null;
          let boxes: Box[] = [];
          let cur = 1;
          let baseName = t('pdfredact.file.base');
          let drag: { x: number; y: number } | null = null;
          let dragNow: { x: number; y: number } | null = null;
          /* 자판으로 고르는 네모 (0~1 비율. 상자와 같은 단위). 끌기만 있으면 이 도구가
           * 통째로 막힌 사람이 생기고, 가리개는 못 가림이 곧 사고다. */
          let caret: { x: number; y: number; w: number; h: number } | null = null;
          let rendering = false;

          /* 상태 줄은 **공용 하나**를 쓴다 (TASK-KL-291). `aria-live` 가 여기 붙어 있어서
           * 화면낭독기가 다 됐습니다, 못 엽니다를 실제로 읽어 준다. */
          const say = statusLine(status);

          /**
           * 한 페이지를 캔버스에 그리고, 그 페이지에 잡아 둔 가림을 먹인다.
           * 가림은 화면 표시가 아니라 캔버스의 점을 바꾸는 것이라, 이 캔버스가 곧 결과물이다.
           */
          async function renderPage(target: HTMLCanvasElement, n: number, scale: number, preview: boolean): Promise<void> {
            if (!doc) return;
            const page = await doc.getPage(n);
            const vp = page.getViewport({ scale });
            target.width = Math.round(vp.width);
            target.height = Math.round(vp.height);
            const ctx = target.getContext('2d');
            if (!ctx) return;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, target.width, target.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;

            ctx.fillStyle = '#000000';
            for (const b of boxes) {
              if (b.page !== n) continue;
              // 상자는 0~1 비율로 갖고 있다. 선명도를 바꿔도 같은 자리를 가리게 하려고
              ctx.fillRect(b.x * target.width, b.y * target.height, b.w * target.width, b.h * target.height);
            }

            // 자판으로 고르는 중이면 그 네모도 테두리로 보여 준다 (끌 때와 같은 모양, 다른 색).
            if (preview && caret) {
              ctx.save();
              ctx.strokeStyle = '#5ab0ff';
              ctx.lineWidth = 2;
              ctx.setLineDash([8, 4]);
              ctx.strokeRect(caret.x * target.width, caret.y * target.height, caret.w * target.width, caret.h * target.height);
              ctx.restore();
            }

            if (preview && drag && dragNow) {
              ctx.save();
              ctx.strokeStyle = '#ff5a5a';
              ctx.lineWidth = 2;
              ctx.setLineDash([6, 6]);
              ctx.strokeRect(
                Math.min(drag.x, dragNow.x) * target.width,
                Math.min(drag.y, dragNow.y) * target.height,
                Math.abs(dragNow.x - drag.x) * target.width,
                Math.abs(dragNow.y - drag.y) * target.height
              );
              ctx.restore();
            }
          }

          async function refresh(): Promise<void> {
            if (!doc || rendering) return;
            rendering = true;
            try {
              await renderPage(canvas, cur, parseFloat(scaleEl.value), true);
            } finally {
              rendering = false;
            }
            const onPage = boxes.filter((b) => b.page === cur).length;
            stats.innerHTML =
              statCell(t('pdfredact.stat.total'), t('pdfredact.value.spots', { n: boxes.length }), true) +
              statCell(t('pdfredact.stat.onPage'), t('pdfredact.value.spots', { n: onPage })) +
              statCell(t('pdfredact.stat.pages'), t('pdfredact.value.pages', { n: doc.numPages }));
            saveBtn.disabled = false;
            undoBtn.disabled = boxes.length === 0;
          }

          /** 누른 자리를 0~1 비율로 바꾼다 (선명도가 바뀌어도 같은 자리를 가리도록). */
          function toRatio(e: PointerEvent): { x: number; y: number } {
            const r = canvas.getBoundingClientRect();
            const clamp = (v: number): number => Math.max(0, Math.min(1, v));
            return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
          }

          async function load(file: File): Promise<void> {
            say(t('pdfredact.say.opening'));
            const lib = await loadPdfJs();
            if (!lib) {
              say(t('pdfredact.err.engine'), 'error');
              return;
            }
            // 이 줄이 없으면 PDF 가 아예 안 열린다 (다른 PDF 도구들과 같은 자리)
            lib.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
            bytes = await file.arrayBuffer();
            try {
              doc = await lib.getDocument({ data: bytes.slice(0) }).promise;
            } catch {
              say(t('pdfredact.err.open'), 'error');
              return;
            }
            boxes = [];
            cur = 1;
            baseName = (file.name || t('pdfredact.file.base')).replace(/\.[^.]+$/, '');
            pageEl.max = String(doc.numPages);
            pageEl.value = '1';
            $<HTMLElement>('#prPageVal').textContent = `1 / ${doc.numPages}`;
            $<HTMLElement>('#prStage').style.display = '';
            $<HTMLElement>('#prControls').style.display = '';
            await refresh();
            say(t('pdfredact.say.ready'), 'ok');
          }

          canvas.addEventListener('pointerdown', (e) => {
            if (!doc) return;
            canvas.setPointerCapture?.(e.pointerId);
            drag = toRatio(e);
            dragNow = drag;
          });
          canvas.addEventListener('pointermove', (e) => {
            if (!drag) return;
            dragNow = toRatio(e);
            void refresh();
          });
          canvas.addEventListener('pointerup', () => {
            if (!drag || !dragNow) return;
            const b: Box = {
              page: cur,
              x: Math.min(drag.x, dragNow.x),
              y: Math.min(drag.y, dragNow.y),
              w: Math.abs(dragNow.x - drag.x),
              h: Math.abs(dragNow.y - drag.y)
            };
            drag = null;
            dragNow = null;
            // 잘못 누른 것을 가렸다고 착각하게 두면 안 된다
            if (b.w < 0.005 || b.h < 0.005) {
              void refresh();
              say(t('pdfredact.err.tooSmall'), 'error');
              return;
            }
            boxes.push(b);
            void refresh();
            say(t('pdfredact.say.added', { n: boxes.length }), 'ok');
          });

          /* 자판 길. 끌기와 **같은 일**을 자판으로 (2026-08-14, `audit:mouse-only` 가 잡은 자리).
           * 화살표=옮기기, Shift+화살표=크기, Enter=가리기, Backspace=되돌리기, Esc=그만.
           * 단위는 쪽 크기의 2% 다. 상자를 비율로 갖고 있어 선명도를 바꿔도 같은 자리다. */
          canvas.tabIndex = 0;
          canvas.setAttribute('role', 'application');
          canvas.setAttribute('aria-label', t('pdfredact.kb.label'));
          const pct = (v: number): number => Math.round(v * 100);
          canvas.addEventListener('keydown', (e) => {
            if (!doc) return;
            const unit = e.shiftKey ? 0.02 : 0.02;
            if (!caret && /^(Arrow|Enter)/.test(e.key)) {
              caret = { x: 0.25, y: 0.25, w: 0.2, h: 0.1 };
              e.preventDefault();
              void refresh();
              say(t('pdfredact.kb.moved', { x: pct(caret.x), y: pct(caret.y), w: pct(caret.w), h: pct(caret.h) }));
              return;
            }
            if (!caret) return;
            switch (e.key) {
              case 'ArrowLeft': if (e.shiftKey) caret.w -= unit; else caret.x -= unit; break;
              case 'ArrowRight': if (e.shiftKey) caret.w += unit; else caret.x += unit; break;
              case 'ArrowUp': if (e.shiftKey) caret.h -= unit; else caret.y -= unit; break;
              case 'ArrowDown': if (e.shiftKey) caret.h += unit; else caret.y += unit; break;
              case 'Enter': {
                boxes.push({ page: cur, x: caret.x, y: caret.y, w: caret.w, h: caret.h });
                caret = null;
                e.preventDefault();
                void refresh();
                say(t('pdfredact.say.added', { n: boxes.length }), 'ok');
                return;
              }
              case 'Backspace': {
                if (boxes.length> 0) boxes.pop();
                e.preventDefault();
                void refresh();
                say(boxes.length ? t('pdfredact.say.left', { n: boxes.length }) : t('pdfredact.say.cleared'), 'ok');
                return;
              }
              case 'Escape': {
                caret = null;
                e.preventDefault();
                void refresh();
                return;
              }
              default: return;
            }
            caret.w = Math.max(0.01, Math.min(caret.w, 1));
            caret.h = Math.max(0.01, Math.min(caret.h, 1));
            caret.x = Math.max(0, Math.min(caret.x, 1 - caret.w));
            caret.y = Math.max(0, Math.min(caret.y, 1 - caret.h));
            e.preventDefault();
            void refresh();
            say(t('pdfredact.kb.moved', { x: pct(caret.x), y: pct(caret.y), w: pct(caret.w), h: pct(caret.h) }));
          });

          const drop = $<HTMLElement>('#prDrop');
          const fileInput = $<HTMLInputElement>('#prFile');

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133). */
          {
            Toolbox.onHandoff?.('pdfredact', (f: File) => void load(f));
          }
          /* 파일 받는 자리는 **공용 하나**를 쓴다 (TASK-KL-290). 붙여넣기가 같이 딸려 온다. */
          wireDrop({ drop, input: fileInput, scope: container, onFiles: (files) => void load(files[0]) });

          pageEl.addEventListener('input', () => {
            cur = parseInt(pageEl.value, 10);
            $<HTMLElement>('#prPageVal').textContent = `${cur} / ${doc ? doc.numPages : 1}`;
            void refresh();
          });
          scaleEl.addEventListener('input', () => {
            const v = parseFloat(scaleEl.value);
            $<HTMLElement>('#prScaleVal').textContent = t(
              v <= 1 ? 'pdfredact.scale.small' : v <= 2 ? 'pdfredact.scale.normal' : 'pdfredact.scale.sharp'
            );
            void refresh();
          });
          undoBtn.onclick = () => {
            boxes.pop();
            void refresh();
            say(boxes.length ? t('pdfredact.say.left', { n: boxes.length }) : t('pdfredact.say.cleared'), 'ok');
          };

          saveBtn.onclick = async () => {
            if (!doc) return;
            if (!boxes.length) {
              say(t('pdfredact.err.noBoxes'), 'error');
              return;
            }
            saveBtn.disabled = true;
            try {
              say(t('pdfredact.say.baking'));
              const L = await loadPdfLib();
              if (!L) throw new Error(t('pdfredact.err.maker'));

              const outDoc = await L.PDFDocument.create();
              const scale = parseFloat(scaleEl.value);
              const tmp = document.createElement('canvas');
              for (let n = 1; n <= doc.numPages; n++) {
                say(`페이지를 그림으로 다시 굽는 중... ${n} / ${doc.numPages}`);
                await renderPage(tmp, n, scale, false);
                // 공용 한 자리(`shared/image.encode`). 못 구우면 스스로 던진다.
                const blob = await encode(tmp, 'png');
                const png = await outDoc.embedPng(await blob.arrayBuffer());
                // 원래 종이 크기로 되돌린다. 선명도는 그림 쪽에만 반영한다
                const pw = png.width / scale;
                const ph = png.height / scale;
                const page = outDoc.addPage([pw, ph]);
                page.drawImage(png, { x: 0, y: 0, width: pw, height: ph });
              }
              const out = await outDoc.save();
              const blob = new Blob([out as unknown as BlobPart], { type: 'application/pdf' });
              // 공용 한 자리(`shared/pdf.download`).
              const outName = baseName + t('pdfredact.file.suffix') + '.pdf';
              download(blob, outName);
              // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133). 받을 도구가 없으면 안 생긴다.
              Toolbox.offerNext?.(status, { blob: blob, name: outName, from: 'pdfredact' });
              say(
                t('pdfredact.say.done', { pages: doc.numPages, size: size(blob.size) }),
                'ok'
              );
              Toolbox.trackUse?.('save');
            } catch (e) {
              say((e as Error).message || t('pdfredact.err.generic'), 'error');
            } finally {
              saveBtn.disabled = false;
            }
          };
  }
})();
