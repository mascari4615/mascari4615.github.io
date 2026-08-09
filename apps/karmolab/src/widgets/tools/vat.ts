/**
 * 부가세 계산기 (TASK-KL-088)
 *
 * 「11만원에서 부가세는 1만원」 인데 「10만원의 10%도 1만원」 이라 헷갈린다 —
 * 공급가에서 더할 때와 총액에서 뺄 때 나누는 수가 다르기 때문이다(1.1 로 나눠야 한다).
 * 이걸 방향별로 갈라 놓고, 세금계산서에 그대로 옮길 세 줄(공급가·세액·합계)을 낸다.
 */
import { spec, vatAdd, vatExtract,  type Rounding } from '../../core/vat';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  /* 돈은 **보는 사람의 언어로** 적되 통화는 KRW 그대로다 — 한국 부가세 계산이라 달러로
   * 바꿔 적으면 거짓말이 된다. core 의 `won` 은 MCP 글자 출력이 쓰므로 안 건드린다. */
  const won = (n: number): string =>
    new Intl.NumberFormat(locale(), { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(
      Math.round(n)
    );

  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'vat',
    title: t('widgets.vat.title', undefined, "부가세 계산기"),
    category: 'tool',
    desc: t('widgets-desc.vat.desc', undefined, "공급가에서 부가세를 더하거나 총액에서 빼냅니다. 세금계산서 세 줄 그대로"),
    layout: 'form',
    icon: '<path d="M4 20 20 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7 4h10a2 2 0 0 1 2 2v3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="7" cy="8" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="17" cy="16" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('vat.stat.tax', undefined, "부가세"),
        build: function (container: HTMLElement): void {
          void loadNamespace('vat').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <div class="tool-chips" id="vaMode">
                <button type="button" class="tool-chip active" data-mode="add">${esc(t('vat.mode.add'))}</button>
                <button type="button" class="tool-chip" data-mode="sub">${esc(t('vat.mode.sub'))}</button>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label" id="vaLabel">${esc(t('vat.label.supply'))}</label>
              <input type="number" id="vaAmount" aria-label="${esc(t('vat.label.supply'))}" value="1000000" step="1000" min="0">
            </div>
            <div class="field-group">
              <div class="tool-sublabel">${esc(t('vat.label.rate'))}</div>
              <input type="number" id="vaRate" aria-label="${esc(t('vat.label.rate'))}" value="10" step="0.1" min="0">
            </div>

            <div class="cc-stats" id="vaStats"></div>
            <div class="tool-list" id="vaOut"></div>
            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-ghost" id="vaCopy">${esc(t('vat.btn.copy'))}</button>
            </div>
            <div class="field-group">
              <div class="tool-sublabel">${esc(t('vat.label.rounding'))}</div>
              <div class="tool-chips" id="vaRound">
                <button type="button" class="tool-chip active" data-round="floor">${esc(t('vat.round.floor'))}</button>
                <button type="button" class="tool-chip" data-round="round">${esc(t('vat.round.half'))}</button>
              </div>
            </div>
            <div class="tool-status" id="vaStatus">${esc(t('vat.status.idle'))}</div>
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

          let rounding: Rounding = 'floor';

          function run(): void {
            /* 계산은 `src/core/vat.ts` 가 한다 — 「1원 미만을 어떻게 하나」와
               「공급가 + 세액 = 합계 를 맞추는 순서」가 거기 있다 (TASK-KL-205). */
            const v = parseFloat(amount.value) || 0;
            const ratePercent = parseFloat(rateEl.value) || 0;
            const r = mode === 'add' ? vatAdd(v, ratePercent, rounding) : vatExtract(v, ratePercent, rounding);
            const factor = (1 + ratePercent / 100).toFixed(2);

            last = r;
            stats.innerHTML =
              stat(mode === 'add' ? t('vat.stat.total') : t('vat.label.supply'), won(mode === 'add' ? r.total : r.supply), true) +
              stat(t('vat.stat.tax'), won(r.tax)) +
              stat(t('vat.row.rate'), `${ratePercent.toFixed(1)}%`);
            out.innerHTML =
              row(t('vat.label.supply'), won(r.supply)) +
              row(t('vat.row.tax'), won(r.tax)) +
              row(t('vat.row.total'), won(r.total)) +
              row(t('vat.row.note'), mode === 'sub' ? t('vat.note.sub', { factor }) : t('vat.note.add', { factor }));
            Toolbox.trackUse?.(mode);
          }

          container.querySelectorAll('#vaRound .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#vaRound .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              rounding = ((chip as HTMLElement).dataset.round as 'floor' | 'round') || 'floor';
              run();
            };
          });

          container.querySelectorAll('#vaMode .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#vaMode .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              mode = (chip as HTMLElement).dataset.mode || 'add';
              label.textContent = mode === 'add' ? t('vat.label.supply') : t('vat.label.totalIn');
              amount.value = mode === 'add' ? '1000000' : '1100000';
              run();
            };
          });
          [amount, rateEl].forEach((el) => el.addEventListener('input', run));
          $<HTMLButtonElement>('#vaCopy').onclick = () => {
            void Toolbox.copyText?.(
              t('vat.copy.lines', { supply: won(last.supply), tax: won(last.tax), total: won(last.total) }),
              { message: t('vat.copy.done') }
            );
          };
          // 주소로 부른 경우 (`?op=extract&amount=1100000`) — 아니면 예시 (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined) {
            if (call.op === 'extract') {
              mode = 'sub';
              label.textContent = t('vat.label.totalIn');
              container.querySelectorAll('#vaMode .tool-chip').forEach((c) => {
                c.classList.toggle('active', (c as HTMLElement).dataset.mode === 'sub');
              });
            }
            amount.value = String(call.args.amount ?? '');
            if (call.args.rate !== undefined) rateEl.value = String(call.args.rate);
            if (call.args.rounding === 'round') rounding = 'round';
          }
          run();
          if (call?.error !== undefined) {
            const st = $<HTMLElement>('#vaStatus');
            st.textContent = call.error;
            st.className = 'tool-status error';
          }
                  });
        }
      }
    ]
  });
})();
