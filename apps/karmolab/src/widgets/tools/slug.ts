/**
 * 슬러그 만들기 (TASK-KL-088)
 *
 * 한글 제목을 그대로 주소에 넣으면 %EC%95%88... 로 부풀어 공유할 때 흉하고 잘린다.
 * 그래서 로마자로 옮겨 적는데, 국어의 로마자 표기법을 손으로 지키기는 어렵다 —
 * 자음이 위치에 따라 달라지기 때문(ㄱ = g / k). 초성·종성을 갈라 규칙대로 옮긴다.
 */
(function (): void {
  const CHO = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
  const JUNG = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
  const JONG = ['','k','k','k','n','n','n','t','l','k','m','p','t','t','p','t','m','p','p','t','t','ng','t','t','k','t','p','t'];

  /** 국어의 로마자 표기법 기준 음절 단위 변환 (자음 동화 등 세부 규칙은 다루지 않는다) */
  function romanize(text: string): string {
    let out = '';
    for (const ch of text) {
      const code = ch.charCodeAt(0) - 0xac00;
      if (code < 0 || code > 11171) {
        out += ch;
        continue;
      }
      out += CHO[Math.floor(code / 588)] + JUNG[Math.floor((code % 588) / 28)] + JONG[code % 28];
    }
    return out;
  }

  function slugify(text: string, opts: { romanize: boolean; sep: string; lower: boolean }): string {
    let s = opts.romanize ? romanize(text) : text;
    s = s.normalize('NFKD').replace(/[̀-ͯ]/g, ''); // 악센트 분리 후 제거
    if (opts.lower) s = s.toLowerCase();
    s = s
      .replace(/['"’`]/g, '')
      .replace(/[^a-zA-Z0-9가-힣]+/g, opts.sep)
      .replace(new RegExp(`\\${opts.sep}{2,}`, 'g'), opts.sep)
      .replace(new RegExp(`^\\${opts.sep}|\\${opts.sep}$`, 'g'), '');
    return s;
  }

  Toolbox.register({
    id: 'slug',
    title: '슬러그 만들기',
    category: 'tool',
    desc: '제목을 주소에 쓸 형태로 바꿉니다. 한글은 로마자로 옮겨 적습니다',
    layout: 'form',
    icon: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '슬러그',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">제목 — 여러 줄이면 줄마다 만듭니다</label>
              <textarea id="slIn" rows="4" spellcheck="false" placeholder="KarmoLab 도구 모음"></textarea>
            </div>
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">이음 문자</div>
                  <select id="slSep" aria-label="이음 문자">
                    <option value="-">하이픈 (-)</option>
                    <option value="_">밑줄 (_)</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">처리</div>
                  <div class="tool-chips">
                    <label class="tool-chip"><input type="checkbox" id="slRoman" checked> 한글 로마자</label>
                    <label class="tool-chip"><input type="checkbox" id="slLower" checked> 소문자</label>
                  </div>
                </div>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label">슬러그</label>
              <textarea id="slOut" aria-label="만들어진 슬러그" rows="4" spellcheck="false" readonly></textarea>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-ghost" id="slCopy">복사</button>
            </div>
            <div class="tool-status" id="slStatus">한글을 그대로 주소에 넣으면 %EC 로 부풀어 공유할 때 잘립니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#slIn');
          const out = $<HTMLTextAreaElement>('#slOut');
          const status = $<HTMLElement>('#slStatus');

          function run(): void {
            const sep = $<HTMLSelectElement>('#slSep').value;
            const opts = {
              romanize: $<HTMLInputElement>('#slRoman').checked,
              lower: $<HTMLInputElement>('#slLower').checked,
              sep
            };
            const lines = input.value.split(/\r?\n/).map((l) => slugify(l, opts));
            out.value = lines.join('\n');
            const longest = Math.max(0, ...lines.map((l) => l.length));
            status.textContent = input.value
              ? `가장 긴 슬러그 ${longest}자 · 주소에 그대로 쓸 수 있습니다.`
              : '한글을 그대로 주소에 넣으면 %EC 로 부풀어 공유할 때 잘립니다.';
            status.className = 'tool-status' + (input.value ? ' ok' : '');
            Toolbox.trackUse?.('slugify');
          }

          input.addEventListener('input', run);
          container.querySelectorAll('select, input[type="checkbox"]').forEach((el) => {
            el.addEventListener('change', run);
          });
          $<HTMLButtonElement>('#slCopy').onclick = () => {
            if (out.value) void Toolbox.copyText?.(out.value, { message: '슬러그를 복사했어요' });
          };

          input.value = 'KarmoLab 도구 모음\n삶을 섞고 술을 바꿀 시간';
          run();
        }
      }
    ]
  });
})();
