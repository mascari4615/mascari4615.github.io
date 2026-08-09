/**
 * 찾아 바꾸기 (TASK-KL-088)
 *
 * 편집기의 찾아 바꾸기는 **누르기 전까지 결과를 모른다**. 정규식이 섞이면 더 그렇다.
 * 여기서는 바꾸기 전에 몇 군데가 걸렸는지, 어디가 바뀌는지 먼저 보여준다 —
 * 되돌릴 수 없는 편집을 실행하기 전에 확인하는 자리.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  Toolbox.register({
    id: 'replace',
    title: t('widgets.replace.title', undefined, "찾아 바꾸기"),
    category: 'tool',
    desc: t('widgets-desc.replace.desc', undefined, "텍스트에서 찾아 바꿉니다. 바꾸기 전에 걸린 곳을 미리 보여줍니다"),
    layout: 'wide',
    icon: '<circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14.5 14.5 20 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 10h6M10 7v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>',
    tabs: [
      {
        id: 'app',
        label: t('replace.tab', undefined, "찾아 바꾸기"),
        build: function (container: HTMLElement): void {
          void loadNamespace('replace').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('replace.label.in'))}</label>
              <textarea id="rpIn" rows="7" spellcheck="false" placeholder="${esc(t('replace.ph.in'))}"></textarea>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('replace.label.find'))}</div>
                  <input type="text" id="rpFind" spellcheck="false" placeholder="${esc(t('replace.ph.find'))}">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('replace.label.to'))}</div>
                  <input type="text" id="rpTo" spellcheck="false" placeholder="${esc(t('replace.ph.to'))}">
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="rpCase"> ${esc(t('replace.opt.case'))}</label>
                <label class="tool-chip"><input type="checkbox" id="rpWord"> ${esc(t('replace.opt.word'))}</label>
                <label class="tool-chip"><input type="checkbox" id="rpRegex"> ${esc(t('replace.opt.regex'))}</label>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">${esc(t('replace.label.preview'))}</label>
              <div class="rx-highlight" id="rpPreview"></div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="rpApply">${esc(t('replace.btn.apply'))}</button>
              <button class="btn btn-ghost" id="rpCopy">${esc(t('replace.btn.copy'))}</button>
              <button class="btn btn-ghost" id="rpUndo">${esc(t('replace.btn.undo'))}</button>
            </div>

            <div class="tool-status" id="rpStatus">${esc(t('replace.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#rpIn');
          const find = $<HTMLInputElement>('#rpFind');
          const to = $<HTMLInputElement>('#rpTo');
          const preview = $<HTMLElement>('#rpPreview');
          const status = $<HTMLElement>('#rpStatus');
          let previous: string | null = null;

          function buildRegex(): RegExp | null {
            const raw = find.value;
            if (!raw) return null;
            let source = $<HTMLInputElement>('#rpRegex').checked ? raw : raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if ($<HTMLInputElement>('#rpWord').checked) source = `\\b${source}\\b`;
            try {
              return new RegExp(source, $<HTMLInputElement>('#rpCase').checked ? 'g' : 'gi');
            } catch {
              return null;
            }
          }

          function render(): void {
            const re = buildRegex();
            if (!re) {
              preview.innerHTML = escapeHtml(input.value.slice(0, 4000));
              status.textContent = find.value
                ? t('replace.err.regex')
                : t('replace.status.idle');
              status.className = 'tool-status' + (find.value ? ' error' : '');
              return;
            }
            let count = 0;
            const marked = escapeHtml(input.value).replace(new RegExp(re.source, re.flags), (m) => {
              count++;
              return `<span class="rx-mark">${m}</span>`;
            });
            preview.innerHTML = marked.slice(0, 20000);
            status.textContent = count ? t('replace.say.hits', { n: count }) : t('replace.say.noHit');
            status.className = 'tool-status' + (count ? ' ok' : '');
          }

          [input, find, to].forEach((el) => el.addEventListener('input', render));
          container.querySelectorAll('input[type="checkbox"]').forEach((el) => el.addEventListener('change', render));

          $<HTMLButtonElement>('#rpApply').onclick = () => {
            const re = buildRegex();
            if (!re) return;
            previous = input.value;
            const before = input.value;
            input.value = before.replace(re, to.value);
            render();
            status.textContent = t('replace.say.applied');
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('replace');
          };
          $<HTMLButtonElement>('#rpUndo').onclick = () => {
            if (previous === null) return;
            input.value = previous;
            previous = null;
            render();
          };
          $<HTMLButtonElement>('#rpCopy').onclick = () => {
            if (input.value) void Toolbox.copyText?.(input.value, { message: t('replace.copy.done') });
          };

          render();
                  });
        }
      }
    ]
  });
})();
