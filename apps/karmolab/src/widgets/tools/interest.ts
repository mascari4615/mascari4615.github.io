/**
 * 예금·적금·대출 이자 계산기 (TASK-KL-088)
 *
 * 광고 문구의 「연 4%」 와 손에 들어오는 금액이 다른 이유는 두 가지다 —
 * ① 적금은 매달 넣은 돈이 각각 다른 기간만 굴러간다 ② 이자소득세 15.4% 가 떼인다.
 * 그래서 세전·세후를 나란히 보여주고, 대출은 원리금균등 상환표까지 펼친다.
 */
import { annuityPayment, depositInterest, savingInterest, spec, TAX_RATE } from '../../core/interest';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  /* 돈은 **보는 사람의 언어로** 적는다. 다만 통화는 KRW 그대로다 — 한국 상품의 금액이라
   * 달러로 바꿔 적으면 거짓말이 된다. core 의 `won` 은 MCP 글자 출력이 그대로 쓰므로 안 건드린다. */
  const money = (n: number): string =>
    new Intl.NumberFormat(locale(), { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(
      Math.round(n)
    );

  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const TAX = TAX_RATE;
  const deposit = depositInterest;
  const saving = savingInterest;
  const annuity = annuityPayment;

  Toolbox.register({
    id: 'interest',
    title: t('widgets.interest.title', undefined, "이자 계산기"),
    category: 'tool',
    desc: t('widgets-desc.interest.desc', undefined, "예금·적금 만기 금액과 대출 월 상환액을 계산합니다. 이자소득세 15.4% 반영"),
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.4V13m0 2.5v.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('interest.t06', undefined, "계산"),
        build: function (container: HTMLElement): void {
          void loadNamespace('interest').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <div class="tool-chips" id="itMode">
                <button type="button" class="tool-chip active" data-mode="saving">${esc(t('interest.mode.savings'))}</button>
                <button type="button" class="tool-chip" data-mode="deposit">${esc(t('interest.mode.deposit'))}</button>
                <button type="button" class="tool-chip" data-mode="loan">${esc(t('interest.mode.loan'))}</button>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label" id="itAmountLabel">${esc(t('interest.label.savings'))}</label>
              <input type="number" id="itAmount" aria-label="${esc(t('interest.label.amount'))}" value="500000" step="10000" min="0">
            </div>
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('interest.label.rate'))}</div>
                  <input type="number" id="itRate" aria-label="${esc(t('interest.label.rate'))}" value="3.5" step="0.1" min="0">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('interest.label.months'))}</div>
                  <input type="number" id="itMonths" aria-label="${esc(t('interest.label.months'))}" value="12" step="1" min="1">
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
              mode === 'saving' ? t('interest.label.savings') : mode === 'deposit' ? t('interest.label.deposit') : t('interest.label.loan');
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
                stat(t('interest.row.monthly'), money(monthly), true) +
                stat(t('interest.row.totalPaid'), money(total)) +
                stat(t('interest.row.totalInterest'), money(total - a));
              detail.innerHTML =
                row(t('interest.row.borrowed'), money(a)) +
                row(t('interest.row.method'), t('interest.method.equal')) +
                row(t('interest.row.firstInterest'), money((a * r) / 100 / 12)) +
                row(t('interest.row.interestShare'), `${((total - a) / a * 100).toFixed(1)}%`);
              status.textContent = t('interest.note.loan');
              status.className = 'tool-status';
            } else {
              const principal = mode === 'saving' ? a * m : a;
              const gross = mode === 'saving' ? saving(a, r, m) : deposit(a, r, m);
              const tax = gross * TAX;
              stats.innerHTML =
                stat(t('interest.row.afterTax'), money(principal + gross - tax), true) +
                stat(t('interest.label.amount'), money(principal)) +
                stat(t('interest.row.interestAfterTax'), money(gross - tax));
              detail.innerHTML =
                row(t('interest.row.interestBeforeTax'), money(gross)) +
                row(t('interest.row.tax'), '-' + money(tax)) +
                row(
                  t('interest.row.realReturn'),
                  t('interest.value.wholeTerm', { pct: (((gross - tax) / principal) * 100).toFixed(2) })
                ) +
                (mode === 'saving'
                  ? row(t('interest.row.whyLess'), t('interest.why.answer'))
                  : row(t('interest.row.basis'), t('interest.basis.simple')));
              status.textContent =
                mode === 'saving'
                  ? t('interest.note.savings')
                  : t('interest.note.deposit');
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
                  });
        }
      }
    ]
  });
})();
