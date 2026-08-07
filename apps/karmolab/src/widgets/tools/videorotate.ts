/**
 * 영상 돌리기·뒤집기 (TASK-KL-088)
 *
 * 폰을 옆으로 들고 찍었는데 컴퓨터에서 열면 누워 있는 영상. 흔하고, 그때마다 편집기를 깔기는 아깝다.
 *
 * 신경 쓴 곳:
 *  - **돌리면 가로세로가 바뀐다.** 90도 돌린 뒤에도 원래 틀에 우겨넣으면 찌그러지거나 잘린다.
 *    그래서 90·270도에서는 내보내는 틀 자체를 뒤집는다.
 *  - 소리는 원본에서 그대로 가져온다 — 다시 그리는 건 화면뿐이다.
 *  - 담는 동안 다른 탭으로 가면 브라우저가 화면 그리기를 멈춰 그 구간이 정지 화면이 된다.
 *    막을 방법이 없으므로 **일어났으면 알려 준다.** 모르고 받아 가는 게 제일 나쁘다.
 */
import { pickRecordType } from './shared/video';
import { fileSize as size, mmss } from './shared/media';

(function (): void {
  type Capturable = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };

  Toolbox.register({
    id: 'videorotate',
    title: '영상 돌리기',
    category: 'tool',
    desc: '누워서 찍힌 영상을 세웁니다. 돌리면 가로세로도 함께 바뀝니다',
    layout: 'wide',
    icon: '<rect x="3" y="7" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M17 8a5 5 0 0 1 0 8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M19.5 5.5L17 8l2.5 2.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '돌리기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="vrDrop">
              <input type="file" id="vrFile" accept="video/*" hidden>
              <span>영상을 끌어다 놓거나 눌러서 고르세요</span>
            </div>

            <div class="field-group" id="vrControls" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-sublabel">돌리기</div>
              <div class="tool-chips" id="vrTurns">
                <button type="button" class="tool-chip active" data-turn="0">그대로</button>
                <button type="button" class="tool-chip" data-turn="90">오른쪽 90°</button>
                <button type="button" class="tool-chip" data-turn="180">180°</button>
                <button type="button" class="tool-chip" data-turn="270">왼쪽 90°</button>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="vrFlipH"> 좌우 뒤집기 (거울)</label>
                <label class="tool-chip"><input type="checkbox" id="vrFlipV"> 상하 뒤집기</label>
                <label class="tool-chip"><input type="checkbox" id="vrAudio" checked> 소리 함께</label>
              </div>
            </div>

            <video id="vrVideo" playsinline muted style="display:none;"></video>
            <div id="vrStage" style="display:none;">
              <div class="tool-sublabel">미리보기 — 나오는 그대로입니다</div>
              <canvas id="vrCanvas" style="max-width:100%; border-radius:10px; display:block; border:1px solid rgba(128,128,128,0.25);"></canvas>
            </div>

            <div class="cc-stats" id="vrStats"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="vrRun" disabled>돌려서 담기</button>
              <button class="btn btn-ghost" id="vrStop" style="display:none;">그만</button>
              <button class="btn btn-ghost" id="vrSave" disabled>내려받기</button>
            </div>

            <div class="tool-status" id="vrStatus">영상은 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const video = $<HTMLVideoElement>('#vrVideo');
          const canvas = $<HTMLCanvasElement>('#vrCanvas') as Capturable;
          const status = $<HTMLElement>('#vrStatus');
          const stats = $<HTMLElement>('#vrStats');
          const runBtn = $<HTMLButtonElement>('#vrRun');
          const stopBtn = $<HTMLButtonElement>('#vrStop');
          const saveBtn = $<HTMLButtonElement>('#vrSave');

          let turn = 0;
          let made: Blob | null = null;
          let baseName = '영상';
          let recorder: MediaRecorder | null = null;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          /** 90·270도에서는 가로세로가 바뀐다 — 안 바꾸면 찌그러지거나 잘린다 */
          function outSize(): { w: number; h: number } {
            const vw = video.videoWidth || 0;
            const vh = video.videoHeight || 0;
            return turn === 90 || turn === 270 ? { w: vh, h: vw } : { w: vw, h: vh };
          }

          /** 한 장면을 돌리고 뒤집어 캔버스에 그린다 (미리보기와 담기가 같은 길을 쓴다) */
          function paint(): void {
            const ctx = canvas.getContext('2d');
            if (!ctx || !video.videoWidth) return;
            const { w, h } = outSize();
            if (canvas.width !== w || canvas.height !== h) {
              canvas.width = w;
              canvas.height = h;
            }
            ctx.save();
            ctx.translate(w / 2, h / 2);
            ctx.rotate((turn * Math.PI) / 180);
            const fh = $<HTMLInputElement>('#vrFlipH').checked ? -1 : 1;
            const fv = $<HTMLInputElement>('#vrFlipV').checked ? -1 : 1;
            ctx.scale(fh, fv);
            ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);
            ctx.restore();
          }

          function showStats(): void {
            const { w, h } = outSize();
            stats.innerHTML =
              stat('나오는 크기', `${w}×${h}`, true) +
              stat('원래 크기', `${video.videoWidth}×${video.videoHeight}`) +
              stat('길이', mmss(video.duration || 0));
          }

          function load(file: File): void {
            video.src = URL.createObjectURL(file);
            baseName = (file.name || '영상').replace(/\.[^.]+$/, '');
            video.onloadeddata = () => {
              $<HTMLElement>('#vrStage').style.display = '';
              $<HTMLElement>('#vrControls').style.display = '';
              runBtn.disabled = false;
              showStats();
              // 자리를 옮기면 그림이 바로 오지 않는다 — 도착했다고 알려 줄 때 그린다.
              // 곧바로 그리면 첫 미리보기가 빈 화면이 된다 (시험이 잡았다).
              video.onseeked = () => paint();
              video.currentTime = 0;
              paint();
              say('돌려 보고 미리보기가 맞으면 담으세요.', 'ok');
            };
            video.onerror = () => say('이 영상을 열지 못했어요. 다른 파일로 해 보세요.', 'error');
          }

          async function record(): Promise<void> {
            const ctx = canvas.getContext('2d');
            if (!ctx || !canvas.captureStream) {
              say('이 브라우저는 영상 담기를 지원하지 않아요. 크롬·엣지에서 열어 보세요.', 'error');
              return;
            }
            made = null;
            saveBtn.disabled = true;

            const out = canvas.captureStream(30);
            if ($<HTMLInputElement>('#vrAudio').checked) {
              const withAudio = video as HTMLVideoElement & { captureStream?: () => MediaStream };
              withAudio.captureStream?.().getAudioTracks().forEach((t) => out.addTrack(t));
            }
            const mimeType = pickRecordType();
            const chunks: Blob[] = [];
            recorder = new MediaRecorder(out, { ...(mimeType ? { mimeType } : {}) });
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
              paint();
              raf = requestAnimationFrame(draw);
            };
            draw();

            // 다른 탭으로 가면 그리기가 멈춰 그 구간이 정지 화면으로 담긴다 — 막을 수 없으니 알린다
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
            say('담는 중… 이 탭을 켜 둔 채로 두세요.');

            made = await finished;
            document.removeEventListener('visibilitychange', onHide);
            stopBtn.style.display = 'none';
            runBtn.disabled = false;
            saveBtn.disabled = false;
            const { w, h } = outSize();
            stats.innerHTML =
              stat('나오는 크기', `${w}×${h}`, true) +
              stat('원래 크기', `${video.videoWidth}×${video.videoHeight}`) +
              stat('파일 크기', size(made.size));
            say(
              leftTab
                ? '다 담았는데, 도중에 다른 탭에 다녀오셨어요 — 그 구간은 멈춘 화면일 수 있습니다. 다시 담는 편이 낫습니다.'
                : '다 담았어요. 내려받으세요.',
              leftTab ? 'error' : 'ok'
            );
            Toolbox.trackUse?.('rotate');
          }

          const drop = $<HTMLElement>('#vrDrop');
          const fileInput = $<HTMLInputElement>('#vrFile');
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

          container.querySelectorAll('#vrTurns .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#vrTurns .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              turn = Number((chip as HTMLElement).dataset.turn);
              paint();
              showStats();
            };
          });
          ['#vrFlipH', '#vrFlipV'].forEach((s) =>
            $<HTMLInputElement>(s).addEventListener('change', () => {
              paint();
            })
          );
          runBtn.onclick = () => void record();
          saveBtn.onclick = () => {
            if (!made) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(made);
            a.download = `${baseName}-돌림.webm`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say(`${size(made.size)} 로 받았어요.`, 'ok');
          };
        }
      }
    ]
  });
})();
