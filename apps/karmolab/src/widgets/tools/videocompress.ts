/**
 * 영상 용량 줄이기 (TASK-KL-088)
 *
 * 폰으로 찍은 1분 영상이 200MB인데 메일·메신저·제출 창구는 대개 그보다 작은 것만 받는다.
 * 그래서 사람들은 낯선 사이트에 영상을 통째로 올린다 — 얼굴과 집이 찍힌 파일을.
 *
 * 브라우저에는 영상을 다시 엮는 기능이 없다. 대신 **재생하면서 작은 화면에 다시 그려 담을** 수 있다.
 * 즉 영상 길이만큼 시간이 걸린다. 우회가 아니라 유일한 길이라 숨기지 않고 남은 시간을 보여 준다.
 *
 * 「얼마나 줄지」는 해 봐야 알기에, 시작 전 어림값을 보여 주고 끝나면 실제 값으로 바꾼다.
 * 이미 잘 눌린 영상은 오히려 커질 수 있는데, 그때 줄었다고 우기지 않는다.
 */
import { attachMedia, download, fileSize as size, mmss } from './shared/media';
import { escapeHtml as esc } from './shared/text';
import { statCell } from './shared/stats';
import { statusLine } from './shared/say';
import { wireDrop } from './shared/drop-well';
import { pickRecordType, attachVideo } from './shared/video';

import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  // captureStream 은 브라우저마다 있고 없고가 갈려 표준 타입에 없다 — 있는지 보고 쓴다.
  type Capturable = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };

  Toolbox.register({
    id: 'videocompress',
    // 다른 도구가 만든 것을 그대로 받는다 (TASK-KL-133)
    accepts: ['video/*'],
    title: t('widgets.videocompress.title', undefined, '영상 용량 줄이기'),
    category: 'tool',
    desc: t(
      'widgets-desc.videocompress.desc',
      undefined,
      '영상 용량을 줄입니다. 해상도와 화질을 고르고, 영상이 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 12h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M10.5 9.5 8 12l2.5 2.5M13.5 9.5 16 12l-2.5 2.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('videocompress.tab', undefined, '용량 줄이기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('videocompress').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="vcDrop">
              <input type="file" id="vcFile" accept="video/*" hidden>
              ${esc(t('videocompress.drop'))}
            </div>

            <div id="vcEditor" style="display:none; margin-top:var(--space-lg);">
              <video id="vcVideo" playsinline muted style="width:100%; max-height:300px; background:#000; border-radius:8px;"></video>

              <div class="tool-section field-group">
                <div class="tool-grid-2">
                  <div>
                    <div class="tool-sublabel">${esc(t('videocompress.label.scale'))} <span id="vcScaleVal" class="range-value">절반</span></div>
                    <input type="range" id="vcScale" aria-label="화면 크기" min="1" max="4" step="1" value="2">
                  </div>
                  <div>
                    <div class="tool-sublabel">${esc(t('videocompress.label.rate'))} <span id="vcRateVal" class="range-value">보통</span></div>
                    <input type="range" id="vcRate" aria-label="화질" min="1" max="4" step="1" value="2">
                  </div>
                </div>
                <div class="tool-chips">
                  <label class="tool-chip"><input type="checkbox" id="vcAudio" checked> ${esc(t('videocompress.opt.audio'))}</label>
                </div>
              </div>

              <div class="cc-stats" id="vcStats"></div>

              <div class="tool-actions">
                <button class="btn btn-primary" id="vcRun">${esc(t('videocompress.btn.run'))}</button>
                <button class="btn btn-ghost" id="vcStop" style="display:none;">${esc(t('videocompress.btn.stop'))}</button>
                <button class="btn btn-ghost" id="vcSave" disabled>${esc(t('videocompress.btn.save'))}</button>
              </div>

              <div id="vcResult" style="display:none;">
                <div class="tool-sublabel">${esc(t('videocompress.label.result'))}</div>
                <video id="vcPreview" controls playsinline style="width:100%; max-height:280px; background:#000; border-radius:8px;"></video>
              </div>
            </div>

            <div class="tool-status" id="vcStatus">${esc(t('videocompress.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#vcDrop');
          const fileInput = $<HTMLInputElement>('#vcFile');
          const editor = $<HTMLElement>('#vcEditor');
          const video = $<HTMLVideoElement>('#vcVideo');
          const scaleEl = $<HTMLInputElement>('#vcScale');
          const rateEl = $<HTMLInputElement>('#vcRate');
          const stats = $<HTMLElement>('#vcStats');
          const status = $<HTMLElement>('#vcStatus');
          const runBtn = $<HTMLButtonElement>('#vcRun');
          const stopBtn = $<HTMLButtonElement>('#vcStop');
          const saveBtn = $<HTMLButtonElement>('#vcSave');
          const preview = $<HTMLVideoElement>('#vcPreview');

          const SCALES: Array<[number, string]> = [
            [0.35, t('videocompress.scale.tiny')],
            [0.5, t('videocompress.scale.half')],
            [0.7, t('videocompress.scale.bitSmall')],
            [1, t('videocompress.scale.same')]
          ];
          // 초당 비트 수 = 용량을 좌우하는 값. 화면이 작으면 적은 값으로도 깨끗하다.
          const RATES: Array<[number, string]> = [
            [0.06, t('videocompress.rate.low')],
            [0.1, t('videocompress.rate.normal')],
            [0.16, t('videocompress.rate.good')],
            [0.25, t('videocompress.rate.best')]
          ];

          let fileName = '';
          let sourceSize = 0;
          let duration = 0;
          let made: Blob | null = null;
          let recorder: MediaRecorder | null = null;

          /* 상태 줄은 **공용 하나**를 쓴다 (TASK-KL-291) — `aria-live` 가 여기 붙어 있어서
           * 화면낭독기가 「다 됐습니다」·「못 엽니다」를 실제로 읽어 준다. */
          const say = statusLine(status);

          function outSize(): { w: number; h: number } {
            const s = SCALES[parseInt(scaleEl.value, 10) - 1][0];
            // 짝수로 맞춘다 — 홀수 크기를 싫어하는 코덱이 있다
            const w = Math.max(2, Math.round((video.videoWidth * s) / 2) * 2);
            const h = Math.max(2, Math.round((video.videoHeight * s) / 2) * 2);
            return { w, h };
          }

          function bitsPerSecond(): number {
            const { w, h } = outSize();
            return Math.round(w * h * 30 * RATES[parseInt(rateEl.value, 10) - 1][0]);
          }

          function refresh(): void {
            if (!duration) return;
            $<HTMLElement>('#vcScaleVal').textContent = SCALES[parseInt(scaleEl.value, 10) - 1][1];
            $<HTMLElement>('#vcRateVal').textContent = RATES[parseInt(rateEl.value, 10) - 1][1];
            const { w, h } = outSize();
            const guess = (bitsPerSecond() / 8) * duration;
            stats.innerHTML =
              statCell(t('videocompress.stat.srcSize'), size(sourceSize), true) +
              statCell(t('videocompress.stat.outDim'), `${w}×${h}`) +
              statCell(t('videocompress.stat.guess'), t('videocompress.value.about', { v: size(guess) })) +
              // 실시간으로 다시 담기 때문에 영상 길이만큼 걸린다. 미리 알려야 「멈춘 건가」 오해가 없다.
              statCell(t('videocompress.stat.time'), t('videocompress.value.about', { v: mmss(duration) }));
          }

          function load(f: File): void {
            fileName = f.name;
            sourceSize = f.size;
            made = null;
            saveBtn.disabled = true;
            $<HTMLElement>('#vcResult').style.display = 'none';
            /* 공용 `attachVideo` 로 (TASK-KL-281) — 녹화한 webm 은 길이가 안 적혀 있어
             * 그냥 물리면 `duration` 이 NaN/Infinity 로 온다. 그 되감기가 공용 쪽에 있다. */
            void attachVideo(video, f).then(() => {
              duration = video.duration;
              editor.style.display = '';
              refresh();
              say(
                t('videocompress.say.loaded', {
                  name: f.name,
                  size: size(f.size),
                  w: video.videoWidth,
                  h: video.videoHeight
                }),
                'ok'
              );
            }).catch(() => say(t('videocompress.err.open'), 'error'));
          }

          async function run(): Promise<void> {
            const { w, h } = outSize();
            const canvas = document.createElement('canvas') as Capturable;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx || !canvas.captureStream) {
              say(t('videocompress.err.unsupported'), 'error');
              return;
            }

            made = null;
            saveBtn.disabled = true;
            $<HTMLElement>('#vcResult').style.display = 'none';

            const out = canvas.captureStream(30);
            // 소리는 원본 영상에서 그대로 가져온다 (다시 그리는 건 화면뿐이다)
            if ($<HTMLInputElement>('#vcAudio').checked) {
              const withAudio = video as HTMLVideoElement & { captureStream?: () => MediaStream };
              const src = withAudio.captureStream?.();
              src?.getAudioTracks().forEach((t) => out.addTrack(t));
            }

            const mimeType = pickRecordType();
            const chunks: Blob[] = [];
            recorder = new MediaRecorder(out, {
              ...(mimeType ? { mimeType } : {}),
              videoBitsPerSecond: bitsPerSecond()
            });
            recorder.ondataavailable = (ev) => {
              if (ev.data.size) chunks.push(ev.data);
            };
            const finished = new Promise<Blob>((resolve) => {
              (recorder as MediaRecorder).onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
            });

            video.currentTime = 0;
            runBtn.disabled = true;
            stopBtn.style.display = '';
            recorder.start(300);
            void video.play();

            let raf = 0;
            const draw = (): void => {
              ctx.drawImage(video, 0, 0, w, h);
              raf = requestAnimationFrame(draw);
            };
            draw();

            // 다른 탭으로 가면 브라우저가 화면 그리기를 멈춘다 — 그 사이 구간이 정지 화면으로 담긴다.
            // 막을 방법이 없으므로 **일어난 사실을 알린다**. 모르고 받아 가는 게 제일 나쁘다.
            let leftTab = false;
            const onHide = (): void => {
              if (document.hidden) leftTab = true;
            };
            document.addEventListener('visibilitychange', onHide);

            const stop = (): void => {
              cancelAnimationFrame(raf);
              video.pause();
              if (recorder && recorder.state !== 'inactive') recorder.stop();
            };
            stopBtn.onclick = stop;
            video.onended = stop;

            const watch = window.setInterval(() => {
              const left = Math.max(0, duration - video.currentTime);
              say(t('videocompress.say.progress', { left: mmss(left) }));
            }, 300);

            made = await finished;
            window.clearInterval(watch);
            document.removeEventListener('visibilitychange', onHide);
            video.onended = null;
            runBtn.disabled = false;
            stopBtn.style.display = 'none';
            recorder = null;

            if (!made || made.size < 100) {
              say(t('videocompress.err.empty'), 'error');
              return;
            }
            attachMedia(preview, made); // 공용 — 앞 주소를 거두고 물린다
            $<HTMLElement>('#vcResult').style.display = '';
            saveBtn.disabled = false;

            const pct = Math.round(Math.abs(1 - made.size / sourceSize) * 100);
            stats.innerHTML =
              statCell(t('videocompress.stat.srcSize'), size(sourceSize)) +
              statCell(t('videocompress.stat.newSize'), size(made.size), true) +
              statCell(
                t('videocompress.stat.change'),
                t(made.size < sourceSize ? 'videocompress.value.smaller' : 'videocompress.value.bigger', { pct })
              ) +
              statCell(t('videocompress.stat.dim'), `${w}×${h}`);
            // 이미 잘 눌린 영상은 다시 담으면 커진다 — 그때 줄었다고 말하면 거짓이 된다
            if (leftTab) {
              say(t('videocompress.err.hidden'), 'error');
            } else if (made.size>= sourceSize) {
              say(t('videocompress.say.noGain', { from: size(sourceSize), to: size(made.size) }), 'error');
            } else {
              say(t('videocompress.say.done', { from: size(sourceSize), to: size(made.size), pct }), 'ok');
            }
            Toolbox.trackUse?.('compress');
          }


          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다. */
          {
              Toolbox.onHandoff?.('videocompress', (f: File) => load(f));
          }
          /* 파일 받는 자리는 **공용 하나**를 쓴다 (TASK-KL-290). */
          wireDrop({ drop, input: fileInput, scope: container, onFiles: (files) => void load(files[0]) });
          // 파일을 바로 붙여넣는 것이 잦다
          [scaleEl, rateEl].forEach((el) => el.addEventListener('input', refresh));

          runBtn.onclick = () => {
            void run().catch((err: Error) => say(t('videocompress.err.running', { msg: err.message }), 'error'));
          };
          saveBtn.onclick = () => {
            if (!made) return;
            const aName = fileName.replace(/\.[^.]+$/, '') + t('videocompress.file.suffix') + '.webm';
            download(made, aName);
            // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
            Toolbox.offerNext?.(status, { blob: made, name: aName, from: 'videocompress' });
            say(t('videocompress.say.saved'), 'ok');
          };
  }
})();
