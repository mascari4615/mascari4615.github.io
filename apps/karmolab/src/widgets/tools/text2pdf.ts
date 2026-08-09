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
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
    title: t('widgets.text2pdf.title', undefined, "글을 PDF 로"),
    category: 'tool',
    desc: t('widgets-desc.text2pdf.desc', undefined, "적은 글을 A4 PDF 로 만듭니다. 한글도 깨지지 않고, 글이 브라우저를 벗어나지 않습니다"),
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8.5 12h7M8.5 15h7M8.5 18h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('text2pdf.t03', undefined, "글 → PDF"),
        build: function (container: HTMLElement): void {
          void loadNamespace('text2pdf').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <label class="field-label" for="t2Text">${esc(t('text2pdf.label.text'))}</label>
              <textarea id="t2Text" rows="12" spellcheck="false" style="width:100%;" placeholder="${esc(t('text2pdf.ph.text'))}"></textarea>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('text2pdf.label.size'))} <span id="t2SizeVal" class="range-value">11pt</span></div>
                  <input type="range" id="t2Size" aria-label="${esc(t('text2pdf.label.size'))}" min="8" max="20" value="11">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('text2pdf.label.lead'))} <span id="t2LeadVal" class="range-value">1.6</span></div>
                  <input type="range" id="t2Lead" aria-label="${esc(t('text2pdf.label.lead'))}" min="10" max="25" value="16">
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">${esc(t('text2pdf.label.margin'))} <span id="t2MarginVal" class="range-value">${esc(t('text2pdf.margin.mid'))}</span></div>
                  <input type="range" id="t2Margin" aria-label="${esc(t('text2pdf.label.margin'))}" min="1" max="3" step="1" value="2">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('text2pdf.label.font'))}</div>
                  <select id="t2Font" aria-label="${esc(t('text2pdf.label.font'))}">
                    <option value="sans-serif">${esc(t('text2pdf.font.sans'))}</option>
                    <option value="serif">${esc(t('text2pdf.font.serif'))}</option>
                    <option value="monospace">${esc(t('text2pdf.font.mono'))}</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="cc-stats" id="t2Stats"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-ghost" id="t2Preview">${esc(t('text2pdf.btn.preview'))}</button>
              <button class="btn btn-primary" id="t2Run">${esc(t('text2pdf.btn.run'))}</button>
            </div>

            <div id="t2Shot" style="display:none;">
              <div class="tool-sublabel">${esc(t('text2pdf.alt.preview'))}</div>
              <img id="t2ShotImg" alt="${esc(t('text2pdf.alt.preview'))}" style="max-width:420px; width:100%; border-radius:8px; background:#fff; border:1px solid rgba(128,128,128,0.25);">
            </div>

            <div class="tool-status" id="t2Status">${esc(t('text2pdf.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const textEl = $<HTMLTextAreaElement>('#t2Text');
          const sizeEl = $<HTMLInputElement>('#t2Size');
          const leadEl = $<HTMLInputElement>('#t2Lead');
          const marginEl = $<HTMLInputElement>('#t2Margin');
          const stats = $<HTMLElement>('#t2Stats');
          const status = $<HTMLElement>('#t2Status');

          const MARGINS: Array<[number, string]> = [
            [36, t('text2pdf.margin.narrow')],
            [56, t('text2pdf.margin.mid')],
            [80, t('text2pdf.margin.wide')]
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
              stat(t('text2pdf.stat.pages'), t('text2pdf.value.pages', { n: pages }), true) +
              stat(t('text2pdf.stat.chars'), t('text2pdf.value.chars', { n: chars.toLocaleString(locale()) })) +
              stat(t('text2pdf.stat.paper'), 'A4');
          }

          async function run(preview: boolean): Promise<void> {
            if (!textEl.value.trim()) {
              say(t('text2pdf.err.noText'), 'error');
              return;
            }
            // 인쇄용으로 2배 크기로 그린다 — 1배로 그리면 글자가 뭉개진다
            const pages = layout(2);
            if (!pages.length) {
              say(t('text2pdf.err.empty'), 'error');
              return;
            }
            if (preview) {
              $<HTMLImageElement>('#t2ShotImg').src = pages[0].toDataURL('image/png');
              $<HTMLElement>('#t2Shot').style.display = '';
              say(t('text2pdf.say.preview', { n: pages.length }), 'ok');
              return;
            }

            say(t('text2pdf.say.building'));
            await Toolbox.ensureScript?.('vendor/pdf-lib.min');
            const lib = (window as unknown as { PDFLib: PdfLib }).PDFLib;
            if (!lib) throw new Error(t('text2pdf.err.lib'));
            const doc = await lib.PDFDocument.create();
            for (const cv of pages) {
              const blob: Blob = await new Promise((res, rej) =>
                cv.toBlob((b) => (b ? res(b) : rej(new Error(t('text2pdf.err.draw')))), 'image/png')
              );
              const img = await doc.embedPng(await blob.arrayBuffer());
              doc.addPage([A4.w, A4.h]).drawImage(img, { x: 0, y: 0, width: A4.w, height: A4.h });
            }
            const out = new Blob([(await doc.save()) as unknown as BlobPart], { type: 'application/pdf' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(out);
            a.download = t('text2pdf.file.name');
            a.click();
            // 만든 것을 이어서 쓸 수 있게 내놓는다 (TASK-KL-133) — 받을 도구가 없으면 줄이 안 생긴다.
            Toolbox.offerNext?.(status, { blob: out, name: a.download, from: 'text2pdf' });
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say(t('text2pdf.say.done', { n: pages.length }), 'ok');
            Toolbox.trackUse?.('make');
          }

          [sizeEl, leadEl, marginEl].forEach((el) => el.addEventListener('input', refresh));
          $<HTMLSelectElement>('#t2Font').addEventListener('change', refresh);
          textEl.addEventListener('input', refresh);
          $<HTMLButtonElement>('#t2Preview').onclick = () => {
            void run(true).catch((err: Error) => say(t('text2pdf.err.run') + err.message, 'error'));
          };
          $<HTMLButtonElement>('#t2Run').onclick = () => {
            void run(false).catch((err: Error) => say(t('text2pdf.err.run') + err.message, 'error'));
          };
          refresh();
                  });
        }
      }
    ]
  });
})();
