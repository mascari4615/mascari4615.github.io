/**
 * 러닝 페이스 계산 (TASK-KL-088)
 *
 * 페이스(1km 당 시간)와 속도(시속)는 서로 역수 관계라, 하나를 알면 나머지가 정해진다.
 * 그런데 페이스는 분:초라 60진법이고 속도는 10진법이라 손으로 옮기면 자주 틀린다.
 * 목표 기록에서 필요한 페이스를 역산하는 쪽이 실제 질문이므로 그쪽도 함께 낸다.
 */
import { t, loadNamespace } from '../../lib/i18n';
import { isMetric } from '../../lib/region';

(function (): void {
  /* 대회 거리는 **어디서나 미터법**이다(미국 대회도 5K·10K·마라톤 42.195km). 그래서 거리 표는
     나라를 안 탄다 — 나라를 타는 것은 **페이스와 속도를 어느 단위로 말하느냐**뿐이다.
     이름은 찾을 때 정한다(표를 만들 때 정하면 열쇠가 굳는다). */
  const distances = (): Array<[string, number]> => [
    ['5K', 5],
    ['10K', 10],
    [t('pace.dist.half'), 21.0975],
    [t('pace.dist.full'), 42.195]
  ];

  /** 1마일 = 1.609344km. 미국은 페이스도 속도도 마일로 말한다. */
  const MILE_KM = 1.609344;

  const mmss = (sec: number): string => {
    const s = Math.max(0, Math.round(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const hms = (sec: number): string => {
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? t('pace.time.hms', { h, m, s: s % 60 }) : t('pace.time.ms', { m, s: s % 60 });
  };

  Toolbox.register({
    id: 'pace',
    title: t('widgets.pace.title', undefined, '러닝 페이스 계산'),
    category: 'tool',
    desc: t(
      'widgets-desc.pace.desc',
      undefined,
      '페이스와 속도를 서로 바꾸고 목표 기록에 필요한 페이스를 역산합니다'
    ),
    layout: 'wide',
    icon: '<circle cx="17" cy="5" r="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14 21l2-6-3-2 1-4 3 2 2 1M9 12l-2 3-3 1" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('pace.tab', undefined, '페이스'),
        build: function (container: HTMLElement): void {
          void loadNamespace('pace').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          /* 미국은 「1마일에 몇 분」으로 말한다 — km 로만 주면 그 사람은 매번 암산해야 한다.
             계산은 km 로 하고 **말하는 단위만** 바꾼다. */
          const perMile = !isMetric();
          const unit = t(perMile ? 'pace.unit.mile' : 'pace.unit.km');
          /** 화면 단위 1개 = 몇 km 인가. */
          const span = perMile ? MILE_KM : 1;

          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('pace.label.pace', { unit }))}</div>
                  <input type="text" id="paPace" value="${perMile ? '9:39' : '6:00'}" spellcheck="false" aria-label="${esc(t('pace.label.pace', { unit }))}">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('pace.label.speed', { unit }))}</div>
                  <input type="number" id="paSpeed" value="${perMile ? '6.21' : '10'}" step="0.1" min="0.1" aria-label="${esc(t('pace.label.speed', { unit }))}">
                </div>
              </div>
            </div>

            <div class="tool-sublabel" style="margin:14px 0 6px;">${esc(t('pace.label.thisPace'))}</div>
            <div class="tool-list" id="paTimes"></div>

            <div class="field-group" style="margin-top:var(--space-xl);">
              <label class="field-label">${esc(t('pace.label.goalCalc'))}</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('pace.label.distance'))}</div>
                  <select id="paDist" aria-label="${esc(t('pace.label.distance'))}"></select>
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('pace.label.goalTime'))}</div>
                  <input type="text" id="paGoal" aria-label="${esc(t('pace.label.goalTime'))}" value="0:50:00" spellcheck="false">
                </div>
              </div>
            </div>
            <div class="tool-list" id="paNeed"></div>
            <div class="tool-status" id="paStatus">${esc(t('pace.status.note'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const paceEl = $<HTMLInputElement>('#paPace');
          const speedEl = $<HTMLInputElement>('#paSpeed');
          const times = $<HTMLElement>('#paTimes');
          const need = $<HTMLElement>('#paNeed');
          let syncing = false;

          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          $<HTMLSelectElement>('#paDist').innerHTML = distances()
            .map(([n, km]) => `<option value="${km}">${esc(n)}</option>`)
            .join('');
          $<HTMLSelectElement>('#paDist').value = '10';

          function paceSeconds(): number {
            const m = paceEl.value.match(/^(\d+)\s*[:분]\s*(\d+)?/);
            if (!m) return 0;
            return parseInt(m[1], 10) * 60 + parseInt(m[2] || '0', 10);
          }

          function renderTimes(): void {
            const sec = paceSeconds();
            if (!sec) {
              times.innerHTML = '';
              return;
            }
            /* 페이스는 **화면 단위 1개당** 시간이라, 거리(km)를 화면 단위 수로 바꿔 곱한다. */
            times.innerHTML = distances()
              .map(([n, km]) => row(esc(n), hms((sec * km) / span)))
              .join('');
          }

          function fromPace(): void {
            if (syncing) return;
            const sec = paceSeconds();
            if (!sec) return;
            syncing = true;
            speedEl.value = (3600 / sec).toFixed(2);
            syncing = false;
            renderTimes();
            renderNeed();
            Toolbox.trackUse?.('pace');
          }

          function fromSpeed(): void {
            if (syncing) return;
            const v = parseFloat(speedEl.value);
            if (!(v > 0)) return;
            syncing = true;
            paceEl.value = mmss(3600 / v);
            syncing = false;
            renderTimes();
            renderNeed();
          }

          function renderNeed(): void {
            const km = parseFloat($<HTMLSelectElement>('#paDist').value);
            const g = $<HTMLInputElement>('#paGoal').value.match(/^(\d+)\s*:\s*(\d+)\s*:?\s*(\d+)?$/);
            if (!g || !km) {
              need.innerHTML = '';
              return;
            }
            const goalSec = parseInt(g[1], 10) * 3600 + parseInt(g[2], 10) * 60 + parseInt(g[3] || '0', 10);
            const perUnit = goalSec / (km / span);
            const mine = (paceSeconds() * km) / span;
            need.innerHTML =
              row(t('pace.row.needPace'), `${mmss(perUnit)} / ${esc(unit)}`) +
              row(t('pace.row.needSpeed'), `${(3600 / perUnit).toFixed(2)} ${esc(unit)}/h`) +
              row(t('pace.row.atCurrent'), hms(mine)) +
              row(
                t('pace.row.diff'),
                `${t(mine <= goalSec ? 'pace.value.under' : 'pace.value.over')} ${hms(Math.abs(mine - goalSec))}`
              );
          }

          paceEl.addEventListener('input', fromPace);
          speedEl.addEventListener('input', fromSpeed);
          $<HTMLInputElement>('#paGoal').addEventListener('input', renderNeed);
          $<HTMLSelectElement>('#paDist').addEventListener('change', renderNeed);

          fromPace();
  }
})();
