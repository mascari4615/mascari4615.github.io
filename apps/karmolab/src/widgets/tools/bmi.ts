/**
 * BMI 계산기 (TASK-KL-088)
 *
 * BMI 표가 두 종류라는 걸 모르면 결과를 잘못 읽는다 — 세계보건기구는 30 이상을 비만으로 보지만
 * 대한비만학회는 25 이상을 비만으로 본다(아시아인 기준). 그래서 **두 기준을 나란히** 보여준다.
 * 근육량·체지방을 구분하지 못한다는 한계도 화면에 적는다. 숫자만 주면 오해가 남는다.
 */
(function (): void {
  /** [상한(미만), 이름] — 대한비만학회(아시아·태평양) 기준 */
  const KR: Array<[number, string]> = [
    [18.5, '저체중'],
    [23, '정상'],
    [25, '비만 전단계 (과체중)'],
    [30, '1단계 비만'],
    [35, '2단계 비만'],
    [Infinity, '3단계 비만']
  ];
  /** WHO 국제 기준 */
  const WHO: Array<[number, string]> = [
    [18.5, '저체중'],
    [25, '정상'],
    [30, '과체중'],
    [35, '1단계 비만'],
    [40, '2단계 비만'],
    [Infinity, '3단계 비만']
  ];

  const classify = (bmi: number, table: Array<[number, string]>): string => {
    for (const [hi, name] of table) if (bmi < hi) return name;
    return '';
  };

  Toolbox.register({
    id: 'bmi',
    title: 'BMI 계산기',
    category: 'tool',
    desc: '키와 몸무게로 체질량지수를 계산하고 대한비만학회·WHO 두 기준으로 함께 봅니다',
    layout: 'form',
    icon: '<circle cx="12" cy="5" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 8v7M9 22l3-7 3 7M7 11h10" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '계산',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">키 (cm)</div>
                  <input type="number" id="bmH" aria-label="키 (cm)" value="170" step="0.1" min="50" max="250">
                </div>
                <div>
                  <div class="tool-sublabel">몸무게 (kg)</div>
                  <input type="number" id="bmW" aria-label="몸무게 (kg)" value="65" step="0.1" min="10" max="300">
                </div>
              </div>
            </div>

            <div class="tool-display" id="bmValue">—</div>
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
            const cm = parseFloat(h.value);
            const kg = parseFloat(w.value);
            if (!isFinite(cm) || !isFinite(kg) || cm <= 0 || kg <= 0) {
              value.textContent = '—';
              stats.innerHTML = '';
              detail.innerHTML = '';
              status.textContent = '키와 몸무게를 넣어 주세요.';
              status.className = 'tool-status';
              return;
            }
            const m = cm / 100;
            const bmi = kg / (m * m);
            value.textContent = bmi.toFixed(1);

            stats.innerHTML =
              stat('대한비만학회 기준', classify(bmi, KR), true) + stat('WHO 국제 기준', classify(bmi, WHO));

            // 「정상 범위 몸무게」 는 BMI 자체보다 실제로 궁금해하는 값이다.
            const lo = 18.5 * m * m;
            const hiKr = 23 * m * m;
            const hiWho = 25 * m * m;
            detail.innerHTML =
              row('정상 범위 (대한비만학회)', `${lo.toFixed(1)} ~ ${hiKr.toFixed(1)} kg`) +
              row('정상 범위 (WHO)', `${lo.toFixed(1)} ~ ${hiWho.toFixed(1)} kg`) +
              row('표준체중 (BMI 22 기준)', `${(22 * m * m).toFixed(1)} kg`) +
              row('계산식', 'BMI = 몸무게(kg) ÷ 키(m)의 제곱');

            status.textContent =
              'BMI 는 근육과 지방을 구분하지 못합니다. 운동량이 많거나 체격이 다른 경우 실제 상태와 다를 수 있어, 건강 판단은 전문가 진료로 확인하세요.';
            status.className = 'tool-status';
            Toolbox.trackUse?.('calc');
          }

          [h, w].forEach((el) => el.addEventListener('input', run));
          run();
        }
      }
    ]
  });
})();
