/**
 * 로또 번호 생성기 (TASK-KL-088) — 1~45 중복 없는 6개 + 보너스.
 * 제외수·고정수·홀짝 균형 조건을 만족할 때까지 재추첨 (최대 시도 후 조건 완화 안내).
 */
(function (): void {
  const BALL_COLOR = (n: number): string => {
    if (n <= 10) return '#fbc400';
    if (n <= 20) return '#69c8f2';
    if (n <= 30) return '#ff7272';
    if (n <= 40) return '#aaa';
    return '#b0d840';
  };

  function draw(exclude: Set<number>, include: number[]): number[] {
    const pool: number[] = [];
    for (let i = 1; i <= 45; i++) if (!exclude.has(i) && include.indexOf(i) < 0) pool.push(i);
    const picked = [...include];
    while (picked.length < 6 && pool.length) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked.sort((a, b) => a - b);
  }

  function parseNums(raw: string): number[] {
    return (raw.match(/\d+/g) || [])
      .map((s) => parseInt(s, 10))
      .filter((n) => n >= 1 && n <= 45)
      .filter((n, i, arr) => arr.indexOf(n) === i);
  }

  Toolbox.register({
    id: 'lotto',
    title: '로또 번호 생성',
    category: 'tool',
    desc: '1~45 로또 번호를 원하는 게임 수만큼 뽑습니다. 제외수·고정수·홀짝 조건 지원',
    layout: 'form',
    icon: '<circle cx="8" cy="9" r="4" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="16" cy="15" r="4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 7v4M6 9h4" stroke="currentColor" stroke-width="1.4"/>',
    tabs: [
      {
        id: 'app',
        label: '로또',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '당첨되면 저도 좀... 농담이에요!' });
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">게임 수 <span id="ltCountVal" class="range-value">5게임</span></div>
                  <input type="range" id="ltCount" min="1" max="20" value="5">
                </div>
                <div>
                  <div class="tool-sublabel">보너스 번호</div>
                  <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-sm); color:var(--text-secondary); height:38px;">
                    <input type="checkbox" id="ltBonus" style="width:auto;" checked> 함께 뽑기
                  </label>
                </div>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">조건 (선택)</label>
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">고정수 — 항상 포함 (최대 5개)</div>
                  <input type="text" id="ltInclude" placeholder="예) 7, 13">
                </div>
                <div>
                  <div class="tool-sublabel">제외수 — 절대 제외</div>
                  <input type="text" id="ltExclude" placeholder="예) 1, 2, 3">
                </div>
              </div>
              <div style="margin-top:10px;">
                <div class="tool-sublabel">홀짝 균형</div>
                <select id="ltParity">
                  <option value="any">상관없음</option>
                  <option value="balanced">홀짝 2:4 ~ 4:2 (흔한 패턴)</option>
                  <option value="odd">홀수 많게</option>
                  <option value="even">짝수 많게</option>
                </select>
              </div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="ltDraw">번호 뽑기</button>
              <button class="btn btn-ghost" id="ltCopy">전체 복사</button>
            </div>

            <div id="ltResult"></div>
            <div class="tool-status" id="ltStatus">완전 무작위(Math.random) 추첨입니다. 재미로만 봐주세요.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const countInput = $<HTMLInputElement>('#ltCount');
          const countVal = $<HTMLElement>('#ltCountVal');
          const result = $<HTMLElement>('#ltResult');
          const status = $<HTMLElement>('#ltStatus');

          countInput.addEventListener('input', () => {
            countVal.textContent = countInput.value + '게임';
          });

          function parityOk(nums: number[]): boolean {
            const odd = nums.filter((n) => n % 2 === 1).length;
            switch ($<HTMLSelectElement>('#ltParity').value) {
              case 'balanced':
                return odd >= 2 && odd <= 4;
              case 'odd':
                return odd >= 4;
              case 'even':
                return odd <= 2;
              default:
                return true;
            }
          }

          function run(): void {
            const include = parseNums($<HTMLInputElement>('#ltInclude').value).slice(0, 5);
            const excludeArr = parseNums($<HTMLInputElement>('#ltExclude').value).filter((n) => include.indexOf(n) < 0);
            const exclude = new Set(excludeArr);
            if (45 - exclude.size < 6) {
              status.textContent = '제외수가 너무 많아요. 최소 6개는 남겨 주세요.';
              status.className = 'tool-status error';
              return;
            }
            const games = parseInt(countInput.value, 10);
            const wantBonus = $<HTMLInputElement>('#ltBonus').checked;
            const rows: string[] = [];
            let relaxed = false;

            for (let g = 0; g < games; g++) {
              let nums: number[] = [];
              let tries = 0;
              do {
                nums = draw(exclude, include);
                tries++;
              } while (!parityOk(nums) && tries < 400);
              if (tries >= 400) relaxed = true;

              let bonus = -1;
              if (wantBonus) {
                const rest: number[] = [];
                for (let i = 1; i <= 45; i++) if (nums.indexOf(i) < 0 && !exclude.has(i)) rest.push(i);
                bonus = rest[Math.floor(Math.random() * rest.length)];
              }
              const balls = nums
                .map(
                  (n) =>
                    `<span class="lt-ball" style="background:${BALL_COLOR(n)}">${n}</span>`
                )
                .join('');
              const bonusHtml =
                bonus > 0
                  ? `<span class="lt-plus">+</span><span class="lt-ball lt-ball-bonus" style="background:${BALL_COLOR(bonus)}">${bonus}</span>`
                  : '';
              rows.push(
                `<div class="lt-row"><span class="lt-index">${g + 1}게임</span><div class="lt-balls">${balls}${bonusHtml}</div></div>`
              );
            }
            result.innerHTML = rows.join('');
            status.textContent = relaxed
              ? '홀짝 조건을 만족하는 조합을 못 찾아 일부 게임은 조건 없이 뽑았어요.'
              : `${games}게임 추첨 완료 · 완전 무작위입니다.`;
            status.className = 'tool-status' + (relaxed ? '' : ' ok');
            Toolbox.incrementProgress?.('lotto_draws', games);
            Toolbox.trackUse?.('draw');
          }

          $<HTMLButtonElement>('#ltDraw').onclick = run;
          $<HTMLButtonElement>('#ltCopy').onclick = async () => {
            const text = [...result.querySelectorAll('.lt-row')]
              .map((row) => {
                const idx = row.querySelector('.lt-index')?.textContent || '';
                const balls = [...row.querySelectorAll('.lt-ball')].map((b) => b.textContent).join(', ');
                return `${idx}: ${balls}`;
              })
              .join('\n');
            if (!text) return;
            await Toolbox.copyText?.(text, { message: '번호를 복사했어요' });
          };

          run();
        }
      }
    ]
  });
})();
