/**
 * PDF 가리개 — 문서에서 개인정보 지우기 (TASK-KL-088)
 *
 * PDF 에 검은 네모를 그려 가리는 방법이 널리 쓰이는데, **그건 가려지지 않는다.** 네모는 글자
 * 위에 얹힌 그림일 뿐이고 글자는 파일 안에 그대로 남는다. 복사·붙여넣기 한 번이면 다 나온다.
 * 기관들이 문서를 유출한 사고 상당수가 이 방식이었다.
 *
 * 그래서 이 도구는 다르게 한다 — **페이지를 그림으로 다시 굽는다.**
 *  - 각 페이지를 그려 낸 뒤 가릴 자리를 지우고, 그 그림으로 PDF 를 새로 만든다.
 *  - 그 결과 글자를 고를 수 없게 된다. 그게 안전한 이유이므로 미리 분명히 말해 준다.
 *  - 가린 자리뿐 아니라 그 페이지의 **모든 글자 데이터**가 사라진다 — 숨은 메모·주석 포함.
 */
import { fileSize as size } from './shared/media';

(function (): void {
  interface Box { page: number; x: number; y: number; w: number; h: number }

  interface PdfPage {
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
  }
  interface PdfDoc { numPages: number; getPage: (n: number) => Promise<PdfPage> }
  interface PdfJs {
    getDocument: (o: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
    GlobalWorkerOptions: { workerSrc: string };
  }
  interface PdfLib {
    PDFDocument: {
      create: () => Promise<{
        addPage: (size: [number, number]) => { drawImage: (img: unknown, o: { x: number; y: number; width: number; height: number }) => void };
        embedPng: (b: ArrayBuffer) => Promise<{ width: number; height: number }>;
        save: () => Promise<Uint8Array>;
      }>;
    };
  }

  Toolbox.register({
    id: 'pdfredact',
    title: 'PDF 가리개',
    category: 'tool',
    desc: 'PDF 에서 개인정보를 지웁니다. 검은 네모를 얹는 게 아니라 글자 자체를 없앱니다',
    layout: 'wide',
    icon: '<path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="8" y="12" width="7" height="3.5" rx="0.8" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: 'PDF 가리기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-status" id="prWarn" style="margin-bottom:var(--space-lg);">
              PDF 에 검은 네모를 그려도 글자는 파일 안에 남습니다 — 복사하면 다 나옵니다.
              이 도구는 페이지를 그림으로 다시 구워서 글자 자체를 없앱니다.
            </div>

            <div class="tool-drop" id="prDrop">
              <input type="file" id="prFile" accept="application/pdf,.pdf" hidden>
              <span>가릴 PDF 를 끌어다 놓거나 눌러서 고르세요</span>
            </div>

            <div class="field-group" id="prControls" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">페이지 <span id="prPageVal" class="range-value">1 / 1</span></div>
                  <input type="range" id="prPage" aria-label="페이지" min="1" max="1" value="1">
                </div>
                <div>
                  <div class="tool-sublabel">선명도 <span id="prScaleVal" class="range-value">보통</span></div>
                  <input type="range" id="prScale" aria-label="선명도" min="1" max="3" step="0.5" value="2">
                </div>
              </div>
            </div>

            <div id="prStage" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-sublabel">가릴 곳을 드래그하세요 — 페이지를 넘겨 가며 해도 됩니다</div>
              <canvas id="prCanvas" style="max-width:100%; border-radius:10px; display:block; cursor:crosshair; border:1px solid rgba(128,128,128,0.25); touch-action:none;"></canvas>
            </div>

            <div class="cc-stats" id="prStats"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="prSave" disabled>가린 PDF 받기</button>
              <button class="btn btn-ghost" id="prUndo" disabled>방금 것 취소</button>
            </div>

            <div class="tool-status" id="prStatus">파일은 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
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
          let doc: PdfDoc | null = null;
          let boxes: Box[] = [];
          let cur = 1;
          let baseName = '문서';
          let drag: { x: number; y: number } | null = null;
          let dragNow: { x: number; y: number } | null = null;
          let rendering = false;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

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
              // 상자는 0~1 비율로 갖고 있다 — 선명도를 바꿔도 같은 자리를 가리게 하려고
              ctx.fillRect(b.x * target.width, b.y * target.height, b.w * target.width, b.h * target.height);
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
              stat('가린 곳', `${boxes.length}군데`, true) +
              stat('이 페이지', `${onPage}군데`) +
              stat('쪽수', `${doc.numPages}쪽`);
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
            say('PDF 를 여는 중…');
            await Toolbox.ensureScript?.('vendor/pdfjs.min');
            const lib = (window as unknown as { pdfjsLib: PdfJs }).pdfjsLib;
            if (!lib) {
              say('PDF 처리기를 불러오지 못했어요.', 'error');
              return;
            }
            // 이 줄이 없으면 PDF 가 아예 안 열린다 (다른 PDF 도구들과 같은 자리)
            lib.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
            bytes = await file.arrayBuffer();
            try {
              doc = await lib.getDocument({ data: bytes.slice(0) }).promise;
            } catch {
              say('PDF 를 열지 못했어요 (암호가 걸려 있을 수 있습니다).', 'error');
              return;
            }
            boxes = [];
            cur = 1;
            baseName = (file.name || '문서').replace(/\.[^.]+$/, '');
            pageEl.max = String(doc.numPages);
            pageEl.value = '1';
            $<HTMLElement>('#prPageVal').textContent = `1 / ${doc.numPages}`;
            $<HTMLElement>('#prStage').style.display = '';
            $<HTMLElement>('#prControls').style.display = '';
            await refresh();
            say('가릴 곳을 드래그하세요. 받을 때 그 페이지의 글자가 통째로 없어집니다.', 'ok');
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
            // 잘못 누른 것을 「가렸다」고 착각하게 두면 안 된다
            if (b.w < 0.005 || b.h < 0.005) {
              void refresh();
              say('너무 작아서 넘어갔어요. 가릴 곳을 끌어서 네모로 잡아 주세요.', 'error');
              return;
            }
            boxes.push(b);
            void refresh();
            say(`${boxes.length}군데 잡았어요. 받을 때 실제로 지워집니다.`, 'ok');
          });

          const drop = $<HTMLElement>('#prDrop');
          const fileInput = $<HTMLInputElement>('#prFile');
          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) void load(fileInput.files[0]);
          };
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

          pageEl.addEventListener('input', () => {
            cur = parseInt(pageEl.value, 10);
            $<HTMLElement>('#prPageVal').textContent = `${cur} / ${doc ? doc.numPages : 1}`;
            void refresh();
          });
          scaleEl.addEventListener('input', () => {
            const v = parseFloat(scaleEl.value);
            $<HTMLElement>('#prScaleVal').textContent = v <= 1 ? '작게' : v <= 2 ? '보통' : '선명하게';
            void refresh();
          });
          undoBtn.onclick = () => {
            boxes.pop();
            void refresh();
            say(boxes.length ? `${boxes.length}군데 남았어요.` : '잡아 둔 것이 없어졌어요.', 'ok');
          };

          saveBtn.onclick = async () => {
            if (!doc) return;
            if (!boxes.length) {
              say('가릴 곳을 먼저 잡아 주세요.', 'error');
              return;
            }
            saveBtn.disabled = true;
            try {
              say('페이지를 그림으로 다시 굽는 중…');
              await Toolbox.ensureScript?.('vendor/pdf-lib.min');
              const L = (window as unknown as { PDFLib: PdfLib }).PDFLib;
              if (!L) throw new Error('PDF 만들기를 불러오지 못했습니다');

              const outDoc = await L.PDFDocument.create();
              const scale = parseFloat(scaleEl.value);
              const tmp = document.createElement('canvas');
              for (let n = 1; n <= doc.numPages; n++) {
                say(`페이지를 그림으로 다시 굽는 중… ${n} / ${doc.numPages}`);
                await renderPage(tmp, n, scale, false);
                const blob = await new Promise<Blob | null>((r) => tmp.toBlob(r, 'image/png'));
                if (!blob) throw new Error(`${n}쪽을 그림으로 바꾸지 못했습니다`);
                const png = await outDoc.embedPng(await blob.arrayBuffer());
                // 원래 종이 크기로 되돌린다 — 선명도는 그림 쪽에만 반영한다
                const pw = png.width / scale;
                const ph = png.height / scale;
                const page = outDoc.addPage([pw, ph]);
                page.drawImage(png, { x: 0, y: 0, width: pw, height: ph });
              }
              const out = await outDoc.save();
              const blob = new Blob([out as unknown as BlobPart], { type: 'application/pdf' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = baseName + '-가림.pdf';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              say(
                `${doc.numPages}쪽 · ${size(blob.size)} 로 받았어요. 가린 자리는 물론이고 글자 데이터가 통째로 없어져, 복사해도 아무것도 안 나옵니다.`,
                'ok'
              );
              Toolbox.trackUse?.('save');
            } catch (e) {
              say((e as Error).message || '가린 PDF 를 만들지 못했어요.', 'error');
            } finally {
              saveBtn.disabled = false;
            }
          };
        }
      }
    ]
  });
})();
