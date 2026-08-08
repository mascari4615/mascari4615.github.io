/**
 * 퍼센트 계산기 (TASK-KL-088)
 *
 * 「20% 가 얼마지」 와 「30 은 200 의 몇 % 지」 와 「100 에서 80 이면 몇 % 줄었지」 는
 * 전부 다른 식인데, 계산기 하나에 몰아넣으면 어느 칸에 뭘 넣을지부터 헷갈린다.
 * 그래서 **질문 문장 그대로** 줄을 나누고, 각 줄이 빈칸 채우기가 되게 한다.
 */
(function (): void {
  const fmt = (n: number): string => {
    if (!isFinite(n)) return '—';
    const r = Math.round(n * 1e6) / 1e6;
    return r.toLocaleString('ko-KR', { maximumFractionDigits: 6 });
  };

  interface Row {
    /** 문장 조각 — 숫자 칸은 null */
    parts: (string | null)[];
    calc: (v: number[]) => string;
    /** 풀이 식 한 줄 — 「맞게 넣었나」를 사람이 확인하는 유일한 장치다. 남들은 전부 준다. */
    formula: (v: number[]) => string;
    defaults: number[];
  }

  const ROWS: Row[] = [
    {
      parts: [null, '의 ', null, '% 는?'],
      defaults: [200, 15],
      calc: (v) => `${fmt((v[0] * v[1]) / 100)}`,
      formula: (v) => `${fmt(v[0])} × ${fmt(v[1])} ÷ 100`
    },
    {
      parts: [null, '은 ', null, '의 몇 % ?'],
      defaults: [30, 200],
      calc: (v) => `${fmt((v[0] / v[1]) * 100)} %`,
      formula: (v) => `${fmt(v[0])} ÷ ${fmt(v[1])} × 100`
    },
    {
      parts: [null, '에서 ', null, '(으)로 바뀌면 몇 % 변화?'],
      defaults: [100, 80],
      calc: (v) => {
        const d = ((v[1] - v[0]) / v[0]) * 100;
        return `${d >= 0 ? '+' : ''}${fmt(d)} % (${d >= 0 ? '증가' : '감소'})`;
      },
      formula: (v) => `(${fmt(v[1])} − ${fmt(v[0])}) ÷ ${fmt(v[0])} × 100`
    },
    {
      parts: [null, '에 ', null, '% 를 더하면?'],
      defaults: [50000, 10],
      calc: (v) => `${fmt(v[0] * (1 + v[1] / 100))}`,
      formula: (v) => `${fmt(v[0])} × (1 + ${fmt(v[1])} ÷ 100)`
    },
    {
      parts: [null, '에서 ', null, '% 를 빼면?'],
      defaults: [50000, 30],
      calc: (v) => `${fmt(v[0] * (1 - v[1] / 100))}`,
      formula: (v) => `${fmt(v[0])} × (1 − ${fmt(v[1])} ÷ 100)`
    },
    {
      /* 연속 할인 — 「30% 먼저, 추가 10%」는 37%가 아니라 37% 가 아니다(0.7×0.9=0.63 → 37% 할인).
         실제로 자주 헷갈리는데 상위 계산기 어디에도 이 줄이 없다. */
      parts: [null, '에서 ', null, '% 할인 후 추가 ', null, '% 할인하면?'],
      defaults: [50000, 30, 10],
      calc: (v) => {
        const price = v[0] * (1 - v[1] / 100) * (1 - v[2] / 100);
        const eff = (1 - price / v[0]) * 100;
        return `${fmt(price)} (합쳐서 ${fmt(eff)}% 할인)`;
      },
      formula: (v) => `${fmt(v[0])} × (1 − ${fmt(v[1])} ÷ 100) × (1 − ${fmt(v[2])} ÷ 100)`
    },
    {
      parts: [null, '이 원래 값의 ', null, '% 라면 원래 값은?'],
      defaults: [80, 40],
      calc: (v) => `${fmt((v[0] / v[1]) * 100)}`,
      formula: (v) => `${fmt(v[0])} ÷ ${fmt(v[1])} × 100`
    }
  ];

  Toolbox.register({
    id: 'percent',
    title: '퍼센트 계산기',
    category: 'tool',
    desc: '할인율·증감률·비율을 질문 문장 그대로 채워 넣어 계산합니다',
    layout: 'form',
    icon: '<path d="M19 5 5 19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="16.5" cy="16.5" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: '계산',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div id="pcRows"></div>
            <div class="tool-status">숫자를 고치면 결과가 바로 바뀝니다. 값은 저장되지 않습니다.</div>
          `;
          const rowsEl = container.querySelector('#pcRows') as HTMLElement;

          rowsEl.innerHTML = ROWS.map((row, ri) => {
            let ni = 0;
            // 화면에서는 문장 사이에 숫자칸이 끼워져 있어 무엇을 넣는지 눈으로 보인다.
            // 화면낭독기는 그 문장을 대신 읽어 주지 않으므로 칸마다 이어 준다 (TASK-KL-089).
            // 빈칸을 빼고 이으면 「의 % 는?」처럼 조사만 남아 문장이 안 읽힌다. 빈칸을 표시해 둔다.
            const sentence = row.parts
              .map((p) => (p === null ? '몇' : p))
              .join('')
              .replace(/\s+/g, ' ')
              .trim();
            const blanks = row.parts.filter((p) => p === null).length;
            const line = row.parts
              .map((p) => {
                if (p !== null) return `<span class="pc-text">${p}</span>`;
                const label = blanks > 1 ? `${sentence} — ${ni + 1}번째 값` : sentence;
                return `<input type="number" class="pc-num" aria-label="${label}" data-row="${ri}" data-n="${ni++}" step="any" value="${row.defaults[ni - 1]}">`;
              })
              .join('');
            return `<div class="field-group pc-row">
                      <div class="pc-line">${line}</div>
                      <div class="pc-out" data-out="${ri}">—</div>
                      <div class="pc-formula" data-formula="${ri}"></div>
                    </div>`;
          }).join('');

          function run(ri: number): void {
            const inputs = [...rowsEl.querySelectorAll(`.pc-num[data-row="${ri}"]`)] as HTMLInputElement[];
            const vals = inputs.map((el) => parseFloat(el.value));
            const out = rowsEl.querySelector(`[data-out="${ri}"]`) as HTMLElement;
            if (vals.some((v) => !isFinite(v))) {
              out.textContent = '—';
              const fx = rowsEl.querySelector(`[data-formula="${ri}"]`) as HTMLElement;
              if (fx) fx.textContent = '';
              return;
            }
            out.textContent = ROWS[ri].calc(vals);
            const f = rowsEl.querySelector(`[data-formula="${ri}"]`) as HTMLElement;
            if (f) f.textContent = ROWS[ri].formula(vals);
          }

          rowsEl.querySelectorAll('.pc-num').forEach((el) => {
            el.addEventListener('input', () => {
              run(Number((el as HTMLElement).dataset.row));
              Toolbox.trackUse?.('calc');
            });
          });
          // 결과를 눌러 복사 — 계산 결과는 대개 어딘가에 옮겨 적힌다.
          rowsEl.querySelectorAll('.pc-out').forEach((el) => {
            (el as HTMLElement).onclick = () => {
              const t = el.textContent || '';
              if (t === '—') return;
              void Toolbox.copyText?.(t.replace(/[^\d.+\-]/g, ''), { message: `복사: ${t}` });
            };
          });

          ROWS.forEach((_, i) => run(i));
        }
      }
    ]
  });
})();
