/**
 * 찾아 바꾸기 (TASK-KL-088)
 *
 * 편집기의 찾아 바꾸기는 **누르기 전까지 결과를 모른다**. 정규식이 섞이면 더 그렇다.
 * 여기서는 바꾸기 전에 몇 군데가 걸렸는지, 어디가 바뀌는지 먼저 보여준다 —
 * 되돌릴 수 없는 편집을 실행하기 전에 확인하는 자리.
 */
(function (): void {
  const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  Toolbox.register({
    id: 'replace',
    title: '찾아 바꾸기',
    category: 'tool',
    desc: '텍스트에서 찾아 바꿉니다. 바꾸기 전에 걸린 곳을 미리 보여줍니다',
    layout: 'wide',
    icon: '<circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14.5 14.5 20 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 10h6M10 7v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>',
    tabs: [
      {
        id: 'app',
        label: '찾아 바꾸기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">원본</label>
              <textarea id="rpIn" rows="7" spellcheck="false" placeholder="바꿀 텍스트를 붙여 넣으세요"></textarea>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">찾을 말</div>
                  <input type="text" id="rpFind" spellcheck="false" placeholder="찾을 내용">
                </div>
                <div>
                  <div class="tool-sublabel">바꿀 말 — 비우면 삭제</div>
                  <input type="text" id="rpTo" spellcheck="false" placeholder="바꿀 내용">
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="rpCase"> 대소문자 구분</label>
                <label class="tool-chip"><input type="checkbox" id="rpWord"> 낱말 단위</label>
                <label class="tool-chip"><input type="checkbox" id="rpRegex"> 정규식으로</label>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">미리보기 — 걸린 곳이 표시됩니다</label>
              <div class="rx-highlight" id="rpPreview"></div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="rpApply">바꾸기</button>
              <button class="btn btn-ghost" id="rpCopy">결과 복사</button>
              <button class="btn btn-ghost" id="rpUndo">되돌리기</button>
            </div>

            <div class="tool-status" id="rpStatus">찾을 말을 넣으면 걸린 곳을 먼저 보여줍니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#rpIn');
          const find = $<HTMLInputElement>('#rpFind');
          const to = $<HTMLInputElement>('#rpTo');
          const preview = $<HTMLElement>('#rpPreview');
          const status = $<HTMLElement>('#rpStatus');
          let previous: string | null = null;

          function buildRegex(): RegExp | null {
            const raw = find.value;
            if (!raw) return null;
            let source = $<HTMLInputElement>('#rpRegex').checked ? raw : raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if ($<HTMLInputElement>('#rpWord').checked) source = `\\b${source}\\b`;
            try {
              return new RegExp(source, $<HTMLInputElement>('#rpCase').checked ? 'g' : 'gi');
            } catch {
              return null;
            }
          }

          function render(): void {
            const re = buildRegex();
            if (!re) {
              preview.innerHTML = escapeHtml(input.value.slice(0, 4000));
              status.textContent = find.value
                ? '정규식을 읽지 못했어요.'
                : '찾을 말을 넣으면 걸린 곳을 먼저 보여줍니다.';
              status.className = 'tool-status' + (find.value ? ' error' : '');
              return;
            }
            let count = 0;
            const marked = escapeHtml(input.value).replace(new RegExp(re.source, re.flags), (m) => {
              count++;
              return `<span class="rx-mark">${m}</span>`;
            });
            preview.innerHTML = marked.slice(0, 20000);
            status.textContent = count ? `${count}군데가 걸립니다. 바꾸기를 누르면 적용됩니다.` : '걸리는 곳이 없어요.';
            status.className = 'tool-status' + (count ? ' ok' : '');
          }

          [input, find, to].forEach((el) => el.addEventListener('input', render));
          container.querySelectorAll('input[type="checkbox"]').forEach((el) => el.addEventListener('change', render));

          $<HTMLButtonElement>('#rpApply').onclick = () => {
            const re = buildRegex();
            if (!re) return;
            previous = input.value;
            const before = input.value;
            input.value = before.replace(re, to.value);
            render();
            status.textContent = '바꿨습니다. 되돌리기로 직전 상태로 돌아갈 수 있어요.';
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('replace');
          };
          $<HTMLButtonElement>('#rpUndo').onclick = () => {
            if (previous === null) return;
            input.value = previous;
            previous = null;
            render();
          };
          $<HTMLButtonElement>('#rpCopy').onclick = () => {
            if (input.value) void Toolbox.copyText?.(input.value, { message: '결과를 복사했어요' });
          };

          render();
        }
      }
    ]
  });
})();
