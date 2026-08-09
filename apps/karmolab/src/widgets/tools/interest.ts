/**
 * 예금·적금·대출 이자 계산기 (TASK-KL-088)
 *
 * 광고 문구의 「연 4%」 와 손에 들어오는 금액이 다른 이유는 두 가지다 —
 * ① 적금은 매달 넣은 돈이 각각 다른 기간만 굴러간다 ② 이자소득세 15.4% 가 떼인다.
 * 그래서 세전·세후를 나란히 보여주고, 대출은 원리금균등 상환표까지 펼친다.
 */
import { annuityPayment, depositInterest, savingInterest, spec, TAX_RATE, won } from '../../core/interest';
import { readInvocation } from '../../lib/tool-url';

(function (): void {
  const TAX = TAX_RATE;
  const deposit = depositInterest;
  const saving = savingInterest;
  const annuity = annuityPayment;

  Toolbox.register({
    id: 'interest',
    title: '이자 계산기',
    category: 'tool',
    desc: '예금·적금 만기 금액과 대출 월 상환액을 계산합니다. 이자소득세 15.4% 반영',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.4V13m0 2.5v.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '계산',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-chips" id="itMode">
                <button type="button" class="tool-chip active" data-mode="saving">적금</button>
                <button type="button" class="tool-chip" data-mode="deposit">예금</button>
                <button type="button" class="tool-chip" data-mode="loan">대출</button>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label" id="itAmountLabel">매달 넣는 금액</label>
              <input type="number" id="itAmount" aria-label="원금" value="500000" step="10000" min="0">
            </div>
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">연 이자율 (%)</div>
                  <input type="number" id="itRate" aria-label="연 이자율 (%)" value="3.5" step="0.1" min="0">
                </div>
                <div>
                  <div class="tool-sublabel">기간 (개월)</div>
                  <input type="number" id="itMonths" aria-label="기간 (개월)" value="12" step="1" min="1">
                </div>
              </div>
            </div>

            <div class="cc-stats" id="itStats"></div>
            <div class="tool-list" id="itDetail"></div>
            <div class="tool-status" id="itStatus"></div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const amount = $<HTMLInputElement>('#itAmount');
          const rate = $<HTMLInputElement>('#itRate');
          const months = $<HTMLInputElement>('#itMonths');
          const stats = $<HTMLElement>('#itStats');
          const detail = $<HTMLElement>('#itDetail');
          const status = $<HTMLElement>('#itStatus');
          const amountLabel = $<HTMLElement>('#itAmountLabel');
          let mode = 'saving';

          /* 라벨 문구는 **한 곳에서만** 적는다. 두 군데(칩 누를 때·주소로 열 때)에 같은 글을
             복사해 두면 다국어로 뺄 때 하나가 남는다 — 검사가 그걸 잡는다(KL-203). */
          function applyMode(): void {
            amountLabel.textContent =
              mode === 'saving' ? '매달 넣는 금액' : mode === 'deposit' ? '맡기는 금액' : '빌리는 금액';
          }

          const stat = (label: string, value: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${label}</div><div class="cc-stat-value">${value}</div></div>`;
          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          function run(): void {
            const a = parseFloat(amount.value) || 0;
            const r = parseFloat(rate.value) || 0;
            const m = Math.max(1, Math.round(parseFloat(months.value) || 1));

            if (mode === 'loan') {
              const monthly = annuity(a, r, m);
              const total = monthly * m;
              stats.innerHTML =
                stat('월 상환액', won(monthly), true) +
                stat('총 상환액', won(total)) +
                stat('총 이자', won(total - a));
              detail.innerHTML =
                row('빌린 금액', won(a)) +
                row('상환 방식', '원리금균등 — 매달 같은 금액') +
                row('첫 달 이자', won((a * r) / 100 / 12)) +
                row('이자 비중', `${((total - a) / a * 100).toFixed(1)}%`);
              status.textContent = '중도상환수수료·인지세 등 부대비용은 포함하지 않았습니다.';
              status.className = 'tool-status';
            } else {
              const principal = mode === 'saving' ? a * m : a;
              const gross = mode === 'saving' ? saving(a, r, m) : deposit(a, r, m);
              const tax = gross * TAX;
              stats.innerHTML =
                stat('세후 수령액', won(principal + gross - tax), true) +
                stat('원금', won(principal)) +
                stat('세후 이자', won(gross - tax));
              detail.innerHTML =
                row('세전 이자', won(gross)) +
                row('이자소득세 (15.4%)', '-' + won(tax)) +
                row('실질 수익률', `${((gross - tax) / principal * 100).toFixed(2)}% (기간 전체)`) +
                (mode === 'saving'
                  ? row('왜 연 이자율보다 적나요?', '먼저 넣은 돈만 오래 굴러서')
                  : row('계산 방식', '단리 — 복리 상품이면 결과가 더 큽니다'));
              status.textContent =
                mode === 'saving'
                  ? '정기적금(단리) 기준입니다. 우대금리·비과세 상품은 반영하지 않았습니다.'
                  : '정기예금(단리) 기준입니다. 실제 금액은 상품 약관에 따라 다를 수 있습니다.';
              status.className = 'tool-status';
            }
            Toolbox.trackUse?.(mode);
          }

          container.querySelectorAll('#itMode .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#itMode .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              mode = (chip as HTMLElement).dataset.mode || 'saving';
              applyMode();
              amount.value = mode === 'saving' ? '500000' : mode === 'deposit' ? '10000000' : '30000000';
              months.value = mode === 'loan' ? '60' : '12';
              run();
            };
          });
          [amount, rate, months].forEach((el) => el.addEventListener('input', run));

          // 주소로 부른 경우 (`?op=saving&monthly=500000&rate=4&months=12`) (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined) {
            mode = call.op;
            applyMode();
            container.querySelectorAll('#itMode .tool-chip').forEach((c) => {
              c.classList.toggle('active', (c as HTMLElement).dataset.mode === mode);
            });
            amount.value = String(call.args.monthly ?? call.args.amount ?? amount.value);
            rate.value = String(call.args.rate ?? rate.value);
            months.value = String(call.args.months ?? months.value);
          }
          run();
          if (call?.error !== undefined) {
            status.textContent = call.error;
            status.className = 'tool-status error';
          }
        }
      }
    ]
  });
})();
