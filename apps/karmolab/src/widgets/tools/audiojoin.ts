/**
 * 오디오 이어붙이기 (TASK-KL-088)
 *
 * 여러 음원을 하나로 잇는 일은 단순해 보이지만 **표본율과 채널 수가 제각각**이면
 * 그대로 이어 붙일 수 없다 — 44.1kHz 와 48kHz 를 섞으면 뒤쪽이 빨라지거나 느려진다.
 * 가장 높은 표본율에 맞추고 채널도 통일한 뒤 잇는다. 사이에 무음을 넣는 선택지도 둔다.
 */
import { encodeAudio, fileSize as size, mmss } from './shared/media';

(function (): void {
  Toolbox.register({
    id: 'audiojoin',
    title: '오디오 이어붙이기',
    category: 'tool',
    desc: '여러 음원을 하나로 잇습니다. 표본율이 달라도 맞춰서 이어 줍니다',
    layout: 'wide',
    icon: '<path d="M4 12h3l2-4 2 8 2-6 2 4h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 4v3M12 17v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.5"/>',
    tabs: [
      {
        id: 'app',
        label: '이어붙이기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="ajDrop">
              <input type="file" id="ajFile" accept="audio/*" multiple hidden>
              음원 파일을 끌어다 놓거나 눌러서 고르세요 (여러 개 · 넣은 순서대로 이어집니다)
            </div>

            <div class="tool-list" id="ajList" style="margin-top:var(--space-lg);"></div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <div class="tool-sublabel">사이 무음 <span id="ajGapVal" class="range-value">0.0초</span></div>
              <input type="range" id="ajGap" aria-label="사이 무음" min="0" max="30" value="0">
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="ajFade" checked> 이음매 페이드 (딸깍 소리 방지)</label>
              </div>
            </div>

            <div class="cc-stats" id="ajStats"></div>
            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="ajRun">이어붙여 내려받기</button>
              <select id="ajFormat" aria-label="저장 형식"><option value="mp3">MP3 — 작음</option><option value="wav">WAV — 손실 없음</option></select>
              <button class="btn btn-ghost" id="ajClear">비우기</button>
            </div>
            <div class="tool-status" id="ajStatus">표본율이 다르면 가장 높은 쪽에 맞춰 이어 줍니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#ajDrop');
          const fileInput = $<HTMLInputElement>('#ajFile');
          const listEl = $<HTMLElement>('#ajList');
          const stats = $<HTMLElement>('#ajStats');
          const status = $<HTMLElement>('#ajStatus');
          const gap = $<HTMLInputElement>('#ajGap');
          let items: Array<{ name: string; buffer: AudioBuffer }> = [];

          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function render(): void {
            listEl.innerHTML = items
              .map(
                (it, i) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${i + 1}번째</span><span class="tool-list-val">${esc(it.name)} <span class="tool-list-dim">${mmss(it.buffer.duration)} · ${(it.buffer.sampleRate / 1000).toFixed(1)}kHz · ${it.buffer.numberOfChannels === 1 ? '모노' : '스테레오'}</span></span></div>`
              )
              .join('');
            if (!items.length) {
              stats.innerHTML = '';
              return;
            }
            const gapSec = parseInt(gap.value, 10) / 10;
            const total = items.reduce((a, i) => a + i.buffer.duration, 0) + gapSec * Math.max(0, items.length - 1);
            const rates = [...new Set(items.map((i) => i.buffer.sampleRate))];
            stats.innerHTML =
              stat('이어진 길이', mmss(total), true) +
              stat('파일 수', `${items.length}개`) +
              stat('표본율', rates.length > 1 ? `${rates.length}종 → ${Math.max(...rates) / 1000}kHz 로 맞춤` : `${rates[0] / 1000}kHz`);
          }

          async function add(list: FileList | File[]): Promise<void> {
            const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            const ctx = new AC();
            for (const f of Array.from(list)) {
              if (!f.type.startsWith('audio/')) continue;
              try {
                items.push({ name: f.name, buffer: await ctx.decodeAudioData(await f.arrayBuffer()) });
              } catch {
                say(`${f.name} 은 브라우저가 열지 못했어요.`, 'error');
              }
            }
            void ctx.close();
            render();
            if (items.length) say(`${items.length}개 · 넣은 순서대로 이어집니다.`, 'ok');
            Toolbox.trackUse?.('add');
          }

          /** 표본율이 다르면 그대로 이으면 안 된다 — 가장 높은 쪽 기준으로 다시 표본을 찍는다. */
          function resample(src: AudioBuffer, rate: number, ch: number, ctx: AudioContext): AudioBuffer {
            if (src.sampleRate === rate && src.numberOfChannels === ch) return src;
            const len = Math.round(src.duration * rate);
            const out = ctx.createBuffer(ch, len, rate);
            for (let c = 0; c < ch; c++) {
              const from = src.getChannelData(Math.min(c, src.numberOfChannels - 1));
              const to = out.getChannelData(c);
              const ratio = src.sampleRate / rate;
              for (let i = 0; i < len; i++) {
                const pos = i * ratio;
                const i0 = Math.floor(pos);
                const frac = pos - i0;
                // 이웃 두 표본을 섞는다 (그냥 가까운 값을 집으면 쇳소리가 난다)
                to[i] = (from[i0] || 0) * (1 - frac) + (from[i0 + 1] || 0) * frac;
              }
            }
            return out;
          }

          /**
           * 표본을 하나하나 옮기는 일이라 긴 음원 여러 개면 수억 번이 된다.
           * 한 번에 돌면 그동안 화면이 통째로 멈춰 「먹통이 됐나」 싶어지므로,
           * **파일 하나를 옮길 때마다** 숨 쉴 틈을 주고 어디까지 왔는지 알려 준다.
           */
          async function join(): Promise<AudioBuffer | null> {
            if (!items.length) return null;
            const rate = Math.max(...items.map((i) => i.buffer.sampleRate));
            const ch = Math.max(...items.map((i) => i.buffer.numberOfChannels));
            const gapLen = Math.round((parseInt(gap.value, 10) / 10) * rate);
            const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            const ctx = new AC();
            const parts: AudioBuffer[] = [];
            for (let i = 0; i < items.length; i++) {
              say(`맞추는 중… ${i + 1}/${items.length}`);
              await new Promise((r) => setTimeout(r, 0));
              parts.push(resample(items[i].buffer, rate, ch, ctx));
            }
            const total = parts.reduce((a, b) => a + b.length, 0) + gapLen * (parts.length - 1);
            const out = ctx.createBuffer(ch, total, rate);
            const fade = $<HTMLInputElement>('#ajFade').checked ? Math.floor(rate * 0.02) : 0;
            let off = 0;
            for (let pi = 0; pi < parts.length; pi++) {
              const part = parts[pi];
              say(`잇는 중… ${pi + 1}/${parts.length}`);
              await new Promise((r) => setTimeout(r, 0));
              for (let c = 0; c < ch; c++) {
                const from = part.getChannelData(c);
                const to = out.getChannelData(c);
                for (let i = 0; i < part.length; i++) {
                  let v = from[i];
                  if (fade) {
                    if (i < fade) v *= i / fade;
                    else if (i > part.length - fade) v *= (part.length - i) / fade;
                  }
                  to[off + i] = v;
                }
              }
              off += part.length + (pi < parts.length - 1 ? gapLen : 0);
            }
            void ctx.close();
            return out;
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files) void add(fileInput.files);
          };
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            if (e.dataTransfer?.files) void add(e.dataTransfer.files);
          });
          gap.addEventListener('input', () => {
            $<HTMLElement>('#ajGapVal').textContent = (parseInt(gap.value, 10) / 10).toFixed(1) + '초';
            render();
          });
          $<HTMLButtonElement>('#ajRun').onclick = () => {
            void (async () => {
            const out = await join();
            if (!out) {
              say('음원을 먼저 넣어 주세요.', 'error');
              return;
            }
            const format = $<HTMLSelectElement>('#ajFormat').value as 'wav' | 'mp3';
            say(format === 'mp3' ? 'MP3 로 만드는 중…' : '내려받는 중…');
            void encodeAudio(out, format)
              .then((blob) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = '이어붙인-음원.' + format;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                say(`${mmss(out.duration)} · ${size(blob.size)} 로 이어 내려받았어요.`, 'ok');
                Toolbox.trackUse?.('join');
              })
              .catch((err: Error) => say('만드는 중 문제가 생겼어요: ' + err.message, 'error'));
            })().catch((err: Error) => say('잇는 중 문제가 생겼어요: ' + err.message, 'error'));
          };
          $<HTMLButtonElement>('#ajClear').onclick = () => {
            items = [];
            render();
            say('비웠어요.');
          };
        }
      }
    ]
  });
})();
