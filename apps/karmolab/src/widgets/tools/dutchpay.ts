/**
 * 나눠 내기 (TASK-KL-316 / 33)
 *
 * 「계산」 작업대의 할 일 한 칸. 셈은 `core/dutchpay`.
 * 1원까지 맞추고, 갚는 횟수를 가장 적게 만든다. 나눠 갖기는 **주소 자체에 담는다** — 서버에 안 맡긴다.
 */
import { balances, decode, encode, parseExpenses, settle } from '../../core/dutchpay';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  const won = (n: number): string => n.toLocaleString();

  Toolbox.register({
    id: 'dutchpay',
    title: t('widgets.dutchpay.title', undefined, '나눠 내기'),
    category: 'tool',
    desc: t(
      'widgets-desc.dutchpay.desc',
      undefined,
      '여럿이 쓴 돈을 나누고, 누가 누구에게 얼마를 보내면 되는지 가장 적은 횟수로 알려 줍니다'
    ),
    layout: 'wide',
    icon: '<circle cx="8" cy="8" r="4" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="16" cy="16" r="4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M11 11l2 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('dutchpay.tab', undefined, '나눠 내기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('dutchpay').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('dutchpay.mdd') });
    container.innerHTML = `
      <div class="tool-grid-2">
        <div>
          <label class="field-label" for="dpPeople">${esc(t('dutchpay.label.people'))}</label>
          <input type="text" id="dpPeople" name="people" aria-label="${esc(t('dutchpay.label.people'))}" class="mono-input" value="윤, 링, 알리사">
        </div>
        <div>
          <label class="field-label" for="dpLines">${esc(t('dutchpay.label.expenses'))}</label>
          <textarea id="dpLines" name="expenses" aria-label="${esc(t('dutchpay.label.expenses'))}" class="mono-input" style="min-height:120px;">윤:30,000::저녁
링:12000
알리사:9000:윤,링:택시</textarea>
        </div>
      </div>
      <p style="font-size:var(--font-size-xs); color:var(--text-secondary);">${esc(t('dutchpay.hint.format'))}</p>
      <div class="tool-grid-2" style="margin-top:8px;">
        <div>
          <div class="tool-sublabel">${esc(t('dutchpay.label.shares'))}</div>
          <div id="dpShares" class="tool-list"></div>
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('dutchpay.label.transfers'))}</div>
          <div id="dpTransfers" class="tool-list"></div>
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin:10px 0;">
        <button class="btn btn-ghost" id="dpShare">${esc(t('dutchpay.btn.share'))}</button>
        <button class="btn btn-ghost" id="dpCopy">${esc(t('dutchpay.btn.copy'))}</button>
      </div>
      <div class="tool-status" id="dpStatus">${esc(t('dutchpay.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const peopleBox = $<HTMLInputElement>('#dpPeople');
    const linesBox = $<HTMLTextAreaElement>('#dpLines');
    const status = $<HTMLElement>('#dpStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    const peopleOf = (): string[] =>
      peopleBox.value
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter((s) => s !== '');

    function render(): void {
      const people = peopleOf();
      const expenses = parseExpenses(linesBox.value);
      if (people.length === 0 || expenses.length === 0) {
        $<HTMLElement>('#dpShares').innerHTML = '';
        $<HTMLElement>('#dpTransfers').innerHTML = '';
        status.textContent = t('dutchpay.status.idle');
        return;
      }
      const shares = balances(people, expenses);
      const transfers = settle(shares);
      const total = expenses.reduce((sum, e) => sum + e.amount, 0);

      $<HTMLElement>('#dpShares').innerHTML = shares
        .map((s) => {
          const color = s.balance > 0 ? 'var(--accent-success, #2e7d32)' : s.balance < 0 ? 'var(--accent-danger, #c62828)' : 'inherit';
          const note = s.balance > 0 ? t('dutchpay.getBack', { n: won(s.balance) }) : s.balance < 0 ? t('dutchpay.mustPay', { n: won(-s.balance) }) : t('dutchpay.even');
          return (
            '<div class="tool-list-row"><span class="tool-list-key">' + esc(s.name) + '</span>' +
            '<span class="tool-list-val">' + esc(t('dutchpay.paidOwed', { paid: won(s.paid), owed: won(s.owed) })) + '</span>' +
            '<span class="tool-list-dim" style="color:' + color + '">' + esc(note) + '</span></div>'
          );
        })
        .join('');

      $<HTMLElement>('#dpTransfers').innerHTML =
        transfers.length === 0
          ? '<div class="tool-list-row"><span class="tool-list-val">' + esc(t('dutchpay.nothingToDo')) + '</span></div>'
          : transfers
              .map(
                (x) =>
                  '<div class="tool-list-row"><span class="tool-list-key">' + esc(x.from) + ' → ' + esc(x.to) + '</span>' +
                  '<span class="tool-list-val">' + esc(won(x.amount)) + '</span></div>'
              )
              .join('');

      status.textContent = t('dutchpay.status.ok', { total: won(total), n: transfers.length });
    }

    [peopleBox, linesBox].forEach((el) => el.addEventListener('input', render));

    $<HTMLButtonElement>('#dpShare').onclick = async (): Promise<void> => {
      const packed = encode(peopleOf(), parseExpenses(linesBox.value));
      /* 주소 자체가 저장소다 — 우리 서버에 아무것도 안 남는다. */
      const url = location.origin + location.pathname + '#d=' + packed;
      await Toolbox.copyText?.(url, { message: t('dutchpay.shared') });
    };

    $<HTMLButtonElement>('#dpCopy').onclick = async (): Promise<void> => {
      const people = peopleOf();
      const expenses = parseExpenses(linesBox.value);
      const transfers = settle(balances(people, expenses));
      if (transfers.length === 0) return;
      const text = transfers.map((x) => x.from + ' → ' + x.to + '  ' + won(x.amount)).join('\n');
      await Toolbox.copyText?.(text, { message: t('dutchpay.copied') });
    };

    /* 받은 주소로 들어온 경우 — 사람과 쓴 돈을 되살린다 */
    const hash = location.hash.startsWith('#d=') ? location.hash.slice(3) : '';
    if (hash !== '') {
      try {
        const got = decode(hash);
        peopleBox.value = got.people.join(', ');
        linesBox.value = got.expenses
          .map((e) => [e.by, String(e.amount), (e.forWhom ?? []).join(','), e.what ?? ''].join(':').replace(/:+$/, ''))
          .join('\n');
      } catch {
        status.textContent = t('dutchpay.status.badLink');
      }
    }

    render();
  }
})();
