/**
 * 유닉스 타임스탬프 변환 (TASK-KL-088)
 *
 * 로그와 API 응답의 시각은 대개 숫자로 온다. 이걸 읽으려면 **자릿수부터 가려야 한다** —
 * 10자리는 초, 13자리는 밀리초다. 잘못 고르면 1970년이나 5만 년 뒤가 나온다.
 * 그래서 자릿수를 보고 단위를 알아서 잡고, 무엇으로 봤는지 화면에 적는다.
 */
(function (): void {
  const pad = (n: number): string => String(n).padStart(2, '0');

  /** 로컬 시간대 기준 datetime-local 값 (UTC 로 밀리면 한 번 더 틀린다) */
  function toLocalInput(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function human(ms: number): string {
    const diff = ms - Date.now();
    const abs = Math.abs(diff);
    const unit: Array<[number, string]> = [
      [1000, '초'],
      [60000, '분'],
      [3600000, '시간'],
      [86400000, '일'],
      [2592000000, '개월'],
      [31536000000, '년']
    ];
    let out = '방금';
    for (let i = unit.length - 1; i >= 0; i--) {
      if (abs >= unit[i][0]) {
        out = `${Math.round(abs / unit[i][0])}${unit[i][1]}`;
        break;
      }
    }
    return diff >= 0 ? `${out} 후` : `${out} 전`;
  }

  Toolbox.register({
    id: 'epoch',
    title: '타임스탬프 변환',
    category: 'tool',
    desc: '유닉스 타임스탬프와 사람이 읽는 시각을 서로 바꿉니다. 초·밀리초 자동 판별',
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l4 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M2 12h3M19 12h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '변환',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">타임스탬프 — 10자리는 초, 13자리는 밀리초</label>
              <input type="text" id="epNum" spellcheck="false" placeholder="1750000000">
            </div>
            <div class="field-group">
              <label class="field-label">사람이 읽는 시각</label>
              <input type="datetime-local" id="epDate" step="1">
            </div>
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="epNow">지금</button>
              <button class="btn btn-ghost" id="epCopySec">초 복사</button>
              <button class="btn btn-ghost" id="epCopyMs">밀리초 복사</button>
            </div>
            <div class="tool-list" id="epOut"></div>
            <div class="tool-status" id="epStatus">숫자를 넣으면 시각이, 시각을 고르면 숫자가 바뀝니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const num = $<HTMLInputElement>('#epNum');
          const date = $<HTMLInputElement>('#epDate');
          const out = $<HTMLElement>('#epOut');
          const status = $<HTMLElement>('#epStatus');
          let ms = Date.now();

          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          function render(note: string): void {
            const d = new Date(ms);
            out.innerHTML =
              row('내 시간대', d.toLocaleString('ko-KR')) +
              row('UTC', d.toUTCString()) +
              row('ISO 8601', d.toISOString()) +
              row('요일', ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] + '요일') +
              row('지금 기준', human(ms)) +
              row('초 (10자리)', String(Math.floor(ms / 1000))) +
              row('밀리초 (13자리)', String(ms));
            status.textContent = note;
            status.className = 'tool-status ok';
          }

          function fromNumber(): void {
            const raw = num.value.replace(/[^\d-]/g, '');
            if (!raw) return;
            const n = Number(raw);
            if (!isFinite(n)) return;
            // 자릿수로 단위를 가린다 — 이걸 틀리면 1970년이나 먼 미래가 나온다.
            const isSeconds = Math.abs(n) < 1e11;
            ms = isSeconds ? n * 1000 : n;
            date.value = toLocalInput(new Date(ms));
            render(isSeconds ? '초로 읽었습니다 (10자리).' : '밀리초로 읽었습니다 (13자리).');
          }

          num.addEventListener('input', fromNumber);
          date.addEventListener('input', () => {
            if (!date.value) return;
            ms = new Date(date.value).getTime();
            num.value = String(Math.floor(ms / 1000));
            render('시각에서 타임스탬프를 만들었습니다.');
          });
          $<HTMLButtonElement>('#epNow').onclick = () => {
            ms = Date.now();
            num.value = String(Math.floor(ms / 1000));
            date.value = toLocalInput(new Date(ms));
            render('지금 시각입니다.');
            Toolbox.trackUse?.('now');
          };
          $<HTMLButtonElement>('#epCopySec').onclick = () => {
            void Toolbox.copyText?.(String(Math.floor(ms / 1000)), { message: '초 단위로 복사했어요' });
          };
          $<HTMLButtonElement>('#epCopyMs').onclick = () => {
            void Toolbox.copyText?.(String(ms), { message: '밀리초 단위로 복사했어요' });
          };

          num.value = String(Math.floor(ms / 1000));
          date.value = toLocalInput(new Date(ms));
          render('지금 시각입니다.');
        }
      }
    ]
  });
})();
