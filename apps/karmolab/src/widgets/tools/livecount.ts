/**
 * 흐른 시간 카운터 — 화면 (흡수 ⓐ 「라이브 카운터」)
 *
 * 숫자가 **계속 올라가는 것**이 이 도구의 전부다. 멈춘 숫자는 그냥 날짜 계산기고, 그건 이미 있다.
 *
 * 계산은 `core/livecount.ts`. 여기서는 1초마다 다시 그리기만 한다.
 *
 * ★ 화면을 떠나면 타이머를 끈다 — 안 그러면 도구를 닫아도 초당 한 번씩 계속 돈다.
 * 그런 게 열 개 쌓이면 배터리가 닳고, 원인은 아무 데도 안 보인다(가만히 둔 화면이 초당 300번
 * 그리던 사고를 하루 전에 겪었다). `Toolbox.onDispose` 가 그 자리를 위해 있다.
 */
import { elapsed, project } from '../../core/livecount';
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'livecount',
    title: t('widgets.livecount.title', undefined, "흐른 시간 카운터"),
    category: 'tool',
    desc: t('widgets-desc.livecount.desc', undefined, "그날 이후 흐른 시간이 초 단위로 올라갑니다. 하루 몇 번 기준으로 어림도 냅니다"),
    layout: 'wide',
    tabs: [
      {
        id: 'count',
        label: t('livecount.t03', undefined, "카운터"),
        build: function (container: HTMLElement): void {
          void loadNamespace('livecount').then(function () {

          container.innerHTML = `
            <div class="tool-block">
              <div class="tool-row">
                <label class="tool-label" for="lcAt">${esc(t('livecount.label.lcAt'))}</label>
                <input id="lcAt" class="tool-input" type="datetime-local" />
              </div>
              <div id="lcBig" class="tool-display" style="font-variant-numeric:tabular-nums;">—</div>
              <div id="lcSub" class="tool-hint"></div>
              <div class="tool-row" style="margin-top:var(--space-md);">
                <label class="tool-label" for="lcRate">${esc(t('livecount.label.lcRate'))}</label>
                <input id="lcRate" class="tool-input" type="number" min="0" step="0.5" value="0" style="max-width:8em;" />
                <input id="lcUnit" class="tool-input" type="text" value="잔" maxlength="6" style="max-width:6em;" aria-label="${esc(t('livecount.aria.lcUnit'))}" />
              </div>
              <div id="lcRateOut" class="tool-note"></div>
            </div>`;

          const $ = <T extends HTMLElement>(sel: string): T => container.querySelector(sel) as T;
          const atInput = $<HTMLInputElement>('#lcAt');
          const rateInput = $<HTMLInputElement>('#lcRate');
          const unitInput = $<HTMLInputElement>('#lcUnit');

          /* 기본값 = 올해 1월 1일. 빈 화면보다 「지금 뭐가 보이는지」가 먼저다. */
          const start = new Date(new Date().getFullYear(), 0, 1);
          atInput.value = `${start.getFullYear()}-01-01T00:00`;

          const tick = (): void => {
            const at = new Date(atInput.value);
            if (Number.isNaN(at.getTime())) {
              $('#lcBig').textContent = '—';
              $('#lcSub').textContent = t('livecount.t04');
              return;
            }
            const e = elapsed(at);
            $('#lcBig').textContent = t('livecount.seconds', { n: e.totalSeconds.toLocaleString(locale()) });
            $('#lcSub').textContent =
              t('livecount.line', {
                days: e.totalDays.toLocaleString(locale()),
                y: e.years,
                mo: e.months,
                d: e.days,
                clock: `${e.hours}:${String(e.minutes).padStart(2, '0')}:${String(e.seconds).padStart(2, '0')}`,
                tail: e.future ? t('livecount.left') : t('livecount.past'),
              });

            const perDay = Number(rateInput.value);
            const unit = unitInput.value.trim() === '' ? t('livecount.t05') : unitInput.value.trim();
            if (Number.isFinite(perDay) && perDay > 0) {
              $('#lcRateOut').textContent =
                t('livecount.projected', {
                  n: project(e, perDay).toLocaleString(locale()),
                  unit,
                });
            } else {
              $('#lcRateOut').textContent = '';
            }
          };

          for (const el of [atInput, rateInput, unitInput]) el.addEventListener('input', tick);
          tick();

          /*
           * 초마다 다시 그린다. 화면을 떠나면 반드시 멈춘다 — 안 멈추면 닫은 도구가 계속 돈다.
           * (숨겨진 탭에서는 브라우저가 알아서 늦춰 주므로 따로 더 하지 않는다.)
           */
          const timer = window.setInterval(tick, 1000);
          Toolbox.onDispose?.(() => window.clearInterval(timer));
                  });
        }
      }
    ]
  });
})();
