/**
 * 숫자 ↔ 한글 (TASK-KL-088)
 *
 * 계약서·영수증에 「금 일천이백삼십사만원」 처럼 적어야 하는데, 사람이 옮겨 적다 자리를 빠뜨린다.
 * 만·억·조 단위가 네 자리씩 끊기는 반면 우리가 숫자를 쓸 때는 세 자리마다 콤마라
 * **눈으로 세는 자리와 읽는 자리가 어긋나는** 게 실수의 원인이다. 기계가 끊게 한다.
 */
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  const DIGIT = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const SMALL = ['', '십', '백', '천'];
  const BIG = ['', '만', '억', '조', '경'];

  /** 네 자리 덩이 하나를 읽는다 (1234 → 천이백삼십사) */
  function readChunk(n: number, formal: boolean): string {
    let out = '';
    for (let i = 3; i >= 0; i--) {
      const d = Math.floor(n / Math.pow(10, i)) % 10;
      if (!d) continue;
      // 일십·일백은 보통 「십·백」 으로 읽는다. 금액 표기(formal)에서는 붙여 적기도 한다.
      out += (d === 1 && i > 0 && !formal ? '' : DIGIT[d]) + SMALL[i];
    }
    return out;
  }

  function toKorean(num: string, formal: boolean): string {
    const neg = num.startsWith('-');
    const digits = num.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
    if (!digits) return '';
    if (digits === '0') return '영';
    if (digits.length > 20) return t('numword.err.tooBig');

    // 뒤에서 네 자리씩 끊는다 — 만·억·조가 네 자리 주기라서.
    const chunks: string[] = [];
    for (let i = digits.length; i > 0; i -= 4) chunks.unshift(digits.slice(Math.max(0, i - 4), i));

    let out = '';
    chunks.forEach((c, i) => {
      const value = parseInt(c, 10);
      if (!value) return;
      out += readChunk(value, formal) + BIG[chunks.length - 1 - i];
    });
    return (neg ? '마이너스 ' : '') + out;
  }

  /** 한글 수를 숫자로 (일천이백 → 1200) */
  function toNumber(text: string): string {
    const src = text.replace(/[\s,]/g, '');
    if (!src) return '';
    let total = 0;
    let bigAcc = 0;
    let cur = 0;
    for (const ch of src) {
      const d = DIGIT.indexOf(ch);
      const s = SMALL.indexOf(ch);
      const b = BIG.indexOf(ch);
      if (d > 0) cur = d;
      else if (s > 0) {
        bigAcc += (cur || 1) * Math.pow(10, s);
        cur = 0;
      } else if (b > 0) {
        total += (bigAcc + cur) * Math.pow(10000, b);
        bigAcc = 0;
        cur = 0;
      } else if (ch === '영') {
        return '0';
      } else {
        return '';
      }
    }
    total += bigAcc + cur;
    return total ? String(total) : '';
  }

  Toolbox.register({
    id: 'numword',
    title: t('widgets.numword.title', undefined, '숫자 ↔ 한글'),
    category: 'tool',
    desc: t(
      'widgets-desc.numword.desc',
      undefined,
      '숫자를 한글로 읽고 한글 수를 숫자로 되돌립니다. 계약서·영수증 금액 표기'
    ),
    layout: 'form',
    icon: '<path d="M4 8h6M7 5v11M14 5h4a2 2 0 0 1 0 4h-2a2 2 0 0 0 0 4h4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('numword.tab', undefined, '변환'),
        build: function (container: HTMLElement): void {
          void loadNamespace('numword').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에 — 파일 실릴 때 그리면 이름 자리에 열쇠가 굳는다. */
  function draw(container: HTMLElement): void {
          /* 번역 글에 꺾쇠가 들어와도 화면이 안 깨지게. */
          const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('numword.label.num'))}</label>
              <input type="text" id="nwNum" spellcheck="false" placeholder="12340000" inputmode="numeric">
            </div>
            <div class="field-group">
              <label class="field-label">${esc(t('numword.label.kor'))}</label>
              <input type="text" id="nwKor" spellcheck="false" placeholder="천이백삼십사만">
            </div>
            <div class="field-group">
              <label class="tool-chip" style="display:inline-flex; align-items:center;">
                <input type="checkbox" id="nwFormal"> ${esc(t('numword.opt.formal'))}
              </label>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-ghost" id="nwCopyKor">${esc(t('numword.btn.copyKor'))}</button>
              <button class="btn btn-ghost" id="nwCopyMoney">${esc(t('numword.btn.copyMoney'))}</button>
              <button class="btn btn-ghost" id="nwClear">${esc(t('numword.btn.clear'))}</button>
            </div>
            <div class="tool-list" id="nwOut"></div>
            <div class="tool-status" id="nwStatus">${esc(t('numword.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const numEl = $<HTMLInputElement>('#nwNum');
          const korEl = $<HTMLInputElement>('#nwKor');
          const formal = $<HTMLInputElement>('#nwFormal');
          const out = $<HTMLElement>('#nwOut');
          const status = $<HTMLElement>('#nwStatus');
          let syncing = false;

          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          function render(): void {
            const digits = numEl.value.replace(/[^\d]/g, '');
            if (!digits) {
              out.innerHTML = '';
              return;
            }
            const n = Number(digits);
            const kor = toKorean(digits, formal.checked);
            out.innerHTML =
              row(t('numword.row.comma'), n.toLocaleString(locale())) +
              row(t('numword.row.kor'), esc(kor)) +
              row(t('numword.row.money'), esc(`금 ${kor}원정`)) +
              row(t('numword.row.digits'), t('numword.value.digits', { n: digits.length }));
          }

          function fromNum(): void {
            if (syncing) return;
            syncing = true;
            korEl.value = toKorean(numEl.value, formal.checked);
            syncing = false;
            render();
            status.textContent = numEl.value ? t('numword.status.toKor') : t('numword.status.idle');
            status.className = 'tool-status' + (numEl.value ? ' ok' : '');
            Toolbox.trackUse?.('to-korean');
          }

          numEl.addEventListener('input', fromNum);
          formal.addEventListener('change', fromNum);
          korEl.addEventListener('input', () => {
            if (syncing) return;
            syncing = true;
            const n = toNumber(korEl.value);
            numEl.value = n;
            syncing = false;
            render();
            status.textContent = n ? t('numword.status.toNum') : t('numword.status.bad');
            status.className = 'tool-status' + (n ? ' ok' : ' error');
            Toolbox.trackUse?.('to-number');
          });

          $<HTMLButtonElement>('#nwCopyKor').onclick = () => {
            if (korEl.value) void Toolbox.copyText?.(korEl.value, { message: t('numword.copy.kor') });
          };
          $<HTMLButtonElement>('#nwCopyMoney').onclick = () => {
            if (korEl.value) void Toolbox.copyText?.(`금 ${korEl.value}원정`, { message: t('numword.copy.money') });
          };
          $<HTMLButtonElement>('#nwClear').onclick = () => {
            numEl.value = '';
            korEl.value = '';
            out.innerHTML = '';
            status.textContent = t('numword.status.idle');
            status.className = 'tool-status';
          };

          numEl.value = '12340000';
          fromNum();
  }
})();
