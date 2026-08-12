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
import { t, loadNamespace } from '../../lib/i18n';
import { download, openForEdit, openForRead, pdfBlob, suffixName, type PdfJsDoc } from './shared/pdf';
import { spec as pdfCropCoreSpec } from '../../core/pdfcrop';

(function (): void {
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
    id: pdfCropCoreSpec.id,
    // 다른 도구가 만든 PDF 를 그대로 받는다 (TASK-KL-133)
    accepts: ['application/pdf'],
    title: t('widgets.pdfcrop.title', undefined, 'PDF 여백 자르기'),
    category: 'tool',
    desc: t(
      'widgets-desc.pdfcrop.desc',
      undefined,
      '스캔본·논문의 넓은 여백을 걷어냅니다. 글자는 그대로 고를 수 있습니다'
    ),
    layout: 'wide',
    icon: '<path d="M7 3v14h14" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M3 7h14v14" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('pdfcrop.tab', undefined, '여백 자르기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('pdfcrop').then(function () {
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
            <div class="tool-drop" id="pcDrop">
              <input type="file" id="pcFile" accept="application/pdf,.pdf" hidden>
              <span>${esc(t('pdfcrop.drop'))}</span>
            </div>

            <div class="field-group" id="pcControls" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('pdfcrop.label.pad'))} <span id="pcPadVal" class="range-value">2%</span></div>
                  <input type="range" id="pcPad" aria-label="${esc(t('pdfcrop.label.pad'))}" min="0" max="10" value="2">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('pdfcrop.label.tol'))} <span id="pcTolVal" class="range-value">${esc(
                    t('pdfcrop.tol.mid')
                  )}</span></div>
                  <input type="range" id="pcTol" aria-label="${esc(t('pdfcrop.label.tol'))}" min="120" max="245" value="200">
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="pcSame" checked> ${esc(t('pdfcrop.opt.same'))}</label>
              </div>
            </div>

            <div id="pcStage" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-sublabel">${esc(t('pdfcrop.label.preview'))}</div>
              <canvas id="pcCanvas" style="max-width:100%; border-radius:10px; display:block; border:1px solid rgba(128,128,128,0.25);"></canvas>
            </div>

            <div class="cc-stats" id="pcStats"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="pcRun" disabled>${esc(t('pdfcrop.btn.run'))}</button>
            </div>

            <div class="tool-status" id="pcStatus">${esc(t('pdfcrop.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const canvas = $<HTMLCanvasElement>('#pcCanvas');
          const status = $<HTMLElement>('#pcStatus');
          const stats = $<HTMLElement>('#pcStats');
          const runBtn = $<HTMLButtonElement>('#pcRun');

          let file: File | null = null;
          let doc: PdfJsDoc | null = null;
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
              say(t('pdfcrop.say.scanning', { i: n, n: doc.numPages }));
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
                stat(t('pdfcrop.stat.saved'), `${saved}%`, true) +
                stat(t('pdfcrop.stat.pages'), t('pdfcrop.value.pages', { n: doc.numPages })) +
                stat(
                  t('pdfcrop.stat.blank'),
                  t('pdfcrop.value.sheets', { n: bounds.filter((b) => !b).length })
                );
              say(
                saved <= 1 ? t('pdfcrop.say.nothingToCrop') : t('pdfcrop.say.willShrink', { pct: saved }),
                saved <= 1 ? 'error' : 'ok'
              );
            } else {
              stats.innerHTML =
                stat(t('pdfcrop.stat.saved'), '0%', true) +
                stat(t('pdfcrop.stat.pages'), t('pdfcrop.value.pages', { n: doc.numPages }));
              say(t('pdfcrop.err.noInk'), 'error');
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
            say(t('pdfcrop.say.opening'));
            try {
              doc = await openForRead(f);
            } catch {
              say(t('pdfcrop.err.open'), 'error');
              return;
            }
            file = f;
            await scan();
          }

          async function run(): Promise<void> {
            if (!file || !doc) return;
            runBtn.disabled = true;
            say(t('pdfcrop.say.cropping'));
            try {
              const out = await openForEdit(file);
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
              const blob = pdfBlob(await out.save());
              const name = suffixName(
                file.name || t('pdfcrop.file.fallback'),
                t('pdfcrop.file.suffix').replace(/^-|\.pdf$/gi, '')
              );
              download(blob, name);
              // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
              Toolbox.offerNext?.(status, { blob: blob, name, from: 'pdfcrop' });
              say(t('pdfcrop.say.done', { n: cropped, size: size(blob.size) }), 'ok');
              Toolbox.trackUse?.('crop');
            } catch (e) {
              say((e as Error).message || t('pdfcrop.err.run'), 'error');
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
            $<HTMLElement>('#pcTolVal').textContent =
              v < 160 ? t('pdfcrop.tol.low') : v < 220 ? t('pdfcrop.tol.mid') : t('pdfcrop.tol.high');
            void scan();
          });
          $<HTMLInputElement>('#pcSame').addEventListener('change', () => void preview());
          runBtn.onclick = () => void run();
  }
})();
