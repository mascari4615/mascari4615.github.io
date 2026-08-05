/**
 * 단위 변환기 (TASK-KL-088)
 * 온도만 비선형이라 factor 대신 to/from 함수 쌍으로 둔다 — 나머지는 기준단위 배수 하나로 끝난다.
 */
(function (): void {
  interface Unit {
    id: string;
    label: string;
    factor?: number;
    to?: (v: number) => number;
    from?: (v: number) => number;
  }
  interface Category {
    id: string;
    label: string;
    units: Unit[];
    defaultFrom: string;
    defaultTo: string;
  }

  const CATEGORIES: Category[] = [
    {
      id: 'length',
      label: '길이',
      defaultFrom: 'cm',
      defaultTo: 'inch',
      units: [
        { id: 'mm', label: '밀리미터 (mm)', factor: 0.001 },
        { id: 'cm', label: '센티미터 (cm)', factor: 0.01 },
        { id: 'm', label: '미터 (m)', factor: 1 },
        { id: 'km', label: '킬로미터 (km)', factor: 1000 },
        { id: 'inch', label: '인치 (in)', factor: 0.0254 },
        { id: 'ft', label: '피트 (ft)', factor: 0.3048 },
        { id: 'yd', label: '야드 (yd)', factor: 0.9144 },
        { id: 'mile', label: '마일 (mi)', factor: 1609.344 },
        { id: 'ja', label: '자 (尺)', factor: 0.303 },
        { id: 'ri', label: '리 (里)', factor: 392.7 }
      ]
    },
    {
      id: 'weight',
      label: '무게',
      defaultFrom: 'kg',
      defaultTo: 'lb',
      units: [
        { id: 'mg', label: '밀리그램 (mg)', factor: 0.000001 },
        { id: 'g', label: '그램 (g)', factor: 0.001 },
        { id: 'kg', label: '킬로그램 (kg)', factor: 1 },
        { id: 't', label: '톤 (t)', factor: 1000 },
        { id: 'lb', label: '파운드 (lb)', factor: 0.45359237 },
        { id: 'oz', label: '온스 (oz)', factor: 0.028349523125 },
        { id: 'geun', label: '근 (600g)', factor: 0.6 },
        { id: 'don', label: '돈 (3.75g)', factor: 0.00375 },
        { id: 'nyang', label: '냥 (37.5g)', factor: 0.0375 }
      ]
    },
    {
      id: 'area',
      label: '넓이',
      defaultFrom: 'pyeong',
      defaultTo: 'm2',
      units: [
        { id: 'cm2', label: '제곱센티미터 (cm²)', factor: 0.0001 },
        { id: 'm2', label: '제곱미터 (m²)', factor: 1 },
        { id: 'km2', label: '제곱킬로미터 (km²)', factor: 1000000 },
        { id: 'pyeong', label: '평', factor: 3.3057851 },
        { id: 'ha', label: '헥타르 (ha)', factor: 10000 },
        { id: 'acre', label: '에이커 (ac)', factor: 4046.8564224 },
        { id: 'ft2', label: '제곱피트 (ft²)', factor: 0.09290304 }
      ]
    },
    {
      id: 'volume',
      label: '부피',
      defaultFrom: 'l',
      defaultTo: 'ml',
      units: [
        { id: 'ml', label: '밀리리터 (mL)', factor: 0.001 },
        { id: 'l', label: '리터 (L)', factor: 1 },
        { id: 'm3', label: '세제곱미터 (m³)', factor: 1000 },
        { id: 'cup', label: '컵 (240mL)', factor: 0.24 },
        { id: 'floz', label: '액량온스 (fl oz)', factor: 0.0295735295625 },
        { id: 'gal', label: '갤런 (US gal)', factor: 3.785411784 },
        { id: 'doe', label: '되 (1.8L)', factor: 1.8039 },
        { id: 'mal', label: '말 (18L)', factor: 18.039 }
      ]
    },
    {
      id: 'temp',
      label: '온도',
      defaultFrom: 'c',
      defaultTo: 'f',
      units: [
        { id: 'c', label: '섭씨 (°C)', to: (v) => v, from: (v) => v },
        { id: 'f', label: '화씨 (°F)', to: (v) => ((v - 32) * 5) / 9, from: (v) => (v * 9) / 5 + 32 },
        { id: 'k', label: '켈빈 (K)', to: (v) => v - 273.15, from: (v) => v + 273.15 }
      ]
    },
    {
      id: 'data',
      label: '데이터',
      defaultFrom: 'mb',
      defaultTo: 'gb',
      units: [
        { id: 'b', label: '바이트 (B)', factor: 1 },
        { id: 'kb', label: '킬로바이트 (KB)', factor: 1024 },
        { id: 'mb', label: '메가바이트 (MB)', factor: 1048576 },
        { id: 'gb', label: '기가바이트 (GB)', factor: 1073741824 },
        { id: 'tb', label: '테라바이트 (TB)', factor: 1099511627776 },
        { id: 'kbit', label: '킬로비트 (Kb)', factor: 128 },
        { id: 'mbit', label: '메가비트 (Mb)', factor: 131072 }
      ]
    },
    {
      id: 'speed',
      label: '속도',
      defaultFrom: 'kmh',
      defaultTo: 'ms',
      units: [
        { id: 'ms', label: '미터/초 (m/s)', factor: 1 },
        { id: 'kmh', label: '킬로미터/시 (km/h)', factor: 0.2777777778 },
        { id: 'mph', label: '마일/시 (mph)', factor: 0.44704 },
        { id: 'knot', label: '노트 (kn)', factor: 0.5144444444 },
        { id: 'mach', label: '마하 (Mach)', factor: 340.29 }
      ]
    },
    {
      id: 'time',
      label: '시간',
      defaultFrom: 'min',
      defaultTo: 'sec',
      units: [
        { id: 'ms', label: '밀리초 (ms)', factor: 0.001 },
        { id: 'sec', label: '초 (s)', factor: 1 },
        { id: 'min', label: '분 (min)', factor: 60 },
        { id: 'hour', label: '시간 (h)', factor: 3600 },
        { id: 'day', label: '일 (d)', factor: 86400 },
        { id: 'week', label: '주 (w)', factor: 604800 },
        { id: 'month', label: '개월 (30일)', factor: 2592000 },
        { id: 'year', label: '년 (365일)', factor: 31536000 }
      ]
    }
  ];

  function toBase(u: Unit, v: number): number {
    return u.to ? u.to(v) : v * (u.factor ?? 1);
  }
  function fromBase(u: Unit, v: number): number {
    return u.from ? u.from(v) : v / (u.factor ?? 1);
  }
  function pretty(n: number): string {
    if (!isFinite(n)) return '-';
    const abs = Math.abs(n);
    if (abs !== 0 && (abs < 0.0001 || abs >= 1e15)) return n.toExponential(6);
    const fixed = abs >= 100 ? 4 : abs >= 1 ? 6 : 8;
    return parseFloat(n.toFixed(fixed)).toLocaleString('ko-KR', { maximumFractionDigits: 8 });
  }

  Toolbox.register({
    id: 'unitconv',
    title: '단위 변환',
    category: 'tool',
    desc: '길이·무게·넓이(평)·부피·온도·데이터·속도·시간을 서로 변환합니다',
    layout: 'form',
    icon: '<path d="M3 8h13l-3-3M21 16H8l3 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '단위',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '평수 계산도 제가 해 드릴게요.' });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">분류</label>
              <div class="tool-chips" id="ucCats">
                ${CATEGORIES.map((c, i) => `<button type="button" class="tool-chip${i === 0 ? ' active' : ''}" data-cat="${c.id}">${c.label}</button>`).join('')}
              </div>
            </div>
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">입력</div>
                  <input type="text" id="ucValue" inputmode="decimal" value="1">
                  <select id="ucFrom" style="margin-top:8px;"></select>
                </div>
                <div>
                  <div class="tool-sublabel">결과</div>
                  <input type="text" id="ucResult" readonly>
                  <select id="ucTo" style="margin-top:8px;"></select>
                </div>
              </div>
              <div style="display:flex; gap:6px; margin-top:10px;">
                <button class="btn btn-ghost" id="ucSwap">↕ 단위 뒤집기</button>
                <button class="btn btn-ghost" id="ucCopy">결과 복사</button>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label">전체 단위 환산</label>
              <div id="ucAll" class="tool-list"></div>
            </div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const valueInput = $<HTMLInputElement>('#ucValue');
          const resultInput = $<HTMLInputElement>('#ucResult');
          const fromSel = $<HTMLSelectElement>('#ucFrom');
          const toSel = $<HTMLSelectElement>('#ucTo');
          const allEl = $<HTMLElement>('#ucAll');
          let cat = CATEGORIES[0];

          function fillUnits(): void {
            const opts = cat.units.map((u) => `<option value="${u.id}">${u.label}</option>`).join('');
            fromSel.innerHTML = opts;
            toSel.innerHTML = opts;
            fromSel.value = cat.defaultFrom;
            toSel.value = cat.defaultTo;
          }
          function render(): void {
            const v = parseFloat(valueInput.value.replace(/,/g, ''));
            const from = cat.units.find((u) => u.id === fromSel.value);
            const to = cat.units.find((u) => u.id === toSel.value);
            if (!from || !to || isNaN(v)) {
              resultInput.value = '';
              allEl.innerHTML = '';
              return;
            }
            const base = toBase(from, v);
            resultInput.value = pretty(fromBase(to, base));
            allEl.innerHTML = cat.units
              .map(
                (u) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${u.label}</span><span class="tool-list-val">${pretty(fromBase(u, base))}</span></div>`
              )
              .join('');
          }

          container.querySelectorAll('.tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('.tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              cat = CATEGORIES.find((c) => c.id === (chip as HTMLElement).dataset.cat) || CATEGORIES[0];
              fillUnits();
              render();
            };
          });
          [valueInput, fromSel, toSel].forEach((el) => {
            el.addEventListener('input', render);
            el.addEventListener('change', render);
          });
          $<HTMLButtonElement>('#ucSwap').onclick = () => {
            const a = fromSel.value;
            fromSel.value = toSel.value;
            toSel.value = a;
            render();
          };
          $<HTMLButtonElement>('#ucCopy').onclick = async () => {
            if (!resultInput.value) return;
            await Toolbox.copyText?.(resultInput.value, { message: '결과를 복사했어요' });
          };

          fillUnits();
          render();
        }
      }
    ]
  });
})();
