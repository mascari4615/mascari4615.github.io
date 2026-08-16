/**
 * 이미지 일괄 변환 (TASK-KL-088)
 *
 * 사진 스무 장을 한 장씩 줄이고 바꾸는 건 도구의 문제가 아니라 **반복의 문제**다.
 * 그래서 여러 장을 한 번에 받아 같은 규칙으로 처리하고, ZIP 하나로 내려준다.
 * 원본보다 커지는 경우가 있어(작은 PNG 를 JPG 로 바꿀 때) 전후 용량을 나란히 보여준다.
 */
import { statusLine } from './shared/say';
import { escapeHtml as esc } from './shared/text';
import { runBatch, retryBar, type BatchFail } from './shared/batch';
import { wireDrop } from './shared/drop-well';
import { download, encode, loadImage, toCanvas } from './shared/image';
import { t, loadNamespace } from '../../lib/i18n';
import { centerCrop, estimateTotal, saving } from '../../lib/imgpreview';

(function (): void {

  interface Result {
    name: string;
    blob: Blob;
    before: number;
    w: number;
    h: number;
  }

  const size = (n: number): string =>
    n>= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n>= 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`;

  Toolbox.register({
    id: 'imgbatch',
    title: t('widgets.imgbatch.title', undefined, "이미지 일괄 변환"),
    category: 'tool',
    desc: t('widgets-desc.imgbatch.desc', undefined, "사진 여러 장의 크기와 형식을 한 번에 바꿔 ZIP 으로 받습니다"),
    layout: 'wide',
    icon: '<rect x="3" y="6" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 14l3.5-3.5 2.5 2.5 3-3 4 4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M7 3h11a2 2 0 0 1 2 2v11" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.6"/>',
    tabs: [
      {
        id: 'app',
        label: t('imgbatch.tab', undefined, "일괄 변환"),
        build: function (container: HTMLElement): void {
          void loadNamespace('imgbatch').then(function () {

          container.innerHTML = `
            <div class="tool-drop" id="ibDrop">
              <input type="file" id="ibFile" accept="image/*" multiple hidden>
              ${esc(t('imgbatch.drop'))}
            </div>

            <div class="tool-section field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('imgbatch.label.format'))}</div>
                  <select id="ibFormat" aria-label="${esc(t('imgbatch.label.format'))}">
                    <option value="image/jpeg">JPG</option>
                    <option value="image/png">PNG</option>
                    <option value="image/webp">${esc(t('imgbatch.format.webp'))}</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('imgbatch.label.max'))} <span id="ibMaxVal" class="range-value">1600px</span></div>
                  <input type="range" id="ibMax" aria-label="${esc(t('imgbatch.label.max'))}" min="200" max="4000" step="100" value="1600">
                </div>
              </div>
              <div>
                <div class="tool-sublabel">${esc(t('imgbatch.label.quality'))} <span id="ibQualityVal" class="range-value">85</span></div>
                <input type="range" id="ibQuality" aria-label="${esc(t('imgbatch.label.quality'))}" min="40" max="100" value="85">
              </div>
            </div>

            <div class="tool-section-end" id="ibPreview" hidden>
              <div class="tool-sublabel">${esc(t('imgbatch.preview.title'))} <span id="ibPreviewMeta" class="range-value"></span></div>
              <div class="tool-grid-2">
                <figure style="margin:0;">
                  <canvas id="ibBefore" style="width:100%; height:auto; display:block; border-radius:8px;"></canvas>
                  <figcaption class="tool-list-dim">${esc(t('imgbatch.preview.before'))}</figcaption>
                </figure>
                <figure style="margin:0;">
                  <canvas id="ibAfter" style="width:100%; height:auto; display:block; border-radius:8px;"></canvas>
                  <figcaption class="tool-list-dim" id="ibAfterCap">${esc(t('imgbatch.preview.after'))}</figcaption>
                </figure>
              </div>
              <p class="tool-list-dim" style="margin-top:6px;">${esc(t('imgbatch.preview.how'))}</p>
            </div>

            <div class="tool-actions tight">
              <button class="btn btn-primary" id="ibRun">${esc(t('imgbatch.btn.run'))}</button>
              <button class="btn btn-ghost" id="ibZip">${esc(t('imgbatch.btn.zip'))}</button>
              <button class="btn btn-ghost" id="ibClear">${esc(t('imgbatch.btn.clear'))}</button>
            </div>

            <div class="kl-batch" id="ibFails" hidden></div>
            <div class="tool-list" id="ibList"></div>
            <div class="tool-status" id="ibStatus">${esc(t('imgbatch.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#ibDrop');
          const fileInput = $<HTMLInputElement>('#ibFile');
          const listEl = $<HTMLElement>('#ibList');
          const status = $<HTMLElement>('#ibStatus');
          const maxEl = $<HTMLInputElement>('#ibMax');
          const qualityEl = $<HTMLInputElement>('#ibQuality');
          let files: File[] = [];
          let results: Result[] = [];
          let lastFails: BatchFail[] = [];

          /* 상태 줄은 **공용 하나**를 쓴다 (TASK-KL-291) — `aria-live` 가 여기 붙어 있어서
           * 화면낭독기가 「다 됐습니다」·「못 엽니다」를 실제로 읽어 준다. */
          const say = statusLine(status);

          function render(): void {
            if (results.length) {
              listEl.innerHTML = results
                .map(
                  (r) =>
                    `<div class="tool-list-row cc-copy-row" data-name="${esc(r.name)}"><span class="tool-list-key">${size(r.blob.size)}</span><span class="tool-list-val">${esc(r.name)} <span class="tool-list-dim">${esc(
                      t('imgbatch.row.meta', {
                        w: r.w,
                        h: r.h,
                        from: size(r.before),
                        verdict:
                          r.blob.size < r.before
                            ? t('imgbatch.verdict.smaller', {
                                pct: Math.round((1 - r.blob.size / r.before) * 100)
                              })
                            : t('imgbatch.verdict.bigger')
                      })
                    )}</span></span></div>`
                )
                .join('');
              listEl.querySelectorAll('[data-name]').forEach((el, i) => {
                (el as HTMLElement).onclick = () => {
                  const r = results[i];
                  download(r.blob, r.name);
                  /* 바꾼 그림은 대개 **또 손본다**(크기·가리개·PDF 로) — 이어서 쓰게 내놓는다 (TASK-KL-298). */
                  Toolbox.offerNext?.(status, { blob: r.blob, name: r.name, from: 'imgbatch' });
                };
              });
              return;
            }
            listEl.innerHTML = files
              .map((f) => `<div class="tool-list-row"><span class="tool-list-key">${size(f.size)}</span><span class="tool-list-val">${esc(f.name)}</span></div>`)
              .join('');
          }

          /**
           * **누르기 전에 보여 준다** (TASK-KL-238 / 17 squoosh).
           *
           * 화질 다이얼은 있었지만 그 숫자가 뭘 뜻하는지는 스무 장을 다 바꾼 뒤에야 알았다.
           * 그래서 첫 장으로 지금 설정 그대로 한 번 눌러 보고, **용량**과 **확대한 그림**을 같이 낸다.
           * 겹쳐 보기는 `comparepic` 의 일이다 — 압축 자국은 **확대해야** 보이므로 여기선 나란히.
           */
          const PREVIEW_BOX = 320;
          const PREVIEW_ZOOM = 2;
          let previewTimer = 0;
          let previewToken = 0;

          async function preview(): Promise<void> {
            const box = $<HTMLElement>('#ibPreview');
            const first = files[0];
            if (first === undefined) {
              box.hidden = true;
              return;
            }
            const mine = ++previewToken;
            let img: HTMLImageElement;
            let result: Result;
            try {
              img = await loadImage(first);
              result = await convert(first);
            } catch {
              box.hidden = true; // 미리보기는 **거들 뿐**이다 — 못 하면 조용히 접는다
              return;
            }
            if (mine !== previewToken) return; // 그 사이 다이얼이 또 움직였다 — 낡은 그림을 덮어쓰지 않는다

            const after = await loadImage(new File([result.blob], result.name, { type: result.blob.type }));
            if (mine !== previewToken) return;

            box.hidden = false;
            paintCrop($<HTMLCanvasElement>('#ibBefore'), img);
            paintCrop($<HTMLCanvasElement>('#ibAfter'), after);

            const s = saving(first.size, result.blob.size);
            const totalBefore = files.reduce((a, f) => a + f.size, 0);
            const guess = estimateTotal(totalBefore, first.size, result.blob.size);
            $<HTMLElement>('#ibPreviewMeta').textContent = t('imgbatch.preview.meta', {
              before: size(first.size),
              after: size(result.blob.size),
              verdict:
                s.kind === 'smaller'
                  ? t('imgbatch.verdict.smaller', { pct: s.pct })
                  : s.kind === 'bigger'
                    ? t('imgbatch.verdict.biggerBy', { pct: s.pct })
                    : t('imgbatch.verdict.same'),
              guess: guess === null || files.length < 2 ? '' : t('imgbatch.preview.guess', { n: files.length, total: size(guess) })
            });
            $<HTMLElement>('#ibAfterCap').textContent = t('imgbatch.preview.afterMeta', {
              q: qualityEl.value,
              w: result.w,
              h: result.h
            });
          }

          /** 같은 자리를 같은 배율로 — 자르는 자리는 `lib/imgpreview` 가 정한다(검사가 그 자리를 본다). */
          function paintCrop(canvas: HTMLCanvasElement, img: HTMLImageElement): void {
            const c = centerCrop(img.naturalWidth, img.naturalHeight, PREVIEW_BOX, PREVIEW_BOX, PREVIEW_ZOOM);
            canvas.width = PREVIEW_BOX;
            canvas.height = PREVIEW_BOX;
            const ctx = canvas.getContext('2d');
            if (ctx === null) return;
            ctx.imageSmoothingEnabled = false; // 자국을 보려고 확대하는 것이다 — 문질러 놓으면 볼 것이 없다
            ctx.clearRect(0, 0, PREVIEW_BOX, PREVIEW_BOX);
            ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, 0, 0, PREVIEW_BOX, PREVIEW_BOX);
          }

          /** 다이얼은 잡고 움직인다 — 뗄 때마다 누르면 큰 사진에서 화면이 멎는다. */
          function previewSoon(): void {
            clearTimeout(previewTimer);
            previewTimer = window.setTimeout(() => void preview(), 350);
          }

          /**
           * 한 장을 바꾼다. 읽기·줄이기·내보내기를 **전부 공용 것으로** (TASK-KL-280).
           *
           * 흰 바탕 깔기도 공용 `encode` 가 한다 — 여기 손으로 적어 두면 다음 도구가 또 잊는다
           * (실제로 「사진 크기 맞추기」가 잊어서 투명한 데가 검게 나왔다, [[TASK-KL-272]]).
           */
          async function convert(file: File): Promise<Result> {
            const img = await loadImage(file);
            const max = parseInt(maxEl.value, 10);
            const cv = toCanvas(img, { w: max, h: max });
            const format = $<HTMLSelectElement>('#ibFormat').value;
            const kind = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpeg';
            const blob = await encode(cv, kind, parseInt(qualityEl.value, 10) / 100);
            const ext = kind === 'jpeg' ? 'jpg' : kind;
            return {
              name: file.name.replace(/\.[^.]+$/, '') + '.' + ext,
              blob,
              before: file.size,
              w: cv.width,
              h: cv.height
            };
          }

          async function run(only?: File[]): Promise<void> {
            const todo = only && only.length ? only : files;
            if (!todo.length) {
              say(t('imgbatch.err.noFile'), 'error');
              return;
            }
            results = [];
            /* 도는 자리는 **공용 하나**를 쓴다 (TASK-KL-302) — 몇째인지 말하는 것과
             * 실패를 남기는 것이 여기 붙어 있다. 전에는 한 장이 깨지면 그 말이 끝말에
             * 덮여서, 스무 장 중 둘이 빠져도 사람은 숫자 하나만 봤다. */
            const batch = await runBatch(todo, (f) => convert(f), {
              say,
              progress: (i, total, f) => t('imgbatch.say.one', { i, total, name: f.name }, `${i}/${total} — ${f.name}`),
              done: () => '',
              partly: (ok, bad) =>
                t(
                  'imgbatch.say.partly',
                  { ok, bad: bad.length, names: bad.map((b) => b.file.name).join(', ') },
                  `${ok}장 됐고, ${bad.length}장은 안 됩니다: ${bad.map((b) => b.file.name).join(', ')}`
                )
            });
            results = batch.done;
            lastFails = batch.failed;
            paintFails();
            render();
            if (batch.failed.length) return;
            const before = files.reduce((a, f) => a + f.size, 0);
            const after = results.reduce((a, r) => a + r.blob.size, 0);
            // 작은 PNG 를 JPG 로 바꾸면 오히려 커진다 — 「-559% 줄었어요」 같은 말이 나오면 안 된다
            const pct = Math.round(Math.abs(1 - after / before) * 100);
            const verdict =
              after < before
                ? t('imgbatch.verdict.smaller', { pct })
                : after> before
                  ? t('imgbatch.verdict.biggerBy', { pct })
                  : t('imgbatch.verdict.same');
            say(
              t('imgbatch.say.done', {
                n: results.length,
                before: size(before),
                after: size(after),
                verdict
              }),
              'ok'
            );
            Toolbox.trackUse?.('convert');
          }

          async function zip(): Promise<void> {
            if (!results.length) {
              say(t('imgbatch.err.runFirst'), 'error');
              return;
            }
            await Toolbox.ensureScript?.('vendor/jszip.min');
            const Z = (window as unknown as { JSZip: new () => { file: (n: string, b: Blob) => void; generateAsync: (o: { type: string }) => Promise<Blob> } }).JSZip;
            const z = new Z();
            results.forEach((r) => z.file(r.name, r.blob));
            const blob = await z.generateAsync({ type: 'blob' });
            download(blob, t('imgbatch.file.zip')); // 공용 한 자리
            say(t('imgbatch.say.zipped', { n: results.length }), 'ok');
            Toolbox.trackUse?.('zip');
          }

          function add(list: FileList | File[]): void {
            results = [];
            for (const f of Array.from(list)) if (f.type.startsWith('image/')) files.push(f);
            render();
            previewSoon();
            say(
                t('imgbatch.say.picked', {
                  n: files.length,
                  total: size(files.reduce((a, f) => a + f.size, 0))
                }),
                'ok'
              );
          }

          /** 실패한 것만 다시 — 스무 장을 통째로 다시 넣게 하지 않는다. */
          function paintFails(): void {
            retryBar(
              $<HTMLElement>('#ibFails'),
              lastFails,
              {
                retry: t('imgbatch.btn.retry', undefined, '안 된 것만 다시'),
                why: t('imgbatch.err.unknown', undefined, '왜인지 모르겠습니다')
              },
              (again) => void run(again)
            );
          }

          /* 파일 받는 자리는 **공용 하나**를 쓴다 (TASK-KL-290). */
          wireDrop({ drop, input: fileInput, scope: container, onFiles: (files) => void add(files) });
          // 화면 캡처를 바로 붙여넣는 것이 가장 잦은 쓰임이다
          maxEl.addEventListener('input', () => {
            $<HTMLElement>('#ibMaxVal').textContent = maxEl.value + 'px';
            previewSoon();
          });
          qualityEl.addEventListener('input', () => {
            $<HTMLElement>('#ibQualityVal').textContent = qualityEl.value;
            previewSoon();
          });
          $<HTMLSelectElement>('#ibFormat').addEventListener('change', previewSoon);
          $<HTMLButtonElement>('#ibRun').onclick = () => void run();
          $<HTMLButtonElement>('#ibZip').onclick = () => void zip();
          $<HTMLButtonElement>('#ibClear').onclick = () => {
            files = [];
            results = [];
            lastFails = [];
            previewToken++;
            $<HTMLElement>('#ibPreview').hidden = true;
            paintFails();
            render();
            say(t('imgbatch.say.cleared'));
          };
                  });
        }
      }
    ]
  });
})();
