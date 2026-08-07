/**
 * 더미 텍스트 생성 (TASK-KL-088)
 *
 * 화면을 짜다 글이 없어 넣는 임시 텍스트다. 영어 로렘 입숨만 있으면 한글 화면에서는
 * 소용이 없다 — 글자 폭·줄바꿈·자간이 전혀 달라 **레이아웃 검증이 안 된다**.
 * 그래서 한글 더미를 기본으로 두고 로렘 입숨을 함께 낸다.
 */
(function (): void {
  const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');

  /** 한글 더미 — 뜻이 통하지 않아야 읽히지 않고, 글자 분포는 한국어에 가깝게. */
  const KO = '가을 바람 소리 물결 그림자 하늘 언덕 시간 자리 마음 이야기 걸음 골목 여름 저녁 노래 창문 나무 기억 사이 구름 빛깔 새벽 방향 무늬 온기 계단 목소리 파도 조각 숨결 거리 문장 표정 열쇠 바다 안개 손끝 지도 오후'.split(' ');

  const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  function sentence(words: string[], korean: boolean): string {
    const n = 6 + Math.floor(Math.random() * 8);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) parts.push(rand(words));
    const s = parts.join(' ');
    return korean ? s + '.' : s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }

  function paragraph(words: string[], korean: boolean): string {
    const n = 3 + Math.floor(Math.random() * 4);
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(sentence(words, korean));
    return out.join(' ');
  }

  Toolbox.register({
    id: 'lorem',
    title: '더미 텍스트 생성',
    category: 'tool',
    desc: '화면 시안용 임시 글을 만듭니다. 한글 더미와 로렘 입숨, 문단·문장·단어 단위',
    layout: 'form',
    icon: '<path d="M4 6h16M4 10h16M4 14h12M4 18h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '더미 텍스트',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-chips" id="loLang">
                <button type="button" class="tool-chip active" data-lang="ko">한글</button>
                <button type="button" class="tool-chip" data-lang="en">로렘 입숨</button>
              </div>
            </div>
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">단위</div>
                  <select id="loUnit" aria-label="단위">
                    <option value="para">문단</option>
                    <option value="sent">문장</option>
                    <option value="word">단어</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">개수 <span id="loCountVal" class="range-value">3개</span></div>
                  <input type="range" id="loCount" aria-label="개수" min="1" max="20" value="3">
                </div>
              </div>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="loGen">새로 만들기</button>
              <button class="btn btn-ghost" id="loCopy">복사</button>
            </div>
            <textarea id="loOut" aria-label="만들어진 글" rows="10" spellcheck="false" readonly></textarea>
            <div class="tool-status" id="loStatus">한글 화면은 한글 더미로 확인해야 줄바꿈이 맞습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const out = $<HTMLTextAreaElement>('#loOut');
          const count = $<HTMLInputElement>('#loCount');
          const countVal = $<HTMLElement>('#loCountVal');
          const unit = $<HTMLSelectElement>('#loUnit');
          const status = $<HTMLElement>('#loStatus');
          let korean = true;

          function run(): void {
            const words = korean ? KO : LOREM;
            const n = parseInt(count.value, 10);
            countVal.textContent = n + '개';
            const rows: string[] = [];
            for (let i = 0; i < n; i++) {
              if (unit.value === 'para') rows.push(paragraph(words, korean));
              else if (unit.value === 'sent') rows.push(sentence(words, korean));
              else rows.push(rand(words));
            }
            out.value = unit.value === 'word' ? rows.join(' ') : rows.join('\n\n');
            status.textContent = `${out.value.length.toLocaleString('ko-KR')}자 · ${korean ? '한글 화면은 한글 더미로 확인해야 줄바꿈이 맞습니다.' : '영문 시안용입니다.'}`;
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('generate');
          }

          container.querySelectorAll('#loLang .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#loLang .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              korean = (chip as HTMLElement).dataset.lang === 'ko';
              run();
            };
          });
          count.addEventListener('input', run);
          unit.addEventListener('change', run);
          $<HTMLButtonElement>('#loGen').onclick = run;
          $<HTMLButtonElement>('#loCopy').onclick = () => {
            if (out.value) void Toolbox.copyText?.(out.value, { message: '더미 텍스트를 복사했어요' });
          };
          run();
        }
      }
    ]
  });
})();
