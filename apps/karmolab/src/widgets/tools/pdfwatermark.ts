/**
 * PDF 워터마크 (TASK-KL-088)
 *
 * 신분증 사본이나 계약서를 보낼 때 「○○ 제출용」 을 박아 두면 다른 데 재사용되는 걸 막는다.
 * 그런데 워터마크를 넣겠다고 문서를 낯선 사이트에 올리는 건 앞뒤가 안 맞는다 — 여기서는 안 올린다.
 *
 * 한글은 PDF 기본 글꼴에 없어 그대로 그리면 오류가 난다. 글자를 그림으로 그려 얹는 방식을 쓴다.
 */
import { acceptPastedFiles } from './shared/paste';

(function (): void {
  interface PDFLib {
    PDFDocument: {
      load: (b: ArrayBuffer, o?: { ignoreEncryption?: boolean }) => Promise<{
        getPages: () => Array<{
          getSize: () => { width: number; height: number };
          drawImage: (img: unknown, o: { x: number; y: number; width: number; height: number; opacity: number; rotate?: unknown }) => void;
        }>;
        embedPng: (b: ArrayBuffer | Uint8Array) => Promise<{ width: number; height: number }>;
        save: () => Promise<Uint8Array>;
      }>;
    };
    degrees: (n: number) => unknown;
  }

  /** 글자를 캔버스에 그려 PNG 로 — PDF 기본 글꼴은 한글을 담지 못한다. */
  function textToPng(text: string, color: string, fontSize: number): Promise<Uint8Array> {
    const pad = 24;
    const probe = document.createElement('canvas').getContext('2d');
    if (!probe) return Promise.reject(new Error('canvas 없음'));
    probe.font = `700 ${fontSize}px sans-serif`;
    const w = Math.ceil(probe.measureText(text).width) + pad * 2;
    const h = fontSize + pad * 2;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) return Promise.reject(new Error('canvas 없음'));
    ctx.font = `700 ${fontSize}px sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, pad, h / 2);
    return new Promise((resolve, reject) => {
      cv.toBlob((b) => {
        if (!b) return reject(new Error('그리기 실패'));
        b.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)));
      }, 'image/png');
    });
  }

  Toolbox.register({
    id: 'pdfwatermark',
    // 다른 도구가 만든 PDF 를 그대로 받는다 (TASK-KL-133)
    accepts: ['application/pdf'],
    title: 'PDF 워터마크',
    category: 'tool',
    desc: 'PDF 전 페이지에 문구를 얹습니다. 한글도 됩니다',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 17 16 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>',
    tabs: [
      {
        id: 'app',
        label: '워터마크',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="pwDrop">
              <input type="file" id="pwFile" accept="application/pdf" hidden>
              PDF 를 끌어다 놓거나 눌러서 고르세요
            </div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <label class="field-label">문구</label>
              <input type="text" id="pwText" aria-label="넣을 문구" value="사본 · 제출용" spellcheck="false">
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">진하기 <span id="pwOpacityVal" class="range-value">15%</span></div>
                  <input type="range" id="pwOpacity" aria-label="진하기" min="5" max="60" value="15">
                </div>
                <div>
                  <div class="tool-sublabel">크기 <span id="pwSizeVal" class="range-value">60%</span></div>
                  <input type="range" id="pwSize" aria-label="크기" min="20" max="95" value="60">
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">기울기</div>
                  <select id="pwAngle" aria-label="기울기">
                    <option value="45">대각선 (45°)</option>
                    <option value="0">가로</option>
                    <option value="90">세로</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">색</div>
                  <input type="text" id="pwColor" aria-label="색" value="#e02020" spellcheck="false">
                </div>
              </div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="pwRun">워터마크 넣고 내려받기</button>
            </div>
            <div class="tool-status" id="pwStatus">파일은 브라우저 안에서만 다뤄집니다 — 문서를 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#pwDrop');
          const fileInput = $<HTMLInputElement>('#pwFile');
          const status = $<HTMLElement>('#pwStatus');
          let file: File | null = null;
          let lib: PDFLib | null = null;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

          async function loadLib(): Promise<PDFLib> {
            if (lib) return lib;
            say('PDF 처리기를 불러오는 중…');
            await Toolbox.ensureScript?.('vendor/pdf-lib.min');
            lib = (window as unknown as { PDFLib: PDFLib }).PDFLib;
            if (!lib) throw new Error('PDF 처리기를 불러오지 못했습니다');
            return lib;
          }

          async function run(): Promise<void> {
            if (!file) {
              say('PDF 를 먼저 넣어 주세요.', 'error');
              return;
            }
            const L = await loadLib();
            const text = $<HTMLInputElement>('#pwText').value.trim();
            if (!text) {
              say('넣을 문구를 적어 주세요.', 'error');
              return;
            }
            try {
              const doc = await L.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
              const pngBytes = await textToPng(text, $<HTMLInputElement>('#pwColor').value || '#e02020', 96);
              const img = await doc.embedPng(pngBytes);
              const opacity = parseInt($<HTMLInputElement>('#pwOpacity').value, 10) / 100;
              const sizePct = parseInt($<HTMLInputElement>('#pwSize').value, 10) / 100;
              const angle = parseInt($<HTMLSelectElement>('#pwAngle').value, 10);

              doc.getPages().forEach((page) => {
                const { width, height } = page.getSize();
                // 기울여 놓으면 대각선 길이를 기준으로 잡아야 페이지 밖으로 안 나간다
                const span = angle === 0 ? width : angle === 90 ? height : Math.sqrt(width * width + height * height);
                const w = span * sizePct;
                const h = (img.height / img.width) * w;
                page.drawImage(img, {
                  x: (width - w) / 2 + (angle === 45 ? -w * 0.15 : 0),
                  y: (height - h) / 2 + (angle === 45 ? -h * 0.15 : 0),
                  width: w,
                  height: h,
                  opacity,
                  rotate: L.degrees(angle)
                });
              });

              const blob = new Blob([(await doc.save()) as unknown as BlobPart], { type: 'application/pdf' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = file.name.replace(/\.pdf$/i, '') + '-워터마크.pdf';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              say('전 페이지에 문구를 얹어 내려받았어요.', 'ok');
              // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
              Toolbox.offerNext?.(status, { blob: blob, name: a.download, from: 'pdfwatermark' });
              Toolbox.trackUse?.('watermark');
            } catch (e) {
              say('처리 중 문제가 생겼어요: ' + (e as Error).message, 'error');
            }
          }

          function pick(f: File): void {
            file = f;
            say(`${f.name} — 문구를 적고 넣기를 누르세요.`, 'ok');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) pick(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 파일이 다시 들어와 방금 한 일을 덮는다. */
          {
            Toolbox.onHandoff?.('pdfwatermark', (f: File) => pick(f));
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
          // 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { pick(files[0]); }, (f: File) => f.type === 'application/pdf');
          $<HTMLInputElement>('#pwOpacity').addEventListener('input', (e) => {
            $<HTMLElement>('#pwOpacityVal').textContent = (e.target as HTMLInputElement).value + '%';
          });
          $<HTMLInputElement>('#pwSize').addEventListener('input', (e) => {
            $<HTMLElement>('#pwSizeVal').textContent = (e.target as HTMLInputElement).value + '%';
          });
          $<HTMLButtonElement>('#pwRun').onclick = () => void run();
        }
      }
    ]
  });
})();
