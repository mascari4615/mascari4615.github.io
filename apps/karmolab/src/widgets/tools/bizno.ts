/**
 * 사업자등록번호 검사 (TASK-KL-088)
 *
 * 열 자리 중 마지막 한 자리는 앞 아홉 자리에서 계산되는 **검증 숫자**다.
 * 그래서 오타는 대부분 계산만으로 걸러진다 — 국세청에 묻지 않아도 「형식상 불가능한 번호」 를 안다.
 * 다만 계산이 맞아도 실제로 등록된 번호인지는 알 수 없다. 그 경계를 화면에 분명히 적는다.
 */
(function (): void {
  const WEIGHT = [1, 3, 7, 1, 3, 7, 1, 3, 5];

  /** 국세청 사업자등록번호 검증 규칙 */
  function checkBiz(digits: string): { ok: boolean; expect: number } | null {
    if (!/^\d{10}$/.test(digits)) return null;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += Number(digits[i]) * WEIGHT[i];
    sum += Math.floor((Number(digits[8]) * 5) / 10);
    const expect = (10 - (sum % 10)) % 10;
    return { ok: expect === Number(digits[9]), expect };
  }

  /** 법인등록번호(13자리) 검증 — 가중치 1,2 반복 */
  function checkCorp(digits: string): { ok: boolean; expect: number } | null {
    if (!/^\d{13}$/.test(digits)) return null;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 2);
    const expect = (10 - (sum % 10)) % 10;
    return { ok: expect === Number(digits[12]), expect };
  }

  /** 중간 자리는 사업자 종류를 뜻한다 — 번호만 보고도 알 수 있는 정보 */
  function kindOf(mid: string): string {
    const n = Number(mid);
    if (n >= 1 && n <= 79) return '개인 과세사업자';
    if (n >= 80 && n <= 80) return '법인이 아닌 종교단체';
    if (n >= 81 && n <= 88) return '영리법인 본점';
    if (n === 89) return '비영리법인 본점·지점';
    if (n >= 90 && n <= 99) return '개인 면세사업자·비영리';
    return '알 수 없음';
  }

  Toolbox.register({
    id: 'bizno',
    title: '사업자번호 검사',
    category: 'tool',
    desc: '사업자등록번호·법인등록번호가 형식상 올바른지 계산으로 확인합니다',
    layout: 'form',
    icon: '<rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 6V4h8v2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 12h5M7 16h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '검사',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">번호 — 하이픈은 있어도 없어도 됩니다</label>
              <input type="text" id="bzIn" spellcheck="false" placeholder="123-45-67890" inputmode="numeric">
            </div>
            <div class="tool-display" id="bzMark">—</div>
            <div class="tool-list" id="bzOut"></div>
            <div class="tool-status" id="bzStatus">계산이 맞아도 실제 등록 여부는 알 수 없습니다 — 그건 국세청 조회가 필요합니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLInputElement>('#bzIn');
          const mark = $<HTMLElement>('#bzMark');
          const out = $<HTMLElement>('#bzOut');
          const status = $<HTMLElement>('#bzStatus');
          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          function run(): void {
            const digits = input.value.replace(/\D/g, '');
            if (!digits) {
              mark.textContent = '—';
              out.innerHTML = '';
              status.textContent = '계산이 맞아도 실제 등록 여부는 알 수 없습니다 — 그건 국세청 조회가 필요합니다.';
              status.className = 'tool-status';
              return;
            }
            if (digits.length === 10) {
              const r = checkBiz(digits)!;
              mark.textContent = r.ok ? '형식 OK' : '형식 오류';
              mark.className = 'tool-display' + (r.ok ? '' : ' tool-display-done');
              out.innerHTML =
                row('종류', '사업자등록번호 (10자리)') +
                row('표기', `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`) +
                row('사업자 구분', kindOf(digits.slice(3, 5))) +
                row('검증 숫자', r.ok ? `${digits[9]} (맞음)` : `${digits[9]} — 계산상 ${r.expect} 이어야 함`);
              status.textContent = r.ok
                ? '형식상 올바른 번호입니다. 실제 등록 여부는 국세청 조회가 필요합니다.'
                : '마지막 자리가 계산과 안 맞습니다 — 오타일 가능성이 큽니다.';
              status.className = 'tool-status' + (r.ok ? ' ok' : ' error');
            } else if (digits.length === 13) {
              const r = checkCorp(digits)!;
              mark.textContent = r.ok ? '형식 OK' : '형식 오류';
              mark.className = 'tool-display' + (r.ok ? '' : ' tool-display-done');
              out.innerHTML =
                row('종류', '법인등록번호 (13자리)') +
                row('표기', `${digits.slice(0, 6)}-${digits.slice(6)}`) +
                row('검증 숫자', r.ok ? `${digits[12]} (맞음)` : `${digits[12]} — 계산상 ${r.expect} 이어야 함`);
              status.textContent = r.ok ? '형식상 올바른 번호입니다.' : '마지막 자리가 계산과 안 맞습니다.';
              status.className = 'tool-status' + (r.ok ? ' ok' : ' error');
            } else {
              mark.textContent = '—';
              out.innerHTML = row('자릿수', `${digits.length}자리 — 10자리 또는 13자리여야 합니다`);
              status.textContent = '사업자등록번호는 10자리, 법인등록번호는 13자리입니다.';
              status.className = 'tool-status';
            }
            Toolbox.trackUse?.('check');
          }

          input.addEventListener('input', run);
        }
      }
    ]
  });
})();
