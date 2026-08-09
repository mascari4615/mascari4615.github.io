/**
 * 문자 변환 허브 — 화면 (흡수 ⓒ)
 *
 * 골격만이다. 계산은 전부 `core/charconv.ts` — 여기서 다시 짜면 화면과 MCP 가 갈린다.
 *
 * 세 갈래를 한 화면에 둔 이유: 이 변환들은 **따로 찾아 들어가는 것 자체가 마찰**이다.
 * 「전각인가?」를 의심할 정도면 이미 한참 헤맨 뒤다. 그래서 붙여 놓고, 붙여 넣는 순간
 * **섞여 있으면 먼저 알려 준다** — 물어보기 전에 답이 보이는 편이 낫다.
 */
import { hasFullWidth, romanize, toFullWidth, toHalfWidth } from '../../core/charconv';
import { compose, decompose } from '../../core/jamo';
import { readInvocation } from '../../lib/tool-url';
import { spec } from '../../core/charconv';

(function (): void {
  const esc = (s: string): string => s.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'));

  type Mode = 'half' | 'full' | 'roman' | 'split' | 'join';

  const MODES: Array<{ id: Mode; label: string }> = [
    { id: 'half', label: '전각 → 반각' },
    { id: 'full', label: '반각 → 전각' },
    { id: 'roman', label: '한글 → 로마자' },
    { id: 'split', label: '한글 → 자모' },
    { id: 'join', label: '자모 → 한글' }
  ];

  const convert = (mode: Mode, text: string): string => {
    switch (mode) {
      case 'half':
        return toHalfWidth(text);
      case 'full':
        return toFullWidth(text);
      case 'roman':
        return romanize(text);
      case 'split':
        return decompose(text);
      case 'join':
        return compose(text);
    }
  };

  Toolbox.register({
    id: 'charconv',
    title: '문자 변환',
    category: 'tool',
    desc: '전각·반각, 한글·로마자, 한글·자모를 한 곳에서. 붙여 넣으면 섞인 글자를 먼저 알려 줍니다',
    tabs: [
      {
        label: '변환',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-block">
              <div class="tool-row" id="ccModes"></div>
              <label class="tool-label" for="ccIn">넣을 글</label>
              <textarea id="ccIn" class="tool-input" rows="4" spellcheck="false"></textarea>
              <div id="ccWarn" class="tool-note" role="status"></div>
              <label class="tool-label" for="ccOut">바뀐 글</label>
              <textarea id="ccOut" class="tool-input" rows="4" readonly></textarea>
              <div class="tool-row">
                <button id="ccCopy" class="tool-btn" type="button">복사</button>
                <button id="ccSwap" class="tool-btn" type="button">결과를 입력으로</button>
              </div>
            </div>`;

          const $ = <T extends HTMLElement>(sel: string): T => container.querySelector(sel) as T;
          const input = $<HTMLTextAreaElement>('#ccIn');
          const output = $<HTMLTextAreaElement>('#ccOut');
          let mode: Mode = 'half';

          $('#ccModes').innerHTML = MODES.map(
            (m) => `<button class="tool-btn" type="button" data-mode="${m.id}">${esc(m.label)}</button>`
          ).join('');

          const paint = (): void => {
            for (const btn of container.querySelectorAll<HTMLButtonElement>('#ccModes button')) {
              btn.classList.toggle('tool-btn-primary', btn.dataset.mode === mode);
            }
          };

          const render = (): void => {
            output.value = input.value === '' ? '' : convert(mode, input.value);
            /* 묻기 전에 알려 준다 — 「왜 검색이 안 되지」의 답이 대개 이것이다. */
            const warn = $('#ccWarn');
            if (mode !== 'full' && hasFullWidth(input.value)) {
              warn.textContent = '전각 글자가 섞여 있습니다 — 검색·로그인·조회가 안 되던 이유가 대개 이것입니다.';
              warn.className = 'tool-note error';
            } else {
              warn.textContent = '';
              warn.className = 'tool-note';
            }
          };

          for (const btn of container.querySelectorAll<HTMLButtonElement>('#ccModes button')) {
            btn.onclick = () => {
              mode = (btn.dataset.mode as Mode) ?? 'half';
              paint();
              render();
            };
          }
          input.addEventListener('input', render);
          $<HTMLButtonElement>('#ccCopy').onclick = () =>
            void Toolbox.copyText?.(output.value, { message: '바뀐 글을 복사했어요' });
          $<HTMLButtonElement>('#ccSwap').onclick = () => {
            input.value = output.value;
            render();
          };

          // 주소로 부른 경우 (`?op=width&text=…&mode=full`). 없으면 예시로 시작한다.
          const call = readInvocation(spec);
          if (call === null) {
            input.value = 'ＫａｒｍｏＬａｂ　１２３';
            paint();
            render();
            return;
          }
          input.value = String(call.args.text ?? '');
          if (call.op === 'roman') mode = 'roman';
          else if (call.op === 'jamo') mode = call.args.mode === 'join' ? 'join' : 'split';
          else mode = call.args.mode === 'full' ? 'full' : 'half';
          paint();
          render();
          if (call.error !== undefined) {
            const warn = $('#ccWarn');
            warn.textContent = call.error;
            warn.className = 'tool-note error';
          }
        }
      }
    ]
  });
})();
