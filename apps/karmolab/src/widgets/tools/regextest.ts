/**
 * 정규식 테스터 (TASK-KL-088)
 * 하이라이트는 exec 루프로 만들되, 빈 매치(`a*` 류)에서 lastIndex 를 강제로 밀어 무한루프를 막는다.
 */
(function (): void {
  const PRESETS: Array<{ label: string; pattern: string; flags: string; sample: string }> = [
    { label: '이메일', pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.]+', flags: 'g', sample: 'help@karmolab.dev 로 보내고 cc 는 me@example.co.kr' },
    { label: '전화번호(한국)', pattern: '01[016789]-?\\d{3,4}-?\\d{4}', flags: 'g', sample: '010-1234-5678 / 01098765432' },
    { label: 'URL', pattern: 'https?://[\\w./?=&%-]+', flags: 'g', sample: 'https://blog.mascari4615.com/karmolab/ 를 열어보세요' },
    { label: 'HTML 태그', pattern: '<[^>]+>', flags: 'g', sample: '<div class="x">본문</div>' },
    { label: '한글만', pattern: '[가-힣]+', flags: 'g', sample: 'KarmoLab 은 도구 상자입니다' },
    { label: '날짜 YYYY-MM-DD', pattern: '(\\d{4})-(\\d{2})-(\\d{2})', flags: 'g', sample: '출시 2026-08-05, 종료 2027-01-01' },
    { label: '중복 공백', pattern: '\\s{2,}', flags: 'g', sample: '공백이    많은   문장' }
  ];

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  Toolbox.register({
    id: 'regextest',
    title: '정규식 테스터',
    category: 'tool',
    desc: '정규표현식을 실시간으로 시험하고 매치·그룹·치환 결과를 확인합니다',
    layout: 'wide',
    icon: '<path d="M12 4v16M5 8l14 8M19 8L5 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '정규식',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '정규식은 무섭지 않아요. 같이 시험해봐요!' });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">패턴</label>
              <div style="display:flex; gap:8px; align-items:center;">
                <span style="color:var(--text-tertiary); font-family:var(--font-mono);">/</span>
                <input type="text" id="rxPattern" class="mono-input" placeholder="[a-z]+" style="flex:1;">
                <span style="color:var(--text-tertiary); font-family:var(--font-mono);">/</span>
                <input type="text" id="rxFlags" class="mono-input" value="gm" style="width:70px;">
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                ${PRESETS.map((p, i) => `<button type="button" class="tool-chip rx-preset" data-i="${i}">${p.label}</button>`).join('')}
              </div>
              <div class="tool-status" style="margin-top:8px;">플래그 — g 전체, i 대소문자 무시, m 여러 줄, s 줄바꿈 포함(.), u 유니코드</div>
            </div>

            <div class="tool-split">
              <div class="tool-split-pane">
                <label class="field-label">테스트 문자열</label>
                <textarea id="rxInput" class="mono-input" style="min-height:180px;"></textarea>
                <label class="field-label" style="margin-top:12px;">치환 (선택) — $1, $&lt;name&gt; 사용 가능</label>
                <input type="text" id="rxReplace" class="mono-input" placeholder="[$&]">
              </div>
              <div class="tool-split-pane">
                <label class="field-label">하이라이트</label>
                <div id="rxHighlight" class="rx-highlight"></div>
                <label class="field-label" style="margin-top:12px;">치환 결과</label>
                <div id="rxReplaced" class="rx-highlight"></div>
              </div>
            </div>

            <div class="tool-status" id="rxStatus" style="margin-top:var(--space-lg);">패턴을 입력하면 즉시 검사합니다.</div>
            <div id="rxMatches" class="tool-list"></div>
          `;
          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const pattern = $<HTMLInputElement>('#rxPattern');
          const flags = $<HTMLInputElement>('#rxFlags');
          const input = $<HTMLTextAreaElement>('#rxInput');
          const replace = $<HTMLInputElement>('#rxReplace');
          const highlight = $<HTMLElement>('#rxHighlight');
          const replaced = $<HTMLElement>('#rxReplaced');
          const status = $<HTMLElement>('#rxStatus');
          const matchesEl = $<HTMLElement>('#rxMatches');

          function run(): void {
            const pat = pattern.value;
            const text = input.value;
            if (!pat) {
              highlight.innerHTML = esc(text);
              replaced.innerHTML = '';
              matchesEl.innerHTML = '';
              status.textContent = '패턴을 입력하면 즉시 검사합니다.';
              status.className = 'tool-status';
              return;
            }
            let re: RegExp;
            try {
              re = new RegExp(pat, flags.value.includes('g') ? flags.value : flags.value + 'g');
            } catch (e) {
              status.textContent = '정규식 오류 — ' + (e instanceof Error ? e.message : String(e));
              status.className = 'tool-status error';
              highlight.innerHTML = esc(text);
              matchesEl.innerHTML = '';
              return;
            }

            let html = '';
            let last = 0;
            let count = 0;
            const rows: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = re.exec(text)) !== null) {
              count++;
              html += esc(text.slice(last, m.index)) + `<mark class="rx-mark">${esc(m[0]) || '∅'}</mark>`;
              last = m.index + m[0].length;
              const groups = m.slice(1).map((g, i) => `$${i + 1}=${g === undefined ? '(없음)' : g}`);
              const named = m.groups ? Object.keys(m.groups).map((k) => `${k}=${m?.groups?.[k]}`) : [];
              rows.push(
                `<div class="tool-list-row"><span class="tool-list-key">#${count} @${m.index}</span><span class="tool-list-val">${esc(m[0])}</span><span class="tool-list-dim">${esc([...groups, ...named].join(' · '))}</span></div>`
              );
              if (m[0] === '') re.lastIndex++;
              if (count > 5000) break;
            }
            html += esc(text.slice(last));
            highlight.innerHTML = html || '<span style="color:var(--text-tertiary);">테스트 문자열을 입력하세요</span>';
            matchesEl.innerHTML = rows.slice(0, 200).join('');
            status.textContent = count ? `${count.toLocaleString('ko-KR')}개 매치` : '매치 없음';
            status.className = 'tool-status ' + (count ? 'ok' : '');

            if (replace.value) {
              try {
                replaced.textContent = text.replace(re, replace.value);
              } catch (e) {
                replaced.textContent = '치환 오류: ' + (e instanceof Error ? e.message : String(e));
              }
            } else {
              replaced.innerHTML = '<span style="color:var(--text-tertiary);">치환 문자열을 입력하면 결과가 나옵니다</span>';
            }
          }

          [pattern, flags, input, replace].forEach((el) => el.addEventListener('input', run));
          container.querySelectorAll('.rx-preset').forEach((btn) => {
            (btn as HTMLButtonElement).onclick = () => {
              const p = PRESETS[Number((btn as HTMLElement).dataset.i)];
              pattern.value = p.pattern;
              flags.value = p.flags;
              if (!input.value.trim()) input.value = p.sample;
              run();
            };
          });

          pattern.value = PRESETS[0].pattern;
          input.value = PRESETS[0].sample;
          run();
        }
      }
    ]
  });
})();
