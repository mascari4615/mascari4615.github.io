/**
 * 영상 → GIF (TASK-KL-088)
 *
 * GIF 로 만드는 일의 어려움은 변환 자체가 아니라 **어디를 자를지 고르는 것**이다.
 * 그래서 이 도구의 중심은 미리보기다 — 구간을 잡고, 그 자리를 바로 눈으로 보고,
 * 만들기 전에 대략의 용량을 알려 준다. 만든 뒤에도 받기 전에 결과를 먼저 보여 준다.
 *
 * 파일은 브라우저 밖으로 나가지 않는다. GIF 압축까지 여기서 직접 한다(`gifenc`).
 */
import { seekTo } from './shared/video';

import { acceptPastedFiles } from './shared/paste';

(function (): void {
  interface GifApi {
    encodeAsync: (o: {
      width: number;
      height: number;
      frames: Array<{ data: Uint8ClampedArray; delayMs: number }>;
      maxColors?: number;
      dither?: boolean;
      onProgress?: (r: number) => void;
    }) => Promise<Blob>;
  }

  const size = (n: number): string =>
    n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n >= 1024 ? `${(n / 1024).toFixed(0)}KB` : `${n}B`;

  const mmss = (sec: number): string => {
    const s = Math.max(0, sec);
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
  };

  Toolbox.register({
    id: 'video2gif',
    title: '영상 → GIF',
    category: 'tool',
    desc: '영상의 원하는 구간을 GIF 로 만듭니다. 구간·화질을 보면서 고르고, 받기 전에 결과를 먼저 봅니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 9.5v5l4-2.5z" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: 'GIF 만들기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="vgDrop">
              <input type="file" id="vgFile" accept="video/*" hidden>
              영상을 끌어다 놓거나 눌러서 고르세요
            </div>

            <div id="vgEditor" style="display:none; margin-top:var(--space-lg);">
              <video id="vgVideo" playsinline muted style="width:100%; max-height:340px; background:#000; border-radius:8px;"></video>

              <div class="field-group" style="margin-top:var(--space-lg);">
                <div class="tool-sublabel">구간 — <span id="vgRangeLabel" class="range-value">0:00.0 ~ 0:00.0 (0.0초)</span></div>
                <input type="range" id="vgStart" aria-label="구간 시작" min="0" max="1000" value="0" step="1">
                <input type="range" id="vgEnd" aria-label="구간 끝" min="0" max="1000" value="1000" step="1" style="margin-top:6px;">
                <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                  <button class="btn btn-ghost btn-sm" id="vgHere">지금 위치를 시작점으로</button>
                  <button class="btn btn-ghost btn-sm" id="vgHereEnd">지금 위치를 끝점으로</button>
                  <button class="btn btn-ghost btn-sm" id="vgPlayRange">구간만 재생</button>
                </div>
              </div>

              <div class="field-group">
                <div class="tool-grid-2">
                  <div>
                    <div class="tool-sublabel">가로 크기 <span id="vgWidthVal" class="range-value">480px</span></div>
                    <input type="range" id="vgWidth" aria-label="가로 크기" min="120" max="960" step="20" value="480">
                  </div>
                  <div>
                    <div class="tool-sublabel">초당 장수 <span id="vgFpsVal" class="range-value">12</span></div>
                    <input type="range" id="vgFps" aria-label="초당 장수" min="4" max="24" step="1" value="12">
                  </div>
                </div>
                <div class="tool-grid-2" style="margin-top:10px;">
                  <div>
                    <div class="tool-sublabel">색 수 <span id="vgColorsVal" class="range-value">128</span></div>
                    <input type="range" id="vgColors" aria-label="색 수" min="16" max="255" step="1" value="128">
                  </div>
                  <div class="tool-chips" style="align-content:end;">
                    <label class="tool-chip"><input type="checkbox" id="vgDither" checked> 색 뿌리기 (얼룩 줄임)</label>
                  </div>
                </div>
              </div>

              <div class="cc-stats" id="vgStats"></div>

              <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
                <button class="btn btn-primary" id="vgRun">GIF 만들기</button>
                <button class="btn btn-ghost" id="vgSave" disabled>내려받기</button>
              </div>

              <div id="vgResult" style="display:none;">
                <div class="tool-sublabel">결과 미리보기 — 마음에 들면 내려받으세요</div>
                <img id="vgPreview" alt="만들어진 GIF" style="max-width:100%; border-radius:8px; background:#111;">
              </div>
            </div>

            <div class="tool-status" id="vgStatus">영상은 브라우저 안에서만 열립니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#vgDrop');
          const fileInput = $<HTMLInputElement>('#vgFile');
          const editor = $<HTMLElement>('#vgEditor');
          const video = $<HTMLVideoElement>('#vgVideo');
          const startEl = $<HTMLInputElement>('#vgStart');
          const endEl = $<HTMLInputElement>('#vgEnd');
          const widthEl = $<HTMLInputElement>('#vgWidth');
          const fpsEl = $<HTMLInputElement>('#vgFps');
          const colorsEl = $<HTMLInputElement>('#vgColors');
          const ditherEl = $<HTMLInputElement>('#vgDither');
          const stats = $<HTMLElement>('#vgStats');
          const status = $<HTMLElement>('#vgStatus');
          const preview = $<HTMLImageElement>('#vgPreview');
          const saveBtn = $<HTMLButtonElement>('#vgSave');

          let fileName = '';
          let duration = 0;
          let made: Blob | null = null;
          let rangePlayTimer = 0;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          const startSec = (): number => (parseInt(startEl.value, 10) / 1000) * duration;
          const endSec = (): number => (parseInt(endEl.value, 10) / 1000) * duration;

          function outSize(): { w: number; h: number } {
            const w = parseInt(widthEl.value, 10);
            const ratio = video.videoHeight / Math.max(1, video.videoWidth);
            return { w, h: Math.max(2, Math.round(w * ratio / 2) * 2) };
          }

          function refresh(): void {
            if (!duration) return;
            // 시작이 끝을 넘어가면 사람이 뭘 고른 건지 알 수 없다 — 서로 밀어 준다
            if (parseInt(startEl.value, 10) >= parseInt(endEl.value, 10)) {
              if (document.activeElement === startEl) endEl.value = String(Math.min(1000, parseInt(startEl.value, 10) + 10));
              else startEl.value = String(Math.max(0, parseInt(endEl.value, 10) - 10));
            }
            const s = startSec(), e = endSec();
            const span = Math.max(0, e - s);
            $<HTMLElement>('#vgRangeLabel').textContent = `${mmss(s)} ~ ${mmss(e)} (${span.toFixed(1)}초)`;
            $<HTMLElement>('#vgWidthVal').textContent = widthEl.value + 'px';
            $<HTMLElement>('#vgFpsVal').textContent = fpsEl.value;
            $<HTMLElement>('#vgColorsVal').textContent = colorsEl.value;

            const { w, h } = outSize();
            const fps = parseInt(fpsEl.value, 10);
            const count = Math.max(1, Math.round(span * fps));
            // 실측 기준 대략치다. 정확한 값은 만들어 봐야 알지만, 「만들고 나서 너무 크네」를 막는 게 목적이다.
            const guess = w * h * count * 0.13 * (parseInt(colorsEl.value, 10) / 128);
            stats.innerHTML =
              stat('만들 크기', `${w}×${h}`, true) +
              stat('장수', `${count}장`) +
              stat('예상 용량', '약 ' + size(guess));
          }

          function load(f: File): void {
            fileName = f.name;
            made = null;
            saveBtn.disabled = true;
            $<HTMLElement>('#vgResult').style.display = 'none';
            video.src = URL.createObjectURL(f);
            video.onloadedmetadata = () => {
              duration = video.duration;
              editor.style.display = '';
              startEl.value = '0';
              // 처음부터 3초 = GIF 로 쓸 만한 기본값. 짧은 영상이면 전체.
              endEl.value = String(Math.min(1000, Math.round((Math.min(3, duration) / duration) * 1000)));
              video.currentTime = 0;
              refresh();
              say(`${f.name} · ${mmss(duration)} — 구간을 고르고 만들기를 누르세요.`, 'ok');
            };
            video.onerror = () => say('이 영상은 브라우저가 열지 못했어요. mp4·webm 은 대체로 됩니다.', 'error');
          }

          /** 지정 시각의 화면 한 장을 가져온다. 옮겨지기 전에 그리면 엉뚱한 장면이 담긴다. */
          async function grab(time: number, canvas: HTMLCanvasElement): Promise<ImageData> {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) throw new Error('canvas 없음');
            await seekTo(video, time);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            return ctx.getImageData(0, 0, canvas.width, canvas.height);
          }

          async function run(): Promise<void> {
            const gif = (window as unknown as { KarmoGif?: GifApi }).KarmoGif;
            if (!gif) {
              say('GIF 만드는 부분을 불러오지 못했어요.', 'error');
              return;
            }
            const s = startSec(), e = endSec();
            const span = e - s;
            if (span <= 0) {
              say('구간을 먼저 잡아 주세요.', 'error');
              return;
            }
            const fps = parseInt(fpsEl.value, 10);
            const count = Math.max(1, Math.round(span * fps));
            if (count > 600) {
              say('장수가 너무 많아요. 구간을 줄이거나 초당 장수를 낮춰 주세요.', 'error');
              return;
            }

            video.pause();
            const { w, h } = outSize();
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;

            const frames: Array<{ data: Uint8ClampedArray; delayMs: number }> = [];
            for (let i = 0; i < count; i++) {
              say(`화면을 모으는 중… ${i + 1}/${count}`);
              const img = await grab(s + (i / fps), canvas);
              frames.push({ data: img.data, delayMs: Math.round(1000 / fps) });
            }

            say('GIF 로 엮는 중…');
            // 브라우저가 화면을 한 번 갱신할 틈을 준다 (안 그러면 위 문구가 안 보인 채 멈춘 듯 보인다)
            await new Promise((r) => setTimeout(r, 30));
            made = await gif.encodeAsync({
              width: w,
              height: h,
              frames,
              maxColors: parseInt(colorsEl.value, 10),
              dither: ditherEl.checked,
              onProgress: (r) => say(`GIF 로 엮는 중… ${Math.round(r * 100)}%`)
            });

            preview.src = URL.createObjectURL(made);
            $<HTMLElement>('#vgResult').style.display = '';
            saveBtn.disabled = false;
            say(`${count}장 · ${w}×${h} · ${size(made.size)} 로 만들었어요. 미리보기를 확인하고 받으세요.`, 'ok');
            Toolbox.trackUse?.('gif');
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
          // 캡처나 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { load(files[0]); }, (f) => f.type.startsWith('video/'));

          [startEl, endEl, widthEl, fpsEl, colorsEl].forEach((el) => el.addEventListener('input', refresh));
          // 손잡이를 옮기면 그 자리를 바로 보여 준다 — 눈으로 확인 못 하면 구간 고르기가 감이 안 온다
          startEl.addEventListener('input', () => {
            video.currentTime = startSec();
          });
          endEl.addEventListener('input', () => {
            video.currentTime = endSec();
          });

          $<HTMLButtonElement>('#vgHere').onclick = () => {
            startEl.value = String(Math.round((video.currentTime / Math.max(0.01, duration)) * 1000));
            refresh();
          };
          $<HTMLButtonElement>('#vgHereEnd').onclick = () => {
            endEl.value = String(Math.round((video.currentTime / Math.max(0.01, duration)) * 1000));
            refresh();
          };
          $<HTMLButtonElement>('#vgPlayRange').onclick = () => {
            window.clearTimeout(rangePlayTimer);
            video.currentTime = startSec();
            void video.play();
            rangePlayTimer = window.setTimeout(() => video.pause(), Math.max(100, (endSec() - startSec()) * 1000));
          };
          $<HTMLButtonElement>('#vgRun').onclick = () => {
            void run().catch((err: Error) => say('만드는 중 문제가 생겼어요: ' + err.message, 'error'));
          };
          saveBtn.onclick = () => {
            if (!made) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(made);
            a.download = fileName.replace(/\.[^.]+$/, '') + '.gif';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say('내려받았어요.', 'ok');
          };
        }
      }
    ]
  });
})();
