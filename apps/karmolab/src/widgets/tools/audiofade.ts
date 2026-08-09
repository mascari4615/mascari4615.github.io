/**
 * 소리 페이드 (TASK-KL-088)
 *
 * 잘라 낸 소리를 그냥 쓰면 시작과 끝에서 「툭」 하고 끊긴다. 파형이 0 이 아닌 자리에서
 * 갑자기 끝나기 때문인데, 스피커에서는 이게 딱 소리로 들린다.
 *
 * 신경 쓴 곳:
 *  - **끊김을 먼저 짚어 준다.** 시작·끝 지점의 진폭을 재서 「여기 딱 소리가 납니다」라고 말해 주고,
 *    필요한 만큼만 페이드를 건다. 무턱대고 3초씩 걸면 짧은 소리가 뭉개진다.
 *  - 페이드 모양은 **귀에 맞춘 곡선**을 쓴다. 소리 크기를 곧게 줄이면 중간이 갑자기 조용해진 듯
 *    들린다 — 사람 귀는 소리 세기를 곧게 느끼지 않는다.
 */
import { encodeAudio, fileSize as size, mmss } from './shared/media';

import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /**
   * 귀에 맞춘 페이드 — 곧게(선형) 줄이면 중간이 툭 꺼진 듯 들린다.
   * 세기를 제곱으로 다루면 귀가 느끼는 변화가 고르게 된다.
   */
  const curve = (t: number): number => t * t;

  Toolbox.register({
    id: 'audiofade',
    // 다른 도구가 만든 것을 그대로 받는다 (TASK-KL-133)
    accepts: ['audio/*', 'video/*'],
    title: t('widgets.audiofade.title', undefined, '소리 페이드'),
    category: 'tool',
    desc: t(
      'widgets-desc.audiofade.desc',
      undefined,
      '시작·끝의 「툭」 하는 끊김을 없앱니다. 어디가 끊기는지 먼저 짚어 줍니다'
    ),
    layout: 'wide',
    icon: '<path d="M3 19L21 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3 19h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7 19v-3M11 19v-6M15 19v-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>',
    tabs: [
      {
        id: 'app',
        label: t('audiofade.tab', undefined, '페이드'),
        build: function (container: HTMLElement): void {
          void loadNamespace('audiofade').then(function () {
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
            <div class="tool-drop" id="afDrop">
              <input type="file" id="afFile" accept="audio/*,video/*" hidden>
              <span>${esc(t('audiofade.drop'))}</span>
            </div>

            <div class="field-group" id="afControls" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('audiofade.label.in'))} <span id="afInVal" class="range-value">${esc(
                    t('audiofade.value.sec', { n: '0.5' })
                  )}</span></div>
                  <input type="range" id="afIn" aria-label="${esc(t('audiofade.label.in'))}" min="0" max="50" value="5">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('audiofade.label.out'))} <span id="afOutVal" class="range-value">${esc(
                    t('audiofade.value.sec', { n: '0.5' })
                  )}</span></div>
                  <input type="range" id="afOut" aria-label="${esc(t('audiofade.label.out'))}" min="0" max="50" value="5">
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <button type="button" class="tool-chip" id="afAuto">${esc(t('audiofade.btn.auto'))}</button>
              </div>
            </div>

            <div class="tool-list" id="afFound"></div>
            <div class="cc-stats" id="afStats"></div>

            <audio id="afPlay" controls style="width:100%; display:none; margin-bottom:var(--space-lg);"></audio>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="afRun" disabled>${esc(t('audiofade.btn.run'))}</button>
              <button class="btn btn-ghost" id="afSave" disabled>${esc(t('audiofade.btn.save'))}</button>
            </div>

            <div class="tool-status" id="afStatus">${esc(t('audiofade.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const status = $<HTMLElement>('#afStatus');
          const stats = $<HTMLElement>('#afStats');
          const foundEl = $<HTMLElement>('#afFound');
          const player = $<HTMLAudioElement>('#afPlay');
          const runBtn = $<HTMLButtonElement>('#afRun');
          const saveBtn = $<HTMLButtonElement>('#afSave');

          let buffer: AudioBuffer | null = null;
          let outBlob: Blob | null = null;
          let baseName = t('audiofade.file.base');

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          /** 시작·끝 20ms 의 최대 진폭 — 0 에서 멀수록 「툭」 소리가 크다 */
          function edgeLevels(buf: AudioBuffer): { head: number; tail: number } {
            const n = Math.min(Math.round(buf.sampleRate * 0.02), Math.floor(buf.length / 2));
            let head = 0;
            let tail = 0;
            for (let c = 0; c < buf.numberOfChannels; c++) {
              const d = buf.getChannelData(c);
              for (let i = 0; i < n; i++) {
                head = Math.max(head, Math.abs(d[i]));
                tail = Math.max(tail, Math.abs(d[d.length - 1 - i]));
              }
            }
            return { head, tail };
          }

          function report(): void {
            if (!buffer) return;
            const { head, tail } = edgeLevels(buffer);
            const pct = (v: number): string => `${Math.round(v * 100)}%`;
            // 0.02 아래면 사실상 조용히 시작·끝나는 것이라 페이드가 필요 없다
            const rows = [
              [t('audiofade.edge.head'), head, head > 0.02],
              [t('audiofade.edge.tail'), tail, tail > 0.02]
            ] as Array<[string, number, boolean]>;
            foundEl.innerHTML = rows
              .map(
                ([label, v, bad]) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${esc(label)}</span><span class="tool-list-val">${pct(v)} ${esc(
                    t(bad ? 'audiofade.edge.bad' : 'audiofade.edge.good')
                  )}</span></div>`
              )
              .join('');
            stats.innerHTML =
              stat(t('audiofade.stat.length'), mmss(buffer.duration), true) +
              stat(t('audiofade.stat.headLevel'), pct(head)) +
              stat(t('audiofade.stat.tailLevel'), pct(tail));
            const bad = head > 0.02 || tail > 0.02;
            say(
              t(bad ? 'audiofade.say.bad' : 'audiofade.say.good'),
              bad ? 'error' : 'ok'
            );
          }

          async function load(file: File): Promise<void> {
            runBtn.disabled = true;
            say(t('audiofade.say.reading'));
            const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const ctx = new AC();
            try {
              buffer = await ctx.decodeAudioData(await file.arrayBuffer());
            } catch {
              say(t('audiofade.err.decode'), 'error');
              void ctx.close();
              return;
            }
            void ctx.close();
            baseName = (file.name || t('audiofade.file.base')).replace(/\.[^.]+$/, '');
            outBlob = null;
            saveBtn.disabled = true;
            player.style.display = 'none';
            $<HTMLElement>('#afControls').style.display = '';
            runBtn.disabled = false;
            report();
          }

          /** 끊기는 만큼만 — 진폭이 클수록 조금 더 길게, 다만 길이의 1/4 을 넘지 않게 */
          function autoSeconds(level: number): number {
            if (!buffer || level <= 0.02) return 0;
            const want = Math.min(0.6, 0.05 + level * 0.5);
            return Math.min(want, buffer.duration / 4);
          }

          async function run(): Promise<void> {
            if (!buffer) return;
            runBtn.disabled = true;
            say(t('audiofade.say.working'));
            await new Promise((r) => setTimeout(r, 0));
            try {
              const sr = buffer.sampleRate;
              const inN = Math.min(Math.round((parseInt($<HTMLInputElement>('#afIn').value, 10) / 10) * sr), Math.floor(buffer.length / 2));
              const outN = Math.min(Math.round((parseInt($<HTMLInputElement>('#afOut').value, 10) / 10) * sr), Math.floor(buffer.length / 2));

              const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
              const ctx = new AC();
              const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, sr);
              for (let c = 0; c < buffer.numberOfChannels; c++) {
                const src = buffer.getChannelData(c);
                const dst = new Float32Array(src.length);
                dst.set(src);
                for (let i = 0; i < inN; i++) dst[i] *= curve(i / inN);
                for (let i = 0; i < outN; i++) dst[dst.length - 1 - i] *= curve(i / outN);
                out.copyToChannel(dst, c);
              }
              void ctx.close();

              outBlob = await encodeAudio(out, 'wav');
              player.src = URL.createObjectURL(outBlob);
              player.style.display = '';
              saveBtn.disabled = false;
              const after = edgeLevels(out);
              stats.innerHTML =
                stat(t('audiofade.stat.headLevel'), `${Math.round(after.head * 100)}%`, true) +
                stat(t('audiofade.stat.tailLevel'), `${Math.round(after.tail * 100)}%`) +
                stat(t('audiofade.stat.size'), size(outBlob.size));
              say(t('audiofade.say.done'), 'ok');
              Toolbox.trackUse?.('fade');
            } catch (e) {
              say((e as Error).message || t('audiofade.err.generic'), 'error');
            } finally {
              runBtn.disabled = false;
            }
          }

          const drop = $<HTMLElement>('#afDrop');
          const fileInput = $<HTMLInputElement>('#afFile');
          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) void load(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 것이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다. */
          {
              Toolbox.onHandoff?.('audiofade', (f: File) => void load(f));
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

          const showIn = (): void => {
            $<HTMLElement>('#afInVal').textContent = t('audiofade.value.sec', {
              n: (parseInt($<HTMLInputElement>('#afIn').value, 10) / 10).toFixed(1)
            });
          };
          const showOut = (): void => {
            $<HTMLElement>('#afOutVal').textContent = t('audiofade.value.sec', {
              n: (parseInt($<HTMLInputElement>('#afOut').value, 10) / 10).toFixed(1)
            });
          };
          $<HTMLInputElement>('#afIn').addEventListener('input', showIn);
          $<HTMLInputElement>('#afOut').addEventListener('input', showOut);
          $<HTMLButtonElement>('#afAuto').onclick = () => {
            if (!buffer) return;
            const { head, tail } = edgeLevels(buffer);
            $<HTMLInputElement>('#afIn').value = String(Math.round(autoSeconds(head) * 10));
            $<HTMLInputElement>('#afOut').value = String(Math.round(autoSeconds(tail) * 10));
            showIn();
            showOut();
            say(t('audiofade.say.auto'), 'ok');
          };
          runBtn.onclick = () => void run();
          saveBtn.onclick = () => {
            if (!outBlob) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(outBlob);
            a.download = baseName + t('audiofade.file.suffix') + '.wav';
            a.click();
            // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
            Toolbox.offerNext?.(status, { blob: outBlob, name: a.download, from: 'audiofade' });
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say(t('audiofade.say.saved', { size: size(outBlob.size) }), 'ok');
          };
  }
})();
