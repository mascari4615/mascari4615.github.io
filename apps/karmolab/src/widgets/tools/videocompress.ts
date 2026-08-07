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
import { fileSize as size, mmss } from './shared/media';
import { acceptPastedFiles } from './shared/paste';
import { pickRecordType } from './shared/video';

(function (): void {
  // captureStream 은 브라우저마다 있고 없고가 갈려 표준 타입에 없다 — 있는지 보고 쓴다.
  type Capturable = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };

  Toolbox.register({
    id: 'videocompress',
    // 다른 도구가 만든 것을 그대로 받는다 (TASK-KL-133)
    accepts: ['video/*'],
    title: '영상 용량 줄이기',
    category: 'tool',
    desc: '영상 용량을 줄입니다. 해상도와 화질을 고르고, 영상이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 12h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M10.5 9.5 8 12l2.5 2.5M13.5 9.5 16 12l-2.5 2.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '용량 줄이기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="vcDrop">
              <input type="file" id="vcFile" accept="video/*" hidden>
              영상을 끌어다 놓거나 눌러서 고르세요
            </div>

            <div id="vcEditor" style="display:none; margin-top:var(--space-lg);">
              <video id="vcVideo" playsinline muted style="width:100%; max-height:300px; background:#000; border-radius:8px;"></video>

              <div class="field-group" style="margin-top:var(--space-lg);">
                <div class="tool-grid-2">
                  <div>
                    <div class="tool-sublabel">화면 크기 <span id="vcScaleVal" class="range-value">절반</span></div>
                    <input type="range" id="vcScale" aria-label="화면 크기" min="1" max="4" step="1" value="2">
                  </div>
                  <div>
                    <div class="tool-sublabel">화질 <span id="vcRateVal" class="range-value">보통</span></div>
                    <input type="range" id="vcRate" aria-label="화질" min="1" max="4" step="1" value="2">
                  </div>
                </div>
                <div class="tool-chips" style="margin-top:10px;">
                  <label class="tool-chip"><input type="checkbox" id="vcAudio" checked> 소리도 함께</label>
                </div>
              </div>

              <div class="cc-stats" id="vcStats"></div>

              <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
                <button class="btn btn-primary" id="vcRun">용량 줄이기</button>
                <button class="btn btn-ghost" id="vcStop" style="display:none;">중단</button>
                <button class="btn btn-ghost" id="vcSave" disabled>내려받기</button>
              </div>

              <div id="vcResult" style="display:none;">
                <div class="tool-sublabel">줄인 영상 — 확인하고 받으세요</div>
                <video id="vcPreview" controls playsinline style="width:100%; max-height:280px; background:#000; border-radius:8px;"></video>
              </div>
            </div>

            <div class="tool-status" id="vcStatus">영상은 브라우저 안에서만 열립니다 — 어디에도 올리지 않습니다.</div>
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
            [0.35, '아주 작게'],
            [0.5, '절반'],
            [0.7, '조금 작게'],
            [1, '그대로']
          ];
          // 초당 비트 수 = 용량을 좌우하는 값. 화면이 작으면 적은 값으로도 깨끗하다.
          const RATES: Array<[number, string]> = [
            [0.06, '작게'],
            [0.1, '보통'],
            [0.16, '좋게'],
            [0.25, '아주 좋게']
          ];

          let fileName = '';
          let sourceSize = 0;
          let duration = 0;
          let made: Blob | null = null;
          let recorder: MediaRecorder | null = null;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

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
              stat('원래 용량', size(sourceSize), true) +
              stat('만들 크기', `${w}×${h}`) +
              stat('예상 용량', '약 ' + size(guess)) +
              // 실시간으로 다시 담기 때문에 영상 길이만큼 걸린다. 미리 알려야 「멈춘 건가」 오해가 없다.
              stat('걸리는 시간', `약 ${mmss(duration)}`);
          }

          function load(f: File): void {
            fileName = f.name;
            sourceSize = f.size;
            made = null;
            saveBtn.disabled = true;
            $<HTMLElement>('#vcResult').style.display = 'none';
            video.src = URL.createObjectURL(f);
            video.onloadedmetadata = () => {
              duration = video.duration;
              editor.style.display = '';
              refresh();
              say(`${f.name} · ${size(f.size)} · ${video.videoWidth}×${video.videoHeight} — 설정을 고르고 줄이세요.`, 'ok');
            };
            video.onerror = () => say('이 영상은 브라우저가 열지 못했어요. mp4·webm 은 대체로 됩니다.', 'error');
          }

          async function run(): Promise<void> {
            const { w, h } = outSize();
            const canvas = document.createElement('canvas') as Capturable;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx || !canvas.captureStream) {
              say('이 브라우저는 영상 담기를 지원하지 않아요. 크롬·엣지에서 열어 보세요.', 'error');
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
              say(`다시 담는 중… ${mmss(left)} 남음 — 이 탭을 보이는 채로 두세요`);
            }, 300);

            made = await finished;
            window.clearInterval(watch);
            document.removeEventListener('visibilitychange', onHide);
            video.onended = null;
            runBtn.disabled = false;
            stopBtn.style.display = 'none';
            recorder = null;

            if (!made || made.size < 100) {
              say('담긴 내용이 없어요.', 'error');
              return;
            }
            preview.src = URL.createObjectURL(made);
            $<HTMLElement>('#vcResult').style.display = '';
            saveBtn.disabled = false;

            const pct = Math.round(Math.abs(1 - made.size / sourceSize) * 100);
            stats.innerHTML =
              stat('원래 용량', size(sourceSize)) +
              stat('줄인 용량', size(made.size), true) +
              stat('변화', made.size < sourceSize ? `${pct}% 줄어듦` : `${pct}% 늘어남`) +
              stat('크기', `${w}×${h}`);
            // 이미 잘 눌린 영상은 다시 담으면 커진다 — 그때 줄었다고 말하면 거짓이 된다
            if (leftTab) {
              say('처리 중에 다른 탭에 다녀오셨네요 — 그동안 화면이 멈춘 채로 담겼을 수 있습니다. 결과를 꼭 확인하고, 이상하면 이 탭을 보이는 채로 다시 해 주세요.', 'error');
            } else if (made.size >= sourceSize) {
              say(`줄지 않았어요 (${size(sourceSize)} → ${size(made.size)}). 이미 잘 압축된 영상입니다. 화면 크기나 화질을 낮추면 줄지만 흐려집니다.`, 'error');
            } else {
              say(`${size(sourceSize)} → ${size(made.size)} (${pct}% 줄었어요). 확인하고 받으세요.`, 'ok');
            }
            Toolbox.trackUse?.('compress');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) load(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다. */
          {
            const handed = Toolbox.takeResult?.();
            if (handed && handed.blob && (handed.blob.type.startsWith('video/'))) {
              load(new File([handed.blob], handed.name || '넘겨받은', { type: handed.blob.type }));
            }
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
          acceptPastedFiles(container, (files) => { void load(files[0]); }, (f) => f.type.startsWith('video/'));
          [scaleEl, rateEl].forEach((el) => el.addEventListener('input', refresh));

          runBtn.onclick = () => {
            void run().catch((err: Error) => say('줄이는 중 문제가 생겼어요: ' + err.message, 'error'));
          };
          saveBtn.onclick = () => {
            if (!made) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(made);
            a.download = fileName.replace(/\.[^.]+$/, '') + '-작게.webm';
            a.click();
            // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
            Toolbox.offerNext?.(status, { blob: made, name: a.download, from: 'videocompress' });
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say('내려받았어요.', 'ok');
          };
        }
      }
    ]
  });
})();
