/**
 * 키보드 이벤트 코드 (TASK-KL-088)
 * 표를 외워 적는 대신 **실제로 눌러서 확인**하게 한다 — 브라우저마다 값이 다를 수 있어 이게 정확하다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'keycode',
    title: t('widgets.keycode.title', undefined, "키보드 이벤트 코드"),
    category: 'ref',
    desc: t('widgets-desc.keycode.desc', undefined, "키를 누르면 event.key · event.code · keyCode 값을 그 자리에서 보여줍니다"),
    layout: 'form',
    icon: '<rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('keycode.t05', undefined, "키 코드"),
        build: function (container: HTMLElement): void {
          void loadNamespace('keycode').then(function () {

          Mdd.linePreset('tool_run', { msg: t('keycode.t06') });
          container.innerHTML = `
            <div class="kc-stage" id="kcStage" tabindex="0">
              <div class="kc-hint" id="kcHint">${esc(t('keycode.label.kcHint'))}</div>
              <div class="kc-key" id="kcKey"></div>
            </div>
            <div class="cc-stats" id="kcStats"></div>
            <div class="field-group">
              <div class="field-row" style="margin-bottom:8px;">
                <label class="field-label" style="margin:0;">${esc(t('keycode.t01'))}</label>
                <button class="btn btn-ghost" id="kcClear">${esc(t('keycode.btn.kcClear'))}</button>
              </div>
              <div id="kcLog" class="tool-list"></div>
            </div>
            <div class="tool-status">${esc(t('keycode.t02'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const stage = $<HTMLElement>('#kcStage');
          const keyEl = $<HTMLElement>('#kcKey');
          const hint = $<HTMLElement>('#kcHint');
          const stats = $<HTMLElement>('#kcStats');
          const log = $<HTMLElement>('#kcLog');
          const history: string[] = [];

          function onKey(e: KeyboardEvent): void {
            // 페이지가 스크롤되거나 브라우저 단축키로 새는 것을 막는다 (F5·Ctrl+W 등 일부는 불가).
            e.preventDefault();
            hint.style.display = 'none';
            keyEl.textContent = e.key === ' ' ? 'Space' : e.key;

            const rows: Array<[string, string]> = [
              ['event.key', e.key === ' ' ? '" " (Space)' : e.key],
              ['event.code', e.code],
              ['keyCode', String(e.keyCode)],
              ['location', String(e.location)],
              ['repeat', e.repeat ? 'true' : 'false'],
              [t('keycode.t07'), [e.ctrlKey && 'Ctrl', e.shiftKey && 'Shift', e.altKey && 'Alt', e.metaKey && 'Meta'].filter(Boolean).join(' + ') || t('keycode.t08')]
            ];
            stats.innerHTML = rows
              .map(
                ([k, v], i) =>
                  `<div class="cc-stat${i < 2 ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${k}</div><div class="cc-stat-value" style="font-size:var(--font-size-sm); word-break:break-all;">${v}</div></div>`
              )
              .join('');

            history.unshift(`${e.code}\t${e.key}\t${e.keyCode}`);
            if (history.length > 30) history.pop();
            log.innerHTML = history
              .map((h) => {
                const [code, key, kc] = h.split('\t');
                return `<div class="tool-list-row"><span class="tool-list-key">${code}</span><span class="tool-list-val">${key === ' ' ? 'Space' : key}</span><span class="tool-list-dim">keyCode ${kc}</span></div>`;
              })
              .join('');
          }

          // 위젯 컨테이너가 포커스를 잃어도 동작하도록 문서 레벨에서 듣되, 이 페이지가 활성일 때만.
          const handler = (e: KeyboardEvent): void => {
            const page = container.closest('.tool-page');
            if (page && !page.classList.contains('active')) return;
            const target = e.target as HTMLElement | null;
            if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
            onKey(e);
          };
          document.addEventListener('keydown', handler);

          stage.addEventListener('click', () => stage.focus());
          $<HTMLButtonElement>('#kcClear').onclick = () => {
            history.length = 0;
            log.innerHTML = '';
          };
                  });
        }
      }
    ]
  });
})();
