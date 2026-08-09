/**
 * 시간 더하기·빼기 (TASK-KL-088)
 *
 * 「9시 40분에 시작해 1시간 25분 걸리면 몇 시?」 는 60진법이라 손으로 하면 자주 틀린다.
 * 근무시간 합계(7:45 + 8:20 + …)도 마찬가지 — 계산기에 넣으면 7.45 로 읽혀 엉뚱한 값이 나온다.
 * 시각 더하기와 시간 합계를 나눠 두 가지 실수 모두 막는다.
 */
import { clock, dayShift as shiftOf, spec, sumTimes, toMinutes } from '../../core/timecalc';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  /* 「1시간 25분」의 단위는 **Intl 이 그 언어로 적어 준다** — 시간/분을 언어마다 적을 필요가 없다.
   * core 의 `fmt` 는 MCP 글자 출력이 그대로 쓰므로 안 건드리고 화면에서만 갈아 끼운다. */
  const unit = (n: number, u: 'hour' | 'minute'): string =>
    new Intl.NumberFormat(locale(), { style: 'unit', unit: u, unitDisplay: 'long' }).format(n);
  const fmt = (min: number): string => {
    const neg = min < 0 ? '-' : '';
    const a = Math.abs(min);
    return `${neg}${unit(Math.floor(a / 60), 'hour')} ${unit(a % 60, 'minute')}`;
  };

  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'timecalc',
    title: t('widgets.timecalc.title', undefined, "시간 더하기·빼기"),
    category: 'tool',
    desc: t('widgets-desc.timecalc.desc', undefined, "시각에 시간을 더하거나 근무시간을 합산합니다. 60진법 실수를 막습니다"),
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M16 4h5M18.5 1.5v5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('timecalc.tab', undefined, "시간 계산"),
        build: function (container: HTMLElement): void {
          void loadNamespace('timecalc').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('timecalc.label.start'))}</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('timecalc.aria.start'))}</div>
                  <input type="time" id="tcStart" aria-label="${esc(t('timecalc.aria.start'))}" value="09:40">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('timecalc.label.dur'))}</div>
                  <input type="text" id="tcDur" aria-label="${esc(t('timecalc.aria.dur'))}" value="1:25" spellcheck="false">
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <button type="button" class="tool-chip active" data-op="add">${esc(t('timecalc.mode.add'))}</button>
                <button type="button" class="tool-chip" data-op="sub">${esc(t('timecalc.mode.sub'))}</button>
              </div>
            </div>
            <div class="tool-display" id="tcResult">—</div>
            <div class="tool-list" id="tcOut"></div>

            <div class="field-group" style="margin-top:var(--space-xl);">
              <label class="field-label">${esc(t('timecalc.label.lines'))}</label>
              <textarea id="tcList" rows="5" spellcheck="false" placeholder="7:45&#10;8:20&#10;6:50"></textarea>
            </div>
            <div class="cc-stats" id="tcSum"></div>
            <div class="tool-status" id="tcStatus">${esc(t('timecalc.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const start = $<HTMLInputElement>('#tcStart');
          const dur = $<HTMLInputElement>('#tcDur');
          const result = $<HTMLElement>('#tcResult');
          const out = $<HTMLElement>('#tcOut');
          const list = $<HTMLTextAreaElement>('#tcList');
          const sum = $<HTMLElement>('#tcSum');
          const status = $<HTMLElement>('#tcStatus');
          let op = 'add';

          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;
          const stat = (label: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${label}</div><div class="cc-stat-value">${v}</div></div>`;

          function render(): void {
            const [sh, sm] = start.value.split(':').map(Number);
            const base = (sh || 0) * 60 + (sm || 0);
            const delta = toMinutes(dur.value);
            if (delta === null) {
              result.textContent = '—';
              out.innerHTML = '';
              status.textContent = t('timecalc.err.dur');
              status.className = 'tool-status error';
              return;
            }
            const total = op === 'add' ? base + delta : base - delta;
            result.textContent = clock(total);
            const dayShift = shiftOf(total);
            out.innerHTML =
              row(t('timecalc.aria.dur'), fmt(delta)) +
              row(t('timecalc.row.result'), `${clock(total)}${
                  dayShift > 0
                    ? t('timecalc.value.dayAfter', { n: dayShift })
                    : dayShift < 0
                      ? t('timecalc.value.dayBefore', { n: -dayShift })
                      : ''
                }`) +
              row(t('timecalc.row.minutes'), t('timecalc.value.min', { n: delta })) +
              row(t('timecalc.row.decimal'), t('timecalc.value.hour', { n: (delta / 60).toFixed(2) }));
            status.textContent = t('timecalc.status.idle');
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('add');
          }

          function renderSum(): void {
            /* 읽기·합산은 `src/core/timecalc.ts` 가 한다 — 「7:45 는 7.45 가 아니다」가
               이 도구의 요점이고, 시험도 거기 붙어 있다 (TASK-KL-205). */
            const r = sumTimes(list.value);
            if (r.counted === 0 && r.bad === 0) {
              sum.innerHTML = '';
              return;
            }
            sum.innerHTML =
              stat(t('timecalc.stat.sum'), fmt(r.total), true) +
              stat(t('timecalc.row.decimal'), t('timecalc.value.hour', { n: (r.total / 60).toFixed(2) })) +
              stat(t('timecalc.stat.avg'), fmt(Math.round(r.total / Math.max(1, r.counted)))) +
              (r.bad ? stat(t('timecalc.stat.unreadable'), t('timecalc.value.lines', { n: r.bad })) : '');
          }

          [start, dur].forEach((el) => el.addEventListener('input', render));
          list.addEventListener('input', renderSum);
          container.querySelectorAll('[data-op]').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('[data-op]').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              op = (chip as HTMLElement).dataset.op || 'add';
              render();
            };
          });

          // 주소로 부른 경우 (`?op=shift&start=09:40&duration=1:25` / `?op=sum&times=…`) (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined && call.op === 'shift') {
            start.value = String(call.args.start ?? start.value);
            dur.value = String(call.args.duration ?? dur.value);
            if (call.args.minus === true) {
              op = 'sub';
              container.querySelectorAll('[data-op]').forEach((c) => {
                c.classList.toggle('active', (c as HTMLElement).dataset.op === 'sub');
              });
            }
          }
          list.value =
            call !== null && call.error === undefined && call.op === 'sum'
              ? String(call.args.times ?? '')
              : '7:45\n8:20\n6:50';
          render();
          renderSum();
          if (call?.error !== undefined) {
            status.textContent = call.error;
            status.className = 'tool-status error';
          }
                  });
        }
      }
    ]
  });
})();
