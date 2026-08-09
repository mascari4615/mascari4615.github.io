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
import { elapsed, humanElapsed, project } from '../../core/livecount';

(function (): void {
  Toolbox.register({
    id: 'livecount',
    title: '흐른 시간 카운터',
    category: 'tool',
    desc: '그날 이후 흐른 시간이 초 단위로 올라갑니다. 하루 몇 번 기준으로 어림도 냅니다',
    layout: 'wide',
    tabs: [
      {
        id: 'count',
        label: '카운터',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-block">
              <div class="tool-row">
                <label class="tool-label" for="lcAt">기준 시각</label>
                <input id="lcAt" class="tool-input" type="datetime-local" />
              </div>
              <div id="lcBig" class="tool-display" style="font-variant-numeric:tabular-nums;">—</div>
              <div id="lcSub" class="tool-hint"></div>
              <div class="tool-row" style="margin-top:var(--space-md);">
                <label class="tool-label" for="lcRate">하루 몇 번</label>
                <input id="lcRate" class="tool-input" type="number" min="0" step="0.5" value="0" style="max-width:8em;" />
                <input id="lcUnit" class="tool-input" type="text" value="잔" maxlength="6" style="max-width:6em;" aria-label="단위" />
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
              $('#lcSub').textContent = '기준 시각을 골라 주세요';
              return;
            }
            const e = elapsed(at);
            $('#lcBig').textContent = `${e.totalSeconds.toLocaleString('ko-KR')}초`;
            $('#lcSub').textContent =
              `${humanElapsed(e)} · ${e.totalDays.toLocaleString('ko-KR')}일 · ` +
              `${e.years}년 ${e.months}개월 ${e.days}일 ${e.hours}:${String(e.minutes).padStart(2, '0')}:${String(e.seconds).padStart(2, '0')}`;

            const perDay = Number(rateInput.value);
            const unit = unitInput.value.trim() === '' ? '번' : unitInput.value.trim();
            if (Number.isFinite(perDay) && perDay > 0) {
              $('#lcRateOut').textContent =
                `약 ${project(e, perDay).toLocaleString('ko-KR')}${unit} — 어림입니다(안 한 날도 그대로 곱했습니다)`;
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
        }
      }
    ]
  });
})();
