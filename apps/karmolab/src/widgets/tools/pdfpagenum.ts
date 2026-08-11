/**
 * PDF 쪽 번호 넣기 (TASK-KL-088)
 *
 * 제출 서류나 인쇄물에 쪽 번호가 없으면 섞였을 때 되돌릴 수가 없다. 그런데 번호를 넣자고
 * 편집 프로그램을 켜기는 아깝다.
 *
 * 신경 쓴 곳:
 *  - **표지는 건너뛴다.** 표지에 「1」이 찍히면 대부분 다시 만들어야 한다. 몇 장을 건너뛸지
 *    고를 수 있고, 건너뛴 장은 세지도 않게 할 수 있다(그래야 본문 첫 장이 1이 된다).
 *  - 번호는 글자를 그림으로 그려 넣는다 — PDF 기본 글꼴은 한글을 담지 못해서 「3쪽」이 깨진다.
 *  - 종이 크기가 제각각인 문서에서도 여백 비율로 자리를 잡는다.
 */
import { fileSize as size } from './shared/media';

import { t, loadNamespace } from '../../lib/i18n';
import { spec as pdfPageNumberCoreSpec } from '../../core/pdfpagenum';

(function (): void {
  interface PDFLib {
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

  /** 글자를 그림으로 — PDF 기본 글꼴은 한글을 담지 못해 「3쪽」이 깨진다 */
  function textToPng(text: string, color: string): Promise<Uint8Array> {
    const fontSize = 64; // 크게 그려 두고 넣을 때 줄인다 (인쇄해도 안 뭉갠다)
    const pad = 8;
    const probe = document.createElement('canvas').getContext('2d');
    if (!probe) return Promise.reject(new Error('canvas 없음'));
    probe.font = `500 ${fontSize}px sans-serif`;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(probe.measureText(text).width) + pad * 2;
    cv.height = fontSize + pad * 2;
    const ctx = cv.getContext('2d');
    if (!ctx) return Promise.reject(new Error('canvas 없음'));
    ctx.font = `500 ${fontSize}px sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, pad, cv.height / 2);
    return new Promise((resolve, reject) => {
      cv.toBlob((b) => {
        if (!b) return reject(new Error('글자를 그림으로 바꾸지 못했습니다'));
        b.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)), reject);
      }, 'image/png');
    });
  }

  Toolbox.register({
    id: pdfPageNumberCoreSpec.id,
    // 다른 도구가 만든 PDF 를 그대로 받는다 (TASK-KL-133)
    accepts: ['application/pdf'],
    title: t('widgets.pdfpagenum.title', undefined, 'PDF 쪽 번호'),
    category: 'tool',
    desc: t(
      'widgets-desc.pdfpagenum.desc',
      undefined,
      'PDF 에 쪽 번호를 넣습니다. 표지는 건너뛰고 본문부터 1로 셀 수 있습니다'
    ),
    layout: 'wide',
    icon: '<path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 17h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('pdfpagenum.tab', undefined, '쪽 번호'),
        build: function (container: HTMLElement): void {
          void loadNamespace('pdfpagenum').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          const esc = (v: string): string =>
            v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          container.innerHTML = `
            <div class="tool-drop" id="pnDrop">
              <input type="file" id="pnFile" accept="application/pdf,.pdf" hidden>
              <span>${esc(t('pdfpagenum.drop'))}</span>
            </div>

            <div class="field-group" id="pnControls" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('pdfpagenum.label.style'))}</div>
                  <select id="pnStyle" aria-label="${esc(t('pdfpagenum.aria.style'))}">
                    <option value="plain">1</option>
                    <option value="slash">1 / 12</option>
                    <option value="dash">- 1 -</option>
                    <option value="ko">${esc(t('pdfpagenum.style.ko'))}</option>
                    <option value="koTotal">${esc(t('pdfpagenum.style.koTotal'))}</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('pdfpagenum.label.place'))}</div>
                  <select id="pnPos" aria-label="번호 자리">
                    <option value="bc">${esc(t('pdfpagenum.place.bc'))}</option>
                    <option value="br">${esc(t('pdfpagenum.place.br'))}</option>
                    <option value="bl">${esc(t('pdfpagenum.place.bl'))}</option>
                    <option value="tr">${esc(t('pdfpagenum.place.tr'))}</option>
                  </select>
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">${esc(t('pdfpagenum.label.skip'))} <span id="pnSkipVal" class="range-value">0장</span></div>
                  <input type="range" id="pnSkip" aria-label="건너뛸 장" min="0" max="5" value="0">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('pdfpagenum.label.size'))} <span id="pnSizeVal" class="range-value">보통</span></div>
                  <input type="range" id="pnSize" aria-label="글씨 크기" min="8" max="18" value="11">
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="pnRestart" checked> ${esc(t('pdfpagenum.opt.restart'))}</label>
              </div>
            </div>

            <div class="cc-stats" id="pnStats"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="pnRun" disabled>${esc(t('pdfpagenum.btn.run'))}</button>
            </div>

            <div class="tool-status" id="pnStatus">${esc(t('pdfpagenum.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const status = $<HTMLElement>('#pnStatus');
          const stats = $<HTMLElement>('#pnStats');
          const runBtn = $<HTMLButtonElement>('#pnRun');

          let file: File | null = null;
          let pageCount = 0;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          /** 쪽 번호 문구를 만든다 — 모양에 따라 「/ 전체」가 붙는다 */
          function label(n: number, total: number): string {
            switch ($<HTMLSelectElement>('#pnStyle').value) {
              case 'slash': return `${n} / ${total}`;
              case 'dash': return `- ${n} -`;
              case 'ko': return `${n}쪽`;
              case 'koTotal': return `${n} / ${total}쪽`;
              default: return String(n);
            }
          }

          function showStats(): void {
            const skip = parseInt($<HTMLInputElement>('#pnSkip').value, 10);
            const restart = $<HTMLInputElement>('#pnRestart').checked;
            const numbered = Math.max(0, pageCount - skip);
            const first = restart ? 1 : skip + 1;
            stats.innerHTML =
              stat(t('pdfpagenum.stat.numbered'), t('pdfpagenum.value.pages', { n: numbered }), true) +
              stat(t('pdfpagenum.stat.total'), t('pdfpagenum.value.pages', { n: pageCount })) +
              stat(t('pdfpagenum.stat.first'), numbered ? String(first) : t('pdfpagenum.value.none'));
          }

          async function load(f: File): Promise<void> {
            say(t('pdfpagenum.say.opening'));
            await Toolbox.ensureScript?.('vendor/pdf-lib.min');
            const L = (window as unknown as { PDFLib: PDFLib }).PDFLib;
            if (!L) {
              say(t('pdfpagenum.err.engine'), 'error');
              return;
            }
            try {
              const doc = await L.PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
              pageCount = doc.getPages().length;
            } catch {
              say(t('pdfpagenum.err.open'), 'error');
              return;
            }
            file = f;
            $<HTMLInputElement>('#pnSkip').max = String(Math.min(5, Math.max(0, pageCount - 1)));
            $<HTMLElement>('#pnControls').style.display = '';
            runBtn.disabled = false;
            showStats();
            say(`${pageCount}장짜리 문서예요. 모양과 자리를 고르고 번호 넣기를 누르세요.`, 'ok');
          }

          async function run(): Promise<void> {
            if (!file) return;
            runBtn.disabled = true;
            say(t('pdfpagenum.say.numbering'));
            try {
              await Toolbox.ensureScript?.('vendor/pdf-lib.min');
              const L = (window as unknown as { PDFLib: PDFLib }).PDFLib;
              const doc = await L.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
              const pages = doc.getPages();
              const skip = parseInt($<HTMLInputElement>('#pnSkip').value, 10);
              const restart = $<HTMLInputElement>('#pnRestart').checked;
              const pt = parseInt($<HTMLInputElement>('#pnSize').value, 10);
              const pos = $<HTMLSelectElement>('#pnPos').value;
              const total = restart ? pages.length - skip : pages.length;

              for (let i = skip; i < pages.length; i++) {
                const n = restart ? i - skip + 1 : i + 1;
                const png = await doc.embedPng(await textToPng(label(n, total), '#333333'));
                const page = pages[i];
                const { width, height } = page.getSize();
                const h = pt;
                const w = (png.width / png.height) * h;
                // 여백은 종이 크기에 견주어 잡는다 — A4·레터가 섞여 있어도 자리가 튀지 않는다
                const mx = width * 0.06;
                const my = height * 0.045;
                const x = pos === 'bc' ? (width - w) / 2 : pos.endsWith('r') ? width - mx - w : mx;
                const y = pos.startsWith('t') ? height - my - h : my;
                page.drawImage(png, { x, y, width: w, height: h });
              }

              const blob = new Blob([(await doc.save()) as unknown as BlobPart], { type: 'application/pdf' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download =
                (file.name || t('pdfpagenum.file.base')).replace(/\.[^.]+$/, '') + t('pdfpagenum.file.suffix') + '.pdf';
              a.click();
              // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
              Toolbox.offerNext?.(status, { blob: blob, name: a.download, from: 'pdfpagenum' });
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              say(
                t('pdfpagenum.say.done', { n: pages.length - skip, size: size(blob.size) }) +
                  (skip ? t('pdfpagenum.say.doneSkip', { n: skip }) : ''),
                'ok'
              );
              Toolbox.trackUse?.('number');
            } catch (e) {
              say((e as Error).message || t('pdfpagenum.err.generic'), 'error');
            } finally {
              runBtn.disabled = false;
            }
          }

          const drop = $<HTMLElement>('#pnDrop');
          const fileInput = $<HTMLInputElement>('#pnFile');
          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) void load(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133). */
          {
            Toolbox.onHandoff?.('pdfpagenum', (f: File) => void load(f));
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
          $<HTMLInputElement>('#pnSkip').addEventListener('input', () => {
            $<HTMLElement>('#pnSkipVal').textContent = t('pdfpagenum.value.pages', {
              n: $<HTMLInputElement>('#pnSkip').value
            });
            showStats();
          });
          $<HTMLInputElement>('#pnSize').addEventListener('input', () => {
            const v = parseInt($<HTMLInputElement>('#pnSize').value, 10);
            $<HTMLElement>('#pnSizeVal').textContent = t(
              v <= 9 ? 'pdfpagenum.size.small' : v <= 13 ? 'pdfpagenum.size.normal' : 'pdfpagenum.size.large'
            );
          });
          $<HTMLInputElement>('#pnRestart').addEventListener('change', showStats);
          $<HTMLSelectElement>('#pnStyle').addEventListener('change', showStats);
          runBtn.onclick = () => void run();
  }
})();
