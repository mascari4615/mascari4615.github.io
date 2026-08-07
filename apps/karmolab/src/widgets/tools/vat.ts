/**
 * 부가세 계산기 (TASK-KL-088)
 *
 * 「11만원에서 부가세는 1만원」 인데 「10만원의 10%도 1만원」 이라 헷갈린다 —
 * 공급가에서 더할 때와 총액에서 뺄 때 나누는 수가 다르기 때문이다(1.1 로 나눠야 한다).
 * 이걸 방향별로 갈라 놓고, 세금계산서에 그대로 옮길 세 줄(공급가·세액·합계)을 낸다.
 */
(function (): void {
  const won = (n: number): string => Math.round(n).toLocaleString('ko-KR') + '원';

  Toolbox.register({
    id: 'vat',
    title: '부가세 계산기',
    category: 'tool',
    desc: '공급가에서 부가세를 더하거나 총액에서 빼냅니다. 세금계산서 세 줄 그대로',
    layout: 'form',
    icon: '<path d="M4 20 20 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7 4h10a2 2 0 0 1 2 2v3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="7" cy="8" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="17" cy="16" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: '부가세',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-chips" id="vaMode">
                <button type="button" class="tool-chip active" data-mode="add">공급가 → 합계 (부가세 더하기)</button>
                <button type="button" class="tool-chip" data-mode="sub">합계 → 공급가 (부가세 빼내기)</button>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label" id="vaLabel">공급가액</label>
              <input type="number" id="vaAmount" aria-label="공급가액" value="1000000" step="1000" min="0">
            </div>
            <div class="field-group">
              <div class="tool-sublabel">세율 (%)</div>
              <input type="number" id="vaRate" aria-label="세율 (%)" value="10" step="0.1" min="0">
            </div>

            <div class="cc-stats" id="vaStats"></div>
            <div class="tool-list" id="vaOut"></div>
            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-ghost" id="vaCopy">세 줄 복사</button>
            </div>
            <div class="tool-status" id="vaStatus">총액에서 뺄 때는 1.1 로 나눕니다 — 10%를 빼는 것과 다릅니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const amount = $<HTMLInputElement>('#vaAmount');
          const rateEl = $<HTMLInputElement>('#vaRate');
          const label = $<HTMLElement>('#vaLabel');
          const stats = $<HTMLElement>('#vaStats');
          const out = $<HTMLElement>('#vaOut');
          let mode = 'add';
          let last = { supply: 0, tax: 0, total: 0 };

          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;
          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          function run(): void {
            const v = parseFloat(amount.value) || 0;
            const rate = (parseFloat(rateEl.value) || 0) / 100;
            let supply: number;
            let tax: number;
            let total: number;
            if (mode === 'add') {
              supply = v;
              tax = v * rate;
              total = supply + tax;
            } else {
              // 총액에서 공급가를 뽑을 때는 (1 + 세율) 로 나눈다. 10% 를 그냥 빼면 틀린다.
              total = v;
              supply = v / (1 + rate);
              tax = total - supply;
            }
            last = { supply, tax, total };
            stats.innerHTML =
              stat(mode === 'add' ? '합계 (받을 돈)' : '공급가액', won(mode === 'add' ? total : supply), true) +
              stat('부가세', won(tax)) +
              stat('세율', `${(rate * 100).toFixed(1)}%`);
            out.innerHTML =
              row('공급가액', won(supply)) +
              row('부가세액', won(tax)) +
              row('합계 금액', won(total)) +
              row('참고', mode === 'sub' ? `총액 ÷ ${(1 + rate).toFixed(2)} 로 계산` : `공급가 × ${(1 + rate).toFixed(2)}`);
            Toolbox.trackUse?.(mode);
          }

          container.querySelectorAll('#vaMode .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#vaMode .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              mode = (chip as HTMLElement).dataset.mode || 'add';
              label.textContent = mode === 'add' ? '공급가액' : '합계 금액 (부가세 포함)';
              amount.value = mode === 'add' ? '1000000' : '1100000';
              run();
            };
          });
          [amount, rateEl].forEach((el) => el.addEventListener('input', run));
          $<HTMLButtonElement>('#vaCopy').onclick = () => {
            void Toolbox.copyText?.(
              `공급가액 ${won(last.supply)}\n부가세액 ${won(last.tax)}\n합계금액 ${won(last.total)}`,
              { message: '세 줄을 복사했어요' }
            );
          };
          run();
        }
      }
    ]
  });
})();
