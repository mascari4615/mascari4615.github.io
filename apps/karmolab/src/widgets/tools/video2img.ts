/**
 * 영상에서 사진 뽑기 (TASK-KL-088)
 *
 * 「이 장면 캡처해서 보내 줘」가 필요할 때 대개 재생하다 화면을 찍는다. 그러면 화질이 화면 해상도에
 * 묶이고 UI 까지 같이 찍힌다. 영상 안의 원본 화면을 그대로 꺼내면 그럴 이유가 없다.
 *
 * 두 갈래를 다 둔다:
 *  - **지금 이 순간** — 재생하다 멈춘 그 장면 한 장 (섬네일 고를 때)
 *  - **일정 간격** — 몇 초마다 한 장씩 여러 장 (요약·정리·연속 동작 확인)
 * 뽑은 장은 눌러 하나씩 받거나 ZIP 으로 한 번에 받는다.
 */
import { fileSize as size, mmss } from './shared/media';
import { acceptPastedFiles } from './shared/paste';

import { seekTo } from './shared/video';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  interface Shot {
    time: number;
    blob: Blob;
    url: string;
  }

  Toolbox.register({
    id: 'video2img',
    // 다른 도구가 만든 것을 그대로 받는다 (TASK-KL-133)
    accepts: ['video/*'],
    title: t('widgets.video2img.title', undefined, "영상에서 사진 뽑기"),
    category: 'tool',
    desc: t('widgets-desc.video2img.desc', undefined, "영상의 한 장면이나 일정 간격 장면을 원본 화질로 뽑습니다. 영상이 브라우저를 벗어나지 않습니다"),
    layout: 'wide',
    icon: '<rect x="3" y="5" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M15 9l6-3v9l-6-3z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><rect x="7" y="12" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="var(--bg, #111)"/><path d="M7 18l3-3 2 2 2.5-2.5L19 18" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('video2img.tab', undefined, "사진 뽑기"),
        build: function (container: HTMLElement): void {
          void loadNamespace('video2img').then(function () {

          container.innerHTML = `
            <div class="tool-drop" id="viDrop">
              <input type="file" id="viFile" accept="video/*" hidden>
              ${esc(t('video2img.drop'))}
            </div>

            <div id="viEditor" style="display:none; margin-top:var(--space-lg);">
              <video id="viVideo" controls playsinline style="width:100%; max-height:340px; background:#000; border-radius:8px;"></video>

              <div class="field-group" style="margin-top:var(--space-lg);">
                <div class="tool-grid-2">
                  <div>
                    <div class="tool-sublabel">${esc(t('video2img.label.format'))}</div>
                    <select id="viFormat" aria-label="${esc(t('video2img.aria.format'))}">
                      <option value="image/png">${esc(t('video2img.format.png'))}</option>
                      <option value="image/jpeg">${esc(t('video2img.format.jpg'))}</option>
                      <option value="image/webp">${esc(t('video2img.format.webp'))}</option>
                    </select>
                  </div>
                  <div>
                    <div class="tool-sublabel">${esc(t('video2img.label.every'))} <span id="viEveryVal" class="range-value">${esc(t('video2img.value.every'))}</span></div>
                    <input type="range" id="viEvery" aria-label="${esc(t('video2img.label.every'))}" min="5" max="300" step="5" value="20">
                  </div>
                </div>
              </div>

              <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
                <button class="btn btn-primary" id="viNow">${esc(t('video2img.btn.now'))}</button>
                <button class="btn btn-ghost" id="viEvery2">${esc(t('video2img.btn.every'))}</button>
                <button class="btn btn-ghost" id="viZip" disabled>${esc(t('video2img.btn.zip'))}</button>
                <button class="btn btn-ghost" id="viClear" disabled>${esc(t('video2img.btn.clear'))}</button>
              </div>

              <div class="cc-stats" id="viStats"></div>
              <div id="viGrid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; margin-top:var(--space-lg);"></div>
            </div>

            <div class="tool-status" id="viStatus">${esc(t('video2img.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#viDrop');
          const fileInput = $<HTMLInputElement>('#viFile');
          const editor = $<HTMLElement>('#viEditor');
          const video = $<HTMLVideoElement>('#viVideo');
          const grid = $<HTMLElement>('#viGrid');
          const stats = $<HTMLElement>('#viStats');
          const status = $<HTMLElement>('#viStatus');
          const everyEl = $<HTMLInputElement>('#viEvery');
          const zipBtn = $<HTMLButtonElement>('#viZip');
          const clearBtn = $<HTMLButtonElement>('#viClear');

          let fileName = '';
          let duration = 0;
          let shots: Shot[] = [];

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          const extOf = (): string => {
            const f = $<HTMLSelectElement>('#viFormat').value;
            return f === 'image/png' ? 'png' : f === 'image/webp' ? 'webp' : 'jpg';
          };

          function render(): void {
            grid.innerHTML = shots
              .map(
                (s, i) =>
                  `<figure style="margin:0; cursor:pointer;" data-i="${i}" title="${esc(t('video2img.row.download'))}">
                     <img src="${s.url}" alt="${esc(t('video2img.alt.shot', { at: mmss(s.time) }))}" style="width:100%; border-radius:6px; display:block; background:#000;">
                     <figcaption class="tool-list-dim" style="text-align:center; padding-top:4px;">${mmss(s.time)} · ${size(s.blob.size)}</figcaption>
                   </figure>`
              )
              .join('');
            grid.querySelectorAll('[data-i]').forEach((el) => {
              (el as HTMLElement).onclick = () => {
                const s = shots[parseInt((el as HTMLElement).dataset.i || '0', 10)];
                const a = document.createElement('a');
                a.href = s.url;
                a.download = `${fileName.replace(/\.[^.]+$/, '')}-${mmss(s.time).replace(':', 'm')}s.${extOf()}`;
                a.click();
              };
            });
            zipBtn.disabled = shots.length < 2;
            clearBtn.disabled = shots.length === 0;
            if (shots.length) {
              const total = shots.reduce((a, s) => a + s.blob.size, 0);
              stats.innerHTML = stat(t('video2img.stat.count'), t('video2img.value.shots', { n: shots.length }), true) + stat(t('video2img.stat.size'), size(total)) + stat(t('video2img.stat.duration'), mmss(duration));
            } else {
              stats.innerHTML = '';
            }
          }

          /** 그 시각의 화면을 원본 크기로 꺼낸다. 옮겨지기 전에 그리면 엉뚱한 장면이 담긴다. */
          async function grab(time: number): Promise<Shot> {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error(t('video2img.err.canvas'));
            await seekTo(video, time);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error(t('video2img.err.shot')))),
                $<HTMLSelectElement>('#viFormat').value,
                0.92
              );
            });
            return { time: video.currentTime, blob, url: URL.createObjectURL(blob) };
          }

          function load(f: File): void {
            fileName = f.name;
            shots.forEach((s) => URL.revokeObjectURL(s.url));
            shots = [];
            render();
            video.src = URL.createObjectURL(f);
            video.onloadedmetadata = () => {
              duration = video.duration;
              editor.style.display = '';
              render();
              say(
              t('video2img.say.loaded', {
                name: f.name,
                len: mmss(duration),
                w: video.videoWidth,
                h: video.videoHeight
              }), 'ok');
            };
            video.onerror = () => say(t('video2img.err.open'), 'error');
          }

          async function grabEvery(): Promise<void> {
            const every = parseInt(everyEl.value, 10) / 10;
            const count = Math.floor(duration / every) + 1;
            if (count > 200) {
              say(t('video2img.err.tooMany'), 'error');
              return;
            }
            video.pause();
            shots.forEach((s) => URL.revokeObjectURL(s.url));
            shots = [];
            for (let i = 0; i < count; i++) {
              say(t('video2img.say.working', { i: i + 1, n: count }));
              shots.push(await grab(i * every));
            }
            render();
            say(t('video2img.say.done', { n: shots.length }), 'ok');
            Toolbox.trackUse?.('frames');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) load(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다. */
          {
              Toolbox.onHandoff?.('video2img', (f: File) => load(f));
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
            if (f) load(f);
          });
          // 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { load(files[0]); }, (f: File) => f.type.startsWith('video/'));
          everyEl.addEventListener('input', () => {
            $<HTMLElement>('#viEveryVal').textContent = (parseInt(everyEl.value, 10) / 10).toFixed(1) + t('video2img.unit.sec');
          });

          $<HTMLButtonElement>('#viNow').onclick = () => {
            video.pause();
            void grab(video.currentTime)
              .then((s) => {
                shots.push(s);
                render();
                say(t('video2img.say.one', { at: mmss(s.time) }), 'ok');
                Toolbox.trackUse?.('frame');
              })
              .catch((err: Error) => say(t('video2img.err.run') + err.message, 'error'));
          };
          $<HTMLButtonElement>('#viEvery2').onclick = () => {
            void grabEvery().catch((err: Error) => say(t('video2img.err.run') + err.message, 'error'));
          };
          zipBtn.onclick = () => {
            void (async () => {
              await Toolbox.ensureScript?.('vendor/jszip.min');
              const Z = (window as unknown as { JSZip: new () => { file: (n: string, b: Blob) => void; generateAsync: (o: { type: string }) => Promise<Blob> } }).JSZip;
              const z = new Z();
              const ext = extOf();
              shots.forEach((s, i) => z.file(`${String(i + 1).padStart(3, '0')}-${mmss(s.time).replace(':', 'm')}s.${ext}`, s.blob));
              const blob = await z.generateAsync({ type: 'blob' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = fileName.replace(/\.[^.]+$/, '') + t('video2img.file.zip');
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              say(t('video2img.say.zipped', { n: shots.length }), 'ok');
            })().catch((err: Error) => say(t('video2img.err.zip') + err.message, 'error'));
          };
          clearBtn.onclick = () => {
            shots.forEach((s) => URL.revokeObjectURL(s.url));
            shots = [];
            render();
            say(t('video2img.say.cleared'));
          };
                  });
        }
      }
    ]
  });
})();
