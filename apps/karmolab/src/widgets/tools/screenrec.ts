/**
 * 화면 녹화 (TASK-KL-088)
 *
 * 버그를 설명하거나 사용법을 보여 줄 때 화면을 찍어 보내는 일이 잦다. 그런데 녹화 프로그램을
 * 깔라고 하면 그 자리에서 대화가 끊긴다. 브라우저가 이미 할 수 있는 일이라 여기서 끝낸다.
 *
 * 녹화된 파일은 **아무 데도 가지 않는다**. 내 화면이 담긴 파일이라 이 점이 특히 중요하다.
 *
 * 소리는 두 갈래다: 화면 소리(탭, 시스템)와 마이크. 둘 다 켜면 섞어야 하므로 오디오를 합친다.
 */
import { pickRecordType, download } from './shared/video';
import { escapeHtml as esc } from './shared/text';
import { statCell } from './shared/stats';
import { statusLine } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';
import { attachMedia } from './shared/media';
import { intervalWhileVisible } from '../../lib/tick';
import { startDisplayCapture, displayCaptureSupported, type CaptureHandle } from './shared/screen-capture';

(function (): void {

  const size = (n: number): string =>
    n>= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n>= 1024 ? `${(n / 1024).toFixed(0)}KB` : `${n}B`;

  const mmss = (sec: number): string => {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  Toolbox.register({
    id: 'screenrec',
    title: t('widgets.screenrec.title', undefined, "화면 녹화"),
    category: 'av',
    desc: t('widgets-desc.screenrec.desc', undefined, "화면이나 창을 녹화합니다. 소리도 함께 담고, 파일이 브라우저를 벗어나지 않습니다"),
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 21h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="10.5" r="3" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: t('screenrec.t04', undefined, "녹화"),
        build: function (container: HTMLElement): void {
          void loadNamespace('screenrec').then(function () {

          container.innerHTML = `
            <div class="tool-section-end tool-chips">
              <label class="tool-chip"><input type="checkbox" id="srSysAudio" checked> ${esc(t('screenrec.opt.sysAudio'))}</label>
              <label class="tool-chip"><input type="checkbox" id="srMic"> ${esc(t('screenrec.opt.mic'))}</label>
            </div>

            <div class="tool-actions tight">
              <button class="btn btn-primary" id="srStart">${esc(t('screenrec.btn.start'))}</button>
              <button class="btn btn-ghost" id="srStop" disabled>${esc(t('screenrec.btn.stop'))}</button>
              <button class="btn btn-ghost" id="srSave" disabled>${esc(t('screenrec.btn.save'))}</button>
            </div>

            <div class="tool-display" id="srClock">0:00</div>
            <div class="cc-stats" id="srStats"></div>

            <div id="srResult" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-sublabel">${esc(t('screenrec.label.result'))}</div>
              <video id="srPreview" controls playsinline style="width:100%; max-height:340px; background:#000; border-radius:var(--radius-lg);"></video>
            </div>

            <div class="tool-status" id="srStatus">${esc(t('screenrec.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const startBtn = $<HTMLButtonElement>('#srStart');
          const stopBtn = $<HTMLButtonElement>('#srStop');
          const saveBtn = $<HTMLButtonElement>('#srSave');
          const clock = $<HTMLElement>('#srClock');
          const stats = $<HTMLElement>('#srStats');
          const status = $<HTMLElement>('#srStatus');
          const preview = $<HTMLVideoElement>('#srPreview');

          let recorder: MediaRecorder | null = null;
          let made: Blob | null = null;
          let tracks: MediaStreamTrack[] = [];
          /* 화면 공유는 공용 부품이 연다. 지켜보기와 같은 길 */
          let capture: CaptureHandle | null = null;
          /** 녹화 시계를 멈추는 함수 (`lib/tick`). 보이는 동안만 돈다. */
          let stopTicker: (() => void) | null = null;
          let startedAt = 0;

          /* 상태 줄은 **공용 하나**를 쓴다 (TASK-KL-291). `aria-live` 가 여기 붙어 있어서
           * 화면낭독기가 다 됐습니다, 못 엽니다를 실제로 읽어 준다. */
          const say = statusLine(status);

          function cleanup(): void {
            stopTicker?.();
            capture?.stop();
            capture = null;
            tracks.forEach((t) => t.stop());
            tracks = [];
            startBtn.disabled = false;
            stopBtn.disabled = true;
          }

          async function start(): Promise<void> {
            if (!displayCaptureSupported()) {
              say(t('screenrec.err.unsupported'), 'error');
              return;
            }
            made = null;
            saveBtn.disabled = true;
            $<HTMLElement>('#srResult').style.display = 'none';

            /* 브라우저 자체의 공유 중지로 끝낼 수도 있다. 그 경우도 똑같이 마무리 */
            capture = await startDisplayCapture({ frameRate: 30, audio: $<HTMLInputElement>('#srSysAudio').checked, onEnded: () => stop() });
            if (!capture) {
              // 사용자가 창 고르기를 취소한 경우. 잘못이 아니므로 조용히 되돌린다
              say(t('screenrec.err.notStarted'));
              return;
            }
            const screen = capture.stream;
            tracks = screen.getAudioTracks();

            const out = new MediaStream(screen.getVideoTracks());
            const audioIn: MediaStreamAudioSourceNode[] = [];
            const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            const ctx = new AC();
            const dest = ctx.createMediaStreamDestination();

            if (screen.getAudioTracks().length) audioIn.push(ctx.createMediaStreamSource(new MediaStream(screen.getAudioTracks())));
            if ($<HTMLInputElement>('#srMic').checked) {
              try {
                const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
                tracks = tracks.concat(mic.getTracks());
                audioIn.push(ctx.createMediaStreamSource(mic));
              } catch {
                say(t('screenrec.warn.noMic'));
              }
            }
            // 소리가 둘이면 섞어야 한다. MediaRecorder 는 오디오 트랙을 하나만 담는다
            if (audioIn.length) {
              audioIn.forEach((n) => n.connect(dest));
              dest.stream.getAudioTracks().forEach((t) => out.addTrack(t));
            }

            const mimeType = pickRecordType();
            const chunks: Blob[] = [];
            recorder = new MediaRecorder(out, mimeType ? { mimeType } : undefined);
            recorder.ondataavailable = (ev) => {
              if (ev.data.size) chunks.push(ev.data);
            };
            const finished = new Promise<Blob>((resolve) => {
              (recorder as MediaRecorder).onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
            });

            recorder.start(500);
            startedAt = performance.now();
            startBtn.disabled = true;
            stopBtn.disabled = false;
            // 지난 시간은 `performance.now()` 에서 다시 재므로, 덮어 뒀다 돌아와도 시각이 안 틀린다.
            stopTicker = intervalWhileVisible(() => {
              const sec = (performance.now() - startedAt) / 1000;
              clock.textContent = mmss(sec);
              const guess = chunks.reduce((a, c) => a + c.size, 0);
              stats.innerHTML = statCell(t('screenrec.stat.length'), mmss(sec), true) + statCell(t('screenrec.stat.soFar'), size(guess));
            }, 250);
            say(t('screenrec.say.recording'), 'ok');

            made = await finished;
            void ctx.close();
            cleanup();

            if (!made || made.size < 100) {
              say(t('screenrec.err.empty'), 'error');
              return;
            }
            attachMedia(preview, made); // 공용. 앞 주소를 거두고 물린다
            $<HTMLElement>('#srResult').style.display = '';
            saveBtn.disabled = false;
            const sec = (performance.now() - startedAt) / 1000;
            stats.innerHTML = statCell(t('screenrec.stat.length'), mmss(sec), true) + statCell(t('screenrec.stat.size'), size(made.size));
            say(`${mmss(sec)}, ${size(made.size)} 로 담았어요. 확인하고 받으세요.`, 'ok');
            Toolbox.trackUse?.('record');
          }

          function stop(): void {
            if (recorder && recorder.state !== 'inactive') recorder.stop();
            recorder = null;
            stopTicker?.();
          }

          startBtn.onclick = () => {
            void start().catch((err: Error) => {
              cleanup();
              say(t('screenrec.err.run') + err.message, 'error');
            });
          };
          stopBtn.onclick = stop;
          saveBtn.onclick = () => {
            if (!made) return;
            const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
            const name = `${t('screenrec.file.name')}-${stamp}.webm`;
            download(made, name);
            say(t('screenrec.say.saved'), 'ok');
            /* **녹화한 것을 이어서 쓰게 내놓는다** (TASK-KL-298).
             * 화면을 찍고 나서 하는 일은 거의 늘 구간 자르기나 GIF 로다 . 
             * 여태는 방금 받은 파일을 다시 올려야 했다. */
            Toolbox.offerNext?.(status, { blob: made, name, from: 'screenrec' });
          };
                  });
        }
      }
    ]
  });
})();
