/**
 * 영상 자르기 (TASK-KL-088)
 *
 * 필요한 건 대개 2분짜리 영상의 10초다. 그 10초를 잘라 보내려고 영상 전체를 올리는 건 앞뒤가 안 맞는다.
 *
 * 브라우저에는 영상을 다시 엮는 기능이 없다. 대신 **재생하면서 그 화면과 소리를 그대로 녹화**할 수 있다.
 * 그래서 이 도구는 고른 구간을 실제로 재생하며 담는다 — 즉 **자르는 데 그 구간만큼 시간이 걸린다**.
 * 이건 우회가 아니라 브라우저에서 가능한 유일한 길이라, 숨기지 않고 남은 시간을 보여 준다.
 */
(function (): void {
  const size = (n: number): string =>
    n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n >= 1024 ? `${(n / 1024).toFixed(0)}KB` : `${n}B`;

  const mmss = (sec: number): string => {
    const s = Math.max(0, sec);
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
  };

  interface Capturable extends HTMLVideoElement {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  }

  Toolbox.register({
    id: 'videotrim',
    title: '영상 자르기',
    category: 'tool',
    desc: '영상에서 원하는 구간만 잘라 냅니다. 소리도 함께 남고, 영상이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M6 4v13a3 3 0 1 0 2 2.8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M18 4v13a3 3 0 1 1-2 2.8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M9 9h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '자르기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="vtDrop">
              <input type="file" id="vtFile" accept="video/*" hidden>
              영상을 끌어다 놓거나 눌러서 고르세요
            </div>

            <div id="vtEditor" style="display:none; margin-top:var(--space-lg);">
              <video id="vtVideo" playsinline controls style="width:100%; max-height:340px; background:#000; border-radius:8px;"></video>

              <div class="field-group" style="margin-top:var(--space-lg);">
                <div class="tool-sublabel">구간 — <span id="vtRangeLabel" class="range-value">0:00.0 ~ 0:00.0 (0.0초)</span></div>
                <input type="range" id="vtStart" min="0" max="1000" value="0" step="1">
                <input type="range" id="vtEnd" min="0" max="1000" value="1000" step="1" style="margin-top:6px;">
                <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                  <button class="btn btn-ghost btn-sm" id="vtHere">지금 위치를 시작점으로</button>
                  <button class="btn btn-ghost btn-sm" id="vtHereEnd">지금 위치를 끝점으로</button>
                  <button class="btn btn-ghost btn-sm" id="vtPlayRange">구간만 재생</button>
                </div>
              </div>

              <div class="tool-chips" style="margin-bottom:var(--space-lg);">
                <label class="tool-chip"><input type="checkbox" id="vtAudio" checked> 소리도 함께</label>
              </div>

              <div class="cc-stats" id="vtStats"></div>

              <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
                <button class="btn btn-primary" id="vtRun">이 구간만 잘라 내기</button>
                <button class="btn btn-ghost" id="vtStop" style="display:none;">중단</button>
                <button class="btn btn-ghost" id="vtSave" disabled>내려받기</button>
              </div>

              <div id="vtResult" style="display:none;">
                <div class="tool-sublabel">잘라 낸 결과 — 확인하고 받으세요</div>
                <video id="vtPreview" controls playsinline style="width:100%; max-height:280px; background:#000; border-radius:8px;"></video>
              </div>
            </div>

            <div class="tool-status" id="vtStatus">영상은 브라우저 안에서만 열립니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#vtDrop');
          const fileInput = $<HTMLInputElement>('#vtFile');
          const editor = $<HTMLElement>('#vtEditor');
          const video = $<Capturable>('#vtVideo');
          const startEl = $<HTMLInputElement>('#vtStart');
          const endEl = $<HTMLInputElement>('#vtEnd');
          const stats = $<HTMLElement>('#vtStats');
          const status = $<HTMLElement>('#vtStatus');
          const runBtn = $<HTMLButtonElement>('#vtRun');
          const stopBtn = $<HTMLButtonElement>('#vtStop');
          const saveBtn = $<HTMLButtonElement>('#vtSave');
          const preview = $<HTMLVideoElement>('#vtPreview');

          let fileName = '';
          let duration = 0;
          let made: Blob | null = null;
          let recorder: MediaRecorder | null = null;
          let rangeTimer = 0;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          const startSec = (): number => (parseInt(startEl.value, 10) / 1000) * duration;
          const endSec = (): number => (parseInt(endEl.value, 10) / 1000) * duration;

          function refresh(): void {
            if (!duration) return;
            if (parseInt(startEl.value, 10) >= parseInt(endEl.value, 10)) {
              if (document.activeElement === startEl) endEl.value = String(Math.min(1000, parseInt(startEl.value, 10) + 10));
              else startEl.value = String(Math.max(0, parseInt(endEl.value, 10) - 10));
            }
            const s = startSec(), e = endSec();
            const span = Math.max(0, e - s);
            $<HTMLElement>('#vtRangeLabel').textContent = `${mmss(s)} ~ ${mmss(e)} (${span.toFixed(1)}초)`;
            stats.innerHTML =
              stat('자를 길이', `${span.toFixed(1)}초`, true) +
              stat('원본 길이', mmss(duration)) +
              // 실시간 녹화라 걸리는 시간이 구간 길이와 같다. 미리 알려 줘야 「멈춘 건가」 오해가 없다.
              stat('걸리는 시간', `약 ${Math.ceil(span)}초`);
          }

          function load(f: File): void {
            fileName = f.name;
            made = null;
            saveBtn.disabled = true;
            $<HTMLElement>('#vtResult').style.display = 'none';
            video.src = URL.createObjectURL(f);
            video.onloadedmetadata = () => {
              duration = video.duration;
              editor.style.display = '';
              startEl.value = '0';
              endEl.value = '1000';
              video.currentTime = 0;
              refresh();
              say(`${f.name} · ${mmss(duration)} — 구간을 고르고 잘라 내기를 누르세요.`, 'ok');
            };
            video.onerror = () => say('이 영상은 브라우저가 열지 못했어요. mp4·webm 은 대체로 됩니다.', 'error');
          }

          /** 브라우저가 담을 수 있는 형식 중 가장 나은 것을 고른다. */
          function pickType(): string {
            const wanted = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
            for (const t of wanted) if (MediaRecorder.isTypeSupported(t)) return t;
            return '';
          }

          /**
           * 그 시각으로 옮기고 옮겨질 때까지 기다린다.
           *
           * 함정: **이미 그 자리에 있으면 「옮겼다」 신호가 오지 않는다.** 손잡이를 끌면 그 자리를
           * 미리 보여 주느라 이미 옮겨져 있으므로, 바로 이어서 누르면 오지 않을 신호를 영원히
           * 기다린다 — 오류도 안 나고 아무 일도 안 일어난다. 실제로 그렇게 멈췄다.
           * 그래서 ① 이미 도착했으면 즉시 넘어가고 ② 그래도 안 오면 시간을 두고 포기한다.
           */
          function seekTo(t: number): Promise<void> {
            return new Promise((resolve) => {
              if (Math.abs(video.currentTime - t) < 0.01) return resolve();
              let timer = 0;
              const done = (): void => {
                window.clearTimeout(timer);
                video.removeEventListener('seeked', done);
                resolve();
              };
              video.addEventListener('seeked', done);
              timer = window.setTimeout(done, 3000);
              video.currentTime = t;
            });
          }

          async function run(): Promise<void> {
            const s = startSec(), e = endSec();
            const span = e - s;
            if (span <= 0) {
              say('구간을 먼저 잡아 주세요.', 'error');
              return;
            }
            const grab = video.captureStream || video.mozCaptureStream;
            if (!grab) {
              say('이 브라우저는 영상 담기를 지원하지 않아요. 크롬·엣지에서 열어 보세요.', 'error');
              return;
            }

            made = null;
            saveBtn.disabled = true;
            $<HTMLElement>('#vtResult').style.display = 'none';

            const stream = grab.call(video);
            if (!$<HTMLInputElement>('#vtAudio').checked) {
              stream.getAudioTracks().forEach((t) => stream.removeTrack(t));
            }
            const mimeType = pickType();
            const chunks: Blob[] = [];
            recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            recorder.ondataavailable = (ev) => {
              if (ev.data.size) chunks.push(ev.data);
            };

            const finished = new Promise<Blob>((resolve) => {
              (recorder as MediaRecorder).onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
            });

            await seekTo(s);
            runBtn.disabled = true;
            stopBtn.style.display = '';
            recorder.start(200);
            void video.play();

            const t0 = performance.now();
            const watch = window.setInterval(() => {
              const left = Math.max(0, span - (performance.now() - t0) / 1000);
              say(`담는 중… ${left.toFixed(1)}초 남음 (구간을 실제로 재생하며 담습니다)`);
              if (video.currentTime >= e - 0.03 || left <= 0) stop();
            }, 100);

            const stop = (): void => {
              window.clearInterval(watch);
              video.pause();
              if (recorder && recorder.state !== 'inactive') recorder.stop();
            };
            stopBtn.onclick = stop;

            made = await finished;
            runBtn.disabled = false;
            stopBtn.style.display = 'none';
            recorder = null;

            if (!made || made.size < 100) {
              say('담긴 내용이 없어요. 구간을 조금 길게 잡아 보세요.', 'error');
              return;
            }
            preview.src = URL.createObjectURL(made);
            $<HTMLElement>('#vtResult').style.display = '';
            saveBtn.disabled = false;
            say(`${span.toFixed(1)}초 · ${size(made.size)} 로 잘라 냈어요. 확인하고 받으세요.`, 'ok');
            Toolbox.trackUse?.('trim');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) load(fileInput.files[0]);
          };
          drop.addEventListener('dragover', (ev) => {
            ev.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (ev) => {
            ev.preventDefault();
            drop.classList.remove('over');
            const f = ev.dataTransfer?.files?.[0];
            if (f) load(f);
          });

          [startEl, endEl].forEach((el) => el.addEventListener('input', refresh));
          startEl.addEventListener('input', () => {
            video.currentTime = startSec();
          });
          endEl.addEventListener('input', () => {
            video.currentTime = endSec();
          });

          $<HTMLButtonElement>('#vtHere').onclick = () => {
            startEl.value = String(Math.round((video.currentTime / Math.max(0.01, duration)) * 1000));
            refresh();
          };
          $<HTMLButtonElement>('#vtHereEnd').onclick = () => {
            endEl.value = String(Math.round((video.currentTime / Math.max(0.01, duration)) * 1000));
            refresh();
          };
          $<HTMLButtonElement>('#vtPlayRange').onclick = () => {
            window.clearTimeout(rangeTimer);
            video.currentTime = startSec();
            void video.play();
            rangeTimer = window.setTimeout(() => video.pause(), Math.max(100, (endSec() - startSec()) * 1000));
          };
          runBtn.onclick = () => {
            void run().catch((err: Error) => say('자르는 중 문제가 생겼어요: ' + err.message, 'error'));
          };
          saveBtn.onclick = () => {
            if (!made) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(made);
            a.download = fileName.replace(/\.[^.]+$/, '') + '-자른부분.webm';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say('내려받았어요.', 'ok');
          };
        }
      }
    ]
  });
})();
