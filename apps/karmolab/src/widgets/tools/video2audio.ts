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
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'video2audio',
    // 다른 도구가 만든 것을 그대로 받는다 (TASK-KL-133)
    accepts: ['video/*'],
    title: t('widgets.video2audio.title', undefined, "영상에서 소리 추출"),
    category: 'tool',
    desc: t('widgets-desc.video2audio.desc', undefined, "영상 파일의 소리만 뽑아 음원으로 받습니다. 파일이 브라우저를 벗어나지 않습니다"),
    layout: 'wide',
    icon: '<rect x="3" y="5" width="13" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M16 10l5-3v10l-5-3z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M7 14c0-2 1.5-3 2.5-3s2.5 1 2.5 3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('video2audio.tab', undefined, "소리 추출"),
        build: function (container: HTMLElement): void {
          void loadNamespace('video2audio').then(function () {

          container.innerHTML = `
            <div class="tool-drop" id="vaDrop">
              <input type="file" id="vaFile" accept="video/*" hidden>
              ${esc(t('video2audio.drop'))}
            </div>

            <div class="cc-stats" id="vaStats"></div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <label class="field-label" for="vaFormat">${esc(t('video2audio.label.format'))}</label>
              <select id="vaFormat">
                <option value="mp3">${esc(t('video2audio.format.mp3'))}</option>
                <option value="wav">${esc(t('video2audio.format.wav'))}</option>
              </select>
            </div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="vaRun">${esc(t('video2audio.btn.run'))}</button>
            </div>
            <div class="tool-status" id="vaStatus">${esc(t('video2audio.status.idle'))}</div>
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
            say(t('video2audio.say.looking', { name: f.name, size: size(f.size) }));
            const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            const ctx = new AC();
            try {
              buffer = await ctx.decodeAudioData(await f.arrayBuffer());
            } catch {
              // 코덱을 브라우저가 모르면 여기로 온다. 무엇이 되는지 알려 줘야 다음 행동이 생긴다.
              say(t('video2audio.err.decode'), 'error');
              void ctx.close();
              return;
            }
            void ctx.close();
            stats.innerHTML =
              stat(t('video2audio.stat.length'), mmss(buffer.duration), true) +
              stat(t('video2audio.stat.rate'), `${(buffer.sampleRate / 1000).toFixed(1)}kHz`) +
              stat(t('video2audio.stat.channels'), buffer.numberOfChannels === 1 ? t('video2audio.value.mono') : t('video2audio.value.stereo'));
            say(t('video2audio.say.found'), 'ok');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) void decode(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다. */
          {
              Toolbox.onHandoff?.('video2audio', (f: File) => void decode(f));
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
          acceptPastedFiles(container, (files) => { void decode(files[0]); }, (f: File) => f.type.startsWith('video/'));

          $<HTMLButtonElement>('#vaRun').onclick = () => {
            if (!buffer || !file) {
              say(t('video2audio.err.noFile'), 'error');
              return;
            }
            const format = $<HTMLSelectElement>('#vaFormat').value as 'wav' | 'mp3';
            const held = buffer;
            const name = file.name;
            say(format === 'mp3' ? t('video2audio.say.encoding') : t('video2audio.say.making'));
            void encodeAudio(held, format)
              .then((blob) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = name.replace(/\.[^.]+$/, '') + '.' + format;
                a.click();
                // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
                Toolbox.offerNext?.(status, { blob: blob, name: a.download, from: 'video2audio' });
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                say(t('video2audio.say.done', { len: mmss(held.duration), size: size(blob.size) }), 'ok');
                Toolbox.trackUse?.('extract');
              })
              .catch((err: Error) => say(t('video2audio.err.run') + err.message, 'error'));
          };
                  });
        }
      }
    ]
  });
})();
