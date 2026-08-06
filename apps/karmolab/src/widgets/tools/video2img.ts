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

import { seekTo } from './shared/video';

(function (): void {
  interface Shot {
    time: number;
    blob: Blob;
    url: string;
  }

  Toolbox.register({
    id: 'video2img',
    title: '영상에서 사진 뽑기',
    category: 'tool',
    desc: '영상의 한 장면이나 일정 간격 장면을 원본 화질로 뽑습니다. 영상이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M15 9l6-3v9l-6-3z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><rect x="7" y="12" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="var(--bg, #111)"/><path d="M7 18l3-3 2 2 2.5-2.5L19 18" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '사진 뽑기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="viDrop">
              <input type="file" id="viFile" accept="video/*" hidden>
              영상을 끌어다 놓거나 눌러서 고르세요
            </div>

            <div id="viEditor" style="display:none; margin-top:var(--space-lg);">
              <video id="viVideo" controls playsinline style="width:100%; max-height:340px; background:#000; border-radius:8px;"></video>

              <div class="field-group" style="margin-top:var(--space-lg);">
                <div class="tool-grid-2">
                  <div>
                    <div class="tool-sublabel">형식</div>
                    <select id="viFormat">
                      <option value="image/png">PNG — 글자·도형이 또렷함</option>
                      <option value="image/jpeg">JPG — 사진에 작음</option>
                      <option value="image/webp">WebP — 가장 작음</option>
                    </select>
                  </div>
                  <div>
                    <div class="tool-sublabel">몇 초마다 <span id="viEveryVal" class="range-value">2.0초</span></div>
                    <input type="range" id="viEvery" min="5" max="300" step="5" value="20">
                  </div>
                </div>
              </div>

              <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
                <button class="btn btn-primary" id="viNow">지금 이 장면 뽑기</button>
                <button class="btn btn-ghost" id="viEvery2">일정 간격으로 뽑기</button>
                <button class="btn btn-ghost" id="viZip" disabled>ZIP 으로 받기</button>
                <button class="btn btn-ghost" id="viClear" disabled>비우기</button>
              </div>

              <div class="cc-stats" id="viStats"></div>
              <div id="viGrid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; margin-top:var(--space-lg);"></div>
            </div>

            <div class="tool-status" id="viStatus">영상은 브라우저 안에서만 열립니다 — 어디에도 올리지 않습니다.</div>
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
                  `<figure style="margin:0; cursor:pointer;" data-i="${i}" title="눌러서 받기">
                     <img src="${s.url}" alt="${mmss(s.time)} 장면" style="width:100%; border-radius:6px; display:block; background:#000;">
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
              stats.innerHTML = stat('뽑은 장', `${shots.length}장`, true) + stat('합계 용량', size(total)) + stat('영상 길이', mmss(duration));
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
            if (!ctx) throw new Error('canvas 없음');
            await seekTo(video, time);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('사진으로 못 바꿨어요'))),
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
              say(`${f.name} · ${mmss(duration)} · ${video.videoWidth}×${video.videoHeight} — 장면을 고르고 뽑으세요.`, 'ok');
            };
            video.onerror = () => say('이 영상은 브라우저가 열지 못했어요. mp4·webm 은 대체로 됩니다.', 'error');
          }

          async function grabEvery(): Promise<void> {
            const every = parseInt(everyEl.value, 10) / 10;
            const count = Math.floor(duration / every) + 1;
            if (count > 200) {
              say('장수가 너무 많아요. 간격을 넓혀 주세요.', 'error');
              return;
            }
            video.pause();
            shots.forEach((s) => URL.revokeObjectURL(s.url));
            shots = [];
            for (let i = 0; i < count; i++) {
              say(`뽑는 중… ${i + 1}/${count}`);
              shots.push(await grab(i * every));
            }
            render();
            say(`${shots.length}장 뽑았어요. 눌러서 하나씩 받거나 ZIP 으로 받으세요.`, 'ok');
            Toolbox.trackUse?.('frames');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) load(fileInput.files[0]);
          };
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
          everyEl.addEventListener('input', () => {
            $<HTMLElement>('#viEveryVal').textContent = (parseInt(everyEl.value, 10) / 10).toFixed(1) + '초';
          });

          $<HTMLButtonElement>('#viNow').onclick = () => {
            video.pause();
            void grab(video.currentTime)
              .then((s) => {
                shots.push(s);
                render();
                say(`${mmss(s.time)} 장면을 뽑았어요. 눌러서 받으세요.`, 'ok');
                Toolbox.trackUse?.('frame');
              })
              .catch((err: Error) => say('뽑는 중 문제가 생겼어요: ' + err.message, 'error'));
          };
          $<HTMLButtonElement>('#viEvery2').onclick = () => {
            void grabEvery().catch((err: Error) => say('뽑는 중 문제가 생겼어요: ' + err.message, 'error'));
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
              a.download = fileName.replace(/\.[^.]+$/, '') + '-사진.zip';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              say(`${shots.length}장을 ZIP 으로 받았어요.`, 'ok');
            })().catch((err: Error) => say('ZIP 으로 묶는 중 문제가 생겼어요: ' + err.message, 'error'));
          };
          clearBtn.onclick = () => {
            shots.forEach((s) => URL.revokeObjectURL(s.url));
            shots = [];
            render();
            say('비웠어요.');
          };
        }
      }
    ]
  });
})();
