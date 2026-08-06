/**
 * 숫자 ↔ 한글 (TASK-KL-088)
 *
 * 계약서·영수증에 「금 일천이백삼십사만원」 처럼 적어야 하는데, 사람이 옮겨 적다 자리를 빠뜨린다.
 * 만·억·조 단위가 네 자리씩 끊기는 반면 우리가 숫자를 쓸 때는 세 자리마다 콤마라
 * **눈으로 세는 자리와 읽는 자리가 어긋나는** 게 실수의 원인이다. 기계가 끊게 한다.
 */
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
    if (digits.length > 20) return '너무 큰 수예요 (경 단위까지 지원)';

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
    title: '숫자 ↔ 한글',
    category: 'tool',
    desc: '숫자를 한글로 읽고 한글 수를 숫자로 되돌립니다. 계약서·영수증 금액 표기',
    layout: 'form',
    icon: '<path d="M4 8h6M7 5v11M14 5h4a2 2 0 0 1 0 4h-2a2 2 0 0 0 0 4h4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '변환',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">숫자</label>
              <input type="text" id="nwNum" spellcheck="false" placeholder="12340000" inputmode="numeric">
            </div>
            <div class="field-group">
              <label class="field-label">한글</label>
              <input type="text" id="nwKor" spellcheck="false" placeholder="천이백삼십사만">
            </div>
            <div class="field-group">
              <label class="tool-chip" style="display:inline-flex; align-items:center;">
                <input type="checkbox" id="nwFormal"> 금액 표기 (일십·일백까지 붙여 적기)
              </label>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-ghost" id="nwCopyKor">한글 복사</button>
              <button class="btn btn-ghost" id="nwCopyMoney">금액 문구 복사</button>
              <button class="btn btn-ghost" id="nwClear">지우기</button>
            </div>
            <div class="tool-list" id="nwOut"></div>
            <div class="tool-status" id="nwStatus">어느 칸에 적어도 반대쪽이 따라 바뀝니다.</div>
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
              row('세 자리 콤마', n.toLocaleString('ko-KR')) +
              row('한글', kor) +
              row('금액 문구', `금 ${kor}원정`) +
              row('자릿수', `${digits.length}자리`);
          }

          function fromNum(): void {
            if (syncing) return;
            syncing = true;
            korEl.value = toKorean(numEl.value, formal.checked);
            syncing = false;
            render();
            status.textContent = numEl.value ? '숫자를 한글로 읽었습니다.' : '어느 칸에 적어도 반대쪽이 따라 바뀝니다.';
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
            status.textContent = n ? '한글 수를 숫자로 되돌렸습니다.' : '한글 수로 읽을 수 없는 글자가 있어요.';
            status.className = 'tool-status' + (n ? ' ok' : ' error');
            Toolbox.trackUse?.('to-number');
          });

          $<HTMLButtonElement>('#nwCopyKor').onclick = () => {
            if (korEl.value) void Toolbox.copyText?.(korEl.value, { message: '한글로 복사했어요' });
          };
          $<HTMLButtonElement>('#nwCopyMoney').onclick = () => {
            if (korEl.value) void Toolbox.copyText?.(`금 ${korEl.value}원정`, { message: '금액 문구를 복사했어요' });
          };
          $<HTMLButtonElement>('#nwClear').onclick = () => {
            numEl.value = '';
            korEl.value = '';
            out.innerHTML = '';
            status.textContent = '어느 칸에 적어도 반대쪽이 따라 바뀝니다.';
            status.className = 'tool-status';
          };

          numEl.value = '12340000';
          fromNum();
        }
      }
    ]
  });
})();
