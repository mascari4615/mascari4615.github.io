/**
 * 줄바꿈·공백 정리 (TASK-KL-088)
 *
 * PDF 나 웹에서 복사한 글은 화면 너비에 맞춰 줄이 잘려 있다. 그대로 붙여 넣으면
 * 문장 한가운데서 줄이 끊긴다. 그런데 **문단 사이의 빈 줄까지 없애면 안 되므로**
 * 「문단은 남기고 문단 안의 줄만 잇는」 처리가 필요하다 — 그게 이 도구의 핵심이다.
 */
(function (): void {
  /** 문단(빈 줄로 나뉜 덩이)은 유지하고 그 안의 줄바꿈만 공백으로 잇는다. */
  function unwrap(text: string): string {
    return text
      .split(/\n\s*\n/)
      .map((para) =>
        para
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .reduce((acc, line) => {
            if (!acc) return line;
            // 하이픈으로 잘린 영어 단어는 붙여서 잇는다 (PDF 에서 흔하다)
            if (/[A-Za-z]-$/.test(acc)) return acc.slice(0, -1) + line;
            // 한글끼리는 공백 없이 이어야 자연스러운 경우가 있으나, 낱말 경계를 알 수 없어 공백을 둔다
            return acc + ' ' + line;
          }, '')
      )
      .filter(Boolean)
      .join('\n\n');
  }

  /** 정해진 글자 수로 줄을 다시 나눈다 (낱말 중간에서 안 끊기게) */
  function wrap(text: string, width: number): string {
    return text
      .split(/\n\s*\n/)
      .map((para) => {
        const words = para.replace(/\s+/g, ' ').trim().split(' ');
        const lines: string[] = [];
        let line = '';
        words.forEach((w) => {
          if (!line) line = w;
          else if ((line + ' ' + w).length <= width) line += ' ' + w;
          else {
            lines.push(line);
            line = w;
          }
        });
        if (line) lines.push(line);
        return lines.join('\n');
      })
      .join('\n\n');
  }

  Toolbox.register({
    id: 'linebreak',
    title: '줄바꿈 정리',
    category: 'tool',
    desc: 'PDF·웹에서 복사한 글의 끊긴 줄을 잇거나 원하는 길이로 다시 나눕니다',
    layout: 'wide',
    icon: '<path d="M4 6h16M4 12h10a3 3 0 0 1 0 6h-3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M13 15l-2 3 2 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 18h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '줄바꿈',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <label class="field-label">원본</label>
                  <textarea id="lbIn" rows="10" spellcheck="false" placeholder="PDF 나 웹에서 복사한 글을 붙여 넣으세요"></textarea>
                </div>
                <div>
                  <label class="field-label">결과</label>
                  <textarea id="lbOut" aria-label="정리된 결과" rows="10" spellcheck="false" readonly></textarea>
                </div>
              </div>
            </div>

            <div class="field-group">
              <div class="tool-chips" id="lbMode">
                <button type="button" class="tool-chip active" data-mode="unwrap">끊긴 줄 잇기</button>
                <button type="button" class="tool-chip" data-mode="wrap">길이 맞춰 나누기</button>
                <button type="button" class="tool-chip" data-mode="single">전부 한 줄로</button>
              </div>
            </div>

            <div class="field-group" id="lbWidthWrap" style="display:none;">
              <div class="tool-sublabel">한 줄 길이 <span id="lbWidthVal" class="range-value">60자</span></div>
              <input type="range" id="lbWidth" aria-label="한 줄 길이" min="20" max="120" value="60">
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-ghost" id="lbCopy">결과 복사</button>
              <button class="btn btn-ghost" id="lbSwap">결과를 원본으로</button>
            </div>
            <div class="tool-status" id="lbStatus">문단 사이 빈 줄은 그대로 두고 문단 안의 줄만 잇습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#lbIn');
          const out = $<HTMLTextAreaElement>('#lbOut');
          const width = $<HTMLInputElement>('#lbWidth');
          const status = $<HTMLElement>('#lbStatus');
          let mode = 'unwrap';

          function run(): void {
            const src = input.value;
            if (mode === 'unwrap') out.value = unwrap(src);
            else if (mode === 'wrap') out.value = wrap(unwrap(src), parseInt(width.value, 10));
            else out.value = src.replace(/\s+/g, ' ').trim();

            $<HTMLElement>('#lbWidthWrap').style.display = mode === 'wrap' ? '' : 'none';
            $<HTMLElement>('#lbWidthVal').textContent = width.value + '자';

            const before = src ? src.split(/\r?\n/).length : 0;
            const after = out.value ? out.value.split(/\r?\n/).length : 0;
            status.textContent = src
              ? `${before}줄 → ${after}줄 · 문단 사이 빈 줄은 그대로 둡니다.`
              : '문단 사이 빈 줄은 그대로 두고 문단 안의 줄만 잇습니다.';
            status.className = 'tool-status' + (src ? ' ok' : '');
            Toolbox.trackUse?.(mode);
          }

          input.addEventListener('input', run);
          width.addEventListener('input', run);
          container.querySelectorAll('#lbMode .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#lbMode .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              mode = (chip as HTMLElement).dataset.mode || 'unwrap';
              run();
            };
          });
          $<HTMLButtonElement>('#lbCopy').onclick = () => {
            if (out.value) void Toolbox.copyText?.(out.value, { message: '결과를 복사했어요' });
          };
          $<HTMLButtonElement>('#lbSwap').onclick = () => {
            input.value = out.value;
            run();
          };

          input.value = '이 문장은 화면 너비에\n맞춰 잘려 있습니다. 그대로\n붙여 넣으면 어색합니다.\n\n두 번째 문단입니다. 문단\n사이 빈 줄은 남아야 합니다.';
          run();
        }
      }
    ]
  });
})();
