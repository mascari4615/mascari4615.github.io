/**
 * 텍스트 정리 (TASK-KL-088) — 줄 단위 정렬·중복 제거·공백 정리·대소문자·번호 매기기.
 *
 * 흩어져 있으면 각각은 사소한데, 실제 작업은 「중복 지우고 → 정렬하고 → 접두어 붙이고」 처럼
 * 이어서 일어난다. 그래서 개별 버튼이 아니라 **체크한 처리를 정해진 순서로 통과**시키는 파이프로 만든다.
 * 원본을 건드리지 않으므로 옵션을 껐다 켜며 결과를 바로 비교할 수 있다.
 */
(function (): void {
  /** 처리 순서 고정 — 공백 정리 → 빈 줄 → 중복 → 정렬 → 대소문자 → 접두/접미 → 번호. */
  interface Opts {
    trim: boolean;
    squeeze: boolean;
    dropEmpty: boolean;
    dedupe: boolean;
    sort: string;
    caseMode: string;
    prefix: string;
    suffix: string;
    number: boolean;
    reverse: boolean;
  }

  function apply(src: string, o: Opts): string[] {
    let lines = src.split(/\r?\n/);
    if (o.trim) lines = lines.map((l) => l.trim());
    if (o.squeeze) lines = lines.map((l) => l.replace(/[ \t]+/g, ' '));
    if (o.dropEmpty) lines = lines.filter((l) => l.trim() !== '');
    if (o.dedupe) {
      const seen = new Set<string>();
      lines = lines.filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
    }
    if (o.sort === 'asc') lines.sort((a, b) => a.localeCompare(b, 'ko-KR'));
    else if (o.sort === 'desc') lines.sort((a, b) => b.localeCompare(a, 'ko-KR'));
    else if (o.sort === 'len') lines.sort((a, b) => a.length - b.length);
    else if (o.sort === 'shuffle') {
      for (let i = lines.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lines[i], lines[j]] = [lines[j], lines[i]];
      }
    }
    if (o.reverse) lines.reverse();
    if (o.caseMode === 'upper') lines = lines.map((l) => l.toUpperCase());
    else if (o.caseMode === 'lower') lines = lines.map((l) => l.toLowerCase());
    else if (o.caseMode === 'title')
      lines = lines.map((l) => l.replace(/\b[a-z]/g, (c) => c.toUpperCase()));
    if (o.prefix || o.suffix) lines = lines.map((l) => o.prefix + l + o.suffix);
    if (o.number) lines = lines.map((l, i) => `${i + 1}. ${l}`);
    return lines;
  }

  Toolbox.register({
    id: 'textclean',
    title: '텍스트 정리',
    category: 'tool',
    desc: '여러 줄 텍스트를 정렬·중복 제거·공백 정리·번호 매기기로 한 번에 다듬습니다',
    layout: 'wide',
    icon: '<path d="M4 6h16M4 11h11M4 16h14M4 21h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M17 18l2 2 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '정리',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <label class="field-label">원본</label>
                  <textarea id="tcIn" rows="10" spellcheck="false" placeholder="한 줄에 하나씩 붙여 넣으세요"></textarea>
                </div>
                <div>
                  <label class="field-label">결과</label>
                  <textarea id="tcOut" rows="10" spellcheck="false" readonly></textarea>
                </div>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">처리 — 위에서부터 순서대로 적용됩니다</label>
              <div class="tool-chips">
                <label class="tool-chip"><input type="checkbox" id="tcTrim" checked> 양끝 공백 제거</label>
                <label class="tool-chip"><input type="checkbox" id="tcSqueeze"> 중간 공백 하나로</label>
                <label class="tool-chip"><input type="checkbox" id="tcDropEmpty" checked> 빈 줄 제거</label>
                <label class="tool-chip"><input type="checkbox" id="tcDedupe"> 중복 줄 제거</label>
                <label class="tool-chip"><input type="checkbox" id="tcReverse"> 순서 뒤집기</label>
                <label class="tool-chip"><input type="checkbox" id="tcNumber"> 번호 매기기</label>
              </div>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">정렬</div>
                  <select id="tcSort">
                    <option value="">그대로</option>
                    <option value="asc">가나다·ABC 순</option>
                    <option value="desc">역순</option>
                    <option value="len">짧은 줄부터</option>
                    <option value="shuffle">무작위 섞기</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">대소문자</div>
                  <select id="tcCase">
                    <option value="">그대로</option>
                    <option value="upper">전부 대문자</option>
                    <option value="lower">전부 소문자</option>
                    <option value="title">첫 글자만 대문자</option>
                  </select>
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">각 줄 앞에 붙이기</div>
                  <input type="text" id="tcPrefix" placeholder="예) - " spellcheck="false">
                </div>
                <div>
                  <div class="tool-sublabel">각 줄 뒤에 붙이기</div>
                  <input type="text" id="tcSuffix" placeholder="예) ," spellcheck="false">
                </div>
              </div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="tcCopy">결과 복사</button>
              <button class="btn btn-ghost" id="tcSwap">결과를 원본으로</button>
              <button class="btn btn-ghost" id="tcClear">지우기</button>
            </div>

            <div class="tool-status" id="tcStatus">붙여 넣으면 바로 정리됩니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#tcIn');
          const output = $<HTMLTextAreaElement>('#tcOut');
          const status = $<HTMLElement>('#tcStatus');

          function run(): void {
            const src = input.value;
            const lines = apply(src, {
              trim: $<HTMLInputElement>('#tcTrim').checked,
              squeeze: $<HTMLInputElement>('#tcSqueeze').checked,
              dropEmpty: $<HTMLInputElement>('#tcDropEmpty').checked,
              dedupe: $<HTMLInputElement>('#tcDedupe').checked,
              reverse: $<HTMLInputElement>('#tcReverse').checked,
              number: $<HTMLInputElement>('#tcNumber').checked,
              sort: $<HTMLSelectElement>('#tcSort').value,
              caseMode: $<HTMLSelectElement>('#tcCase').value,
              prefix: $<HTMLInputElement>('#tcPrefix').value,
              suffix: $<HTMLInputElement>('#tcSuffix').value
            });
            output.value = lines.join('\n');
            const before = src ? src.split(/\r?\n/).length : 0;
            status.textContent = src
              ? `${before}줄 → ${lines.length}줄 · ${output.value.length.toLocaleString('ko-KR')}자`
              : '붙여 넣으면 바로 정리됩니다.';
            status.className = 'tool-status' + (src ? ' ok' : '');
          }

          container.querySelectorAll('input, select, textarea').forEach((el) => {
            el.addEventListener('input', run);
            el.addEventListener('change', run);
          });

          $<HTMLButtonElement>('#tcCopy').onclick = async () => {
            if (!output.value) return;
            await Toolbox.copyText?.(output.value, { message: '정리한 텍스트를 복사했어요' });
            Toolbox.trackUse?.('copy');
          };
          $<HTMLButtonElement>('#tcSwap').onclick = () => {
            input.value = output.value;
            run();
          };
          $<HTMLButtonElement>('#tcClear').onclick = () => {
            input.value = '';
            run();
          };

          run();
        }
      }
    ]
  });
})();
