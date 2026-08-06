/**
 * 목소리 녹음 (TASK-KL-088)
 *
 * 메모·발음 확인·짧은 음성 전달처럼 「지금 바로 한마디 담고 싶은」 순간에 쓰는 자리다.
 * 녹음 앱을 찾거나 설치하는 사이에 하려던 말을 잊는다.
 *
 * 신경 쓴 곳:
 *  - **소리가 들어오고 있는지 눈으로 보인다.** 녹음의 최대 사고는 「다 말하고 보니 안 담김」이라,
 *    입력 크기를 실시간으로 그린다. 조용하면 조용하다고 알려 준다.
 *  - 저장은 WAV. 다른 도구(오디오 자르기·잇기)에 바로 물릴 수 있고 품질 손실이 없다.
 */
import { toWav, encodeAudio, fileSize as size, mmss } from './shared/media';

(function (): void {
  Toolbox.register({
    id: 'voicerec',
    title: '목소리 녹음',
    category: 'tool',
    desc: '마이크로 바로 녹음해 WAV 로 받습니다. 소리가 들어오는지 눈으로 보이고, 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 18v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '녹음',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="vrStart">녹음 시작</button>
              <button class="btn btn-ghost" id="vrStop" disabled>멈추기</button>
              <button class="btn btn-ghost" id="vrSave" disabled>내려받기</button>
              <select id="vrFormat" aria-label="저장 형식">
                <option value="mp3">MP3 — 작음</option>
                <option value="wav">WAV — 손실 없음</option>
              </select>
            </div>

            <div class="tool-display" id="vrClock">0:00</div>
            <canvas id="vrMeter" height="72" style="width:100%; height:72px; border-radius:8px; background:var(--surface-2, #1a1a1a); display:block;"></canvas>

            <div class="cc-stats" id="vrStats"></div>

            <div id="vrResult" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-sublabel">녹음한 소리 — 들어 보고 받으세요</div>
              <audio id="vrPreview" controls style="width:100%;"></audio>
            </div>

            <div class="tool-status" id="vrStatus">시작을 누르면 브라우저가 마이크 사용을 물어봅니다. 녹음은 어디에도 올라가지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const startBtn = $<HTMLButtonElement>('#vrStart');
          const stopBtn = $<HTMLButtonElement>('#vrStop');
          const saveBtn = $<HTMLButtonElement>('#vrSave');
          const clock = $<HTMLElement>('#vrClock');
          const meter = $<HTMLCanvasElement>('#vrMeter');
          const stats = $<HTMLElement>('#vrStats');
          const status = $<HTMLElement>('#vrStatus');
          const preview = $<HTMLAudioElement>('#vrPreview');

          let recorder: MediaRecorder | null = null;
          let stream: MediaStream | null = null;
          let wav: Blob | null = null;
          // 저장 형식을 나중에 고르므로 소리 자체를 들고 있어야 한다 (WAV 로만 갖고 있으면 MP3 를 못 만든다)
          let recorded: AudioBuffer | null = null;
          let raf = 0;
          let ticker = 0;
          let startedAt = 0;
          let peak = 0; // 녹음 내내 가장 컸던 소리 — 「안 담겼다」를 판정하는 근거

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          /** 들어오는 소리를 흐르는 막대로 그린다. 숫자보다 눈이 빠르다. */
          function drawMeter(analyser: AnalyserNode): void {
            const ctx = meter.getContext('2d');
            if (!ctx) return;
            const buf = new Float32Array(analyser.fftSize);
            const history: number[] = [];
            const tick = (): void => {
              analyser.getFloatTimeDomainData(buf);
              let max = 0;
              for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]));
              peak = Math.max(peak, max);
              history.push(max);
              const w = (meter.width = meter.clientWidth || 600);
              const h = meter.height;
              while (history.length > Math.floor(w / 3)) history.shift();
              ctx.clearRect(0, 0, w, h);
              ctx.fillStyle = 'rgba(255,255,255,0.08)';
              ctx.fillRect(0, h / 2 - 0.5, w, 1);
              ctx.fillStyle = max > 0.9 ? '#e04b4b' : '#4bb3e0';
              history.forEach((v, i) => {
                const bar = Math.max(2, v * h * 0.92);
                ctx.fillRect(i * 3, (h - bar) / 2, 2, bar);
              });
              raf = requestAnimationFrame(tick);
            };
            tick();
          }

          function cleanup(): void {
            cancelAnimationFrame(raf);
            window.clearInterval(ticker);
            stream?.getTracks().forEach((t) => t.stop());
            stream = null;
            startBtn.disabled = false;
            stopBtn.disabled = true;
          }

          async function start(): Promise<void> {
            if (!navigator.mediaDevices?.getUserMedia) {
              say('이 브라우저는 녹음을 지원하지 않아요. 크롬·엣지·사파리 최신 버전에서 열어 보세요.', 'error');
              return;
            }
            wav = null;
            recorded = null;
            peak = 0;
            saveBtn.disabled = true;
            $<HTMLElement>('#vrResult').style.display = 'none';

            try {
              stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
            } catch {
              say('마이크를 쓸 수 없어요. 브라우저 주소창의 자물쇠에서 마이크 권한을 허용해 주세요.', 'error');
              return;
            }

            const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            const ctx = new AC();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            ctx.createMediaStreamSource(stream).connect(analyser);
            drawMeter(analyser);

            const chunks: Blob[] = [];
            recorder = new MediaRecorder(stream);
            recorder.ondataavailable = (ev) => {
              if (ev.data.size) chunks.push(ev.data);
            };
            const finished = new Promise<Blob>((resolve) => {
              (recorder as MediaRecorder).onstop = () => resolve(new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }));
            });

            recorder.start(300);
            startedAt = performance.now();
            startBtn.disabled = true;
            stopBtn.disabled = false;
            ticker = window.setInterval(() => {
              clock.textContent = mmss((performance.now() - startedAt) / 1000);
            }, 250);
            say('녹음 중입니다. 막대가 움직이면 소리가 들어오고 있는 것입니다.', 'ok');

            const raw = await finished;
            const seconds = (performance.now() - startedAt) / 1000;
            cleanup();

            // 녹음한 소리를 WAV 로 바꾼다. 담긴 형식은 브라우저마다 달라, 한 번 해독해 통일한다.
            let buffer: AudioBuffer | null = null;
            try {
              buffer = await ctx.decodeAudioData(await raw.arrayBuffer());
            } catch {
              buffer = null;
            }
            void ctx.close();

            if (!buffer || buffer.duration < 0.05) {
              say('담긴 소리가 없어요. 마이크가 맞게 골라졌는지 확인해 주세요.', 'error');
              return;
            }
            recorded = buffer;
            wav = toWav(buffer); // 미리 듣기는 손실 없는 쪽으로 들려준다
            preview.src = URL.createObjectURL(wav);
            $<HTMLElement>('#vrResult').style.display = '';
            saveBtn.disabled = false;
            clock.textContent = mmss(buffer.duration);
            stats.innerHTML =
              stat('길이', mmss(buffer.duration), true) +
              stat('용량', size(wav.size)) +
              stat('가장 큰 소리', `${Math.round(peak * 100)}%`);

            // 소리가 거의 안 들어왔으면 그냥 저장 성공이라고 하면 안 된다 — 사용자는 나중에야 안다
            if (peak < 0.02) {
              say(`${mmss(seconds)} 담겼지만 소리가 거의 없습니다. 마이크가 음소거이거나 다른 장치가 골라졌을 수 있어요.`, 'error');
            } else if (peak > 0.99) {
              say(`${mmss(buffer.duration)} 담았어요. 다만 소리가 너무 커서 찌그러졌을 수 있습니다 — 조금 떨어져서 말해 보세요.`);
            } else {
              say(`${mmss(buffer.duration)} · ${size(wav.size)} 담았어요. 들어 보고 받으세요.`, 'ok');
            }
            Toolbox.trackUse?.('record');
          }

          startBtn.onclick = () => {
            void start().catch((err: Error) => {
              cleanup();
              say('녹음 중 문제가 생겼어요: ' + err.message, 'error');
            });
          };
          stopBtn.onclick = () => {
            if (recorder && recorder.state !== 'inactive') recorder.stop();
            recorder = null;
          };
          saveBtn.onclick = () => {
            if (!recorded) return;
            const format = $<HTMLSelectElement>('#vrFormat').value as 'wav' | 'mp3';
            say(format === 'mp3' ? 'MP3 로 만드는 중…' : '내려받는 중…');
            void encodeAudio(recorded, format)
              .then((blob) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
                a.download = `녹음-${stamp}.${format}`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                say(`${size(blob.size)} 로 내려받았어요.`, 'ok');
              })
              .catch((err: Error) => say('만드는 중 문제가 생겼어요: ' + err.message, 'error'));
          };
        }
      }
    ]
  });
})();
