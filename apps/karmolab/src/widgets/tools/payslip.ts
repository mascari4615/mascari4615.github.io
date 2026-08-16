/**
 * 실수령액 (TASK-KL-316 / 34)
 *
 * 「계산」 작업대의 할 일 한 칸. 셈은 `core/payslip`.
 * 사이트마다 답이 갈리는 세 가지를 **화면에 드러낸다**: 비과세·보험료 상한·세금 어림 방식.
 * 회사는 간이세액표로 떼므로 세금은 **어림**이라고 적고, 표의 기준 해도 같이 보여 준다.
 */
import { fromYearly, monthly, YEAR, type Slip } from '../../core/payslip';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { spec } from '../../core/payslip';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  const won = (n: number): string => n.toLocaleString();

  Toolbox.register({
    id: 'payslip',
    title: t('widgets.payslip.title', undefined, '실수령액'),
    category: 'tool',
    desc: t(
      'widgets-desc.payslip.desc',
      undefined,
      '연봉·월급에서 4대보험과 세금을 떼고 통장에 들어오는 돈을 계산합니다. 비과세·부양가족까지 반영합니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 9v6M18 9v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('payslip.tab', undefined, '실수령액'),
        build: function (container: HTMLElement): void {
          void loadNamespace('payslip').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('payslip.mdd') });
    container.innerHTML = `
      <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin-bottom:10px;">
        <div>
          <label class="field-label" for="psBasis">${esc(t('payslip.label.basis'))}</label>
          <select id="psBasis" name="basis" aria-label="${esc(t('payslip.label.basis'))}">
            <option value="yearly">${esc(t('payslip.basis.yearly'))}</option>
            <option value="monthly">${esc(t('payslip.basis.monthly'))}</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="psAmount">${esc(t('payslip.label.amount'))}</label>
          <input type="text" id="psAmount" name="salary" aria-label="${esc(t('payslip.label.amount'))}" class="mono-input" value="36,000,000" inputmode="numeric">
        </div>
        <div>
          <label class="field-label" for="psTaxFree">${esc(t('payslip.label.taxFree'))}</label>
          <input type="text" id="psTaxFree" name="taxFree" aria-label="${esc(t('payslip.label.taxFree'))}" class="mono-input" value="200,000" inputmode="numeric">
        </div>
        <div>
          <label class="field-label" for="psFamily">${esc(t('payslip.label.family'))}</label>
          <input type="number" id="psFamily" name="family" aria-label="${esc(t('payslip.label.family'))}" class="mono-input" min="1" max="10" value="1" style="width:80px;">
        </div>
        <div>
          <label class="field-label" for="psChildren">${esc(t('payslip.label.children'))}</label>
          <input type="number" id="psChildren" name="children" aria-label="${esc(t('payslip.label.children'))}" class="mono-input" min="0" max="8" value="0" style="width:80px;">
        </div>
      </div>
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('payslip.label.breakdown'))}</div>
          <div id="psRows" class="tool-list"></div>
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('payslip.label.net'))}</div>
          <div id="psNet" style="font-size:28px; font-weight:700; padding:12px 0;"></div>
          <div id="psYearly" class="tool-list"></div>
        </div>
      </div>
      <div class="tool-status" id="psStatus">${esc(t('payslip.status.idle'))}</div>
      <p class="tool-hint">${esc(t('payslip.note.estimate', { year: YEAR }))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const status = $<HTMLElement>('#psStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    const number = (id: string): number => Number($<HTMLInputElement>(id).value.replace(/[^\d]/g, '')) || 0;

    function render(): void {
      const amount = number('#psAmount');
      const taxFree = number('#psTaxFree');
      const family = Number($<HTMLInputElement>('#psFamily').value) || 1;
      const children = Number($<HTMLInputElement>('#psChildren').value) || 0;
      if (amount <= 0) {
        $<HTMLElement>('#psRows').innerHTML = '';
        $<HTMLElement>('#psNet').textContent = '';
        status.textContent = t('payslip.status.idle');
        return;
      }
      const isYearly = $<HTMLSelectElement>('#psBasis').value === 'yearly';
      const slip: Slip = isYearly
        ? fromYearly({ yearly: amount, monthly: 0, taxFree, family, children })
        : monthly({ monthly: amount, taxFree, family, children });

      const row = (key: string, value: number, dim?: string): string =>
        '<div class="tool-list-row"><span class="tool-list-key">' + esc(t('payslip.row.' + key)) + '</span>' +
        '<span class="tool-list-val" style="font-family:var(--font-mono)">' + esc(won(value)) + '</span>' +
        '<span class="tool-list-dim">' + esc(dim ?? '') + '</span></div>';

      $<HTMLElement>('#psRows').innerHTML = [
        row('gross', slip.gross),
        slip.taxFree > 0 ? row('taxFree', slip.taxFree, t('payslip.row.taxFreeNote')) : '',
        row('pension', -slip.pension, '4.5%'),
        row('health', -slip.health, '3.545%'),
        row('care', -slip.care, t('payslip.row.careNote')),
        row('employment', -slip.employment, '0.9%'),
        row('incomeTax', -slip.incomeTax, t('payslip.row.taxNote')),
        row('localTax', -slip.localTax, '10%'),
        row('deductions', -slip.deductions)
      ]
        .filter((s) => s !== '')
        .join('');

      $<HTMLElement>('#psNet').textContent = won(slip.net) + ' ' + t('payslip.perMonth');
      $<HTMLElement>('#psYearly').innerHTML = [
        row('netYear', slip.net * 12),
        row('grossYear', slip.gross * 12),
        row('rateKept', Math.round((slip.net / slip.gross) * 1000) / 10)
      ].join('');
      status.textContent = t('payslip.status.ok', { year: slip.year });
    }

    container.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', render));
    $<HTMLSelectElement>('#psBasis').addEventListener('change', render);

    // 주소로 부른 경우 (`?op=yearly&salary=36000000`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined) {
      if (call.args.salary !== undefined) $<HTMLInputElement>('#psAmount').value = String(call.args.salary);
      if (call.op === 'monthly') $<HTMLSelectElement>('#psBasis').value = 'monthly';
      if (call.args.taxFree !== undefined) $<HTMLInputElement>('#psTaxFree').value = String(call.args.taxFree);
      if (call.args.family !== undefined) $<HTMLInputElement>('#psFamily').value = String(call.args.family);
    }

    render();
  }
})();
