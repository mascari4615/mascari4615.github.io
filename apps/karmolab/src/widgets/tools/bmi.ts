/**
 * BMI 계산기 (TASK-KL-088)
 *
 * BMI 표가 두 종류라는 걸 모르면 결과를 잘못 읽는다 — 세계보건기구는 30 이상을 비만으로 보지만
 * 대한비만학회는 25 이상을 비만으로 본다(아시아인 기준). 그래서 **두 기준을 나란히** 보여준다.
 * 근육량·체지방을 구분하지 못한다는 한계도 화면에 적는다. 숫자만 주면 오해가 남는다.
 */
import { t, loadNamespace } from '../../lib/i18n';
import { region, isMetric } from '../../lib/region';

(function (): void {
  /** [상한(미만), 이름열쇠] — 대한비만학회(아시아·태평양) 기준 */
  const ASIA: Array<[number, string]> = [
    [18.5, 'under'],
    [23, 'normal'],
    [25, 'preObese'],
    [30, 'obese1'],
    [35, 'obese2'],
    [Infinity, 'obese3']
  ];
  /** WHO 국제 기준 */
  const WHO: Array<[number, string]> = [
    [18.5, 'under'],
    [25, 'normal'],
    [30, 'over'],
    [35, 'obese1'],
    [40, 'obese2'],
    [Infinity, 'obese3']
  ];

  /* 이름은 **찾을 때** 정한다 — 표를 만들 때 정하면 열쇠가 굳는다. */
  const classify = (bmi: number, table: Array<[number, string]>): string => {
    for (const [hi, key] of table) if (bmi < hi) return t(`bmi.class.${key}`);
    return '';
  };

  /**
   * 어느 기준을 **앞에** 둘까 — 아시아·태평양 기준(비만 25 이상)은 같은 BMI 라도 아시아인에게
   * 위험이 더 일찍 온다는 데서 나왔다. 그래서 **사는 곳**으로 고른다: 한국·일본은 그 기준이 앞,
   * 그 밖은 WHO 가 앞. 어느 쪽이든 **둘 다 보여 준다** — 하나만 주면 결과를 잘못 읽는다.
   */
  const asiaFirst = (): boolean => region() === 'KR' || region() === 'JP';

  Toolbox.register({
    id: 'bmi',
    title: t('widgets.bmi.title', undefined, 'BMI 계산기'),
    category: 'tool',
    desc: t(
      'widgets-desc.bmi.desc',
      undefined,
      '키와 몸무게로 체질량지수를 계산하고 대한비만학회·WHO 두 기준으로 함께 봅니다'
    ),
    layout: 'form',
    icon: '<circle cx="12" cy="5" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 8v7M9 22l3-7 3 7M7 11h10" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('bmi.tab', undefined, '계산'),
        build: function (container: HTMLElement): void {
          void loadNamespace('bmi').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          /* 미국은 피트·인치·파운드를 쓴다 — 「kg 을 넣으세요」는 그 사람에게 못 쓰는 도구다.
             재는 것은 같으니 **넣는 칸만** 그 나라 단위로 두고 계산 직전에 미터법으로 바꾼다. */
          const us = !isMetric();

          const hLabel = `${t('bmi.label.height')} (${t(us ? 'bmi.unit.ft' : 'bmi.unit.cm')})`;
          const wLabel = `${t('bmi.label.weight')} (${t(us ? 'bmi.unit.lb' : 'bmi.unit.kg')})`;

          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(hLabel)}</div>
                  ${
                    us
                      ? `<div style="display:flex; gap:6px;">
                          <input type="number" id="bmH" aria-label="${esc(t('bmi.unit.ft'))}" value="5" step="1" min="1" max="8">
                          <input type="number" id="bmHin" aria-label="${esc(t('bmi.unit.in'))}" value="7" step="0.5" min="0" max="11.5">
                        </div>`
                      : `<input type="number" id="bmH" aria-label="${esc(hLabel)}" value="170" step="0.1" min="50" max="250">`
                  }
                </div>
                <div>
                  <div class="tool-sublabel">${esc(wLabel)}</div>
                  <input type="number" id="bmW" aria-label="${esc(wLabel)}" value="${us ? '145' : '65'}" step="0.1" min="10" max="700">
                </div>
              </div>
            </div>

            <div class="tool-display" id="bmValue">—</div>
            <!-- 숫자 22.5 보다 「내가 어디쯤」이 즉각 이해된다. 상위 계산기는 전부 눈금이 있다. -->
            <div class="bmi-scale" id="bmScale" aria-hidden="true">
              <div class="bmi-scale-bar">
                <span class="bmi-seg" style="flex:18.5"></span>
                <span class="bmi-seg bmi-ok" style="flex:4.5"></span>
                <span class="bmi-seg bmi-warn" style="flex:2"></span>
                <span class="bmi-seg bmi-bad" style="flex:5"></span>
                <span class="bmi-seg bmi-worse" style="flex:10"></span>
              </div>
              <div class="bmi-pin" id="bmPin"></div>
            </div>
            <div class="cc-stats" id="bmStats"></div>
            <div class="tool-list" id="bmDetail"></div>
            <div class="tool-status" id="bmStatus"></div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const h = $<HTMLInputElement>('#bmH');
          const w = $<HTMLInputElement>('#bmW');
          const value = $<HTMLElement>('#bmValue');
          const stats = $<HTMLElement>('#bmStats');
          const detail = $<HTMLElement>('#bmDetail');
          const status = $<HTMLElement>('#bmStatus');

          const stat = (label: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${label}</div><div class="cc-stat-value">${v}</div></div>`;
          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          function run(): void {
            const hIn = container.querySelector('#bmHin') as HTMLInputElement | null;
            const cm = us
              ? (parseFloat(h.value) * 12 + (parseFloat(hIn?.value || '0') || 0)) * 2.54
              : parseFloat(h.value);
            const kg = us ? parseFloat(w.value) * 0.45359237 : parseFloat(w.value);
            if (!isFinite(cm) || !isFinite(kg) || cm <= 0 || kg <= 0) {
              value.textContent = '—';
              stats.innerHTML = '';
              detail.innerHTML = '';
              status.textContent = t('bmi.status.empty');
              status.className = 'tool-status';
              return;
            }
            const m = cm / 100;
            const bmi = kg / (m * m);
            value.textContent = bmi.toFixed(1);

            /* 눈금 위 내 자리 — 15~40 을 화면 폭으로 본다(그 밖은 양끝에 붙인다). */
            const pin = Math.min(100, Math.max(0, ((bmi - 15) / 25) * 100));
            $<HTMLElement>('#bmPin').style.left = pin.toFixed(1) + '%';

            /* 「정상까지 몇 kg」 — 실제로 행동을 만드는 한 줄인데 우리에겐 없었다. */
            const 정상하한 = 18.5 * m * m;
            const 정상상한 = 23 * m * m;
            /* 무게는 **그 사람이 넣은 단위로** 돌려준다 — 파운드로 넣었는데 「3.2kg 빼세요」는 못 읽는다. */
            const wUnit = t(us ? 'bmi.unit.lb' : 'bmi.unit.kg');
            const showW = (v: number): string => `${(us ? v / 0.45359237 : v).toFixed(1)} ${wUnit}`;
            const 차이 =
              kg > 정상상한 ? t('bmi.value.lose', { n: showW(kg - 정상상한) })
              : kg < 정상하한 ? t('bmi.value.gain', { n: showW(정상하한 - kg) })
              : t('bmi.value.inRange');

            const asia = stat(t(region() === 'JP' ? 'bmi.stat.asiaJp' : 'bmi.stat.asia'), classify(bmi, ASIA), asiaFirst());
            const who = stat(t('bmi.stat.who'), classify(bmi, WHO), !asiaFirst());
            stats.innerHTML = (asiaFirst() ? asia + who : who + asia) + stat(t('bmi.stat.toNormal'), 차이);

            // 「정상 범위 몸무게」 는 BMI 자체보다 실제로 궁금해하는 값이다.
            const lo = 18.5 * m * m;
            const hiKr = 23 * m * m;
            const hiWho = 25 * m * m;
            const range = (a: number, b: number): string => `${showW(a).replace(` ${wUnit}`, '')} ~ ${showW(b)}`;
            detail.innerHTML =
              row(t('bmi.row.rangeAsia'), range(lo, hiKr)) +
              row(t('bmi.row.rangeWho'), range(lo, hiWho)) +
              row(t('bmi.row.standard'), showW(22 * m * m)) +
              row(t('bmi.row.formula'), t('bmi.formula'));

            status.textContent = t('bmi.status.note');
            status.className = 'tool-status';
            Toolbox.trackUse?.('calc');
          }

          const inputs = [h, w, container.querySelector('#bmHin') as HTMLInputElement | null].filter(
            (el): el is HTMLInputElement => !!el
          );
          inputs.forEach((el) => el.addEventListener('input', run));
          run();
  }
})();
