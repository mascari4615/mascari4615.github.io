/**
 * 글을 PDF 로 (TASK-KL-088)
 *
 * 이력서 초안이나 안내문을 PDF 로 내야 하는데, 워드가 없거나 설치가 번거로운 상황이 흔하다.
 * 온라인 변환기에 글을 붙여 넣는 것도 내용에 따라 곤란하다.
 *
 * 어려운 점은 **한글**이다. PDF 기본 글꼴에는 한글이 없어 그대로 쓰면 글자가 깨지거나 오류가 난다.
 * 글꼴 파일(수 MB)을 받아 심는 방법도 있지만, 한 장 만들자고 그걸 받게 하고 싶지 않다.
 * 그래서 글자를 화면에 그린 뒤 그 그림을 쪽에 얹는다 — 브라우저의 글꼴을 그대로 쓰므로
 * 한글·이모지·한자가 전부 나온다. 대신 글자를 선택·검색할 수는 없다(그 사실을 숨기지 않는다).
 */
(function (): void {
  interface PdfLib {
    PDFDocument: {
      create: () => Promise<{
        addPage: (size: [number, number]) => {
          drawImage: (img: unknown, o: { x: number; y: number; width: number; height: number }) => void;
        };
        embedPng: (b: ArrayBuffer | Uint8Array) => Promise<{ width: number; height: number }>;
        save: () => Promise<Uint8Array>;
      }>;
    };
  }

  // A4 를 화면 점으로 (72dpi 기준). 인쇄 규격을 지켜야 출력이 어긋나지 않는다.
  const A4 = { w: 595, h: 842 };

  Toolbox.register({
    id: 'text2pdf',
    title: '글을 PDF 로',
    category: 'tool',
    desc: '적은 글을 A4 PDF 로 만듭니다. 한글도 깨지지 않고, 글이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8.5 12h7M8.5 15h7M8.5 18h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '글 → PDF',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label" for="t2Text">PDF 로 만들 글</label>
              <textarea id="t2Text" rows="12" spellcheck="false" style="width:100%;" placeholder="여기에 붙여 넣거나 적으세요. 빈 줄로 문단을 나눕니다."></textarea>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">글자 크기 <span id="t2SizeVal" class="range-value">11pt</span></div>
                  <input type="range" id="t2Size" aria-label="글자 크기" min="8" max="20" value="11">
                </div>
                <div>
                  <div class="tool-sublabel">줄 간격 <span id="t2LeadVal" class="range-value">1.6</span></div>
                  <input type="range" id="t2Lead" aria-label="줄 간격" min="10" max="25" value="16">
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">여백 <span id="t2MarginVal" class="range-value">보통</span></div>
                  <input type="range" id="t2Margin" aria-label="여백" min="1" max="3" step="1" value="2">
                </div>
                <div>
                  <div class="tool-sublabel">글꼴</div>
                  <select id="t2Font" aria-label="글꼴">
                    <option value="sans-serif">고딕 — 화면·안내문</option>
                    <option value="serif">명조 — 문서·인쇄물</option>
                    <option value="monospace">고정폭 — 코드·표</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="cc-stats" id="t2Stats"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-ghost" id="t2Preview">미리 보기</button>
              <button class="btn btn-primary" id="t2Run">PDF 로 받기</button>
            </div>

            <div id="t2Shot" style="display:none;">
              <div class="tool-sublabel">첫 쪽 미리보기</div>
              <img id="t2ShotImg" alt="첫 쪽 미리보기" style="max-width:420px; width:100%; border-radius:8px; background:#fff; border:1px solid rgba(128,128,128,0.25);">
            </div>

            <div class="tool-status" id="t2Status">글은 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const textEl = $<HTMLTextAreaElement>('#t2Text');
          const sizeEl = $<HTMLInputElement>('#t2Size');
          const leadEl = $<HTMLInputElement>('#t2Lead');
          const marginEl = $<HTMLInputElement>('#t2Margin');
          const stats = $<HTMLElement>('#t2Stats');
          const status = $<HTMLElement>('#t2Status');

          const MARGINS: Array<[number, string]> = [
            [36, '좁게'],
            [56, '보통'],
            [80, '넓게']
          ];

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function labels(): void {
            $<HTMLElement>('#t2SizeVal').textContent = sizeEl.value + 'pt';
            $<HTMLElement>('#t2LeadVal').textContent = (parseInt(leadEl.value, 10) / 10).toFixed(1);
            $<HTMLElement>('#t2MarginVal').textContent = MARGINS[parseInt(marginEl.value, 10) - 1][1];
          }

          /**
           * 글을 쪽 단위로 나눈다. 한 줄이 넘치면 **글자 단위로** 접는다 —
           * 한국어는 띄어쓰기가 드문 문장이 많아 낱말 단위로만 접으면 오른쪽이 삐져나간다.
           */
          function layout(scale: number): HTMLCanvasElement[] {
            const fontSize = parseInt(sizeEl.value, 10) * scale;
            const lineHeight = fontSize * (parseInt(leadEl.value, 10) / 10);
            const margin = MARGINS[parseInt(marginEl.value, 10) - 1][0] * scale;
            const family = $<HTMLSelectElement>('#t2Font').value;
            const W = A4.w * scale;
            const H = A4.h * scale;
            const maxW = W - margin * 2;

            const probe = document.createElement('canvas').getContext('2d');
            if (!probe) return [];
            probe.font = `${fontSize}px ${family}`;

            const lines: string[] = [];
            for (const para of textEl.value.replace(/\r/g, '').split('\n')) {
              if (!para) {
                lines.push('');
                continue;
              }
              let cur = '';
              for (const ch of para) {
                const next = cur + ch;
                if (probe.measureText(next).width > maxW && cur) {
                  lines.push(cur);
                  cur = ch;
                } else cur = next;
              }
              lines.push(cur);
            }

            const perPage = Math.max(1, Math.floor((H - margin * 2) / lineHeight));
            const pages: HTMLCanvasElement[] = [];
            for (let i = 0; i < Math.max(1, lines.length); i += perPage) {
              const cv = document.createElement('canvas');
              cv.width = Math.round(W);
              cv.height = Math.round(H);
              const ctx = cv.getContext('2d');
              if (!ctx) break;
              ctx.fillStyle = '#fff';
              ctx.fillRect(0, 0, cv.width, cv.height);
              ctx.fillStyle = '#111';
              ctx.font = `${fontSize}px ${family}`;
              ctx.textBaseline = 'top';
              lines.slice(i, i + perPage).forEach((ln, k) => {
                ctx.fillText(ln, margin, margin + k * lineHeight);
              });
              pages.push(cv);
            }
            return pages;
          }

          function refresh(): void {
            labels();
            const chars = textEl.value.replace(/\s/g, '').length;
            const pages = chars ? layout(1).length : 0;
            stats.innerHTML =
              stat('쪽 수', `${pages}쪽`, true) + stat('글자 수', `${chars.toLocaleString()}자`) + stat('규격', 'A4');
          }

          async function run(preview: boolean): Promise<void> {
            if (!textEl.value.trim()) {
              say('글을 먼저 적어 주세요.', 'error');
              return;
            }
            // 인쇄용으로 2배 크기로 그린다 — 1배로 그리면 글자가 뭉개진다
            const pages = layout(2);
            if (!pages.length) {
              say('만들 내용이 없어요.', 'error');
              return;
            }
            if (preview) {
              $<HTMLImageElement>('#t2ShotImg').src = pages[0].toDataURL('image/png');
              $<HTMLElement>('#t2Shot').style.display = '';
              say(`${pages.length}쪽으로 만들어집니다. 첫 쪽을 확인해 보세요.`, 'ok');
              return;
            }

            say('PDF 로 엮는 중…');
            await Toolbox.ensureScript?.('vendor/pdf-lib.min');
            const lib = (window as unknown as { PDFLib: PdfLib }).PDFLib;
            if (!lib) throw new Error('PDF 만드는 부분을 불러오지 못했습니다');
            const doc = await lib.PDFDocument.create();
            for (const cv of pages) {
              const blob: Blob = await new Promise((res, rej) =>
                cv.toBlob((b) => (b ? res(b) : rej(new Error('그리기 실패'))), 'image/png')
              );
              const img = await doc.embedPng(await blob.arrayBuffer());
              doc.addPage([A4.w, A4.h]).drawImage(img, { x: 0, y: 0, width: A4.w, height: A4.h });
            }
            const out = new Blob([(await doc.save()) as unknown as BlobPart], { type: 'application/pdf' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(out);
            a.download = '문서.pdf';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say(`${pages.length}쪽 PDF 로 받았어요. 글자를 선택·검색할 수는 없습니다 (글자를 그림으로 그려 넣기 때문).`, 'ok');
            Toolbox.trackUse?.('make');
          }

          [sizeEl, leadEl, marginEl].forEach((el) => el.addEventListener('input', refresh));
          $<HTMLSelectElement>('#t2Font').addEventListener('change', refresh);
          textEl.addEventListener('input', refresh);
          $<HTMLButtonElement>('#t2Preview').onclick = () => {
            void run(true).catch((err: Error) => say('만드는 중 문제가 생겼어요: ' + err.message, 'error'));
          };
          $<HTMLButtonElement>('#t2Run').onclick = () => {
            void run(false).catch((err: Error) => say('만드는 중 문제가 생겼어요: ' + err.message, 'error'));
          };
          refresh();
        }
      }
    ]
  });
})();
