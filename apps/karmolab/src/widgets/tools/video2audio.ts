/**
 * 영상에서 소리만 뽑기 (TASK-KL-088)
 *
 * 강의나 인터뷰를 소리만 남기고 싶을 때, 대개 영상을 통째로 남의 서버에 올린다.
 * 브라우저는 이미 영상 파일의 소리를 해독할 수 있으니 올릴 이유가 없다.
 *
 * 주의: 브라우저가 해독하지 못하는 코덱이 있다(특히 일부 mkv·avi). 그때는 실패를 숨기지 않고
 * 어떤 파일이 되는지 알려 준다 — 「아무 일도 안 일어남」이 제일 나쁜 결과다.
 */
import { encodeAudio, fileSize as size, mmss } from './shared/media';
import { acceptPastedFiles } from './shared/paste';

(function (): void {
  Toolbox.register({
    id: 'video2audio',
    // 다른 도구가 만든 것을 그대로 받는다 (TASK-KL-133)
    accepts: ['video/*'],
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

            <div class="field-group" style="margin-top:var(--space-lg);">
              <label class="field-label" for="vaFormat">저장 형식</label>
              <select id="vaFormat">
                <option value="mp3">MP3 — 작아서 보내기 좋음</option>
                <option value="wav">WAV — 품질 손실 없음, 용량 큼</option>
              </select>
            </div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="vaRun">소리만 뽑아 받기</button>
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

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다. */
          {
            const handed = Toolbox.takeResult?.();
            if (handed && handed.blob && (handed.blob.type.startsWith('video/'))) {
              void decode(new File([handed.blob], handed.name || '넘겨받은', { type: handed.blob.type }));
            }
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
            if (f) void decode(f);
          });
          // 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { void decode(files[0]); }, (f) => f.type.startsWith('video/'));

          $<HTMLButtonElement>('#vaRun').onclick = () => {
            if (!buffer || !file) {
              say('영상을 먼저 넣어 주세요.', 'error');
              return;
            }
            const format = $<HTMLSelectElement>('#vaFormat').value as 'wav' | 'mp3';
            const held = buffer;
            const name = file.name;
            say(format === 'mp3' ? 'MP3 로 만드는 중…' : '음원으로 만드는 중…');
            void encodeAudio(held, format)
              .then((blob) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = name.replace(/\.[^.]+$/, '') + '.' + format;
                a.click();
                // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
                Toolbox.offerNext?.(status, { blob: blob, name: a.download, from: 'video2audio' });
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                say(`${mmss(held.duration)} · ${size(blob.size)} 로 받았어요.`, 'ok');
                Toolbox.trackUse?.('extract');
              })
              .catch((err: Error) => say('만드는 중 문제가 생겼어요: ' + err.message, 'error'));
          };
        }
      }
    ]
  });
})();
