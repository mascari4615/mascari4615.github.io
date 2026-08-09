/**
 * 유닉스 타임스탬프 변환 — 화면 (TASK-KL-088)
 *
 * 자릿수로 단위를 가리는 판단과 값 만들기는 `src/core/epoch.ts` 가 한다 (TASK-KL-205).
 * 여기는 칸을 그리고 오간 값을 옮기는 일만 한다.
 */
import { parseTimestamp, spec, stampRows, toLocalInput } from '../../core/epoch';
import { readInvocation } from '../../lib/tool-url';

(function (): void {
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
              <label class="field-label">타임스탬프 — 10자리 초 · 13자리 밀리초 · 16자리 마이크로초 · 19자리 나노초</label>
              <input type="text" id="epNum" spellcheck="false" placeholder="1750000000">
            </div>
            <div class="field-group">
              <label class="field-label">사람이 읽는 시각</label>
              <input type="datetime-local" id="epDate" aria-label="사람이 읽는 시각" step="1">
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
            out.innerHTML = stampRows(ms, Date.now())
              .map(([k, v]) => row(k, v))
              .join('');
            status.textContent = note;
            status.className = 'tool-status ok';
          }

          function fromNumber(): void {
            const parsed = parseTimestamp(num.value);
            if (parsed === null) return;
            ms = parsed.ms;
            date.value = toLocalInput(new Date(ms));
            render(`${parsed.unit.label}로 읽었습니다.`);
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

          // 주소로 부른 경우(`?op=toDate&ts=…`)는 그 값으로, 아니면 지금 시각으로 연다 (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined && call.op === 'toDate') {
            num.value = String(call.args.ts ?? '');
            fromNumber();
          } else if (call !== null && call.error === undefined && call.op === 'toStamp') {
            const t = new Date(String(call.args.date ?? '')).getTime();
            if (Number.isNaN(t) === false) {
              ms = t;
              num.value = String(Math.floor(ms / 1000));
              date.value = toLocalInput(new Date(ms));
              render('주소로 받은 시각입니다.');
            }
          } else {
            num.value = String(Math.floor(ms / 1000));
            date.value = toLocalInput(new Date(ms));
            render('지금 시각입니다.');
          }
          if (call?.error !== undefined) {
            status.textContent = call.error;
            status.className = 'tool-status error';
          }
        }
      }
    ]
  });
})();
