/**
 * 단어 빈도 분석 (TASK-KL-088)
 *
 * 글을 고칠 때 「내가 무슨 말을 반복하고 있나」 는 읽어서는 잘 안 보인다.
 * 세어 보면 바로 드러난다 — 그게 이 도구의 쓸모다.
 * 한국어는 조사가 붙어 「도구를 / 도구가 / 도구는」 이 다 다른 낱말로 세지므로,
 * 흔한 조사를 떼는 선택지를 둔다 (형태소 분석은 아니지만 체감은 크게 달라진다).
 */
(function (): void {
  /** 자주 붙는 조사·어미 — 길이 긴 것부터 떼야 「에서는」 이 「에서」+「는」 으로 안 갈린다 */
  const PARTICLES = [
    '으로부터', '에게서', '이라고', '라고는', '에서는', '에게는', '으로는', '까지는',
    '부터는', '이라는', '에서도', '으로도', '이나마', '조차도',
    '에서', '에게', '으로', '까지', '부터', '이나', '라도', '마저', '조차', '처럼', '보다', '만큼',
    '이란', '이든', '든지', '한테', '더러', '와의', '과의',
    '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만', '로', '나', '야', '여'
  ];

  const STOP = new Set(['그리고', '그러나', '하지만', '그래서', '또한', '즉', '및', '등', '수', '것', '때', '이것', '저것', '그것', 'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'it', 'for', 'on', 'that', 'this', 'with']);

  function stripParticle(word: string): string {
    if (word.length < 3) return word;
    for (const p of PARTICLES) {
      if (word.length > p.length + 1 && word.endsWith(p)) return word.slice(0, -p.length);
    }
    return word;
  }

  Toolbox.register({
    id: 'wordfreq',
    title: '단어 빈도 분석',
    category: 'tool',
    desc: '글에서 자주 쓴 낱말을 세어 보여줍니다. 한국어 조사 떼기 지원',
    layout: 'wide',
    icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20v-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '빈도',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">글</label>
              <textarea id="wfIn" rows="8" spellcheck="false" placeholder="분석할 글을 붙여 넣으세요"></textarea>
            </div>
            <div class="field-group">
              <div class="tool-chips">
                <label class="tool-chip"><input type="checkbox" id="wfParticle" checked> 조사 떼기</label>
                <label class="tool-chip"><input type="checkbox" id="wfStop" checked> 흔한 말 빼기</label>
                <label class="tool-chip"><input type="checkbox" id="wfCase"> 대소문자 구분</label>
              </div>
            </div>
            <div class="cc-stats" id="wfStats"></div>
            <div class="tool-list" id="wfOut"></div>
            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-ghost" id="wfCopy">표 복사</button>
            </div>
            <div class="tool-status" id="wfStatus">같은 말을 얼마나 반복하는지 보면 글이 줄어듭니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#wfIn');
          const stats = $<HTMLElement>('#wfStats');
          const out = $<HTMLElement>('#wfOut');
          const status = $<HTMLElement>('#wfStatus');
          let rows: Array<[string, number]> = [];

          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;
          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          function run(): void {
            const text = input.value;
            if (!text.trim()) {
              stats.innerHTML = '';
              out.innerHTML = '';
              rows = [];
              return;
            }
            const useParticle = $<HTMLInputElement>('#wfParticle').checked;
            const useStop = $<HTMLInputElement>('#wfStop').checked;
            const caseSensitive = $<HTMLInputElement>('#wfCase').checked;

            const raw = text.match(/[가-힣]+|[A-Za-z][A-Za-z']*|\d+/g) || [];
            const count: Record<string, number> = {};
            raw.forEach((w) => {
              let word = caseSensitive ? w : w.toLowerCase();
              if (useParticle && /^[가-힣]+$/.test(word)) word = stripParticle(word);
              if (word.length < 2) return;
              if (useStop && STOP.has(word)) return;
              count[word] = (count[word] || 0) + 1;
            });

            rows = Object.entries(count).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko-KR'));
            const total = raw.length;
            const top = rows[0];

            stats.innerHTML =
              stat('가장 많이 쓴 말', top ? `${top[0]} (${top[1]}회)` : '—', true) +
              stat('낱말 수', `${total.toLocaleString('ko-KR')}개`) +
              stat('서로 다른 말', `${rows.length.toLocaleString('ko-KR')}개`) +
              stat('어휘 다양도', total ? `${((rows.length / total) * 100).toFixed(1)}%` : '—');

            const maxCount = top ? top[1] : 1;
            out.innerHTML = rows
              .slice(0, 60)
              .map(
                ([w, c]) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${esc(w)}</span><span class="tool-list-val"><span class="wf-bar" style="width:${Math.max(4, (c / maxCount) * 100)}%"></span> ${c}회</span></div>`
              )
              .join('');
            status.textContent = `상위 ${Math.min(60, rows.length)}개를 보여줍니다. 같은 말을 얼마나 반복하는지 보면 글이 줄어듭니다.`;
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('analyze');
          }

          input.addEventListener('input', run);
          container.querySelectorAll('input[type="checkbox"]').forEach((el) => el.addEventListener('change', run));
          $<HTMLButtonElement>('#wfCopy').onclick = () => {
            if (!rows.length) return;
            void Toolbox.copyText?.(rows.map(([w, c]) => `${w}\t${c}`).join('\n'), { message: '빈도표를 복사했어요' });
          };
        }
      }
    ]
  });
})();
