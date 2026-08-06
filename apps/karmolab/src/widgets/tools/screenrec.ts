/**
 * 화면 녹화 (TASK-KL-088)
 *
 * 버그를 설명하거나 사용법을 보여 줄 때 화면을 찍어 보내는 일이 잦다. 그런데 녹화 프로그램을
 * 깔라고 하면 그 자리에서 대화가 끊긴다. 브라우저가 이미 할 수 있는 일이라 여기서 끝낸다.
 *
 * 녹화된 파일은 **아무 데도 가지 않는다** — 내 화면이 담긴 파일이라 이 점이 특히 중요하다.
 *
 * 소리는 두 갈래다: 화면 소리(탭·시스템)와 마이크. 둘 다 켜면 섞어야 하므로 오디오를 합친다.
 */
import { pickRecordType } from './shared/video';

(function (): void {
  const size = (n: number): string =>
    n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n >= 1024 ? `${(n / 1024).toFixed(0)}KB` : `${n}B`;

  const mmss = (sec: number): string => {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  Toolbox.register({
    id: 'screenrec',
    title: '화면 녹화',
    category: 'tool',
    desc: '화면이나 창을 녹화합니다. 소리도 함께 담고, 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 21h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="10.5" r="3" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: '녹화',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-chips" style="margin-bottom:var(--space-lg);">
              <label class="tool-chip"><input type="checkbox" id="srSysAudio" checked> 화면 소리</label>
              <label class="tool-chip"><input type="checkbox" id="srMic"> 마이크</label>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="srStart">녹화 시작</button>
              <button class="btn btn-ghost" id="srStop" disabled>멈추기</button>
              <button class="btn btn-ghost" id="srSave" disabled>내려받기</button>
            </div>

            <div class="tool-display" id="srClock">0:00</div>
            <div class="cc-stats" id="srStats"></div>

            <div id="srResult" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-sublabel">녹화한 화면 — 확인하고 받으세요</div>
              <video id="srPreview" controls playsinline style="width:100%; max-height:340px; background:#000; border-radius:8px;"></video>
            </div>

            <div class="tool-status" id="srStatus">시작을 누르면 어떤 화면을 담을지 브라우저가 물어봅니다. 녹화 파일은 어디에도 올라가지 않습니다.</div>
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
          let ticker = 0;
          let startedAt = 0;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function cleanup(): void {
            window.clearInterval(ticker);
            tracks.forEach((t) => t.stop());
            tracks = [];
            startBtn.disabled = false;
            stopBtn.disabled = true;
          }

          async function start(): Promise<void> {
            if (!navigator.mediaDevices?.getDisplayMedia) {
              say('이 브라우저는 화면 녹화를 지원하지 않아요. 크롬·엣지에서 열어 보세요.', 'error');
              return;
            }
            made = null;
            saveBtn.disabled = true;
            $<HTMLElement>('#srResult').style.display = 'none';

            let screen: MediaStream;
            try {
              screen = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30 },
                audio: $<HTMLInputElement>('#srSysAudio').checked
              });
            } catch {
              // 사용자가 창 고르기를 취소한 경우 — 잘못이 아니므로 조용히 되돌린다
              say('녹화를 시작하지 않았어요.');
              return;
            }
            tracks = screen.getTracks();

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
                say('마이크를 쓸 수 없어 화면 소리만 담습니다.');
              }
            }
            // 소리가 둘이면 섞어야 한다 — MediaRecorder 는 오디오 트랙을 하나만 담는다
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

            // 브라우저 자체의 「공유 중지」로 끝낼 수도 있다 — 그 경우도 똑같이 마무리해야 한다
            screen.getVideoTracks()[0].addEventListener('ended', () => stop());

            recorder.start(500);
            startedAt = performance.now();
            startBtn.disabled = true;
            stopBtn.disabled = false;
            ticker = window.setInterval(() => {
              const sec = (performance.now() - startedAt) / 1000;
              clock.textContent = mmss(sec);
              const guess = chunks.reduce((a, c) => a + c.size, 0);
              stats.innerHTML = stat('녹화 시간', mmss(sec), true) + stat('지금까지', size(guess));
            }, 250);
            say('녹화 중입니다. 멈추기를 누르거나 브라우저의 공유 중지를 누르세요.', 'ok');

            made = await finished;
            void ctx.close();
            cleanup();

            if (!made || made.size < 100) {
              say('담긴 내용이 없어요. 시작하자마자 멈추면 이렇게 됩니다 — 몇 초 이상 녹화해 보세요.', 'error');
              return;
            }
            preview.src = URL.createObjectURL(made);
            $<HTMLElement>('#srResult').style.display = '';
            saveBtn.disabled = false;
            const sec = (performance.now() - startedAt) / 1000;
            stats.innerHTML = stat('녹화 시간', mmss(sec), true) + stat('용량', size(made.size));
            say(`${mmss(sec)} · ${size(made.size)} 로 담았어요. 확인하고 받으세요.`, 'ok');
            Toolbox.trackUse?.('record');
          }

          function stop(): void {
            if (recorder && recorder.state !== 'inactive') recorder.stop();
            recorder = null;
            window.clearInterval(ticker);
          }

          startBtn.onclick = () => {
            void start().catch((err: Error) => {
              cleanup();
              say('녹화 중 문제가 생겼어요: ' + err.message, 'error');
            });
          };
          stopBtn.onclick = stop;
          saveBtn.onclick = () => {
            if (!made) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(made);
            const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
            a.download = `화면녹화-${stamp}.webm`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say('내려받았어요.', 'ok');
          };
        }
      }
    ]
  });
})();
