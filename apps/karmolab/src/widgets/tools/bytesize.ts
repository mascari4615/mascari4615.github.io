/**
 * 용량 단위 변환 (TASK-KL-088)
 *
 * 「1TB 하드인데 왜 931GB 로 보이지」 의 답이 여기 있다 — 제조사는 1000 배로 세고(TB)
 * 운영체제는 1024 배로 센다(TiB). 같은 이름을 두 뜻으로 쓰기 때문에 생기는 차이라,
 * **두 계열을 나란히** 보여주고 차이를 %로 적는다.
 */
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const DEC = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const BIN = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];

  const fmt = (n: number): string =>
    n >= 1000 || Number.isInteger(n) ? n.toLocaleString(locale(), { maximumFractionDigits: 2 }) : n.toFixed(3);

  Toolbox.register({
    id: 'bytesize',
    title: t('widgets.bytesize.title', undefined, "용량 단위 변환"),
    category: 'tool',
    desc: t('widgets-desc.bytesize.desc', undefined, "KB·MB·GB 를 서로 바꿉니다. 1000 기준과 1024 기준을 나란히 봅니다"),
    layout: 'form',
    icon: '<ellipse cx="12" cy="6" rx="8" ry="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" stroke="currentColor" stroke-width="1.4" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('bytesize.stat.size', undefined, "용량"),
        build: function (container: HTMLElement): void {
          void loadNamespace('bytesize').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('bytesize.label.value'))}</div>
                  <input type="number" id="bsValue" aria-label="${esc(t('bytesize.label.value'))}" value="1" step="any" min="0">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('bytesize.label.unit'))}</div>
                  <select id="bsUnit" aria-label="${esc(t('bytesize.label.unit'))}"></select>
                </div>
              </div>
            </div>

            <div class="tool-list" id="bsDec"></div>
            <div class="tool-sublabel" style="margin:14px 0 6px;">${esc(t('bytesize.opt.binary'))}</div>
            <div class="tool-list" id="bsBin"></div>

            <div class="tool-list" id="bsNote" style="margin-top:14px;"></div>
            <div class="tool-status" id="bsStatus">${esc(t('bytesize.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const value = $<HTMLInputElement>('#bsValue');
          const unit = $<HTMLSelectElement>('#bsUnit');
          const dec = $<HTMLElement>('#bsDec');
          const bin = $<HTMLElement>('#bsBin');
          const note = $<HTMLElement>('#bsNote');

          unit.innerHTML =
            DEC.map((u, i) => `<option value="d${i}">${esc(t('bytesize.opt.dec', { u }))}</option>`).join('') +
            BIN.slice(1).map((u, i) => `<option value="b${i + 1}">${esc(t('bytesize.opt.bin', { u }))}</option>`).join('');
          unit.value = 'd3';

          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          function run(): void {
            const v = parseFloat(value.value);
            if (!isFinite(v) || v < 0) {
              dec.innerHTML = '';
              bin.innerHTML = '';
              note.innerHTML = '';
              return;
            }
            const sel = unit.value;
            const idx = parseInt(sel.slice(1), 10);
            const bytes = sel.startsWith('d') ? v * Math.pow(1000, idx) : v * Math.pow(1024, idx);

            dec.innerHTML = DEC.map((u, i) => row(u, fmt(bytes / Math.pow(1000, i)))).join('');
            bin.innerHTML = BIN.map((u, i) => row(u, fmt(bytes / Math.pow(1024, i)))).join('');

            // 같은 숫자를 두 방식으로 읽었을 때 벌어지는 차이 — 하드 용량 표기 오해의 정체
            const level = Math.min(5, Math.max(1, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1000))));
            const decVal = bytes / Math.pow(1000, level);
            const binVal = bytes / Math.pow(1024, level);
            note.innerHTML =
              row(t('bytesize.stat.bytes'), `${Math.round(bytes).toLocaleString(locale())} B`) +
              row(t('bytesize.stat.gap'), `${fmt(decVal)} ${DEC[level]} = ${fmt(binVal)} ${BIN[level]}`) +
              row(
                t('bytesize.row.diff'),
                t('bytesize.value.smaller', { pct: (((decVal - binVal) / decVal) * 100).toFixed(1) })
              );
            Toolbox.trackUse?.('convert');
          }

          [value, unit].forEach((el) => {
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
