/**
 * 오디오 자르기 (TASK-KL-088)
 *
 * 벨소리나 인용 구간을 만들려고 음원을 사이트에 올리면 저작물이 남의 서버에 남는다.
 * 브라우저는 이미 오디오를 해독할 수 있으므로(Web Audio) 잘라 내는 일은 밖으로 나갈 필요가 없다.
 * 내보내기는 MP3(작아서 보내기 좋음)와 WAV(손실 없음) 중 고른다. MP3 압축기는 그때만 받아 온다.
 */
import { attachAudio, audioCtx, download, encodeAudio, fileSize as size, loadAudioInfo, mmss } from './shared/media';
import { escapeHtml as esc } from './shared/text';
import { statCell } from './shared/stats';
import { statusLine } from './shared/say';
import { wireDrop } from './shared/drop-well';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  Toolbox.register({
    id: 'audiocut',
    // 다른 도구가 만든 것을 그대로 받는다 (TASK-KL-133)
    accepts: ['audio/*'],
    title: t('widgets.audiocut.title', undefined, "오디오 자르기"),
    category: 'tool',
    desc: t('widgets-desc.audiocut.desc', undefined, "음원의 원하는 구간만 잘라 냅니다. 파일이 브라우저를 벗어나지 않습니다"),
    layout: 'wide',
    icon: '<path d="M3 12h2l2-5 3 12 3-16 3 14 2-5h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('audiocut.tab', undefined, "오디오"),
        build: function (container: HTMLElement): void {
          void loadNamespace('audiocut').then(function () {

          container.innerHTML = `
            <div class="tool-drop" id="acDrop" role="button" tabindex="0">
              <input type="file" id="acFile" accept="audio/*" hidden>
              ${esc(t('audiocut.drop'))}
            </div>

            <div id="acPanel" style="display:none; margin-top:var(--space-lg);">
              <audio id="acPlayer" controls style="width:100%; margin-bottom:var(--space-md);"></audio>
              <canvas id="acWave" class="ac-wave"></canvas>

              <div class="field-group" style="margin-top:var(--space-md);">
                <div class="tool-grid-2">
                  <div>
                    <div class="tool-sublabel">${esc(t('audiocut.label.start'))} <span id="acStartVal" class="range-value">0:00</span></div>
                    <input type="range" id="acStart" aria-label="${esc(t('audiocut.aria.start'))}" min="0" max="100" value="0" step="0.1">
                  </div>
                  <div>
                    <div class="tool-sublabel">${esc(t('audiocut.label.end'))} <span id="acEndVal" class="range-value">0:00</span></div>
                    <input type="range" id="acEnd" aria-label="${esc(t('audiocut.aria.end'))}" min="0" max="100" value="100" step="0.1">
                  </div>
                </div>
                <div class="tool-chips">
                  <label class="tool-chip"><input type="checkbox" id="acFade" checked> ${esc(t('audiocut.opt.fade'))}</label>
                </div>
              </div>

              <div class="cc-stats" id="acStats"></div>
              <div class="tool-actions">
                <button class="btn btn-ghost" id="acPreview">${esc(t('audiocut.btn.preview'))}</button>
                <button class="btn btn-primary" id="acSave">${esc(t('audiocut.btn.save'))}</button>
                <select id="acFormat" aria-label="${esc(t('audiocut.label.format'))}"><option value="mp3">${esc(t('audiocut.format.mp3'))}</option><option value="wav">${esc(t('audiocut.format.wav'))}</option></select>
              </div>
            </div>

            <div class="tool-status" id="acStatus">${esc(t('audiocut.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#acDrop');
          const fileInput = $<HTMLInputElement>('#acFile');
          const panel = $<HTMLElement>('#acPanel');
          const player = $<HTMLAudioElement>('#acPlayer');
          const canvas = $<HTMLCanvasElement>('#acWave');
          const startEl = $<HTMLInputElement>('#acStart');
          const endEl = $<HTMLInputElement>('#acEnd');
          const stats = $<HTMLElement>('#acStats');
          const status = $<HTMLElement>('#acStatus');
          let buffer: AudioBuffer | null = null;
          /* 파일이 원래 몇 번 잰 소리인가. 재생 장치 값(`buffer.sampleRate`)과 다르다 */
          let rate = 0;
          let fileName = 'audio';

          /* 상태 줄은 **공용 하나**를 쓴다 (TASK-KL-291). `aria-live` 가 여기 붙어 있어서
           * 화면낭독기가 다 됐습니다, 못 엽니다를 실제로 읽어 준다. */
          const say = statusLine(status);

          /** 파형은 최댓값만 훑어 그린다. 전 샘플을 그리면 긴 곡에서 멈춘다. */
          function drawWave(): void {
            if (!buffer) return;
            const w = (canvas.width = canvas.clientWidth * 2);
            const h = (canvas.height = 240);
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const data = buffer.getChannelData(0);
            const step = Math.max(1, Math.floor(data.length / w));
            ctx.clearRect(0, 0, w, h);
            const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5865F2';
            ctx.fillStyle = accent;
            for (let x = 0; x < w; x++) {
              let peak = 0;
              for (let i = 0; i < step; i++) {
                const v = Math.abs(data[x * step + i] || 0);
                if (v> peak) peak = v;
              }
              const barH = Math.max(1, peak * h * 0.9);
              ctx.globalAlpha = 0.75;
              ctx.fillRect(x, (h - barH) / 2, 1, barH);
            }
            // 고른 구간을 덮어 표시
            const s = (parseFloat(startEl.value) / 100) * w;
            const e = (parseFloat(endEl.value) / 100) * w;
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, s, h);
            ctx.fillRect(e, 0, w - e, h);
          }

          function times(): [number, number] {
            if (!buffer) return [0, 0];
            const d = buffer.duration;
            let s = (parseFloat(startEl.value) / 100) * d;
            let e = (parseFloat(endEl.value) / 100) * d;
            if (s> e) [s, e] = [e, s];
            return [s, e];
          }

          function refresh(): void {
            if (!buffer) return;
            const [s, e] = times();
            $<HTMLElement>('#acStartVal').textContent = mmss(s);
            $<HTMLElement>('#acEndVal').textContent = mmss(e);
            stats.innerHTML =
              statCell(t('audiocut.stat.picked'), mmss(e - s), true) +
              statCell(t('audiocut.stat.total'), mmss(buffer.duration)) +
              statCell(t('audiocut.stat.rate'), `${(rate / 1000).toFixed(1)} kHz`) +
              statCell(t('audiocut.stat.channels'), buffer.numberOfChannels === 1 ? t('audiocut.value.mono') : t('audiocut.value.stereo'));
            drawWave();
          }

          async function load(file: File): Promise<void> {
            say(t('audiocut.say.opening'));
            fileName = file.name.replace(/\.[^.]+$/, '');
            try {
              ({ buffer, rate } = await loadAudioInfo(file));
            } catch {
              say(t('audiocut.err.format'), 'error');
              return;
            }
            attachAudio(player, file); // 공용. 앞 주소를 거두고 물린다
            panel.style.display = '';
            startEl.value = '0';
            endEl.value = '100';
            refresh();
            say(t('audiocut.say.loaded', { len: mmss(buffer.duration) }), 'ok');
            Toolbox.trackUse?.('open');
          }

          function slice(): AudioBuffer | null {
            if (!buffer) return null;
            const [s, e] = times();
            const rate = buffer.sampleRate;
            const from = Math.floor(s * rate);
            const len = Math.max(1, Math.floor((e - s) * rate));
            const ctx = audioCtx();
            const out = ctx.createBuffer(buffer.numberOfChannels, len, rate);
            const fade = $<HTMLInputElement>('#acFade').checked ? Math.floor(rate * 0.05) : 0;
            for (let c = 0; c < buffer.numberOfChannels; c++) {
              const src = buffer.getChannelData(c);
              const dst = out.getChannelData(c);
              for (let i = 0; i < len; i++) {
                let v = src[from + i] || 0;
                // 자른 자리에서 파형이 뚝 끊기면 딸깍 소리가 난다. 앞뒤를 짧게 눕힌다
                if (fade) {
                  if (i < fade) v *= i / fade;
                  else if (i> len - fade) v *= (len - i) / fade;
                }
                dst[i] = v;
              }
            }
            return out;
          }

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다. 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다.
           * (2026-08-13: 파일 자리를 공용으로 옮기다 이 덩이를 같이 지웠다가 게이트가 잡았다.) */
          {
            Toolbox.onHandoff?.('audiocut', (f: File) => void load(f));
          }
          /* 파일 받는 자리는 **공용 하나**를 쓴다 (TASK-KL-290). 키보드로 열기, 붙여넣기가 딸려 온다. */
          wireDrop({ drop, input: fileInput, scope: container, onFiles: (files) => void load(files[0]) });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            const f = e.dataTransfer?.files?.[0];
            if (f) void load(f);
          });
          // 캡처나 파일을 바로 붙여넣는 것이 잦다
          [startEl, endEl].forEach((el) => el.addEventListener('input', refresh));

          $<HTMLButtonElement>('#acPreview').onclick = () => {
            const [s, e] = times();
            player.currentTime = s;
            void player.play();
            const stop = (): void => {
              if (player.currentTime>= e) {
                player.pause();
                player.removeEventListener('timeupdate', stop);
              }
            };
            player.addEventListener('timeupdate', stop);
          };

          $<HTMLButtonElement>('#acSave').onclick = () => {
            const out = slice();
            if (!out) return;
            const format = $<HTMLSelectElement>('#acFormat').value as 'wav' | 'mp3';
            say(format === 'mp3' ? t('audiocut.say.encoding') : t('audiocut.say.saving'));
            void encodeAudio(out, format)
              .then((blob) => {
                const aName = `${fileName}${t('audiocut.file.suffix')}.${format}`;
                download(blob, aName);
                // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133). 받을 도구가 없으면 안 생긴다.
                Toolbox.offerNext?.(status, { blob: blob, name: aName, from: 'audiocut' });
                say(t('audiocut.say.done', { len: mmss(out.duration), size: size(blob.size) }), 'ok');
                Toolbox.trackUse?.('cut');
              })
              .catch((err: Error) => say(t('audiocut.err.run') + err.message, 'error'));
          };

          window.addEventListener('resize', drawWave);
                  });
        }
      }
    ]
  });
})();
