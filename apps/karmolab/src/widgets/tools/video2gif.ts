/**
 * 영상 → GIF (TASK-KL-088)
 *
 * GIF 로 만드는 일의 어려움은 변환 자체가 아니라 **어디를 자를지 고르는 것**이다.
 * 그래서 이 도구의 중심은 미리보기다. 구간을 잡고, 그 자리를 바로 눈으로 보고,
 * 만들기 전에 대략의 용량을 알려 준다. 만든 뒤에도 받기 전에 결과를 먼저 보여 준다.
 *
 * 파일은 브라우저 밖으로 나가지 않는다. GIF 압축까지 여기서 직접 한다(`gifenc`).
 */
import { seekTo, download, attachVideo } from './shared/video';
import { escapeHtml as esc } from './shared/text';
import { statCell } from './shared/stats';
import { statusLine } from './shared/say';
import { wireDrop } from './shared/drop-well';


import { t, loadNamespace } from '../../lib/i18n';
import { attachImage } from './shared/image';
import { getKarmoGif } from '../../lib/karmogif';

(function (): void {
  const size = (n: number): string =>
    n>= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n>= 1024 ? `${(n / 1024).toFixed(0)}KB` : `${n}B`;

  const mmss = (sec: number): string => {
    const s = Math.max(0, sec);
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
  };

  Toolbox.register({
    id: 'video2gif',
    // 다른 도구가 만든 것을 그대로 받는다 (TASK-KL-133)
    accepts: ['video/*'],
    title: t('widgets.video2gif.title', undefined, '영상 → GIF'),
    category: 'av',
    desc: t(
      'widgets-desc.video2gif.desc',
      undefined,
      '영상의 원하는 구간을 GIF 로 만듭니다. 구간, 화질을 보면서 고르고, 받기 전에 결과를 먼저 봅니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 9.5v5l4-2.5z" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: t('video2gif.tab', undefined, 'GIF 만들기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('video2gif').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="vgDrop">
              <input type="file" id="vgFile" accept="video/*" hidden>
              ${esc(t('video2gif.drop'))}
            </div>

            <div id="vgEditor" style="display:none; margin-top:var(--space-lg);">
              <video id="vgVideo" playsinline muted style="width:100%; max-height:340px; background:#000; border-radius:var(--radius-lg);"></video>

              <div class="tool-section field-group">
                <div class="tool-sublabel">${esc(t('video2gif.label.range'))}. <span id="vgRangeLabel" class="range-value">${esc(
                  t('video2gif.range.value', { from: '0:00.0', to: '0:00.0', sec: '0.0' })
                )}</span></div>
                <input type="range" id="vgStart" aria-label="구간 시작" min="0" max="1000" value="0" step="1">
                <input type="range" id="vgEnd" aria-label="구간 끝" min="0" max="1000" value="1000" step="1" style="margin-top:6px;">
                <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                  <button class="btn btn-ghost btn-sm" id="vgHere">${esc(t('video2gif.btn.here'))}</button>
                  <button class="btn btn-ghost btn-sm" id="vgHereEnd">${esc(t('video2gif.btn.hereEnd'))}</button>
                  <button class="btn btn-ghost btn-sm" id="vgPlayRange">${esc(t('video2gif.btn.playRange'))}</button>
                </div>
              </div>

              <div class="field-group">
                <div class="tool-grid-2">
                  <div>
                    <div class="tool-sublabel">${esc(t('video2gif.label.width'))} <span id="vgWidthVal" class="range-value">480px</span></div>
                    <input type="range" id="vgWidth" aria-label="가로 크기" min="120" max="960" step="20" value="480">
                  </div>
                  <div>
                    <div class="tool-sublabel">${esc(t('video2gif.label.fps'))} <span id="vgFpsVal" class="range-value">12</span></div>
                    <input type="range" id="vgFps" aria-label="초당 장수" min="4" max="24" step="1" value="12">
                  </div>
                </div>
                <div class="tool-grid-2">
                  <div>
                    <div class="tool-sublabel">${esc(t('video2gif.label.colors'))} <span id="vgColorsVal" class="range-value">128</span></div>
                    <input type="range" id="vgColors" aria-label="색 수" min="16" max="255" step="1" value="128">
                  </div>
                  <div class="tool-chips" style="align-content:end;">
                    <label class="tool-chip"><input type="checkbox" id="vgDither" checked> ${esc(t('video2gif.opt.dither'))}</label>
                  </div>
                </div>
              </div>

              <div class="cc-stats" id="vgStats"></div>

              <div class="tool-actions">
                <button class="btn btn-primary" id="vgRun">${esc(t('video2gif.btn.run'))}</button>
                <button class="btn btn-ghost" id="vgSave" disabled>${esc(t('video2gif.btn.save'))}</button>
              </div>

              <div id="vgResult" style="display:none;">
                <div class="tool-sublabel">${esc(t('video2gif.label.preview'))}</div>
                <img id="vgPreview" alt="만들어진 GIF" style="max-width:100%; border-radius:var(--radius-lg); background:#111;">
              </div>
            </div>

            <div class="tool-status" id="vgStatus">${esc(t('video2gif.status.idle'))}</div>
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

          /* 상태 줄은 **공용 하나**를 쓴다 (TASK-KL-291). `aria-live` 가 여기 붙어 있어서
           * 화면낭독기가 다 됐습니다, 못 엽니다를 실제로 읽어 준다. */
          const say = statusLine(status);

          const startSec = (): number => (parseInt(startEl.value, 10) / 1000) * duration;
          const endSec = (): number => (parseInt(endEl.value, 10) / 1000) * duration;

          function outSize(): { w: number; h: number } {
            const w = parseInt(widthEl.value, 10);
            const ratio = video.videoHeight / Math.max(1, video.videoWidth);
            return { w, h: Math.max(2, Math.round(w * ratio / 2) * 2) };
          }

          function refresh(): void {
            if (!duration) return;
            // 시작이 끝을 넘어가면 사람이 뭘 고른 건지 알 수 없다. 서로 밀어 준다
            if (parseInt(startEl.value, 10)>= parseInt(endEl.value, 10)) {
              if (document.activeElement === startEl) endEl.value = String(Math.min(1000, parseInt(startEl.value, 10) + 10));
              else startEl.value = String(Math.max(0, parseInt(endEl.value, 10) - 10));
            }
            const s = startSec(), e = endSec();
            const span = Math.max(0, e - s);
            $<HTMLElement>('#vgRangeLabel').textContent = t('video2gif.range.value', {
              from: mmss(s),
              to: mmss(e),
              sec: span.toFixed(1)
            });
            $<HTMLElement>('#vgWidthVal').textContent = widthEl.value + 'px';
            $<HTMLElement>('#vgFpsVal').textContent = fpsEl.value;
            $<HTMLElement>('#vgColorsVal').textContent = colorsEl.value;

            const { w, h } = outSize();
            const fps = parseInt(fpsEl.value, 10);
            const count = Math.max(1, Math.round(span * fps));
            // 실측 기준 대략치다. 정확한 값은 만들어 봐야 알지만, 만들고 나서 너무 크네를 막는 게 목적이다.
            const guess = w * h * count * 0.13 * (parseInt(colorsEl.value, 10) / 128);
            stats.innerHTML =
              statCell(t('video2gif.stat.size'), `${w}×${h}`, true) +
              statCell(t('video2gif.stat.frames'), t('video2gif.value.frames', { n: count })) +
              statCell(t('video2gif.stat.guess'), t('video2gif.value.about', { v: size(guess) }));
          }

          function load(f: File): void {
            fileName = f.name;
            made = null;
            saveBtn.disabled = true;
            $<HTMLElement>('#vgResult').style.display = 'none';
            /* 공용 `attachVideo` 로 (TASK-KL-281). 녹화한 webm 은 길이가 안 적혀 있어
             * 그냥 물리면 `duration` 이 NaN/Infinity 로 온다. 그 되감기가 공용 쪽에 있다. */
            void attachVideo(video, f).then(() => {
              duration = video.duration;
              editor.style.display = '';
              startEl.value = '0';
              // 처음부터 3초 = GIF 로 쓸 만한 기본값. 짧은 영상이면 전체.
              endEl.value = String(Math.min(1000, Math.round((Math.min(3, duration) / duration) * 1000)));
              video.currentTime = 0;
              refresh();
              say(t('video2gif.say.loaded', { name: f.name, len: mmss(duration) }), 'ok');
            }).catch(() => say(t('video2gif.err.open'), 'error'));
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
            const gif = getKarmoGif();
            if (!gif) {
              say(t('video2gif.err.engine'), 'error');
              return;
            }
            const s = startSec(), e = endSec();
            const span = e - s;
            if (span <= 0) {
              say(t('video2gif.err.noRange'), 'error');
              return;
            }
            const fps = parseInt(fpsEl.value, 10);
            const count = Math.max(1, Math.round(span * fps));
            if (count> 600) {
              say(t('video2gif.err.tooMany'), 'error');
              return;
            }

            video.pause();
            const { w, h } = outSize();
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;

            const frames: Array<{ data: Uint8ClampedArray; delayMs: number }> = [];
            for (let i = 0; i < count; i++) {
              say(t('video2gif.say.grabbing', { i: i + 1, total: count }));
              const img = await grab(s + (i / fps), canvas);
              frames.push({ data: img.data, delayMs: Math.round(1000 / fps) });
            }

            say(t('video2gif.say.encoding'));
            // 브라우저가 화면을 한 번 갱신할 틈을 준다 (안 그러면 위 문구가 안 보인 채 멈춘 듯 보인다)
            await new Promise((r) => setTimeout(r, 30));
            made = await gif.encodeAsync({
              width: w,
              height: h,
              frames,
              maxColors: parseInt(colorsEl.value, 10),
              dither: ditherEl.checked,
              onProgress: (r) => say(t('video2gif.say.encodingPct', { pct: Math.round(r * 100) }))
            });

            attachImage(preview, made); // GIF 미리보기는 <img> 다. 그림 쪽 공용
            $<HTMLElement>('#vgResult').style.display = '';
            saveBtn.disabled = false;
            say(t('video2gif.say.done', { n: count, w, h, size: size(made.size) }), 'ok');
            Toolbox.trackUse?.('gif');
          }


          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다. 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다. */
          {
              Toolbox.onHandoff?.('video2gif', (f: File) => load(f));
          }
          /* 파일 받는 자리는 **공용 하나**를 쓴다 (TASK-KL-290). */
          wireDrop({ drop, input: fileInput, scope: container, onFiles: (files) => void load(files[0]) });
          // 캡처나 파일을 바로 붙여넣는 것이 잦다

          [startEl, endEl, widthEl, fpsEl, colorsEl].forEach((el) => el.addEventListener('input', refresh));
          // 손잡이를 옮기면 그 자리를 바로 보여 준다. 눈으로 확인 못 하면 구간 고르기가 감이 안 온다
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
            void run().catch((err: Error) => say(t('video2gif.err.running', { msg: err.message }), 'error'));
          };
          saveBtn.onclick = () => {
            if (!made) return;
            const aName = fileName.replace(/\.[^.]+$/, '') + '.gif';
            download(made, aName);
            // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133). 받을 도구가 없으면 안 생긴다.
            Toolbox.offerNext?.(status, { blob: made, name: aName, from: 'video2gif' });
            say(t('video2gif.say.saved'), 'ok');
          };
  }
})();
