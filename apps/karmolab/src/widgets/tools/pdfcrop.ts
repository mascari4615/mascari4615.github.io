/**
 * PDF 여백 자르기 (TASK-KL-088)
 *
 * 스캔한 문서나 논문 PDF 는 여백이 넓어, 폰이나 전자책 화면에서 글씨가 손톱만하게 보인다.
 * 여백만 걷어내면 같은 화면에서 글씨가 훨씬 커진다.
 *
 * 신경 쓴 곳 — **글자를 살린 채로 자른다.**
 *  - 페이지를 그림으로 다시 굽지 않는다. 보이는 범위(CropBox)만 좁힌다. 그래서 글자를 그대로
 *    고르고 찾을 수 있고, 파일도 커지지 않는다. 내용은 하나도 지워지지 않는다 — 가려질 뿐이다.
 *  - **모든 장을 같은 크기로** 자를 수 있다. 장마다 다르게 자르면 넘길 때 화면이 들썩인다.
 *  - 스캔 얼룩 한 점 때문에 여백이 안 잘리는 일이 많아, 옅은 점은 무시하고 본다.
 */
import { fileSize as size } from './shared/media';

(function (): void {
  interface PdfPage {
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
  }
  interface PdfDoc { numPages: number; getPage: (n: number) => Promise<PdfPage> }
  interface PdfJs {
    getDocument: (o: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
    GlobalWorkerOptions: { workerSrc: string };
  }
  interface PDFLib {
    PDFDocument: {
      load: (b: ArrayBuffer, o?: { ignoreEncryption?: boolean }) => Promise<{
        getPages: () => Array<{
          getSize: () => { width: number; height: number };
          setCropBox: (x: number, y: number, w: number, h: number) => void;
        }>;
        save: () => Promise<Uint8Array>;
      }>;
    };
  }

  /** 그려 낸 페이지에서 내용이 실제로 있는 범위를 찾는다 (0~1 비율) */
  function inkBounds(ctx: CanvasRenderingContext2D, w: number, h: number, tolerance: number): null | { l: number; t: number; r: number; b: number } {
    const d = ctx.getImageData(0, 0, w, h).data;
    let l = w, t = h, r = -1, b = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // 옅은 점은 무시한다 — 스캔 얼룩 하나 때문에 여백이 통째로 안 잘리는 일이 잦다
        if (d[i] < tolerance && d[i + 1] < tolerance && d[i + 2] < tolerance) {
          if (x < l) l = x;
          if (x > r) r = x;
          if (y < t) t = y;
          if (y > b) b = y;
        }
      }
    }
    if (r < 0) return null; // 빈 장 — 자르지 않는다
    return { l: l / w, t: t / h, r: r / w, b: b / h };
  }

  Toolbox.register({
    id: 'pdfcrop',
    // 다른 도구가 만든 PDF 를 그대로 받는다 (TASK-KL-133)
    accepts: ['application/pdf'],
    title: 'PDF 여백 자르기',
    category: 'tool',
    desc: '스캔본·논문의 넓은 여백을 걷어냅니다. 글자는 그대로 고를 수 있습니다',
    layout: 'wide',
    icon: '<path d="M7 3v14h14" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M3 7h14v14" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '여백 자르기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="pcDrop">
              <input type="file" id="pcFile" accept="application/pdf,.pdf" hidden>
              <span>여백을 자를 PDF 를 끌어다 놓거나 눌러서 고르세요</span>
            </div>

            <div class="field-group" id="pcControls" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">남길 여백 <span id="pcPadVal" class="range-value">2%</span></div>
                  <input type="range" id="pcPad" aria-label="남길 여백" min="0" max="10" value="2">
                </div>
                <div>
                  <div class="tool-sublabel">옅은 얼룩 무시 <span id="pcTolVal" class="range-value">보통</span></div>
                  <input type="range" id="pcTol" aria-label="옅은 얼룩 무시" min="120" max="245" value="200">
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="pcSame" checked> 모든 장 같은 크기로 (권장)</label>
              </div>
            </div>

            <div id="pcStage" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-sublabel">첫 장 미리보기 — 빨간 선 안쪽만 남습니다</div>
              <canvas id="pcCanvas" style="max-width:100%; border-radius:10px; display:block; border:1px solid rgba(128,128,128,0.25);"></canvas>
            </div>

            <div class="cc-stats" id="pcStats"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="pcRun" disabled>잘라서 받기</button>
            </div>

            <div class="tool-status" id="pcStatus">파일은 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const canvas = $<HTMLCanvasElement>('#pcCanvas');
          const status = $<HTMLElement>('#pcStatus');
          const stats = $<HTMLElement>('#pcStats');
          const runBtn = $<HTMLButtonElement>('#pcRun');

          let file: File | null = null;
          let doc: PdfDoc | null = null;
          let bounds: Array<{ l: number; t: number; r: number; b: number } | null> = [];

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          /** 모든 장을 감싸는 하나의 범위 — 장마다 다르게 자르면 넘길 때 화면이 들썩인다 */
          function unioned(): { l: number; t: number; r: number; b: number } | null {
            const real = bounds.filter(Boolean) as Array<{ l: number; t: number; r: number; b: number }>;
            if (!real.length) return null;
            return {
              l: Math.min(...real.map((x) => x.l)),
              t: Math.min(...real.map((x) => x.t)),
              r: Math.max(...real.map((x) => x.r)),
              b: Math.max(...real.map((x) => x.b))
            };
          }

          /** 남길 여백까지 얹은 최종 범위 (0~1 비율) */
          function finalBox(i: number): { l: number; t: number; r: number; b: number } | null {
            const box = $<HTMLInputElement>('#pcSame').checked ? unioned() : bounds[i];
            if (!box) return null;
            const pad = parseInt($<HTMLInputElement>('#pcPad').value, 10) / 100;
            return {
              l: Math.max(0, box.l - pad),
              t: Math.max(0, box.t - pad),
              r: Math.min(1, box.r + pad),
              b: Math.min(1, box.b + pad)
            };
          }

          async function scan(): Promise<void> {
            if (!doc) return;
            const tol = parseInt($<HTMLInputElement>('#pcTol').value, 10);
            bounds = [];
            const tmp = document.createElement('canvas');
            const tctx = tmp.getContext('2d');
            if (!tctx) return;
            for (let n = 1; n <= doc.numPages; n++) {
              say(`여백을 살펴보는 중… ${n} / ${doc.numPages}`);
              const page = await doc.getPage(n);
              // 작게 그려도 여백 경계는 충분히 잡힌다 — 크게 그리면 오래 걸린다
              const vp = page.getViewport({ scale: 0.5 });
              tmp.width = Math.max(1, Math.round(vp.width));
              tmp.height = Math.max(1, Math.round(vp.height));
              tctx.fillStyle = '#ffffff';
              tctx.fillRect(0, 0, tmp.width, tmp.height);
              await page.render({ canvasContext: tctx, viewport: vp }).promise;
              bounds.push(inkBounds(tctx, tmp.width, tmp.height, tol));
            }
            await preview();
          }

          async function preview(): Promise<void> {
            if (!doc) return;
            const page = await doc.getPage(1);
            const vp = page.getViewport({ scale: 1 });
            canvas.width = Math.round(vp.width);
            canvas.height = Math.round(vp.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;

            const box = finalBox(0);
            if (box) {
              ctx.save();
              ctx.strokeStyle = '#ff5a5a';
              ctx.lineWidth = 2;
              ctx.setLineDash([7, 5]);
              ctx.strokeRect(
                box.l * canvas.width,
                box.t * canvas.height,
                (box.r - box.l) * canvas.width,
                (box.b - box.t) * canvas.height
              );
              ctx.restore();
              const saved = Math.round((1 - (box.r - box.l) * (box.b - box.t)) * 100);
              stats.innerHTML =
                stat('줄어드는 넓이', `${saved}%`, true) +
                stat('쪽수', `${doc.numPages}쪽`) +
                stat('빈 장', `${bounds.filter((b) => !b).length}장`);
              say(
                saved <= 1
                  ? '자를 여백이 거의 없어요. 이미 꽉 찬 문서입니다.'
                  : `여백을 걷어내면 넓이가 ${saved}% 줄어요. 빨간 선 안쪽만 남습니다.`,
                saved <= 1 ? 'error' : 'ok'
              );
            } else {
              stats.innerHTML = stat('줄어드는 넓이', '0%', true) + stat('쪽수', `${doc.numPages}쪽`);
              say('내용을 못 찾았어요 — 전부 빈 장이거나 아주 옅은 문서입니다.', 'error');
            }
            $<HTMLElement>('#pcStage').style.display = '';
            $<HTMLElement>('#pcControls').style.display = '';
            runBtn.disabled = false;
          }

          async function load(f: File): Promise<void> {
            // 새 문서를 훑는 동안은 못 누르게 한다. 안 그러면 앞 문서에서 잰 범위로 잘린다
            // (시험이 잡았다 — 둘째 문서가 첫째 문서 크기로 나왔다).
            runBtn.disabled = true;
            bounds = [];
            say('PDF 를 여는 중…');
            await Toolbox.ensureScript?.('vendor/pdfjs.min');
            const lib = (window as unknown as { pdfjsLib: PdfJs }).pdfjsLib;
            if (!lib) {
              say('PDF 처리기를 불러오지 못했어요.', 'error');
              return;
            }
            lib.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
            try {
              doc = await lib.getDocument({ data: (await f.arrayBuffer()).slice(0) }).promise;
            } catch {
              say('PDF 를 열지 못했어요 (암호가 걸려 있을 수 있습니다).', 'error');
              return;
            }
            file = f;
            await scan();
          }

          async function run(): Promise<void> {
            if (!file || !doc) return;
            runBtn.disabled = true;
            say('자르는 중…');
            try {
              await Toolbox.ensureScript?.('vendor/pdf-lib.min');
              const L = (window as unknown as { PDFLib: PDFLib }).PDFLib;
              const out = await L.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
              const pages = out.getPages();
              let cropped = 0;
              pages.forEach((page, i) => {
                const box = finalBox(i);
                if (!box) return;
                const { width, height } = page.getSize();
                // PDF 는 아래에서 위로 센다 — 화면 좌표(위에서 아래)를 뒤집어야 한다
                const x = box.l * width;
                const w = (box.r - box.l) * width;
                const h = (box.b - box.t) * height;
                const y = height - box.b * height;
                page.setCropBox(x, y, w, h);
                cropped++;
              });
              const blob = new Blob([(await out.save()) as unknown as BlobPart], { type: 'application/pdf' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = (file.name || '문서').replace(/\.[^.]+$/, '') + '-여백자름.pdf';
              a.click();
              // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
              Toolbox.offerNext?.(status, { blob: blob, name: a.download, from: 'pdfcrop' });
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              say(`${cropped}장을 잘랐어요 · ${size(blob.size)}. 글자는 그대로 고를 수 있습니다.`, 'ok');
              Toolbox.trackUse?.('crop');
            } catch (e) {
              say((e as Error).message || '자르지 못했어요.', 'error');
            } finally {
              runBtn.disabled = false;
            }
          }

          const drop = $<HTMLElement>('#pcDrop');
          const fileInput = $<HTMLInputElement>('#pcFile');
          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) void load(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133). */
          {
            Toolbox.onHandoff?.('pdfcrop', (f: File) => void load(f));
          }
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
          $<HTMLInputElement>('#pcPad').addEventListener('input', () => {
            $<HTMLElement>('#pcPadVal').textContent = $<HTMLInputElement>('#pcPad').value + '%';
            void preview();
          });
          $<HTMLInputElement>('#pcTol').addEventListener('change', () => {
            const v = parseInt($<HTMLInputElement>('#pcTol').value, 10);
            $<HTMLElement>('#pcTolVal').textContent = v < 160 ? '적게' : v < 220 ? '보통' : '많이';
            void scan();
          });
          $<HTMLInputElement>('#pcSame').addEventListener('change', () => void preview());
          runBtn.onclick = () => void run();
        }
      }
    ]
  });
})();
