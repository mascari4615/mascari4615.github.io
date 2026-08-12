/**
 * 이미지 → PDF (TASK-KL-088)
 *
 * 스캔한 사진 여러 장을 한 문서로 내야 할 때(제출 서류가 대표적) 필요한 일이다.
 * 각 장의 비율이 제각각이라 **A4 에 그냥 늘려 넣으면 찌그러진다** — 비율을 지킨 채
 * 가운데 맞춰 넣고, 원본 크기를 그대로 쓰고 싶으면 그 선택지도 둔다.
 */
import { acceptPastedFiles } from './shared/paste';
import { t, loadNamespace } from '../../lib/i18n';
import { createPdf, download, loadPdfJs, loadPdfLib, openForEdit, openForRead, pdfBlob, renderPage, suffixName, type PdfJs, type PdfJsDoc, type PdfPage, type PdfLibDoc, type PDFLib } from './shared/pdf';
import { spec as imagePdfCoreSpec } from '../../core/img2pdf';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');


  /** 종이 크기 (pt) */
  const PAPER: Record<string, [number, number]> = {
    a4: [595.28, 841.89],
    letter: [612, 792],
    b5: [498.9, 708.66]
  };

  Toolbox.register({
    id: imagePdfCoreSpec.id,
    // 다른 도구가 만든 그림을 그대로 받는다 (TASK-KL-133)
    accepts: ['image/*'],
    title: t('widgets.img2pdf.title', undefined, "이미지 → PDF"),
    category: 'tool',
    desc: t('widgets-desc.img2pdf.desc', undefined, "사진 여러 장을 한 PDF 로 묶습니다. 비율을 지킨 채 종이에 맞춥니다"),
    layout: 'wide',
    icon: '<rect x="3" y="4" width="10" height="9" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 11l3-3 2 2 3-3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M17 8h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('img2pdf.tab', undefined, "이미지 → PDF"),
        build: function (container: HTMLElement): void {
          void loadNamespace('img2pdf').then(function () {

          container.innerHTML = `
            <div class="tool-drop" id="i2Drop">
              <input type="file" id="i2File" accept="image/png,image/jpeg" multiple hidden>
              ${esc(t('img2pdf.drop'))}
            </div>

            <div class="p2-grid" id="i2Preview" style="margin-top:var(--space-lg);"></div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('img2pdf.label.paper'))}</div>
                  <select id="i2Paper" aria-label="${esc(t('img2pdf.label.paper'))}">
                    <option value="a4">A4</option>
                    <option value="letter">${esc(t('img2pdf.paper.letter'))}</option>
                    <option value="b5">B5</option>
                    <option value="fit">${esc(t('img2pdf.paper.fit'))}</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('img2pdf.label.orient'))}</div>
                  <select id="i2Orient" aria-label="${esc(t('img2pdf.label.orient'))}">
                    <option value="auto">${esc(t('img2pdf.orient.auto'))}</option>
                    <option value="portrait">${esc(t('img2pdf.orient.portrait'))}</option>
                    <option value="landscape">${esc(t('img2pdf.orient.landscape'))}</option>
                  </select>
                </div>
              </div>
              <div style="margin-top:10px;">
                <div class="tool-sublabel">${esc(t('img2pdf.label.margin'))} <span id="i2MarginVal" class="range-value">20pt</span></div>
                <input type="range" id="i2Margin" aria-label="${esc(t('img2pdf.label.margin'))}" min="0" max="72" value="20">
              </div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="i2Run">${esc(t('img2pdf.btn.run'))}</button>
              <button class="btn btn-ghost" id="i2Clear">${esc(t('img2pdf.btn.clear'))}</button>
            </div>
            <div class="tool-status" id="i2Status">${esc(t('img2pdf.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#i2Drop');
          const fileInput = $<HTMLInputElement>('#i2File');
          const preview = $<HTMLElement>('#i2Preview');
          const status = $<HTMLElement>('#i2Status');
          const margin = $<HTMLInputElement>('#i2Margin');
          let files: File[] = [];
          let lib: PDFLib | null = null;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

          async function loadLib(): Promise<PDFLib> {
            if (lib) return lib;
            say(t('img2pdf.say.loadingLib'));
            lib = await loadPdfLib();
            return lib;
          }

          function renderPreview(): void {
            preview.innerHTML = files
              .map((f, i) => `<div class="p2-cell"><img src="${URL.createObjectURL(f)}" alt=""><span>${esc(t('img2pdf.value.nth', { n: i + 1 }))}</span></div>`)
              .join('');
          }

          async function run(): Promise<void> {
            if (!files.length) {
              say(t('img2pdf.err.noFile'), 'error');
              return;
            }
            const L = await loadLib();
            const paperKey = $<HTMLSelectElement>('#i2Paper').value;
            const orient = $<HTMLSelectElement>('#i2Orient').value;
            const pad = parseInt(margin.value, 10);
            try {
              const doc = await L.PDFDocument.create();
              for (const f of files) {
                const bytes = await f.arrayBuffer();
                const isPng = f.type === 'image/png';
                const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);

                if (paperKey === 'fit') {
                  const page = doc.addPage([img.width, img.height]);
                  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
                  continue;
                }
                let [pw, ph] = PAPER[paperKey];
                const wantLandscape = orient === 'landscape' || (orient === 'auto' && img.width > img.height);
                if (wantLandscape) [pw, ph] = [ph, pw];

                // 비율을 지킨 채 여백 안에 들어가는 최대 크기를 구해 가운데 놓는다
                const maxW = pw - pad * 2;
                const maxH = ph - pad * 2;
                const ratio = Math.min(maxW / img.width, maxH / img.height);
                const w = img.width * ratio;
                const h = img.height * ratio;
                const page = doc.addPage([pw, ph]);
                page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
              }
              const blob = pdfBlob(await doc.save());
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = t('img2pdf.file.name');
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              say(t('img2pdf.say.done', { n: files.length }), 'ok');
              // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
              Toolbox.offerNext?.(status, { blob: blob, name: a.download, from: 'img2pdf' });
              Toolbox.trackUse?.('convert');
            } catch (e) {
              say(t('img2pdf.err.run') + (e as Error).message, 'error');
            }
          }

          function add(list: FileList | File[]): void {
            for (const f of Array.from(list)) {
              if (f.type === 'image/png' || f.type === 'image/jpeg') files.push(f);
            }
            renderPreview();
            say(t('img2pdf.say.picked', { n: files.length }), 'ok');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files) add(fileInput.files);
          };

          /* 옆 도구가 방금 만든 그림이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다. */
          {
              Toolbox.onHandoff?.('img2pdf', (f: File) => add([f]));
          }
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            if (e.dataTransfer?.files) add(e.dataTransfer.files);
          });
          // 캡처나 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { add(files); }, (f: File) => f.type.startsWith('image/'));
          margin.addEventListener('input', () => {
            $<HTMLElement>('#i2MarginVal').textContent = margin.value + 'pt';
          });
          $<HTMLButtonElement>('#i2Run').onclick = () => void run();
          $<HTMLButtonElement>('#i2Clear').onclick = () => {
            files = [];
            renderPreview();
            say(t('img2pdf.say.cleared'));
          };
                  });
        }
      }
    ]
  });
})();
