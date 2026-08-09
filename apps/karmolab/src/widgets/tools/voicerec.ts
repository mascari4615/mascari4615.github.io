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
import { AiGate } from '../../lib/ai-gate';
import { loadEngine, webgpuAvailable } from '../../lib/ai-engine';
import { MODEL_SIZE_MB, toModelAudio, toSrt, transcribe } from '../../lib/ai-transcribe';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  Toolbox.register({
    id: 'voicerec',
    title: t('widgets.voicerec.title', undefined, '목소리 녹음'),
    category: 'tool',
    desc: t(
      'widgets-desc.voicerec.desc',
      undefined,
      '마이크로 바로 녹음해 WAV 로 받습니다. 소리가 들어오는지 눈으로 보이고, 파일이 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon: '<rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 18v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('voicerec.tab', undefined, '녹음'),
        build: function (container: HTMLElement): void {
          void loadNamespace('voicerec').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          const esc = (v: string): string =>
            v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          container.innerHTML = `
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="vrStart">${esc(t('voicerec.btn.start'))}</button>
              <button class="btn btn-ghost" id="vrStop" disabled>${esc(t('voicerec.btn.stop'))}</button>
              <button class="btn btn-ghost" id="vrSave" disabled>${esc(t('voicerec.btn.save'))}</button>
              <select id="vrFormat" aria-label="${esc(t('voicerec.aria.format'))}">
                <option value="mp3">${esc(t('voicerec.format.mp3'))}</option>
                <option value="wav">${esc(t('voicerec.format.wav'))}</option>
              </select>
            </div>

            <div class="tool-display" id="vrClock">0:00</div>
            <canvas id="vrMeter" height="72" style="width:100%; height:72px; border-radius:8px; background:var(--surface-2, #1a1a1a); display:block;"></canvas>

            <div class="cc-stats" id="vrStats"></div>

            <div id="vrResult" style="display:none; margin-top:var(--space-lg);">
              <div id="vrAiPanel" style="display:none; margin-top:var(--space-md);">
                <button class="btn btn-ghost" id="vrAiBtn" type="button"></button>
                <div class="tool-status" id="vrAiSay"></div>
                <textarea id="vrAiText" class="tool-input" rows="5" readonly aria-label="받아쓴 글"
                  style="display:none; margin-top:var(--space-sm);"></textarea>
                <button class="btn btn-ghost" id="vrAiSrt" type="button"
                  style="display:none; margin-top:var(--space-xs);">자막(SRT)으로 복사</button>
              </div>
              <div class="tool-sublabel">${esc(t('voicerec.label.result'))}</div>
              <audio id="vrPreview" controls style="width:100%;"></audio>
            </div>

            <div class="tool-status" id="vrStatus">${esc(t('voicerec.status.idle'))}</div>
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

          /*
           * 로컬 전사 (해자④ 파일럿). **키 없이, 소리를 밖으로 안 내보내고** 글자를 얻는다.
           *
           * 철칙은 하나 — 이 자리가 없어도 녹음기는 그대로 돌아야 한다. 그래서 WebGPU 가 없으면
           * 자리 자체를 안 보여 준다(오류 X). 모델은 「AI 켜기」를 누른 뒤에만 받는다.
           */
          let gate: AiGate | null = null;

          const aiSay = (msg: string, tone = ''): void => {
            const el = container.querySelector('#vrAiSay') as HTMLElement | null;
            if (el === null) return;
            el.textContent = msg;
            el.className = `tool-status${tone === '' ? '' : ' ' + tone}`;
          };

          function showAi(): void {
            const panel = container.querySelector('#vrAiPanel') as HTMLElement | null;
            if (panel === null) return;
            if (webgpuAvailable() === false) return; // 못 하는 자리에서는 아예 안 보여 준다
            panel.style.display = '';
            const btn = container.querySelector('#vrAiBtn') as HTMLButtonElement;
            btn.textContent = '음성을 글자로 (AI 켜기)';
            aiSay(`${MODEL_SIZE_MB}MB 를 한 번 받으면 그다음부터는 바로 됩니다. 소리는 기기 밖으로 안 나갑니다.`);
          }

          async function runTranscribe(): Promise<void> {
            if (recorded === null) return;
            const btn = container.querySelector('#vrAiBtn') as HTMLButtonElement;
            const out = container.querySelector('#vrAiText') as HTMLTextAreaElement;
            const srtBtn = container.querySelector('#vrAiSrt') as HTMLButtonElement;
            btn.disabled = true;

            gate ??= new AiGate({
              sizeMb: MODEL_SIZE_MB,
              fetch: async (onProgress) => {
                const engine = await loadEngine();
                /* 이미 디코드된 소리라 다시 풀 필요가 없다 — 그대로 16kHz 단일채널로만 맞춘다. */
                const audio = await toModelAudio(new ArrayBuffer(0), async () => recorded as AudioBuffer);
                const result = await transcribe(engine, audio, { language: 'korean', onProgress });
                out.value = result.text === '' ? '(말소리를 못 알아들었습니다)' : result.text;
                out.style.display = '';
                const srt = toSrt(result);
                srtBtn.style.display = srt === '' ? 'none' : '';
                srtBtn.onclick = () => void Toolbox.copyText?.(srt, { message: '자막을 복사했어요 — 자막 도구에 붙여 넣으세요' });
              },
              onChange: (v) => aiSay(v.say, v.state === 'failed' ? 'error' : '')
            });

            const ok = await gate.accept();
            btn.disabled = false;
            btn.textContent = ok ? '다시 글자로' : '음성을 글자로 (AI 켜기)';
          }
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
              say(t('voicerec.err.unsupported'), 'error');
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
              say(t('voicerec.err.denied'), 'error');
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
            say(t('voicerec.say.recording'), 'ok');

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
              say(t('voicerec.err.empty'), 'error');
              return;
            }
            recorded = buffer;
            wav = toWav(buffer); // 미리 듣기는 손실 없는 쪽으로 들려준다
            preview.src = URL.createObjectURL(wav);
            $<HTMLElement>('#vrResult').style.display = '';
            showAi();
            saveBtn.disabled = false;
            clock.textContent = mmss(buffer.duration);
            stats.innerHTML =
              stat(t('voicerec.stat.length'), mmss(buffer.duration), true) +
              stat(t('voicerec.stat.size'), size(wav.size)) +
              stat(t('voicerec.stat.peak'), `${Math.round(peak * 100)}%`);

            // 소리가 거의 안 들어왔으면 그냥 저장 성공이라고 하면 안 된다 — 사용자는 나중에야 안다
            if (peak < 0.02) {
              say(t('voicerec.say.silent', { len: mmss(seconds) }), 'error');
            } else if (peak > 0.99) {
              say(t('voicerec.say.clipped', { len: mmss(buffer.duration) }));
            } else {
              say(t('voicerec.say.done', { len: mmss(buffer.duration), size: size(wav.size) }), 'ok');
            }
            Toolbox.trackUse?.('record');
          }

          (container.querySelector('#vrAiBtn') as HTMLButtonElement).onclick = () => void runTranscribe();
          startBtn.onclick = () => {
            void start().catch((err: Error) => {
              cleanup();
              say(t('voicerec.err.record', { msg: err.message }), 'error');
            });
          };
          stopBtn.onclick = () => {
            if (recorder && recorder.state !== 'inactive') recorder.stop();
            recorder = null;
          };
          saveBtn.onclick = () => {
            if (!recorded) return;
            const format = $<HTMLSelectElement>('#vrFormat').value as 'wav' | 'mp3';
            say(format === 'mp3' ? t('voicerec.say.encoding') : t('voicerec.say.saving'));
            void encodeAudio(recorded, format)
              .then((blob) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
                a.download = `${t('voicerec.file.name')}-${stamp}.${format}`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                say(t('voicerec.say.saved', { size: size(blob.size) }), 'ok');
              })
              .catch((err: Error) => say(t('voicerec.err.encode', { msg: err.message }), 'error'));
          };
  }
})();
