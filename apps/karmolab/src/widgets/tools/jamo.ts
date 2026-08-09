/**
 * 한글 자모 분해·조합 (TASK-KL-088)
 *
 * 검색·정렬을 만들다 보면 「강」 을 ㄱ/ㅏ/ㅇ 으로 쪼개야 하는 순간이 온다(초성 검색).
 * 반대로 자모만 남은 문자열을 글자로 되돌려야 할 때도 있다 — 맥에서 만든 파일 이름이
 * 윈도우에서 「ㄱ ㅏ ㅁ」 처럼 풀려 보이는 게 대표적이다(자모가 따로 저장된 표기).
 */
import { compose, decompose, initials, spec, split } from '../../core/jamo';
import { readInvocation } from '../../lib/tool-url';

(function (): void {
  Toolbox.register({
    id: 'jamo',
    title: '한글 자모 분해',
    category: 'tool',
    desc: '글자를 초성·중성·종성으로 쪼개고 자모를 글자로 되돌립니다. 초성 추출 포함',
    layout: 'wide',
    icon: '<path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: '자모',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">한글</label>
              <textarea id="jaIn" rows="4" spellcheck="false" placeholder="한글 자모 분해"></textarea>
            </div>
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">초성만</div>
                  <input type="text" id="jaCho" aria-label="초성만" readonly spellcheck="false">
                </div>
                <div>
                  <div class="tool-sublabel">자모 나열</div>
                  <input type="text" id="jaAll" aria-label="자모 나열" readonly spellcheck="false">
                </div>
              </div>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-ghost" id="jaCopyCho">초성 복사</button>
              <button class="btn btn-ghost" id="jaCopyAll">자모 복사</button>
              <button class="btn btn-ghost" id="jaJoin">자모 → 글자로 되돌리기</button>
            </div>
            <div class="tool-list" id="jaOut"></div>
            <div class="tool-status" id="jaStatus">초성 검색이나 정렬을 만들 때 쓰는 형태입니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#jaIn');
          const cho = $<HTMLInputElement>('#jaCho');
          const all = $<HTMLInputElement>('#jaAll');
          const out = $<HTMLElement>('#jaOut');
          const status = $<HTMLElement>('#jaStatus');
          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          function run(): void {
            /* 쪼개는 계산은 `src/core/jamo.ts` 가 한다 — 겹받침·「종성이냐 다음 초성이냐」 판단이
               거기 있고 시험도 거기에 붙어 있다 (TASK-KL-205). */
            const text = input.value;
            const rows: string[] = [];
            for (const ch of text) {
              const parts = split(ch);
              if (parts === null || rows.length >= 40) continue;
              rows.push(
                `<div class="tool-list-row"><span class="tool-list-key">${esc(ch)}</span><span class="tool-list-val">초성 ${parts[0]} · 중성 ${parts[1]} · 종성 ${parts[2] || '없음'}</span></div>`
              );
            }
            cho.value = initials(text);
            all.value = decompose(text);
            out.innerHTML = rows.join('');
            status.textContent = text ? `${[...text].length}글자를 쪼갰습니다.` : '초성 검색이나 정렬을 만들 때 쓰는 형태입니다.';
            status.className = 'tool-status' + (text ? ' ok' : '');
            Toolbox.trackUse?.('split');
          }

          /** 자모 나열을 다시 글자로. 판단은 알맹이(`core/jamo.ts` 의 compose)가 한다. */
          function join(): void {
            input.value = compose(input.value);
            run();
            status.textContent = '자모를 글자로 되돌렸습니다.';
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('join');
          }

          input.addEventListener('input', run);
          $<HTMLButtonElement>('#jaCopyCho').onclick = () => {
            if (cho.value) void Toolbox.copyText?.(cho.value, { message: '초성을 복사했어요' });
          };
          $<HTMLButtonElement>('#jaCopyAll').onclick = () => {
            if (all.value) void Toolbox.copyText?.(all.value, { message: '자모를 복사했어요' });
          };
          $<HTMLButtonElement>('#jaJoin').onclick = join;

          // 주소로 부른 경우 (`?op=split&text=…` / `?op=join&text=…`) — 아니면 예시 (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined) {
            input.value = String(call.args.text ?? '');
            if (call.op === 'join') join();
            else run();
          } else {
            input.value = '한글 자모 분해';
            run();
            if (call?.error !== undefined) {
              status.textContent = call.error;
              status.className = 'tool-status error';
            }
          }
        }
      }
    ]
  });
})();
