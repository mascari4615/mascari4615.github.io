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
    defaults: number[];
  }

  const ROWS: Row[] = [
    {
      parts: [null, '의 ', null, '% 는?'],
      defaults: [200, 15],
      calc: (v) => `${fmt((v[0] * v[1]) / 100)}`
    },
    {
      parts: [null, '은 ', null, '의 몇 % ?'],
      defaults: [30, 200],
      calc: (v) => `${fmt((v[0] / v[1]) * 100)} %`
    },
    {
      parts: [null, '에서 ', null, '(으)로 바뀌면 몇 % 변화?'],
      defaults: [100, 80],
      calc: (v) => {
        const d = ((v[1] - v[0]) / v[0]) * 100;
        return `${d >= 0 ? '+' : ''}${fmt(d)} % (${d >= 0 ? '증가' : '감소'})`;
      }
    },
    {
      parts: [null, '에 ', null, '% 를 더하면?'],
      defaults: [50000, 10],
      calc: (v) => `${fmt(v[0] * (1 + v[1] / 100))}`
    },
    {
      parts: [null, '에서 ', null, '% 를 빼면?'],
      defaults: [50000, 30],
      calc: (v) => `${fmt(v[0] * (1 - v[1] / 100))}`
    },
    {
      parts: [null, '이 원래 값의 ', null, '% 라면 원래 값은?'],
      defaults: [80, 40],
      calc: (v) => `${fmt((v[0] / v[1]) * 100)}`
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
            const line = row.parts
              .map((p) =>
                p === null
                  ? `<input type="number" class="pc-num" data-row="${ri}" data-n="${ni++}" step="any" value="${row.defaults[ni - 1]}">`
                  : `<span class="pc-text">${p}</span>`
              )
              .join('');
            return `<div class="field-group pc-row">
                      <div class="pc-line">${line}</div>
                      <div class="pc-out" data-out="${ri}">—</div>
                    </div>`;
          }).join('');

          function run(ri: number): void {
            const inputs = [...rowsEl.querySelectorAll(`.pc-num[data-row="${ri}"]`)] as HTMLInputElement[];
            const vals = inputs.map((el) => parseFloat(el.value));
            const out = rowsEl.querySelector(`[data-out="${ri}"]`) as HTMLElement;
            if (vals.some((v) => !isFinite(v))) {
              out.textContent = '—';
              return;
            }
            out.textContent = ROWS[ri].calc(vals);
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
