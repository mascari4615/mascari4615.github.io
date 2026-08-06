/**
 * PDF 에 서명 넣기 (TASK-KL-088)
 *
 * 계약서에 서명하려고 인쇄 → 서명 → 스캔을 반복하거나, 서명하겠다고 계약서를 낯선 사이트에
 * 통째로 올린다. 둘 다 좋은 선택이 아니다.
 *
 * 여기서는 쪽을 그림으로 그려 보여 주고, **그 위에서 자리를 잡아** 서명을 얹는다.
 * 계약서는 브라우저 밖으로 나가지 않는다.
 *
 * 자리 잡기가 핵심이다 — 좌표를 숫자로 입력하게 하면 아무도 못 쓴다. 미리보기 위를 눌러
 * 옮기고 크기를 조절하며, 화면에서 본 그대로 들어간다(화면 배율을 실제 쪽 크기로 되돌려 얹는다).
 */
(function (): void {
  interface PdfPage {
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
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
      load: (b: ArrayBuffer, o?: { ignoreEncryption?: boolean }) => Promise<{
        getPages: () => Array<{
          getSize: () => { width: number; height: number };
          drawImage: (img: unknown, o: { x: number; y: number; width: number; height: number }) => void;
        }>;
        embedPng: (b: ArrayBuffer | Uint8Array) => Promise<{ width: number; height: number }>;
        save: () => Promise<Uint8Array>;
      }>;
    };
  }

  Toolbox.register({
    id: 'pdfsign',
    title: 'PDF 에 서명 넣기',
    category: 'tool',
    desc: '계약서에 손으로 그린 서명을 얹습니다. 인쇄·스캔 없이, 문서가 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 16c1.5-3 2.5 1 4-1s2 .5 3-1" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '서명 넣기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="psDrop">
              <input type="file" id="psFile" accept="application/pdf" hidden>
              계약서(PDF)를 끌어다 놓거나 눌러서 고르세요
            </div>

            <div id="psEditor" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-sublabel">서명을 그리세요 — 마우스나 손가락으로</div>
              <canvas id="psPad" height="150" style="width:100%; height:150px; background:#fff; border-radius:8px; touch-action:none; display:block; cursor:crosshair;"></canvas>
              <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                <button class="btn btn-ghost btn-sm" id="psClearPad">다시 그리기</button>
                <label class="btn btn-ghost btn-sm" style="cursor:pointer;">
                  그림 파일로 넣기<input type="file" id="psImg" accept="image/*" hidden>
                </label>
              </div>

              <div class="field-group" style="margin-top:var(--space-lg);">
                <div class="tool-grid-2">
                  <div>
                    <div class="tool-sublabel">쪽 <span id="psPageVal" class="range-value">1 / 1</span></div>
                    <input type="range" id="psPage" aria-label="쪽" min="1" max="1" value="1">
                  </div>
                  <div>
                    <div class="tool-sublabel">서명 크기 <span id="psSizeVal" class="range-value">30%</span></div>
                    <input type="range" id="psSize" aria-label="서명 크기" min="8" max="70" value="30">
                  </div>
                </div>
              </div>

              <div class="tool-sublabel">미리보기 — 서명을 놓을 자리를 누르세요</div>
              <div id="psStage" style="position:relative; display:inline-block; max-width:100%;">
                <canvas id="psView" style="max-width:100%; border-radius:8px; background:#fff; display:block; cursor:crosshair;"></canvas>
                <img id="psGhost" alt="" style="position:absolute; display:none; pointer-events:none; opacity:0.85;">
              </div>

              <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
                <button class="btn btn-primary" id="psRun">서명 넣고 내려받기</button>
              </div>
            </div>

            <div class="tool-status" id="psStatus">문서는 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#psDrop');
          const fileInput = $<HTMLInputElement>('#psFile');
          const editor = $<HTMLElement>('#psEditor');
          const pad = $<HTMLCanvasElement>('#psPad');
          const view = $<HTMLCanvasElement>('#psView');
          const ghost = $<HTMLImageElement>('#psGhost');
          const pageEl = $<HTMLInputElement>('#psPage');
          const sizeEl = $<HTMLInputElement>('#psSize');
          const status = $<HTMLElement>('#psStatus');

          let file: File | null = null;
          let pdfjs: PdfJs | null = null;
          let doc: PdfDoc | null = null;
          let signature: string | null = null; // data URL
          // 놓을 자리를 「쪽 크기 대비 비율」로 갖는다 — 미리보기 배율이 바뀌어도 자리가 안 틀어진다
          let spot: { x: number; y: number } | null = null;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

          /* ---- 서명 그리기 ---- */
          const padCtx = pad.getContext('2d');
          let drawing = false;
          let drew = false;
          function padPos(e: PointerEvent): [number, number] {
            const r = pad.getBoundingClientRect();
            return [((e.clientX - r.left) / r.width) * pad.width, ((e.clientY - r.top) / r.height) * pad.height];
          }
          function resetPad(): void {
            pad.width = pad.clientWidth * 2 || 600;
            pad.height = 300;
            if (!padCtx) return;
            padCtx.clearRect(0, 0, pad.width, pad.height);
            padCtx.lineWidth = 4;
            padCtx.lineCap = 'round';
            padCtx.lineJoin = 'round';
            padCtx.strokeStyle = '#111';
            drew = false;
            signature = null;
            ghost.style.display = 'none';
          }
          pad.addEventListener('pointerdown', (e) => {
            if (!padCtx) return;
            drawing = true;
            drew = true;
            pad.setPointerCapture(e.pointerId);
            const [x, y] = padPos(e);
            padCtx.beginPath();
            padCtx.moveTo(x, y);
          });
          pad.addEventListener('pointermove', (e) => {
            if (!drawing || !padCtx) return;
            const [x, y] = padPos(e);
            padCtx.lineTo(x, y);
            padCtx.stroke();
          });
          const endStroke = (): void => {
            if (!drawing) return;
            drawing = false;
            if (drew) {
              signature = trimmed();
              updateGhost();
              say('서명을 그렸어요. 미리보기에서 놓을 자리를 누르세요.', 'ok');
            }
          };
          pad.addEventListener('pointerup', endStroke);
          pad.addEventListener('pointercancel', endStroke);

          /** 빈 여백을 잘라 낸다 — 안 자르면 서명이 실제보다 작게 얹힌다. */
          function trimmed(): string {
            if (!padCtx) return pad.toDataURL('image/png');
            const d = padCtx.getImageData(0, 0, pad.width, pad.height).data;
            let minX = pad.width, minY = pad.height, maxX = 0, maxY = 0;
            for (let y = 0; y < pad.height; y++) {
              for (let x = 0; x < pad.width; x++) {
                if (d[(y * pad.width + x) * 4 + 3] > 8) {
                  if (x < minX) minX = x;
                  if (x > maxX) maxX = x;
                  if (y < minY) minY = y;
                  if (y > maxY) maxY = y;
                }
              }
            }
            if (maxX <= minX || maxY <= minY) return pad.toDataURL('image/png');
            const pad2 = 8;
            const w = Math.min(pad.width, maxX - minX + pad2 * 2);
            const h = Math.min(pad.height, maxY - minY + pad2 * 2);
            const cv = document.createElement('canvas');
            cv.width = w;
            cv.height = h;
            cv.getContext('2d')?.drawImage(pad, minX - pad2, minY - pad2, w, h, 0, 0, w, h);
            return cv.toDataURL('image/png');
          }

          /* ---- PDF ---- */
          async function loadLib(): Promise<PdfJs> {
            if (pdfjs) return pdfjs;
            say('PDF 처리기를 불러오는 중…');
            await Toolbox.ensureScript?.('vendor/pdfjs.min');
            const g = (window as unknown as { pdfjsLib: PdfJs }).pdfjsLib;
            if (!g) throw new Error('PDF 처리기를 불러오지 못했습니다');
            g.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
            pdfjs = g;
            return g;
          }

          async function drawPage(n: number): Promise<void> {
            if (!doc) return;
            const page = await doc.getPage(n);
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(2, 900 / base.width);
            const vp = page.getViewport({ scale });
            view.width = Math.round(vp.width);
            view.height = Math.round(vp.height);
            const ctx = view.getContext('2d');
            if (!ctx) return;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, view.width, view.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            updateGhost();
          }

          /** 놓을 자리에 서명을 반투명으로 겹쳐 보여 준다 — 넣기 전에 눈으로 확인하게. */
          function updateGhost(): void {
            if (!signature || !spot) {
              ghost.style.display = 'none';
              return;
            }
            const rect = view.getBoundingClientRect();
            const widthRatio = parseInt(sizeEl.value, 10) / 100;
            ghost.src = signature;
            ghost.style.display = '';
            ghost.style.width = `${rect.width * widthRatio}px`;
            ghost.style.left = `${spot.x * rect.width - (rect.width * widthRatio) / 2}px`;
            ghost.style.top = `${spot.y * rect.height - ghost.clientHeight / 2}px`;
          }

          view.addEventListener('click', (e) => {
            const r = view.getBoundingClientRect();
            spot = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
            updateGhost();
            if (!signature) say('먼저 위에서 서명을 그려 주세요.', 'error');
            else say('자리를 잡았어요. 넣고 내려받으세요.', 'ok');
          });

          async function load(f: File): Promise<void> {
            file = f;
            spot = null;
            say(`${f.name} 을 여는 중…`);
            try {
              const lib = await loadLib();
              doc = await lib.getDocument({ data: await f.arrayBuffer() }).promise;
              editor.style.display = '';
              resetPad();
              pageEl.max = String(doc.numPages);
              pageEl.value = '1';
              $<HTMLElement>('#psPageVal').textContent = `1 / ${doc.numPages}`;
              await drawPage(1);
              say('서명을 그리고, 미리보기에서 놓을 자리를 누르세요.', 'ok');
            } catch (e) {
              say('이 PDF 를 열지 못했어요: ' + (e as Error).message, 'error');
            }
          }

          async function run(): Promise<void> {
            if (!file || !doc) {
              say('PDF 를 먼저 넣어 주세요.', 'error');
              return;
            }
            if (!signature) {
              say('서명을 먼저 그려 주세요.', 'error');
              return;
            }
            if (!spot) {
              say('미리보기에서 놓을 자리를 눌러 주세요.', 'error');
              return;
            }
            await Toolbox.ensureScript?.('vendor/pdf-lib.min');
            const lib = (window as unknown as { PDFLib: PdfLib }).PDFLib;
            if (!lib) throw new Error('PDF 만드는 부분을 불러오지 못했습니다');

            const out = await lib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
            const pageNo = parseInt(pageEl.value, 10);
            const page = out.getPages()[pageNo - 1];
            const { width, height } = page.getSize();

            const bytes = Uint8Array.from(atob(signature.split(',')[1]), (c) => c.charCodeAt(0));
            const img = await out.embedPng(bytes);
            const w = width * (parseInt(sizeEl.value, 10) / 100);
            const h = (img.height / img.width) * w;
            // PDF 의 y 는 아래에서 위로 커진다 — 화면 좌표를 그대로 쓰면 위아래가 뒤집힌다
            page.drawImage(img, {
              x: spot.x * width - w / 2,
              y: (1 - spot.y) * height - h / 2,
              width: w,
              height: h
            });

            const blob = new Blob([(await out.save()) as unknown as BlobPart], { type: 'application/pdf' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = file.name.replace(/\.pdf$/i, '') + '-서명.pdf';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say(`${pageNo}쪽에 서명을 넣어 받았어요.`, 'ok');
            Toolbox.trackUse?.('sign');
          }

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

          $<HTMLButtonElement>('#psClearPad').onclick = () => {
            resetPad();
            say('다시 그려 주세요.');
          };
          $<HTMLInputElement>('#psImg').onchange = (e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
              signature = String(reader.result);
              updateGhost();
              say('그림을 서명으로 넣었어요. 미리보기에서 자리를 누르세요.', 'ok');
            };
            reader.readAsDataURL(f);
          };
          pageEl.addEventListener('input', () => {
            $<HTMLElement>('#psPageVal').textContent = `${pageEl.value} / ${doc?.numPages ?? 1}`;
            void drawPage(parseInt(pageEl.value, 10));
          });
          sizeEl.addEventListener('input', () => {
            $<HTMLElement>('#psSizeVal').textContent = sizeEl.value + '%';
            updateGhost();
          });
          $<HTMLButtonElement>('#psRun').onclick = () => {
            void run().catch((err: Error) => say('넣는 중 문제가 생겼어요: ' + err.message, 'error'));
          };

          resetPad();
        }
      }
    ]
  });
})();
