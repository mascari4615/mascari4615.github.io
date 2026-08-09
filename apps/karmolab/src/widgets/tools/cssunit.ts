/**
 * CSS 단위 변환 (TASK-KL-088)
 *
 * px 을 rem 으로 옮길 때 기준(루트 글자 크기)을 잊어 16으로 나눠야 할 걸 10으로 나눈다.
 * 게다가 rem 은 **루트 기준**, em 은 **부모 기준**이라 같은 숫자가 다른 크기가 된다 —
 * 이 둘을 나란히 놓지 않으면 계속 헷갈린다. 기준값을 눈에 보이게 두고 함께 계산한다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const SCALE = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

  Toolbox.register({
    id: 'cssunit',
    title: t('widgets.cssunit.title', undefined, "CSS 단위 변환"),
    category: 'tool',
    desc: t('widgets-desc.cssunit.desc', undefined, "px·rem·em·pt·% 를 서로 바꿉니다. 루트 기준과 부모 기준을 나란히"),
    layout: 'form',
    icon: '<path d="M4 7h16M4 12h10M4 17h13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M19 14v6M17 16l2-2 2 2" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('cssunit.label.unit', undefined, "단위"),
        build: function (container: HTMLElement): void {
          void loadNamespace('cssunit').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('cssunit.label.root'))}</div>
                  <input type="number" id="cuRoot" aria-label="${esc(t('cssunit.aria.root'))}" value="16" step="1" min="1">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('cssunit.label.parent'))}</div>
                  <input type="number" id="cuParent" aria-label="${esc(t('cssunit.aria.parent'))}" value="16" step="1" min="1">
                </div>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">${esc(t('cssunit.tab'))}</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('cssunit.label.number'))}</div>
                  <input type="number" id="cuValue" aria-label="${esc(t('cssunit.aria.value'))}" value="24" step="any">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('cssunit.label.unit'))}</div>
                  <select id="cuUnit" aria-label="${esc(t('cssunit.aria.unit'))}">
                    <option value="px">px</option>
                    <option value="rem">rem</option>
                    <option value="em">em</option>
                    <option value="pt">pt</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="tool-list" id="cuOut"></div>

            <div class="tool-sublabel" style="margin:16px 0 6px;">${esc(t('cssunit.label.common'))}</div>
            <div class="tool-list" id="cuScale"></div>
            <div class="tool-status" id="cuStatus">${esc(t('cssunit.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const out = $<HTMLElement>('#cuOut');
          const scaleEl = $<HTMLElement>('#cuScale');
          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;
          const trim = (n: number): string => String(Math.round(n * 10000) / 10000);

          function run(): void {
            const root = parseFloat($<HTMLInputElement>('#cuRoot').value) || 16;
            const parent = parseFloat($<HTMLInputElement>('#cuParent').value) || 16;
            const v = parseFloat($<HTMLInputElement>('#cuValue').value);
            const unit = $<HTMLSelectElement>('#cuUnit').value;
            if (!isFinite(v)) {
              out.innerHTML = '';
              return;
            }

            // 어떤 단위로 들어와도 일단 px 로 모은 뒤 다시 펼친다.
            const px = unit === 'px' ? v : unit === 'rem' ? v * root : unit === 'em' ? v * parent : (v * 96) / 72;

            out.innerHTML =
              row('px', trim(px)) +
              row(t('cssunit.row.rem'), `${trim(px / root)}rem`) +
              row(t('cssunit.row.em'), `${trim(px / parent)}em`) +
              row('pt', `${trim((px * 72) / 96)}pt`) +
              row(t('cssunit.row.pct'), `${trim((px / parent) * 100)}%`);

            scaleEl.innerHTML = SCALE.map((s) => row(`${s}px`, `${trim(s / root)}rem`)).join('');
            Toolbox.trackUse?.('convert');
          }

          container.querySelectorAll('input, select').forEach((el) => {
            el.addEventListener('input', run);
            el.addEventListener('change', run);
          });
          run();
                  });
        }
      }
    ]
  });
})();
