/**
 * 영상에서 소리만 뽑기 (TASK-KL-088)
 *
 * 강의나 인터뷰를 소리만 남기고 싶을 때, 대개 영상을 통째로 남의 서버에 올린다.
 * 브라우저는 이미 영상 파일의 소리를 해독할 수 있으니 올릴 이유가 없다.
 *
 * 주의: 브라우저가 해독하지 못하는 코덱이 있다(특히 일부 mkv·avi). 그때는 실패를 숨기지 않고
 * 어떤 파일이 되는지 알려 준다 — 「아무 일도 안 일어남」이 제일 나쁜 결과다.
 */
(function (): void {
  /** AudioBuffer → WAV. 브라우저에 저장 기능이 없어 직접 엮는다. */
  function toWav(buffer: AudioBuffer): Blob {
    const numCh = buffer.numberOfChannels;
    const len = buffer.length * numCh * 2 + 44;
    const view = new DataView(new ArrayBuffer(len));
    const w = (off: number, s: string): void => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    w(0, 'RIFF');
    view.setUint32(4, len - 8, true);
    w(8, 'WAVE');
    w(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * numCh * 2, true);
    view.setUint16(32, numCh * 2, true);
    view.setUint16(34, 16, true);
    w(36, 'data');
    view.setUint32(40, len - 44, true);
    const chans: Float32Array[] = [];
    for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numCh; c++) {
        const s = Math.max(-1, Math.min(1, chans[c][i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  const size = (n: number): string =>
    n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n >= 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`;

  const mmss = (sec: number): string => {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  Toolbox.register({
    id: 'video2audio',
    title: '영상에서 소리 추출',
    category: 'tool',
    desc: '영상 파일의 소리만 뽑아 음원으로 받습니다. 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="13" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M16 10l5-3v10l-5-3z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M7 14c0-2 1.5-3 2.5-3s2.5 1 2.5 3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '소리 추출',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="vaDrop">
              <input type="file" id="vaFile" accept="video/*" hidden>
              영상을 끌어다 놓거나 눌러서 고르세요
            </div>

            <div class="cc-stats" id="vaStats"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="vaRun">소리만 뽑아 받기 (WAV)</button>
            </div>
            <div class="tool-status" id="vaStatus">영상은 브라우저 안에서만 열립니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#vaDrop');
          const fileInput = $<HTMLInputElement>('#vaFile');
          const stats = $<HTMLElement>('#vaStats');
          const status = $<HTMLElement>('#vaStatus');
          let file: File | null = null;
          let buffer: AudioBuffer | null = null;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          async function decode(f: File): Promise<void> {
            file = f;
            buffer = null;
            stats.innerHTML = '';
            say(`${f.name} · ${size(f.size)} 에서 소리를 찾는 중…`);
            const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            const ctx = new AC();
            try {
              buffer = await ctx.decodeAudioData(await f.arrayBuffer());
            } catch {
              // 코덱을 브라우저가 모르면 여기로 온다. 무엇이 되는지 알려 줘야 다음 행동이 생긴다.
              say('이 영상의 소리는 브라우저가 해독하지 못했어요. mp4·webm·mov 는 대체로 됩니다.', 'error');
              void ctx.close();
              return;
            }
            void ctx.close();
            stats.innerHTML =
              stat('길이', mmss(buffer.duration), true) +
              stat('표본율', `${(buffer.sampleRate / 1000).toFixed(1)}kHz`) +
              stat('채널', buffer.numberOfChannels === 1 ? '모노' : '스테레오');
            say(`소리를 찾았어요 — 뽑기를 누르면 음원으로 받습니다.`, 'ok');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) void decode(fileInput.files[0]);
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
            if (f) void decode(f);
          });

          $<HTMLButtonElement>('#vaRun').onclick = () => {
            if (!buffer || !file) {
              say('영상을 먼저 넣어 주세요.', 'error');
              return;
            }
            const blob = toWav(buffer);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = file.name.replace(/\.[^.]+$/, '') + '.wav';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say(`${mmss(buffer.duration)} · ${size(blob.size)} 로 받았어요.`, 'ok');
            Toolbox.trackUse?.('extract');
          };
        }
      }
    ]
  });
})();
