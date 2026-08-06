/**
 * 영업일 계산 (TASK-KL-088)
 *
 * 「접수일로부터 영업일 7일 이내」 같은 기한은 주말만 빼서는 안 맞는다. 공휴일과 대체공휴일까지
 * 빼야 진짜 날짜가 나온다. 그런데 달력을 세어 보다 보면 설·추석이 며칠인지부터 막힌다.
 *
 * 그래서 한국 공휴일을 담아 두고 **어떤 날을 뺐는지 보여 준다** — 결과 날짜만 던지면
 * 맞는지 확인할 방법이 없다. 음력 명절은 해마다 날짜가 달라 표로 담는다(계산으로는 못 낸다).
 */
(function (): void {
  /** 양력 고정 공휴일 (월-일) */
  const FIXED: Array<[number, number, string]> = [
    [1, 1, '신정'],
    [3, 1, '삼일절'],
    [5, 5, '어린이날'],
    [6, 6, '현충일'],
    [8, 15, '광복절'],
    [10, 3, '개천절'],
    [10, 9, '한글날'],
    [12, 25, '성탄절']
  ];

  /**
   * 음력 명절과 부처님오신날은 해마다 양력 날짜가 달라 계산으로 못 낸다 — 표로 담는다.
   * 담지 않은 해는 「모른다」고 말한다. 조용히 틀린 날짜를 내놓는 것보다 낫다.
   */
  const LUNAR: Record<number, Array<[number, number, string]>> = {
    2024: [[2, 9, '설 연휴'], [2, 10, '설날'], [2, 11, '설 연휴'], [2, 12, '대체공휴일'], [4, 10, '국회의원 선거'], [5, 15, '부처님오신날'], [9, 16, '추석 연휴'], [9, 17, '추석'], [9, 18, '추석 연휴']],
    2025: [[1, 28, '설 연휴'], [1, 29, '설날'], [1, 30, '설 연휴'], [3, 3, '대체공휴일'], [5, 5, '부처님오신날'], [5, 6, '대체공휴일'], [10, 5, '추석 연휴'], [10, 6, '추석'], [10, 7, '추석 연휴'], [10, 8, '대체공휴일']],
    2026: [[2, 16, '설 연휴'], [2, 17, '설날'], [2, 18, '설 연휴'], [3, 2, '대체공휴일'], [5, 24, '부처님오신날'], [5, 25, '대체공휴일'], [8, 17, '대체공휴일'], [9, 24, '추석 연휴'], [9, 25, '추석'], [9, 26, '추석 연휴'], [10, 5, '대체공휴일']],
    2027: [[2, 6, '설 연휴'], [2, 7, '설날'], [2, 8, '설 연휴'], [2, 9, '대체공휴일'], [5, 13, '부처님오신날'], [9, 14, '추석 연휴'], [9, 15, '추석'], [9, 16, '추석 연휴']]
  };

  const KNOWN_YEARS = Object.keys(LUNAR).map(Number);
  const key = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

  function holidaysOf(year: number): Map<string, string> {
    const map = new Map<string, string>();
    for (const [m, d, name] of FIXED) map.set(`${year}-${m}-${d}`, name);
    for (const [m, d, name] of LUNAR[year] || []) map.set(`${year}-${m}-${d}`, name);
    return map;
  }

  Toolbox.register({
    id: 'workdays',
    title: '영업일 계산',
    category: 'tool',
    desc: '주말과 공휴일을 뺀 영업일을 셉니다. 어떤 날을 뺐는지 보여 줍니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9 15l2 2 4-4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '영업일',
        build: function (container: HTMLElement): void {
          const today = new Date();
          const iso = (d: Date): string =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

          container.innerHTML = `
            <div class="tool-chips" style="margin-bottom:var(--space-lg);">
              <button type="button" class="tool-chip active" id="wdModeAfter">며칠 뒤가 언제</button>
              <button type="button" class="tool-chip" id="wdModeBetween">두 날 사이 며칠</button>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">시작일</div>
                  <input type="date" id="wdFrom" aria-label="시작일" value="${iso(today)}">
                </div>
                <div id="wdAfterWrap">
                  <div class="tool-sublabel">영업일 <span id="wdDaysVal" class="range-value">7일</span></div>
                  <input type="range" id="wdDays" aria-label="영업일 수" min="1" max="60" value="7">
                </div>
                <div id="wdToWrap" style="display:none;">
                  <div class="tool-sublabel">끝나는 날</div>
                  <input type="date" id="wdTo" aria-label="끝나는 날" value="${iso(new Date(today.getTime() + 14 * 86400000))}">
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="wdSat"> 토요일도 영업일</label>
                <label class="tool-chip"><input type="checkbox" id="wdIncludeStart"> 시작일도 하루로 셈</label>
              </div>
            </div>

            <div class="tool-display" id="wdOut">—</div>
            <div class="cc-stats" id="wdStats"></div>
            <div class="tool-list" id="wdSkipped"></div>

            <div class="tool-status" id="wdStatus">기한은 주말만 빼서는 안 맞습니다 — 공휴일과 대체공휴일까지 뺍니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const fromEl = $<HTMLInputElement>('#wdFrom');
          const toEl = $<HTMLInputElement>('#wdTo');
          const daysEl = $<HTMLInputElement>('#wdDays');
          const out = $<HTMLElement>('#wdOut');
          const stats = $<HTMLElement>('#wdStats');
          const skippedEl = $<HTMLElement>('#wdSkipped');
          const status = $<HTMLElement>('#wdStatus');

          let mode: 'after' | 'between' = 'after';

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;
          const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
          const fmt = (d: Date): string => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;

          /** 그 날이 쉬는 날이면 이유를, 아니면 빈 문자열을 준다. */
          function restReason(d: Date, satWorks: boolean): string {
            const day = d.getDay();
            if (day === 0) return '일요일';
            if (day === 6 && !satWorks) return '토요일';
            return holidaysOf(d.getFullYear()).get(key(d)) || '';
          }

          function warnUnknown(years: number[]): void {
            const unknown = [...new Set(years)].filter((y) => !KNOWN_YEARS.includes(y));
            if (unknown.length) {
              say(
                `${unknown.join('·')}년은 음력 명절 날짜를 담고 있지 않습니다. 설·추석·부처님오신날이 빠져 결과가 며칠 어긋날 수 있습니다.`,
                'error'
              );
            }
          }

          function refresh(): void {
            const satWorks = $<HTMLInputElement>('#wdSat').checked;
            const from = new Date(fromEl.value + 'T00:00:00');
            if (isNaN(from.getTime())) return;
            const skipped: Array<[string, string]> = [];

            if (mode === 'after') {
              const need = parseInt(daysEl.value, 10);
              $<HTMLElement>('#wdDaysVal').textContent = need + '일';
              let counted = 0;
              const cur = new Date(from);
              // 시작일을 세는지 여부에 따라 하루 앞에서 시작한다
              if (!$<HTMLInputElement>('#wdIncludeStart').checked) cur.setDate(cur.getDate() + 1);
              let guard = 0;
              while (counted < need && guard++ < 2000) {
                const why = restReason(cur, satWorks);
                if (why) skipped.push([`${cur.getMonth() + 1}/${cur.getDate()}`, why]);
                else counted++;
                if (counted < need) cur.setDate(cur.getDate() + 1);
              }
              out.textContent = fmt(cur);
              stats.innerHTML =
                stat('영업일', `${need}일`, true) +
                stat('실제 걸리는 날', `${Math.round((cur.getTime() - from.getTime()) / 86400000)}일`) +
                stat('쉬는 날', `${skipped.length}일`);
              warnUnknown([from.getFullYear(), cur.getFullYear()]);
            } else {
              const to = new Date(toEl.value + 'T00:00:00');
              if (isNaN(to.getTime()) || to < from) {
                out.textContent = '—';
                say('끝나는 날이 시작일보다 빠릅니다.', 'error');
                return;
              }
              let work = 0;
              const cur = new Date(from);
              if (!$<HTMLInputElement>('#wdIncludeStart').checked) cur.setDate(cur.getDate() + 1);
              while (cur <= to) {
                const why = restReason(cur, satWorks);
                if (why) skipped.push([`${cur.getMonth() + 1}/${cur.getDate()}`, why]);
                else work++;
                cur.setDate(cur.getDate() + 1);
              }
              const total = Math.round((to.getTime() - from.getTime()) / 86400000);
              out.textContent = `영업일 ${work}일`;
              stats.innerHTML =
                stat('영업일', `${work}일`, true) + stat('달력상', `${total}일`) + stat('쉬는 날', `${skipped.length}일`);
              warnUnknown([from.getFullYear(), to.getFullYear()]);
            }

            // 어떤 날을 뺐는지 보여 준다 — 결과만 던지면 맞는지 확인할 방법이 없다
            skippedEl.innerHTML = skipped.length
              ? skipped
                  .map(
                    ([d, why]) =>
                      `<div class="tool-list-row"><span class="tool-list-key">${d}</span><span class="tool-list-val">${why}</span></div>`
                  )
                  .join('')
              : '<div class="tool-list-row"><span class="tool-list-val">뺀 날이 없습니다.</span></div>';
            if (!status.className.includes('error')) say('쉬는 날을 아래에 모두 적었습니다 — 확인해 보세요.', 'ok');
            Toolbox.trackUse?.('calc');
          }

          function setMode(next: 'after' | 'between'): void {
            mode = next;
            $<HTMLElement>('#wdModeAfter').classList.toggle('active', next === 'after');
            $<HTMLElement>('#wdModeBetween').classList.toggle('active', next === 'between');
            $<HTMLElement>('#wdAfterWrap').style.display = next === 'after' ? '' : 'none';
            $<HTMLElement>('#wdToWrap').style.display = next === 'between' ? '' : 'none';
            refresh();
          }

          [fromEl, toEl, daysEl].forEach((el) => el.addEventListener('input', refresh));
          ['#wdSat', '#wdIncludeStart'].forEach((s) => $<HTMLInputElement>(s).addEventListener('change', refresh));
          $<HTMLElement>('#wdModeAfter').onclick = () => setMode('after');
          $<HTMLElement>('#wdModeBetween').onclick = () => setMode('between');
          refresh();
        }
      }
    ]
  });
})();
