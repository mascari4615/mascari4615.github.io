/**
 * 오디오 자르기 (TASK-KL-088)
 *
 * 벨소리나 인용 구간을 만들려고 음원을 사이트에 올리면 저작물이 남의 서버에 남는다.
 * 브라우저는 이미 오디오를 해독할 수 있으므로(Web Audio) 잘라 내는 일은 밖으로 나갈 필요가 없다.
 * 내보내기는 MP3(작아서 보내기 좋음)와 WAV(손실 없음) 중 고른다. MP3 압축기는 그때만 받아 온다.
 */
import { encodeAudio, fileSize as size, mmss } from './shared/media';
import { acceptPastedFiles } from './shared/paste';

(function (): void {
  Toolbox.register({
    id: 'audiocut',
    title: '오디오 자르기',
    category: 'tool',
    desc: '음원의 원하는 구간만 잘라 냅니다. 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M3 12h2l2-5 3 12 3-16 3 14 2-5h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '오디오',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="acDrop" role="button" tabindex="0">
              <input type="file" id="acFile" accept="audio/*" hidden>
              음원 파일을 끌어다 놓거나 눌러서 고르세요
            </div>

            <div id="acPanel" style="display:none; margin-top:var(--space-lg);">
              <audio id="acPlayer" controls style="width:100%; margin-bottom:var(--space-md);"></audio>
              <canvas id="acWave" class="ac-wave"></canvas>

              <div class="field-group" style="margin-top:var(--space-md);">
                <div class="tool-grid-2">
                  <div>
                    <div class="tool-sublabel">시작 <span id="acStartVal" class="range-value">0:00</span></div>
                    <input type="range" id="acStart" aria-label="시작 지점" min="0" max="100" value="0" step="0.1">
                  </div>
                  <div>
                    <div class="tool-sublabel">끝 <span id="acEndVal" class="range-value">0:00</span></div>
                    <input type="range" id="acEnd" aria-label="끝 지점" min="0" max="100" value="100" step="0.1">
                  </div>
                </div>
                <div class="tool-chips" style="margin-top:10px;">
                  <label class="tool-chip"><input type="checkbox" id="acFade" checked> 앞뒤 0.05초 페이드 (딸깍 소리 방지)</label>
                </div>
              </div>

              <div class="cc-stats" id="acStats"></div>
              <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
                <button class="btn btn-ghost" id="acPreview">구간 듣기</button>
                <button class="btn btn-primary" id="acSave">잘라서 내려받기</button>
                <select id="acFormat" aria-label="저장 형식"><option value="mp3">MP3 — 작음</option><option value="wav">WAV — 손실 없음</option></select>
              </div>
            </div>

            <div class="tool-status" id="acStatus">파일은 브라우저 안에서만 다뤄지고 어디로도 올라가지 않습니다.</div>
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
          let fileName = 'audio';

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          /** 파형은 최댓값만 훑어 그린다 — 전 샘플을 그리면 긴 곡에서 멈춘다. */
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
                if (v > peak) peak = v;
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
            if (s > e) [s, e] = [e, s];
            return [s, e];
          }

          function refresh(): void {
            if (!buffer) return;
            const [s, e] = times();
            $<HTMLElement>('#acStartVal').textContent = mmss(s);
            $<HTMLElement>('#acEndVal').textContent = mmss(e);
            stats.innerHTML =
              stat('고른 길이', mmss(e - s), true) +
              stat('전체 길이', mmss(buffer.duration)) +
              stat('표본율', `${(buffer.sampleRate / 1000).toFixed(1)} kHz`) +
              stat('채널', buffer.numberOfChannels === 1 ? '모노' : '스테레오');
            drawWave();
          }

          async function load(file: File): Promise<void> {
            say('음원을 여는 중…');
            fileName = file.name.replace(/\.[^.]+$/, '');
            try {
              const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
              const ctx = new AC();
              buffer = await ctx.decodeAudioData(await file.arrayBuffer());
              void ctx.close();
            } catch {
              say('이 형식은 브라우저가 열지 못해요. MP3·WAV·M4A 를 써 보세요.', 'error');
              return;
            }
            player.src = URL.createObjectURL(file);
            panel.style.display = '';
            startEl.value = '0';
            endEl.value = '100';
            refresh();
            say(`${mmss(buffer.duration)} 음원을 열었어요. 구간을 정하고 내려받으세요.`, 'ok');
            Toolbox.trackUse?.('open');
          }

          function slice(): AudioBuffer | null {
            if (!buffer) return null;
            const [s, e] = times();
            const rate = buffer.sampleRate;
            const from = Math.floor(s * rate);
            const len = Math.max(1, Math.floor((e - s) * rate));
            const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            const ctx = new AC();
            const out = ctx.createBuffer(buffer.numberOfChannels, len, rate);
            const fade = $<HTMLInputElement>('#acFade').checked ? Math.floor(rate * 0.05) : 0;
            for (let c = 0; c < buffer.numberOfChannels; c++) {
              const src = buffer.getChannelData(c);
              const dst = out.getChannelData(c);
              for (let i = 0; i < len; i++) {
                let v = src[from + i] || 0;
                // 자른 자리에서 파형이 뚝 끊기면 딸깍 소리가 난다 — 앞뒤를 짧게 눕힌다
                if (fade) {
                  if (i < fade) v *= i / fade;
                  else if (i > len - fade) v *= (len - i) / fade;
                }
                dst[i] = v;
              }
            }
            void ctx.close();
            return out;
          }

          drop.onclick = () => fileInput.click();
          // 파일 고르는 칸은 감춰 두고 이 상자를 누르게 되어 있다. 마우스가 없으면 길이 막히므로
          // 키보드에서도 열리게 한다 (TASK-KL-089).
          drop.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInput.click();
            }
          });
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) void load(fileInput.files[0]);
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
            if (f) void load(f);
          });
          // 캡처나 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { void load(files[0]); }, (f) => f.type.startsWith('audio/'));
          [startEl, endEl].forEach((el) => el.addEventListener('input', refresh));

          $<HTMLButtonElement>('#acPreview').onclick = () => {
            const [s, e] = times();
            player.currentTime = s;
            void player.play();
            const stop = (): void => {
              if (player.currentTime >= e) {
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
            say(format === 'mp3' ? 'MP3 로 만드는 중…' : '내려받는 중…');
            void encodeAudio(out, format)
              .then((blob) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${fileName}-자름.${format}`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                say(`${mmss(out.duration)} 구간을 ${size(blob.size)} 로 내려받았어요.`, 'ok');
                Toolbox.trackUse?.('cut');
              })
              .catch((err: Error) => say('만드는 중 문제가 생겼어요: ' + err.message, 'error'));
          };

          window.addEventListener('resize', drawWave);
        }
      }
    ]
  });
})();
