/**
 * 영상 자르기 (TASK-KL-088)
 *
 * 필요한 건 대개 2분짜리 영상의 10초다. 그 10초를 잘라 보내려고 영상 전체를 올리는 건 앞뒤가 안 맞는다.
 *
 * 브라우저에는 영상을 다시 엮는 기능이 없다. 대신 **재생하면서 그 화면과 소리를 그대로 녹화**할 수 있다.
 * 그래서 이 도구는 고른 구간을 실제로 재생하며 담는다 — 즉 **자르는 데 그 구간만큼 시간이 걸린다**.
 * 이건 우회가 아니라 브라우저에서 가능한 유일한 길이라, 숨기지 않고 남은 시간을 보여 준다.
 */
import { seekTo, pickRecordType } from './shared/video';

import { acceptPastedFiles } from './shared/paste';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
    // 다른 도구가 만든 것을 그대로 받는다 (TASK-KL-133)
    accepts: ['video/*'],
    title: t('widgets.videotrim.title', undefined, "영상 자르기"),
    category: 'tool',
    desc: t('widgets-desc.videotrim.desc', undefined, "영상에서 원하는 구간만 잘라 냅니다. 소리도 함께 남고, 영상이 브라우저를 벗어나지 않습니다"),
    layout: 'wide',
    icon: '<path d="M6 4v13a3 3 0 1 0 2 2.8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M18 4v13a3 3 0 1 1-2 2.8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M9 9h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('videotrim.tab', undefined, "자르기"),
        build: function (container: HTMLElement): void {
          void loadNamespace('videotrim').then(function () {

          container.innerHTML = `
            <div class="tool-drop" id="vtDrop">
              <input type="file" id="vtFile" accept="video/*" hidden>
              ${esc(t('videotrim.drop'))}
            </div>

            <div id="vtEditor" style="display:none; margin-top:var(--space-lg);">
              <video id="vtVideo" playsinline controls style="width:100%; max-height:340px; background:#000; border-radius:8px;"></video>

              <div class="field-group" style="margin-top:var(--space-lg);">
                <div class="tool-sublabel">${esc(t('videotrim.label.range'))} <span id="vtRangeLabel" class="range-value">${esc(t('videotrim.value.range'))}</span></div>
                <input type="range" id="vtStart" aria-label="${esc(t('videotrim.aria.start'))}" min="0" max="1000" value="0" step="1">
                <input type="range" id="vtEnd" aria-label="${esc(t('videotrim.aria.end'))}" min="0" max="1000" value="1000" step="1" style="margin-top:6px;">
                <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                  <button class="btn btn-ghost btn-sm" id="vtHere">${esc(t('videotrim.btn.here'))}</button>
                  <button class="btn btn-ghost btn-sm" id="vtHereEnd">${esc(t('videotrim.btn.hereEnd'))}</button>
                  <button class="btn btn-ghost btn-sm" id="vtPlayRange">${esc(t('videotrim.btn.play'))}</button>
                </div>
              </div>

              <div class="tool-chips" style="margin-bottom:var(--space-lg);">
                <label class="tool-chip"><input type="checkbox" id="vtAudio" checked> ${esc(t('videotrim.opt.audio'))}</label>
              </div>

              <div class="cc-stats" id="vtStats"></div>

              <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
                <button class="btn btn-primary" id="vtRun">${esc(t('videotrim.btn.run'))}</button>
                <button class="btn btn-ghost" id="vtStop" style="display:none;">${esc(t('videotrim.btn.stop'))}</button>
                <button class="btn btn-ghost" id="vtSave" disabled>${esc(t('videotrim.btn.save'))}</button>
              </div>

              <div id="vtResult" style="display:none;">
                <div class="tool-sublabel">${esc(t('videotrim.label.result'))}</div>
                <video id="vtPreview" controls playsinline style="width:100%; max-height:280px; background:#000; border-radius:8px;"></video>
              </div>
            </div>

            <div class="tool-status" id="vtStatus">${esc(t('videotrim.status.idle'))}</div>
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
            $<HTMLElement>('#vtRangeLabel').textContent = t('videotrim.value.rangeOf', { from: mmss(s), to: mmss(e), sec: span.toFixed(1) }) + ``;
            stats.innerHTML =
              stat(t('videotrim.stat.cut'), t('videotrim.value.sec', { n: span.toFixed(1) }), true) +
              stat(t('videotrim.stat.total'), mmss(duration)) +
              // 실시간 녹화라 걸리는 시간이 구간 길이와 같다. 미리 알려 줘야 「멈춘 건가」 오해가 없다.
              stat(t('videotrim.stat.eta'), t('videotrim.value.about', { n: Math.ceil(span) }));
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
              say(t('videotrim.say.loaded', { name: f.name, len: mmss(duration) }), 'ok');
            };
            video.onerror = () => say(t('videotrim.err.open'), 'error');
          }

          async function run(): Promise<void> {
            const s = startSec(), e = endSec();
            const span = e - s;
            if (span <= 0) {
              say(t('videotrim.err.noRange'), 'error');
              return;
            }
            const grab = video.captureStream || video.mozCaptureStream;
            if (!grab) {
              say(t('videotrim.err.unsupported'), 'error');
              return;
            }

            made = null;
            saveBtn.disabled = true;
            $<HTMLElement>('#vtResult').style.display = 'none';

            const stream = grab.call(video);
            if (!$<HTMLInputElement>('#vtAudio').checked) {
              stream.getAudioTracks().forEach((t) => stream.removeTrack(t));
            }
            const mimeType = pickRecordType();
            const chunks: Blob[] = [];
            recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            recorder.ondataavailable = (ev) => {
              if (ev.data.size) chunks.push(ev.data);
            };

            const finished = new Promise<Blob>((resolve) => {
              (recorder as MediaRecorder).onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
            });

            await seekTo(video, s);
            runBtn.disabled = true;
            stopBtn.style.display = '';
            recorder.start(200);
            void video.play();

            const t0 = performance.now();
            const watch = window.setInterval(() => {
              const left = Math.max(0, span - (performance.now() - t0) / 1000);
              say(t('videotrim.say.recording', { left: left.toFixed(1) }));
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
              say(t('videotrim.err.empty'), 'error');
              return;
            }
            preview.src = URL.createObjectURL(made);
            $<HTMLElement>('#vtResult').style.display = '';
            saveBtn.disabled = false;
            say(t('videotrim.say.done', { sec: span.toFixed(1), size: size(made.size) }), 'ok');
            Toolbox.trackUse?.('trim');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) load(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다. */
          {
              Toolbox.onHandoff?.('videotrim', (f: File) => load(f));
          }
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
          // 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { load(files[0]); }, (f: File) => f.type.startsWith('video/'));

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
            void run().catch((err: Error) => say(t('videotrim.err.run') + err.message, 'error'));
          };
          saveBtn.onclick = () => {
            if (!made) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(made);
            a.download = fileName.replace(/\.[^.]+$/, '') + t('videotrim.file.suffix');
            a.click();
            // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
            Toolbox.offerNext?.(status, { blob: made, name: a.download, from: 'videotrim' });
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say(t('videotrim.say.saved'), 'ok');
          };
                  });
        }
      }
    ]
  });
})();
