/**
 * 이미지 일괄 변환 (TASK-KL-088)
 *
 * 사진 스무 장을 한 장씩 줄이고 바꾸는 건 도구의 문제가 아니라 **반복의 문제**다.
 * 그래서 여러 장을 한 번에 받아 같은 규칙으로 처리하고, ZIP 하나로 내려준다.
 * 원본보다 커지는 경우가 있어(작은 PNG 를 JPG 로 바꿀 때) 전후 용량을 나란히 보여준다.
 */
import { acceptPastedFiles } from './shared/paste';
import { statusLine } from './shared/say';
import { wireDrop } from './shared/drop-well';
import { loadImage, toCanvas, encode, download } from './shared/image';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  interface Result {
    name: string;
    blob: Blob;
    before: number;
    w: number;
    h: number;
  }

  const size = (n: number): string =>
    n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n >= 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`;

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

            <div class="field-group" style="margin-top:var(--space-lg);">
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
              <div style="margin-top:10px;">
                <div class="tool-sublabel">${esc(t('imgbatch.label.quality'))} <span id="ibQualityVal" class="range-value">85</span></div>
                <input type="range" id="ibQuality" aria-label="${esc(t('imgbatch.label.quality'))}" min="40" max="100" value="85">
              </div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="ibRun">${esc(t('imgbatch.btn.run'))}</button>
              <button class="btn btn-ghost" id="ibZip">${esc(t('imgbatch.btn.zip'))}</button>
              <button class="btn btn-ghost" id="ibClear">${esc(t('imgbatch.btn.clear'))}</button>
            </div>

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

          async function run(): Promise<void> {
            if (!files.length) {
              say(t('imgbatch.err.noFile'), 'error');
              return;
            }
            results = [];
            say(t('imgbatch.say.working', { n: files.length }));
            for (const f of files) {
              try {
                results.push(await convert(f));
              } catch {
                say(t('imgbatch.err.one', { name: f.name }), 'error');
              }
            }
            render();
            const before = files.reduce((a, f) => a + f.size, 0);
            const after = results.reduce((a, r) => a + r.blob.size, 0);
            // 작은 PNG 를 JPG 로 바꾸면 오히려 커진다 — 「-559% 줄었어요」 같은 말이 나오면 안 된다
            const pct = Math.round(Math.abs(1 - after / before) * 100);
            const verdict =
              after < before
                ? t('imgbatch.verdict.smaller', { pct })
                : after > before
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
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = t('imgbatch.file.zip');
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say(t('imgbatch.say.zipped', { n: results.length }), 'ok');
            Toolbox.trackUse?.('zip');
          }

          function add(list: FileList | File[]): void {
            results = [];
            for (const f of Array.from(list)) if (f.type.startsWith('image/')) files.push(f);
            render();
            say(
                t('imgbatch.say.picked', {
                  n: files.length,
                  total: size(files.reduce((a, f) => a + f.size, 0))
                }),
                'ok'
              );
          }

          /* 파일 받는 자리는 **공용 하나**를 쓴다 (TASK-KL-290). */
          wireDrop({ drop, input: fileInput, scope: container, onFiles: (files) => void add(files) });
          // 화면 캡처를 바로 붙여넣는 것이 가장 잦은 쓰임이다
          acceptPastedFiles(container, (files) => { add(files); });
          maxEl.addEventListener('input', () => {
            $<HTMLElement>('#ibMaxVal').textContent = maxEl.value + 'px';
          });
          qualityEl.addEventListener('input', () => {
            $<HTMLElement>('#ibQualityVal').textContent = qualityEl.value;
          });
          $<HTMLButtonElement>('#ibRun').onclick = () => void run();
          $<HTMLButtonElement>('#ibZip').onclick = () => void zip();
          $<HTMLButtonElement>('#ibClear').onclick = () => {
            files = [];
            results = [];
            render();
            say(t('imgbatch.say.cleared'));
          };
                  });
        }
      }
    ]
  });
})();
