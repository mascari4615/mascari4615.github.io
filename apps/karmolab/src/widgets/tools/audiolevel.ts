/**
 * 소리 크기 맞추기 (TASK-KL-088)
 *
 * 강의 녹음이나 회의 녹음은 「어떤 대목은 안 들리고 어떤 대목은 귀가 아픈」 상태가 되기 쉽다.
 * 볼륨을 올리는 것만으로는 안 된다 — 큰 데가 먼저 찌그러지기 때문이다.
 *
 * 그래서 두 단계로 한다:
 *  ① **고르게(압축)** — 큰 소리만 눌러 큰 데와 작은 데의 차이를 좁힌다
 *  ② **키우기(정규화)** — 그 뒤에 전체를 목표 크기까지 올린다
 * 순서가 반대면 찌그러진다. 처리 전후를 **숫자와 파형으로 나란히** 보여 주고, 귀로도 비교하게 한다.
 */
import { toWav, encodeAudio, fileSize as size, mmss } from './shared/media';
import { acceptPastedFiles } from './shared/paste';

import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /** 소리의 「체감 크기」. 순간 최대값이 아니라 평균 에너지라 사람이 느끼는 크기에 가깝다. */
  function rms(data: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / Math.max(1, data.length));
  }

  function peakOf(data: Float32Array): number {
    let p = 0;
    for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i]));
    return p;
  }

  const db = (v: number): string => (v <= 0.00001 ? '-∞' : `${(20 * Math.log10(v)).toFixed(1)}`);

  /** 파형을 그린다. 숫자만으로는 「고르게 됐다」가 안 와닿는다. */
  function drawWave(canvas: HTMLCanvasElement, data: Float32Array, color: string): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = (canvas.width = canvas.clientWidth || 600);
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, h / 2 - 0.5, w, 1);
    ctx.fillStyle = color;
    const step = Math.max(1, Math.floor(data.length / w));
    for (let x = 0; x < w; x++) {
      let max = 0;
      for (let i = x * step; i < (x + 1) * step && i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
      const bar = Math.max(1, max * h * 0.94);
      ctx.fillRect(x, (h - bar) / 2, 1, bar);
    }
  }

  Toolbox.register({
    id: 'audiolevel',
    // 다른 도구가 만든 것을 그대로 받는다 (TASK-KL-133)
    accepts: ['audio/*', 'video/*'],
    title: t('widgets.audiolevel.title', undefined, '소리 크기 맞추기'),
    category: 'tool',
    desc: t(
      'widgets-desc.audiolevel.desc',
      undefined,
      '들쭉날쭉한 녹음의 크기를 고르게 만듭니다. 전후를 파형과 숫자로 비교하고, 파일이 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon: '<path d="M4 14V10M8 17V7M12 19V5M16 16V8M20 13v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('audiolevel.tab', undefined, '크기 맞추기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('audiolevel').then(function () {
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
            <div class="tool-drop" id="alDrop">
              <input type="file" id="alFile" accept="audio/*,video/*" hidden>
              ${esc(t('audiolevel.drop'))}
            </div>

            <div id="alEditor" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-sublabel">${esc(t('audiolevel.label.before'))}</div>
              <canvas id="alBefore" height="70" style="width:100%; height:70px; border-radius:8px; background:var(--surface-2, #1a1a1a); display:block;"></canvas>
              <div class="tool-sublabel" style="margin-top:10px;">${esc(t('audiolevel.label.after'))}</div>
              <canvas id="alAfter" height="70" style="width:100%; height:70px; border-radius:8px; background:var(--surface-2, #1a1a1a); display:block;"></canvas>

              <div class="field-group" style="margin-top:var(--space-lg);">
                <div class="tool-grid-2">
                  <div>
                    <div class="tool-sublabel">${esc(t('audiolevel.label.even'))} <span id="alEvenVal" class="range-value">보통</span></div>
                    <input type="range" id="alEven" aria-label="고르게 하는 정도" min="0" max="3" step="1" value="2">
                  </div>
                  <div>
                    <div class="tool-sublabel">${esc(t('audiolevel.label.target'))} <span id="alTargetVal" class="range-value">-1.0 dB</span></div>
                    <input type="range" id="alTarget" aria-label="목표 크기" min="-12" max="-1" step="1" value="-1">
                  </div>
                </div>
              </div>

              <div class="cc-stats" id="alStats"></div>

              <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
                <button class="btn btn-primary" id="alRun">${esc(t('audiolevel.btn.run'))}</button>
                <button class="btn btn-ghost" id="alSave" disabled>${esc(t('audiolevel.btn.save'))}</button>
                <select id="alFormat" aria-label="저장 형식">
                  <option value="mp3">${esc(t('audiolevel.format.mp3'))}</option>
                  <option value="wav">${esc(t('audiolevel.format.wav'))}</option>
                </select>
              </div>

              <div id="alResult" style="display:none;">
                <div class="tool-sublabel">${esc(t('audiolevel.label.preview'))}</div>
                <audio id="alPreview" controls style="width:100%;"></audio>
              </div>
            </div>

            <div class="tool-status" id="alStatus">${esc(t('audiolevel.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#alDrop');
          const fileInput = $<HTMLInputElement>('#alFile');
          const editor = $<HTMLElement>('#alEditor');
          const stats = $<HTMLElement>('#alStats');
          const status = $<HTMLElement>('#alStatus');
          const evenEl = $<HTMLInputElement>('#alEven');
          const targetEl = $<HTMLInputElement>('#alTarget');
          const saveBtn = $<HTMLButtonElement>('#alSave');

          const EVEN: Array<[number, string]> = [
            [1, t('audiolevel.even.none')],
            [0.7, t('audiolevel.even.light')],
            [0.5, t('audiolevel.even.normal')],
            [0.32, t('audiolevel.even.strong')]
          ];

          let fileName = '';
          let source: AudioBuffer | null = null;
          let made: Blob | null = null;
          let processed: AudioBuffer | null = null;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function labels(): void {
            $<HTMLElement>('#alEvenVal').textContent = EVEN[parseInt(evenEl.value, 10)][1];
            $<HTMLElement>('#alTargetVal').textContent = `${parseFloat(targetEl.value).toFixed(1)} dB`;
          }

          async function load(f: File): Promise<void> {
            fileName = f.name;
            made = null;
            saveBtn.disabled = true;
            $<HTMLElement>('#alResult').style.display = 'none';
            say(`${f.name} · ${size(f.size)} 를 읽는 중…`);
            const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            const ctx = new AC();
            try {
              source = await ctx.decodeAudioData(await f.arrayBuffer());
            } catch {
              say(t('audiolevel.err.decode'), 'error');
              void ctx.close();
              return;
            }
            void ctx.close();
            editor.style.display = '';
            const ch0 = source.getChannelData(0);
            drawWave($<HTMLCanvasElement>('#alBefore'), ch0, '#7a8894');
            drawWave($<HTMLCanvasElement>('#alAfter'), new Float32Array(0), '#4bb3e0');
            stats.innerHTML =
              stat(t('audiolevel.stat.length'), mmss(source.duration), true) +
              stat(t('audiolevel.stat.peak'), `${db(peakOf(ch0))} dB`) +
              stat(t('audiolevel.stat.loudness'), `${db(rms(ch0))} dB`);
            say(t('audiolevel.say.ready'), 'ok');
          }

          /**
           * 큰 소리를 눌러 크고 작음의 차이를 좁힌 뒤(①) 전체를 목표까지 올린다(②).
           * 누르는 정도는 지수로 준다 — 곱셈으로 줄이면 작은 소리까지 같이 줄어 아무 소용이 없다.
           */
          async function process(buffer: AudioBuffer, ctx: AudioContext): Promise<AudioBuffer> {
            const ratio = EVEN[parseInt(evenEl.value, 10)][0];
            const target = Math.pow(10, parseFloat(targetEl.value) / 20);
            const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

            // 표본 하나하나를 만지는 일이라 1시간 녹음이면 3억 번이 넘는다. 한 번에 돌면 그동안
            // 화면이 통째로 멈춰 「먹통이 됐나」 싶어진다 — 조금씩 끊어 돌며 진행률을 보여 준다.
            const CHUNK = 2_000_000;
            const total = buffer.length * buffer.numberOfChannels * 2; // 두 번 훑는다
            let done = 0;
            const breathe = async (): Promise<void> => {
              say(`맞추는 중… ${Math.min(99, Math.round((done / total) * 100))}%`);
              await new Promise((r) => setTimeout(r, 0));
            };

            let maxAfter = 0;
            for (let c = 0; c < buffer.numberOfChannels; c++) {
              const from = buffer.getChannelData(c);
              const to = out.getChannelData(c);
              for (let i = 0; i < from.length; i++) {
                const v = from[i];
                // 부호는 그대로 두고 크기만 눌러야 소리가 뒤집히지 않는다
                const shaped = ratio === 1 ? v : Math.sign(v) * Math.pow(Math.abs(v), ratio);
                to[i] = shaped;
                const abs = shaped < 0 ? -shaped : shaped;
                if (abs > maxAfter) maxAfter = abs;
                if (++done % CHUNK === 0) await breathe();
              }
            }
            // 목표를 넘지 않도록 한 번에 맞춘다 (넘으면 찌그러진다)
            const gain = maxAfter > 0 ? target / maxAfter : 1;
            for (let c = 0; c < out.numberOfChannels; c++) {
              const to = out.getChannelData(c);
              for (let i = 0; i < to.length; i++) {
                to[i] = Math.max(-1, Math.min(1, to[i] * gain));
                if (++done % CHUNK === 0) await breathe();
              }
            }
            return out;
          }

          async function run(): Promise<void> {
            if (!source) {
              say(t('audiolevel.err.noFile'), 'error');
              return;
            }
            const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            const ctx = new AC();
            const held = source;
            const out = await process(held, ctx);
            void ctx.close();

            const before = held.getChannelData(0);
            const after = out.getChannelData(0);
            drawWave($<HTMLCanvasElement>('#alAfter'), after, '#4bb3e0');

            // 미리 듣기는 손실 없는 쪽으로. 저장 형식은 받을 때 고른다(소리 자체를 들고 있어야 한다).
            processed = out;
            made = toWav(out);
            $<HTMLAudioElement>('#alPreview').src = URL.createObjectURL(made);
            $<HTMLElement>('#alResult').style.display = '';
            saveBtn.disabled = false;

            // 「고르게 됐다」는 큰 소리와 체감 크기의 **간격이 좁아진 것**으로 재는 게 정확하다
            const spanBefore = 20 * Math.log10(peakOf(before) / Math.max(1e-6, rms(before)));
            const spanAfter = 20 * Math.log10(peakOf(after) / Math.max(1e-6, rms(after)));
            stats.innerHTML =
              stat(t('audiolevel.stat.loudness'), `${db(rms(before))} → ${db(rms(after))} dB`, true) +
              stat(t('audiolevel.stat.peak'), `${db(peakOf(before))} → ${db(peakOf(after))} dB`) +
              stat(t('audiolevel.stat.span'), `${spanBefore.toFixed(1)} → ${spanAfter.toFixed(1)} dB`) +
              stat(t('audiolevel.stat.size'), size(made.size));
            say(
              t('audiolevel.say.done', { before: spanBefore.toFixed(1), after: spanAfter.toFixed(1) }),
              'ok'
            );
            Toolbox.trackUse?.('level');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) void load(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다. */
          {
              Toolbox.onHandoff?.('audiolevel', (f: File) => void load(f));
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
            if (f) void load(f);
          });
          // 캡처나 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { void load(files[0]); }, (f: File) => f.type.startsWith('audio/') || f.type.startsWith('video/'));
          [evenEl, targetEl].forEach((el) => el.addEventListener('input', labels));
          labels();

          $<HTMLButtonElement>('#alRun').onclick = () => {
            void run().catch((err: Error) => say(t('audiolevel.err.leveling', { msg: err.message }), 'error'));
          };
          saveBtn.onclick = () => {
            if (!processed) return;
            const format = $<HTMLSelectElement>('#alFormat').value as 'wav' | 'mp3';
            const name = fileName.replace(/\.[^.]+$/, '') + t('audiolevel.file.suffix') + '.' + format;
            say(t(format === 'mp3' ? 'audiolevel.say.encoding' : 'audiolevel.say.saving'));
            void encodeAudio(processed, format)
              .then((blob) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = name;
                a.click();
                // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
                Toolbox.offerNext?.(status, { blob: blob, name: a.download, from: 'audiolevel' });
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                say(`${size(blob.size)} 로 내려받았어요.`, 'ok');
              })
              .catch((err: Error) => say(t('audiolevel.err.making', { msg: err.message }), 'error'));
          };
  }
})();
