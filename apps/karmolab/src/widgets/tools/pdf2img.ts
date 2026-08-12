/**
 * PDF → 이미지 (TASK-KL-088)
 *
 * PDF 한 장을 슬라이드나 문서에 넣으려면 이미지가 필요한데, 캡처하면 화질이 화면 해상도에 묶인다.
 * PDF 는 벡터라 **원하는 배율로 다시 그릴 수 있다** — 2배로 그리면 인쇄에도 쓸 만한 그림이 나온다.
 * 파일은 브라우저 밖으로 나가지 않는다.
 */
import { acceptPastedFiles } from './shared/paste';
import { t, loadNamespace } from '../../lib/i18n';
import { openForRead, renderPage } from './shared/pdf';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
    title: t('widgets.pdf2img.title', undefined, "PDF → 이미지"),
    category: 'tool',
    desc: t('widgets-desc.pdf2img.desc', undefined, "PDF 페이지를 PNG·JPG 로 바꿉니다. 배율을 올리면 인쇄용 해상도까지"),
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="13" y="13" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M13 19l2-2 2 2 2-3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('pdf2img.tab', undefined, "PDF → 이미지"),
        build: function (container: HTMLElement): void {
          void loadNamespace('pdf2img').then(function () {

          container.innerHTML = `
            <div class="tool-drop" id="p2Drop">
              <input type="file" id="p2File" accept="application/pdf" hidden>
              ${esc(t('pdf2img.drop'))}
            </div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('pdf2img.label.scale'))} <span id="p2ScaleVal" class="range-value">${esc(t('pdf2img.value.scale'))}</span></div>
                  <input type="range" id="p2Scale" aria-label="${esc(t('pdf2img.label.scale'))}" min="1" max="4" step="0.5" value="2">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('pdf2img.label.format'))}</div>
                  <select id="p2Format" aria-label="${esc(t('pdf2img.label.format'))}">
                    <option value="image/png">${esc(t('pdf2img.format.png'))}</option>
                    <option value="image/jpeg">${esc(t('pdf2img.format.jpg'))}</option>
                  </select>
                </div>
              </div>
              <div style="margin-top:10px;">
                <div class="tool-sublabel">${esc(t('pdf2img.label.range'))}</div>
                <input type="text" id="p2Range" placeholder="1-3,5" spellcheck="false">
              </div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="p2Run">${esc(t('pdf2img.btn.run'))}</button>
            </div>

            <div class="p2-grid" id="p2Out"></div>
            <div class="tool-status" id="p2Status">${esc(t('pdf2img.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#p2Drop');
          const fileInput = $<HTMLInputElement>('#p2File');
          const out = $<HTMLElement>('#p2Out');
          const status = $<HTMLElement>('#p2Status');
          const scale = $<HTMLInputElement>('#p2Scale');
          let file: File | null = null;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

          async function run(): Promise<void> {
            if (!file) {
              say(t('pdf2img.err.noFile'), 'error');
              return;
            }
            say(t('pdf2img.say.loadingLib'));
            const format = $<HTMLSelectElement>('#p2Format').value;
            const ext = format === 'image/png' ? 'png' : 'jpg';
            const s = parseFloat(scale.value);
            out.innerHTML = '';
            try {
              const doc = await openForRead(file);
              const pages = $<HTMLInputElement>('#p2Range').value.trim()
                ? parseRange($<HTMLInputElement>('#p2Range').value, doc.numPages)
                : Array.from({ length: doc.numPages }, (_, i) => i + 1);
              say(t('pdf2img.say.drawing', { n: pages.length }));
              for (const n of pages) {
                const page = await doc.getPage(n);
                // JPG 는 투명을 못 담아 검게 나온다 — 흰 바탕을 먼저 깔아 달라고 시킨다
                const { canvas } = await renderPage(page, s, format === 'image/jpeg' ? '#fff' : undefined);
                const url = canvas.toDataURL(format, 0.92);
                const cell = document.createElement('a');
                cell.className = 'p2-cell';
                cell.href = url;
                cell.download = `${file.name.replace(/\.pdf$/i, '')}-${n}.${ext}`;
                cell.innerHTML = `<img src="${url}" alt="${esc(t('pdf2img.value.page', { n }))}"><span>${esc(
                t('pdf2img.value.pageSize', { n, w: canvas.width, h: canvas.height })
              )}</span>`;
                out.appendChild(cell);
              }
              say(t('pdf2img.say.done', { n: pages.length }), 'ok');
              Toolbox.trackUse?.('convert');
            } catch (e) {
              say(t('pdf2img.err.run') + (e as Error).message, 'error');
            }
          }

          function pick(f: File): void {
            file = f;
            say(t('pdf2img.say.loaded', { name: f.name, mb: (f.size / 1024 / 1024).toFixed(2) }), 'ok');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) pick(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 파일이 다시 들어와 방금 한 일을 덮는다. */
          {
            Toolbox.onHandoff?.('pdf2img', (f: File) => pick(f));
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
          acceptPastedFiles(container, (files) => { pick(files[0]); }, (f: File) => f.type === 'application/pdf');
          scale.addEventListener('input', () => {
            $<HTMLElement>('#p2ScaleVal').textContent = scale.value + t('pdf2img.unit.scale');
          });
          $<HTMLButtonElement>('#p2Run').onclick = () => void run();
                  });
        }
      }
    ]
  });
})();
