/**
 * 소리 속도 바꾸기 (TASK-KL-088)
 *
 * 강의 녹음이나 회의록을 1.5배로 줄여 듣는 일은 흔하다. 그런데 그냥 빨리 돌리면 **목소리가
 * 변한다** — 다람쥐 소리가 되면 오래 못 듣는다. 그건 소리를 통째로 늘였다 줄이는 방식이라
 * 높이(음정)까지 같이 바뀌기 때문이다.
 *
 * 그래서 기본은 **목소리를 그대로 두고 길이만 바꾼다.** 소리를 짧은 조각으로 잘라, 겹치는
 * 부분을 부드럽게 이어 붙이며 조각 사이의 간격만 조절한다(겹쳐 잇기). 높이는 건드리지 않는다.
 * 「그냥 빠르게」도 남겨 뒀다 — 효과음이나 배속 감상용으로 일부러 쓰는 사람이 있다.
 */
import { encodeAudio, fileSize as size, mmss } from './shared/media';

(function (): void {
  /**
   * 겹쳐 잇기(overlap-add) — 조각을 잘라 겹치는 자리를 서로 녹여 붙인다.
   * 조각을 그냥 이어 붙이면 이음매마다 「딱딱」 소리가 난다. 그래서 겹치는 구간에서
   * 앞 조각은 서서히 줄이고 뒤 조각은 서서히 키워 서로 넘겨 준다.
   */
  function stretch(input: Float32Array, rate: number, sampleRate: number): Float32Array<ArrayBuffer> {
    // 속도가 1이면 그대로지만, 채널로 넘기려면 자기 버퍼를 가진 사본이어야 한다
    if (Math.abs(rate - 1) < 0.001) return input.slice();
    const grain = Math.round(sampleRate * 0.06); // 60ms — 말소리에 무난한 조각 길이
    const overlap = Math.round(grain / 2);
    const hop = grain - overlap; // 결과에서 조각이 나아가는 폭
    const inHop = Math.round(hop * rate); // 원본에서 읽어 나아가는 폭 — 여기서 길이가 바뀐다
    const outLen = Math.max(1, Math.floor(input.length / rate) + grain);
    const out = new Float32Array(outLen);
    const win = new Float32Array(overlap);
    for (let i = 0; i < overlap; i++) win[i] = i / overlap;

    let readAt = 0;
    let writeAt = 0;
    while (readAt + grain < input.length && writeAt + grain < outLen) {
      for (let i = 0; i < grain; i++) {
        const s = input[readAt + i];
        if (i < overlap) {
          // 겹치는 앞부분 — 이미 쓰인 앞 조각과 서로 넘겨받는다
          out[writeAt + i] = out[writeAt + i] * (1 - win[i]) + s * win[i];
        } else {
          out[writeAt + i] = s;
        }
      }
      readAt += inHop;
      writeAt += hop;
    }
    // slice 로 새 배열을 준다 — subarray 는 원본 버퍼에 묶여 있어 나중에 채널로 못 넘긴다
    return out.slice(0, Math.max(1, writeAt + overlap));
  }

  /** 그냥 빨리 돌리기 — 높이까지 같이 바뀐다 (일부러 쓰는 사람이 있다) */
  function resample(input: Float32Array, rate: number): Float32Array<ArrayBuffer> {
    const outLen = Math.max(1, Math.floor(input.length / rate));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const at = i * rate;
      const i0 = Math.floor(at);
      const f = at - i0;
      out[i] = (input[i0] || 0) * (1 - f) + (input[i0 + 1] || 0) * f;
    }
    return out;
  }

  Toolbox.register({
    id: 'audiospeed',
    // 다른 도구가 만든 것을 그대로 받는다 (TASK-KL-133)
    accepts: ['audio/*', 'video/*'],
    title: '소리 속도',
    category: 'tool',
    desc: '녹음을 빠르게·느리게 만듭니다. 목소리는 그대로 두고 길이만 바꿉니다',
    layout: 'wide',
    icon: '<path d="M4 9v6h4l5 4V5L8 9H4z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M16 8l4 4-4 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '속도 바꾸기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="asDrop">
              <input type="file" id="asFile" accept="audio/*,video/*" hidden>
              <span>소리 파일을 끌어다 놓거나 눌러서 고르세요 — 영상에서 소리만 뽑아도 됩니다</span>
            </div>

            <div class="field-group" id="asControls" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-sublabel">속도 <span id="asRateVal" class="range-value">1.5배</span></div>
              <input type="range" id="asRate" aria-label="속도" min="0.5" max="3" step="0.05" value="1.5">
              <div class="tool-chips" style="margin-top:10px;">
                <button type="button" class="tool-chip" data-preset="0.75">0.75배 — 받아쓰기</button>
                <button type="button" class="tool-chip active" data-preset="1.5">1.5배</button>
                <button type="button" class="tool-chip" data-preset="2">2배</button>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="asKeep" checked> 목소리 그대로 (권장)</label>
              </div>
            </div>

            <div class="cc-stats" id="asStats"></div>

            <audio id="asPlay" controls style="width:100%; display:none; margin-bottom:var(--space-lg);"></audio>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="asRun" disabled>바꾸기</button>
              <button class="btn btn-ghost" id="asSave" disabled>내려받기</button>
            </div>

            <div class="tool-status" id="asStatus">소리는 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const rateEl = $<HTMLInputElement>('#asRate');
          const status = $<HTMLElement>('#asStatus');
          const stats = $<HTMLElement>('#asStats');
          const player = $<HTMLAudioElement>('#asPlay');
          const runBtn = $<HTMLButtonElement>('#asRun');
          const saveBtn = $<HTMLButtonElement>('#asSave');

          let buffer: AudioBuffer | null = null;
          let outBlob: Blob | null = null;
          let baseName = '소리';

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function showStats(): void {
            if (!buffer) return;
            const rate = parseFloat(rateEl.value);
            const after = buffer.duration / rate;
            stats.innerHTML =
              stat('바뀐 뒤 길이', mmss(after), true) +
              stat('원래 길이', mmss(buffer.duration)) +
              stat('줄어드는 시간', mmss(Math.abs(buffer.duration - after)));
          }

          async function load(file: File): Promise<void> {
            say('소리를 읽는 중…');
            const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const ctx = new AC();
            try {
              buffer = await ctx.decodeAudioData(await file.arrayBuffer());
            } catch {
              say('이 파일에서 소리를 읽지 못했어요. 다른 형식으로 해 보세요.', 'error');
              void ctx.close();
              return;
            }
            void ctx.close();
            baseName = (file.name || '소리').replace(/\.[^.]+$/, '');
            $<HTMLElement>('#asControls').style.display = '';
            runBtn.disabled = false;
            saveBtn.disabled = true;
            outBlob = null;
            player.style.display = 'none';
            showStats();
            say(`${mmss(buffer.duration)} 짜리 소리를 읽었어요. 속도를 고르고 바꾸기를 누르세요.`, 'ok');
          }

          async function run(): Promise<void> {
            if (!buffer) return;
            const rate = parseFloat(rateEl.value);
            const keep = $<HTMLInputElement>('#asKeep').checked;
            runBtn.disabled = true;
            say(keep ? '목소리를 지키며 바꾸는 중…' : '바꾸는 중…');
            // 화면이 멈춘 것처럼 보이지 않게 한 박자 넘긴다
            await new Promise((r) => setTimeout(r, 0));
            try {
              const chans: Float32Array<ArrayBuffer>[] = [];
              for (let c = 0; c < buffer.numberOfChannels; c++) {
                const src = buffer.getChannelData(c);
                chans.push(keep ? stretch(src, rate, buffer.sampleRate) : resample(src, rate));
              }
              const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
              const ctx = new AC();
              const outBuf = ctx.createBuffer(chans.length, chans[0].length, buffer.sampleRate);
              for (let c = 0; c < chans.length; c++) outBuf.copyToChannel(chans[c], c);
              void ctx.close();

              outBlob = await encodeAudio(outBuf, 'wav');
              player.src = URL.createObjectURL(outBlob);
              player.style.display = '';
              saveBtn.disabled = false;
              stats.innerHTML =
                stat('바뀐 뒤 길이', mmss(outBuf.length / outBuf.sampleRate), true) +
                stat('원래 길이', mmss(buffer.duration)) +
                stat('파일 크기', size(outBlob.size));
              say(
                keep
                  ? '다 됐어요. 들어 보고 마음에 들면 내려받으세요 — 목소리 높이는 그대로입니다.'
                  : '다 됐어요. 이 방식은 목소리 높이도 함께 바뀝니다.',
                'ok'
              );
              Toolbox.trackUse?.('speed');
            } catch (e) {
              say((e as Error).message || '속도를 바꾸지 못했어요.', 'error');
            } finally {
              runBtn.disabled = false;
            }
          }

          const drop = $<HTMLElement>('#asDrop');
          const fileInput = $<HTMLInputElement>('#asFile');
          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) void load(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다. */
          {
              Toolbox.onHandoff?.(['audio/*', 'video/*'], (f: File) => void load(f));
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

          rateEl.addEventListener('input', () => {
            $<HTMLElement>('#asRateVal').textContent = parseFloat(rateEl.value).toFixed(2).replace(/\.?0+$/, '') + '배';
            container.querySelectorAll('[data-preset]').forEach((c) => c.classList.remove('active'));
            showStats();
          });
          container.querySelectorAll('[data-preset]').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              rateEl.value = (chip as HTMLElement).dataset.preset as string;
              rateEl.dispatchEvent(new Event('input'));
              container.querySelectorAll('[data-preset]').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
            };
          });
          runBtn.onclick = () => void run();
          saveBtn.onclick = () => {
            if (!outBlob) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(outBlob);
            a.download = `${baseName}-${parseFloat(rateEl.value)}배.wav`;
            a.click();
            // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
            Toolbox.offerNext?.(status, { blob: outBlob, name: a.download, from: 'audiospeed' });
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say(`${size(outBlob.size)} 로 받았어요.`, 'ok');
          };
        }
      }
    ]
  });
})();
