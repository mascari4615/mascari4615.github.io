/**
 * 단위 변환기 (TASK-KL-088)
 * 온도만 비선형이라 factor 대신 to/from 함수 쌍으로 둔다 — 나머지는 기준단위 배수 하나로 끝난다.
 */
import { t, loadNamespace, locale } from '../../lib/i18n';
import { inRegion, region } from '../../lib/region';

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

  /**
   * 단위 이름은 **그릴 때** 정해진다 (TASK-KL-203).
   *
   * 예전에는 이 표를 파일이 실려 오자마자 만들었다. 그 시점에는 말 묶음이 아직 안 왔으므로
   * 이름 자리에 열쇠가 그대로 굳는다 — 나중에 말이 와도 표는 이미 만들어진 뒤다.
   * 그래서 함수로 두고 그릴 때 부른다.
   */
  /**
   * 어느 단위에서 어느 단위로 **처음 놓아 둘까** — 사는 곳이 정한다 (TASK-KL-203 S14-b).
   *
   * 미터법 나라 사람은 「cm 를 인치로」가 궁금하고, 미국 사람은 정확히 그 **반대**가 궁금하다.
   * 어느 쪽이든 두 칸을 바꿔 넣으면 되지만, 처음 놓인 자리가 틀리면 매번 손이 한 번 더 간다 —
   * 그리고 그 한 번이 「이 도구는 내 것이 아니구나」를 만든다.
   *
   * 넓이는 나라마다 **쓰는 단위 자체가 다르다**: 한국 평 · 일본 坪(같은 크기) · 미국 제곱피트.
   */
  const REGION_DEFAULTS: Record<string, Record<string, [string, string]>> = {
    US: {
      length: ['inch', 'cm'],
      weight: ['lb', 'kg'],
      area: ['ft2', 'm2'],
      volume: ['gal', 'l'],
      temp: ['f', 'c'],
      speed: ['mph', 'kmh']
    },
    JP: { area: ['pyeong', 'm2'] },
    XX: { area: ['m2', 'ft2'] }
  };

  /** 그 나라의 기본 짝. 안 정해 둔 갈래는 표에 적힌 기본값 그대로. */
  const defaultsFor = (id: string, from: string, to: string): [string, string] =>
    REGION_DEFAULTS[region()]?.[id] || [from, to];

  const buildCategories = (): Category[] => [
    {
      id: 'length',
      label: t('unitconv.cat.length'),
      defaultFrom: defaultsFor('length', 'cm', 'inch')[0],
      defaultTo: defaultsFor('length', 'cm', 'inch')[1],
      units: [
        { id: 'mm', label: t('unitconv.mm'), factor: 0.001 },
        { id: 'cm', label: t('unitconv.cm'), factor: 0.01 },
        { id: 'm', label: t('unitconv.m'), factor: 1 },
        { id: 'km', label: t('unitconv.km'), factor: 1000 },
        { id: 'inch', label: t('unitconv.inch'), factor: 0.0254 },
        { id: 'ft', label: t('unitconv.ft'), factor: 0.3048 },
        { id: 'yd', label: t('unitconv.yd'), factor: 0.9144 },
        { id: 'mile', label: t('unitconv.mi'), factor: 1609.344 },
        { id: 'ja', label: t('unitconv.ja_'), factor: 0.303 },
        { id: 'ri', label: t('unitconv.ri'), factor: 392.7 }
      ]
    },
    {
      id: 'weight',
      label: t('unitconv.cat.weight'),
      defaultFrom: defaultsFor('weight', 'kg', 'lb')[0],
      defaultTo: defaultsFor('weight', 'kg', 'lb')[1],
      units: [
        { id: 'mg', label: t('unitconv.mg'), factor: 0.000001 },
        { id: 'g', label: t('unitconv.g'), factor: 0.001 },
        { id: 'kg', label: t('unitconv.kg'), factor: 1 },
        { id: 't', label: t('unitconv.t'), factor: 1000 },
        { id: 'lb', label: t('unitconv.lb'), factor: 0.45359237 },
        { id: 'oz', label: t('unitconv.oz'), factor: 0.028349523125 },
        { id: 'geun', label: t('unitconv.geun'), factor: 0.6 },
        { id: 'don', label: t('unitconv.don'), factor: 0.00375 },
        { id: 'nyang', label: t('unitconv.nyang'), factor: 0.0375 }
      ]
    },
    {
      id: 'area',
      label: t('unitconv.cat.area'),
      defaultFrom: defaultsFor('area', 'pyeong', 'm2')[0],
      defaultTo: defaultsFor('area', 'pyeong', 'm2')[1],
      units: [
        { id: 'cm2', label: t('unitconv.cm2'), factor: 0.0001 },
        { id: 'm2', label: t('unitconv.m2'), factor: 1 },
        { id: 'km2', label: t('unitconv.km2'), factor: 1000000 },
        { id: 'pyeong', label: t('unitconv.pyeong'), factor: 3.3057851 },
        { id: 'ha', label: t('unitconv.ha'), factor: 10000 },
        { id: 'acre', label: t('unitconv.ac'), factor: 4046.8564224 },
        { id: 'ft2', label: t('unitconv.ft2'), factor: 0.09290304 }
      ]
    },
    {
      id: 'volume',
      label: t('unitconv.cat.volume'),
      defaultFrom: defaultsFor('volume', 'l', 'ml')[0],
      defaultTo: defaultsFor('volume', 'l', 'ml')[1],
      units: [
        { id: 'ml', label: t('unitconv.ml'), factor: 0.001 },
        { id: 'l', label: t('unitconv.l'), factor: 1 },
        { id: 'm3', label: t('unitconv.m3'), factor: 1000 },
        { id: 'cup', label: t('unitconv.cup'), factor: 0.24 },
        { id: 'floz', label: t('unitconv.floz'), factor: 0.0295735295625 },
        { id: 'gal', label: t('unitconv.gal'), factor: 3.785411784 },
        { id: 'doe', label: t('unitconv.doe'), factor: 1.8039 },
        { id: 'mal', label: t('unitconv.mal'), factor: 18.039 }
      ]
    },
    {
      id: 'temp',
      label: t('unitconv.cat.temp'),
      defaultFrom: defaultsFor('temp', 'c', 'f')[0],
      defaultTo: defaultsFor('temp', 'c', 'f')[1],
      units: [
        { id: 'c', label: t('unitconv.c'), to: (v) => v, from: (v) => v },
        { id: 'f', label: t('unitconv.f'), to: (v) => ((v - 32) * 5) / 9, from: (v) => (v * 9) / 5 + 32 },
        { id: 'k', label: t('unitconv.k'), to: (v) => v - 273.15, from: (v) => v + 273.15 }
      ]
    },
    {
      id: 'data',
      label: t('unitconv.cat.data'),
      defaultFrom: defaultsFor('data', 'mb', 'gb')[0],
      defaultTo: defaultsFor('data', 'mb', 'gb')[1],
      units: [
        { id: 'b', label: t('unitconv.B'), factor: 1 },
        { id: 'kb', label: t('unitconv.KB'), factor: 1024 },
        { id: 'mb', label: t('unitconv.MB'), factor: 1048576 },
        { id: 'gb', label: t('unitconv.GB'), factor: 1073741824 },
        { id: 'tb', label: t('unitconv.TB'), factor: 1099511627776 },
        { id: 'kbit', label: t('unitconv.Kb'), factor: 128 },
        { id: 'mbit', label: t('unitconv.Mb'), factor: 131072 }
      ]
    },
    {
      id: 'speed',
      label: t('unitconv.cat.speed'),
      defaultFrom: defaultsFor('speed', 'kmh', 'ms')[0],
      defaultTo: defaultsFor('speed', 'kmh', 'ms')[1],
      units: [
        { id: 'ms', label: t('unitconv.ms_'), factor: 1 },
        { id: 'kmh', label: t('unitconv.kmh'), factor: 0.2777777778 },
        { id: 'mph', label: t('unitconv.mph'), factor: 0.44704 },
        { id: 'knot', label: t('unitconv.kn'), factor: 0.5144444444 },
        { id: 'mach', label: t('unitconv.mach'), factor: 340.29 }
      ]
    },
    {
      id: 'time',
      label: t('unitconv.cat.time'),
      defaultFrom: defaultsFor('time', 'min', 'sec')[0],
      defaultTo: defaultsFor('time', 'min', 'sec')[1],
      units: [
        { id: 'ms', label: t('unitconv.msec'), factor: 0.001 },
        { id: 'sec', label: t('unitconv.sec'), factor: 1 },
        { id: 'min', label: t('unitconv.min'), factor: 60 },
        { id: 'hour', label: t('unitconv.hour'), factor: 3600 },
        { id: 'day', label: t('unitconv.day'), factor: 86400 },
        { id: 'week', label: t('unitconv.week'), factor: 604800 },
        { id: 'month', label: t('unitconv.month'), factor: 2592000 },
        { id: 'year', label: t('unitconv.year'), factor: 31536000 }
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
    /* 도구 큰제목이 이 값을 쓴다 — 등록 순간이라 원본을 기본값으로 함께 준다. */
    title: t('widgets.unitconv.title', undefined, '단위 변환'),
    category: 'tool',
    /* 도구 큰제목 아래 한 줄도 이 값을 쓴다 — 등록 순간이라 원본을 기본값으로 함께 준다. */
    desc: t('widgets-desc.unitconv.desc', undefined, '길이·무게·넓이(평)·부피·온도·데이터·속도·시간을 서로 변환합니다'),
    layout: 'form',
    icon: '<path d="M3 8h13l-3-3M21 16H8l3 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('unitconv.tab', undefined, '단위'),
        build: function (container: HTMLElement): void {
          void loadNamespace('unitconv').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    const CATS = buildCategories();
          Mdd.linePreset('tool_run', { msg: t('unitconv.mdd') });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">분류</label>
              <div class="tool-chips" id="ucCats">
                ${CATS.map((c, i) => `<button type="button" class="tool-chip${i === 0 ? ' active' : ''}" data-cat="${c.id}">${c.label}</button>`).join('')}
              </div>
            </div>
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">입력</div>
                  <input type="text" id="ucValue" aria-label=t('unitconv.label.value') inputmode="decimal" value="1">
                  <select id="ucFrom" aria-label=t('unitconv.label.from') style="margin-top:8px;"></select>
                </div>
                <div>
                  <div class="tool-sublabel">결과</div>
                  <input type="text" id="ucResult" aria-label=t('unitconv.label.result') readonly>
                  <select id="ucTo" aria-label=t('unitconv.label.to') style="margin-top:8px;"></select>
                </div>
              </div>
              <div style="display:flex; gap:6px; margin-top:10px;">
                <button class="btn btn-ghost" id="ucSwap">↕ 단위 뒤집기</button>
                <button class="btn btn-ghost" id="ucCopy">결과 복사</button>
              </div>
            </div>
            <div class="field-group" id="ucPriceWrap" style="display:none;">
              <label class="field-label">평당 가격</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">총액 (만원)</div>
                  <input type="text" id="ucPrice" inputmode="decimal" placeholder="예) 60000" aria-label="총액 (만원)">
                </div>
                <div>
                  <div class="tool-sublabel">넓이는 위에 넣은 값을 씁니다</div>
                  <div id="ucPriceOut" class="tool-status">총액을 넣으면 평당·㎡당 가격이 나옵니다.</div>
                </div>
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
          let cat = CATS[0];

          // 총액을 고치면 그 자리에서 다시 센다.
          $<HTMLInputElement>('#ucPrice').addEventListener('input', () => render());

          function fillUnits(): void {
            const opts = cat.units.map((u) => `<option value="${u.id}">${u.label}</option>`).join('');
            fromSel.innerHTML = opts;
            toSel.innerHTML = opts;
            fromSel.value = cat.defaultFrom;
            toSel.value = cat.defaultTo;
          }
          /**
           * 평당 가격 (넓이일 때만) — 한국에서 넓이를 재는 이유의 절반이 이것이다.
           *
           * 남들 단위 변환기는 평↔㎡ 까지만 하고 끝난다. 그런데 실제로 평수를 재는 사람은
           * **평당 얼마인지**를 알려는 것이다(집을 보러 다닐 때 유일하게 비교되는 숫자다).
           * 그래서 위에서 넣은 넓이를 그대로 써서 총액만 받으면 평당·㎡당을 같이 낸다.
           */
          function renderPrice(baseSquareMeters: number): void {
            const wrap = $<HTMLElement>('#ucPriceWrap');
            /* **평당 가격은 한국에서만 뜻이 있는 계산이다** (TASK-KL-203).
               평이라는 단위도, 「만원/억원」이라는 금액 단위도, 「평당 얼마」로 집을 비교하는
               습관도 한국 것이다. 이걸 영어·일본어로 옮기면 말은 되지만 아무도 안 쓰는 칸이
               하나 늘 뿐이다 — 옮기는 것보다 **안 보이는 게 맞다**. 그 언어에 맞는 계산이
               따로 생기면 그때 그 언어에 맞게 넣는다. */
            /* 「평당 얼마」로 집을 비교하는 습관은 한국 것이다 — 한국어를 읽느냐가 아니라
               **한국에서 집을 보느냐**가 기준이라 지역으로 가른다(영어로 읽는 한국 거주자도 쓴다). */
            const forKorea = inRegion('KR');
            wrap.style.display = forKorea && cat.id === 'area' ? '' : 'none';
            if (!forKorea || cat.id !== 'area') return;
            const out = $<HTMLElement>('#ucPriceOut');
            const 만원 = parseFloat(($<HTMLInputElement>('#ucPrice').value || '').replace(/,/g, ''));
            if (!isFinite(만원) || 만원 <= 0 || !isFinite(baseSquareMeters) || baseSquareMeters <= 0) {
              out.textContent = '총액을 넣으면 평당·㎡당 가격이 나옵니다.';
              out.className = 'tool-status';
              return;
            }
            const 평 = baseSquareMeters / 3.3057851;
            const 평당 = 만원 / 평;
            const 제곱당 = 만원 / baseSquareMeters;
            const 만원말 = (n: number): string =>
              n >= 10000 ? `${(n / 10000).toFixed(2)}억원` : `${Math.round(n).toLocaleString('ko-KR')}만원`;
            out.textContent = `${평.toFixed(2)}평 · 평당 ${만원말(평당)} · ㎡당 ${만원말(제곱당)}`;
            out.className = 'tool-status ok';
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
            renderPrice(base);
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
              cat = CATS.find((c) => c.id === (chip as HTMLElement).dataset.cat) || CATS[0];
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
            await Toolbox.copyText?.(resultInput.value, { message: t('unitconv.copied') });
          };

          fillUnits();
          render();
  }
})();
