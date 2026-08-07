/**
 * PDF → 이미지 (TASK-KL-088)
 *
 * PDF 한 장을 슬라이드나 문서에 넣으려면 이미지가 필요한데, 캡처하면 화질이 화면 해상도에 묶인다.
 * PDF 는 벡터라 **원하는 배율로 다시 그릴 수 있다** — 2배로 그리면 인쇄에도 쓸 만한 그림이 나온다.
 * 파일은 브라우저 밖으로 나가지 않는다.
 */
import { acceptPastedFiles } from './shared/paste';

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

  function parseRange(spec: string, total: number): number[] {
    const out: number[] = [];
    const seen = new Set<number>();
    for (const chunk of spec.split(',')) {
      const s = chunk.trim();
      if (!s) continue;
      const m = s.match(/^(\d+)?\s*-\s*(\d+)?$/);
      if (m) {
        const from = m[1] ? parseInt(m[1], 10) : 1;
        const to = m[2] ? parseInt(m[2], 10) : total;
        for (let i = from; i <= Math.min(to, total); i++) if (i >= 1 && !seen.has(i)) (seen.add(i), out.push(i));
      } else if (/^\d+$/.test(s)) {
        const n = parseInt(s, 10);
        if (n >= 1 && n <= total && !seen.has(n)) (seen.add(n), out.push(n));
      }
    }
    return out;
  }

  Toolbox.register({
    id: 'pdf2img',
    // 다른 도구가 만든 PDF 를 그대로 받는다 (TASK-KL-133)
    accepts: ['application/pdf'],
    title: 'PDF → 이미지',
    category: 'tool',
    desc: 'PDF 페이지를 PNG·JPG 로 바꿉니다. 배율을 올리면 인쇄용 해상도까지',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="13" y="13" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M13 19l2-2 2 2 2-3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: 'PDF → 이미지',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="p2Drop">
              <input type="file" id="p2File" accept="application/pdf" hidden>
              PDF 를 끌어다 놓거나 눌러서 고르세요
            </div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">배율 <span id="p2ScaleVal" class="range-value">2배</span></div>
                  <input type="range" id="p2Scale" aria-label="배율" min="1" max="4" step="0.5" value="2">
                </div>
                <div>
                  <div class="tool-sublabel">형식</div>
                  <select id="p2Format" aria-label="형식">
                    <option value="image/png">PNG — 글자가 또렷함</option>
                    <option value="image/jpeg">JPG — 용량이 작음</option>
                  </select>
                </div>
              </div>
              <div style="margin-top:10px;">
                <div class="tool-sublabel">페이지 — 1-3,5 (비우면 전체)</div>
                <input type="text" id="p2Range" placeholder="1-3,5" spellcheck="false">
              </div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="p2Run">이미지로 바꾸기</button>
            </div>

            <div class="p2-grid" id="p2Out"></div>
            <div class="tool-status" id="p2Status">파일은 브라우저 안에서만 다뤄집니다. 그림을 누르면 내려받습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#p2Drop');
          const fileInput = $<HTMLInputElement>('#p2File');
          const out = $<HTMLElement>('#p2Out');
          const status = $<HTMLElement>('#p2Status');
          const scale = $<HTMLInputElement>('#p2Scale');
          let file: File | null = null;
          let pdfjs: PdfJs | null = null;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

          async function loadLib(): Promise<PdfJs> {
            if (pdfjs) return pdfjs;
            say('PDF 처리기를 불러오는 중…');
            await Toolbox.ensureScript?.('vendor/pdfjs.min');
            const g = (window as unknown as { pdfjsLib: PdfJs }).pdfjsLib;
            if (!g) throw new Error('PDF 처리기를 불러오지 못했습니다');
            // 워커도 같은 자리에서 받아야 한다 (CDN 을 따로 두면 버전이 어긋난다)
            g.GlobalWorkerOptions.workerSrc = '/apps/karmolab/js/vendor/pdfjs.worker.min.js';
            pdfjs = g;
            return g;
          }

          async function run(): Promise<void> {
            if (!file) {
              say('PDF 를 먼저 넣어 주세요.', 'error');
              return;
            }
            const lib = await loadLib();
            const format = $<HTMLSelectElement>('#p2Format').value;
            const ext = format === 'image/png' ? 'png' : 'jpg';
            const s = parseFloat(scale.value);
            out.innerHTML = '';
            try {
              const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
              const pages = $<HTMLInputElement>('#p2Range').value.trim()
                ? parseRange($<HTMLInputElement>('#p2Range').value, doc.numPages)
                : Array.from({ length: doc.numPages }, (_, i) => i + 1);
              say(`${pages.length}쪽을 그리는 중…`);
              for (const n of pages) {
                const page = await doc.getPage(n);
                const viewport = page.getViewport({ scale: s });
                const canvas = document.createElement('canvas');
                canvas.width = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);
                const ctx = canvas.getContext('2d');
                if (!ctx) continue;
                if (format === 'image/jpeg') {
                  // JPG 는 투명을 못 담아 검게 나온다 — 흰 바탕을 먼저 깐다
                  ctx.fillStyle = '#fff';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                await page.render({ canvasContext: ctx, viewport }).promise;
                const url = canvas.toDataURL(format, 0.92);
                const cell = document.createElement('a');
                cell.className = 'p2-cell';
                cell.href = url;
                cell.download = `${file.name.replace(/\.pdf$/i, '')}-${n}.${ext}`;
                cell.innerHTML = `<img src="${url}" alt="${n}쪽"><span>${n}쪽 · ${canvas.width}×${canvas.height}</span>`;
                out.appendChild(cell);
              }
              say(`${pages.length}쪽을 바꿨어요. 그림을 누르면 내려받습니다.`, 'ok');
              Toolbox.trackUse?.('convert');
            } catch (e) {
              say('처리 중 문제가 생겼어요: ' + (e as Error).message, 'error');
            }
          }

          function pick(f: File): void {
            file = f;
            say(`${f.name} · ${(f.size / 1024 / 1024).toFixed(2)}MB — 배율을 정하고 바꾸기를 누르세요.`, 'ok');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) pick(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 파일이 다시 들어와 방금 한 일을 덮는다. */
          {
            const handed = Toolbox.takeResult?.();
            if (handed && handed.blob && handed.blob.type === 'application/pdf') {
              pick(new File([handed.blob], handed.name || '넘겨받은.pdf', { type: 'application/pdf' }));
            }
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
            if (f) pick(f);
          });
          // 캡처나 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { pick(files[0]); }, (f) => f.type === 'application/pdf');
          scale.addEventListener('input', () => {
            $<HTMLElement>('#p2ScaleVal').textContent = scale.value + '배';
          });
          $<HTMLButtonElement>('#p2Run').onclick = () => void run();
        }
      }
    ]
  });
})();
