/**
 * 표기법 변환 (TASK-KL-088) — camelCase ↔ snake_case ↔ kebab-case ↔ PascalCase ↔ CONSTANT.
 *
 * 변환의 어려운 부분은 출력이 아니라 **입력을 낱말로 쪼개는 것**이다.
 * "XMLHttpRequest" 는 XML / Http / Request 로 끊겨야 하고, "user_id2" 는 user / id2 다.
 * 쪼개기를 한 곳에 두고 표기법마다 다시 조립한다.
 */
(function (): void {
  /** 어떤 표기법으로 쓰였든 낱말 목록으로 되돌린다. */
  function words(src: string): string[] {
    return src
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      // 연속 대문자 뒤에 낱말이 이어지면 마지막 대문자부터가 새 낱말 (XMLHttp → XML Http)
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/[_\-.\s]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.toLowerCase());
  }

  const FORMS: Array<[string, string, (w: string[]) => string]> = [
    ['camelCase', '자바스크립트 변수·함수', (w) => w.map((x, i) => (i ? x[0].toUpperCase() + x.slice(1) : x)).join('')],
    ['PascalCase', '클래스·타입·컴포넌트', (w) => w.map((x) => x[0].toUpperCase() + x.slice(1)).join('')],
    ['snake_case', '파이썬·DB 컬럼', (w) => w.join('_')],
    ['SCREAMING_SNAKE', '상수·환경 변수', (w) => w.join('_').toUpperCase()],
    ['kebab-case', 'URL·CSS 클래스·파일명', (w) => w.join('-')],
    ['dot.case', '설정 키·네임스페이스', (w) => w.join('.')],
    ['Title Case', '제목·라벨', (w) => w.map((x) => x[0].toUpperCase() + x.slice(1)).join(' ')],
    ['lower case', '문장', (w) => w.join(' ')]
  ];

  Toolbox.register({
    id: 'caseconv',
    title: '표기법 변환',
    category: 'tool',
    desc: 'camelCase·snake_case·kebab-case·PascalCase 를 서로 바꿉니다. 여러 줄 한 번에',
    layout: 'form',
    icon: '<path d="M4 17 8 7l4 10M5.5 14h5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 11a3 3 0 1 0 0 4v1m0-6.5V17" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '변환',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">이름 — 여러 줄이면 줄마다 변환합니다</label>
              <textarea id="ccIn" rows="3" spellcheck="false" placeholder="userName
XMLHttpRequest
api_key_2"></textarea>
            </div>
            <div class="tool-list" id="ccOut"></div>
            <div class="tool-status" id="ccStatus">어떤 표기법으로 써도 알아서 낱말로 쪼갭니다.</div>
          `;

          const input = container.querySelector('#ccIn') as HTMLTextAreaElement;
          const out = container.querySelector('#ccOut') as HTMLElement;
          const status = container.querySelector('#ccStatus') as HTMLElement;
          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          function run(): void {
            const lines = input.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            if (!lines.length) {
              out.innerHTML = '';
              status.textContent = '어떤 표기법으로 써도 알아서 낱말로 쪼갭니다.';
              status.className = 'tool-status';
              return;
            }
            out.innerHTML = FORMS.map(([name, use, fn]) => {
              const value = lines.map((l) => {
                const w = words(l);
                return w.length ? fn(w) : l;
              }).join('\n');
              return `<div class="tool-list-row cc-copy-row" data-copy="${esc(value)}">
                        <span class="tool-list-key">${name}<span class="tool-list-dim" style="display:block;">${use}</span></span>
                        <span class="tool-list-val" style="white-space:pre-wrap;">${esc(value)}</span>
                      </div>`;
            }).join('');
            out.querySelectorAll('[data-copy]').forEach((el) => {
              (el as HTMLElement).onclick = () => {
                const v = (el as HTMLElement).dataset.copy || '';
                void Toolbox.copyText?.(v, { message: '복사했어요' });
              };
            });
            status.textContent = `${lines.length}줄 · 줄을 눌러 복사하세요.`;
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('convert');
          }

          input.addEventListener('input', run);
          input.value = 'XMLHttpRequest';
          run();
        }
      }
    ]
  });
})();
