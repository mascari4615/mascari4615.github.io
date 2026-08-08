/**
 * 날짜 계산기 · D-Day (TASK-KL-088)
 * 모든 계산은 로컬 자정 기준 Date 로 정규화한다 — 시:분이 섞이면 하루가 밀린다(경계 버그의 단골).
 */
(function (): void {
  const DAY = 86400000;
  const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

  const midnight = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = (): Date => midnight(new Date());
  const toInput = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (s: string): Date | null => {
    if (!s) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  };
  const label = (d: Date): string => `${toInput(d)} (${WEEKDAY[d.getDay()]})`;

  /** 만 나이 = 생일이 지났는지로 판정 (한국 만나이 통일법 기준) */
  function ageOf(birth: Date, on: Date): { full: number; korean: number; nextBirthday: Date; daysToBirthday: number } {
    let full = on.getFullYear() - birth.getFullYear();
    const passed =
      on.getMonth() > birth.getMonth() || (on.getMonth() === birth.getMonth() && on.getDate() >= birth.getDate());
    if (!passed) full -= 1;
    const korean = on.getFullYear() - birth.getFullYear() + 1;
    let next = new Date(on.getFullYear(), birth.getMonth(), birth.getDate());
    if (next.getTime() < on.getTime()) next = new Date(on.getFullYear() + 1, birth.getMonth(), birth.getDate());
    return { full, korean, nextBirthday: next, daysToBirthday: Math.round((next.getTime() - on.getTime()) / DAY) };
  }

  function businessDays(from: Date, to: Date): number {
    const a = from.getTime() <= to.getTime() ? from : to;
    const b = from.getTime() <= to.getTime() ? to : from;
    let n = 0;
    for (let t = a.getTime(); t < b.getTime(); t += DAY) {
      const day = new Date(t).getDay();
      if (day !== 0 && day !== 6) n++;
    }
    return n;
  }

  Toolbox.register({
    id: 'datecalc',
    title: '날짜 계산기 · D-Day',
    category: 'tool',
    desc: '두 날짜 사이 일수, D-Day, 며칠 후 날짜, 만 나이를 계산합니다',
    layout: 'form',
    icon: '<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'dday',
        label: 'D-Day',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '며칠 남았는지 세어 드릴게요.' });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">기준일 (오늘)</label>
              <input type="date" id="ddBase" aria-label="기준일">
            </div>
            <div class="field-group">
              <label class="field-label">목표일</label>
              <input type="date" id="ddTarget" aria-label="목표일">
              <div style="display:flex; gap:6px; margin-top:10px; flex-wrap:wrap;">
                <button class="btn btn-ghost dd-quick" data-add="7">+7일</button>
                <button class="btn btn-ghost dd-quick" data-add="30">+30일</button>
                <button class="btn btn-ghost dd-quick" data-add="100">+100일</button>
                <button class="btn btn-ghost dd-quick" data-add="365">+365일</button>
              </div>
            </div>
            <div class="tool-display" id="ddResult">D-0</div>
            <div class="cc-stats" id="ddStats"></div>
            <!-- 기념일 표 — 커플·기념일 계산기가 앞세우는 것. 기준일만 넣으면 나온다. -->
            <div class="field-group" style="margin-top:var(--space-lg);">
              <label class="field-label">기준일부터의 기념일</label>
              <div class="tool-list" id="ddMarks"></div>
            </div>
            <div class="tool-status" id="ddNote">D-Day 는 목표일 당일을 D-Day 로, 하루 전을 D-1 로 셉니다. 기념일은 <b>기준일을 1일째</b>로 세는 한국식입니다.</div>
          `;
          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const base = $<HTMLInputElement>('#ddBase');
          const target = $<HTMLInputElement>('#ddTarget');
          const out = $<HTMLElement>('#ddResult');
          const stats = $<HTMLElement>('#ddStats');

          base.value = toInput(today());
          target.value = toInput(new Date(today().getTime() + 100 * DAY));

          function render(): void {
            const a = parse(base.value);
            const b = parse(target.value);
            if (!a || !b) return;
            const diff = Math.round((b.getTime() - a.getTime()) / DAY);
            out.textContent = diff === 0 ? 'D-DAY' : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
            const cells: Array<[string, string]> = [
              ['목표일', label(b)],
              ['남은 일수', `${Math.abs(diff).toLocaleString('ko-KR')}일`],
              ['주 단위', `${Math.floor(Math.abs(diff) / 7)}주 ${Math.abs(diff) % 7}일`],
              ['평일만', `${businessDays(a, b).toLocaleString('ko-KR')}일`],
              ['시작일 포함', `${(Math.abs(diff) + 1).toLocaleString('ko-KR')}일째`],
              ['개월(근사)', `${(Math.abs(diff) / 30.44).toFixed(1)}개월`]
            ];
            stats.innerHTML = cells
              .map(([k, v]) => `<div class="cc-stat"><div class="cc-stat-label">${k}</div><div class="cc-stat-value">${v}</div></div>`)
              .join('');

            /* 기념일은 **기준일을 1일째**로 센다(한국식) — 100일은 기준일+99일이다.
               이걸 틀리면 하루씩 밀려서 정작 그날 축하를 못 한다. */
            const marks: Array<[string, number]> = [
              ['100일', 99], ['200일', 199], ['300일', 299],
              ['500일', 499], ['1000일', 999],
              ['1주년', -1], ['2주년', -2], ['3주년', -3]
            ];
            const now = today();
            $<HTMLElement>('#ddMarks').innerHTML = marks
              .map(([name, plus]) => {
                const day = plus < 0
                  ? new Date(a.getFullYear() - plus, a.getMonth(), a.getDate())
                  : new Date(a.getTime() + plus * DAY);
                const left = Math.round((day.getTime() - now.getTime()) / DAY);
                const 남은말 = left === 0 ? '오늘 🎉' : left > 0 ? `D-${left}` : `${Math.abs(left)}일 지남`;
                return `<div class="tool-list-row"><span class="tool-list-key">${name}</span><span class="tool-list-val">${label(day)} <span class="tool-list-dim">${남은말}</span></span></div>`;
              })
              .join('');
          }
          base.addEventListener('change', render);
          target.addEventListener('change', render);
          container.querySelectorAll('.dd-quick').forEach((btn) => {
            (btn as HTMLButtonElement).onclick = () => {
              const a = parse(base.value) || today();
              target.value = toInput(new Date(a.getTime() + Number((btn as HTMLElement).dataset.add) * DAY));
              render();
            };
          });
          render();
        }
      },
      {
        id: 'between',
        label: '날짜 차이 · 더하기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">두 날짜 사이</label>
              <div class="tool-grid-2">
                <input type="date" id="dbFrom" aria-label="시작일">
                <input type="date" id="dbTo" aria-label="종료일">
              </div>
              <div class="tool-status" id="dbOut" style="margin-top:10px;"></div>
            </div>
            <div class="field-group">
              <label class="field-label">날짜 더하기 / 빼기</label>
              <div class="tool-grid-2">
                <input type="date" id="daBase" aria-label="기준 날짜">
                <div style="display:flex; gap:6px;">
                  <input type="text" id="daAmount" inputmode="numeric" value="100" placeholder="숫자">
                  <select id="daUnit" aria-label="단위" style="width:auto;">
                    <option value="day">일</option>
                    <option value="week">주</option>
                    <option value="month">개월</option>
                    <option value="year">년</option>
                  </select>
                </div>
              </div>
              <div class="tool-status" id="daOut" style="margin-top:10px;"></div>
            </div>
          `;
          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const from = $<HTMLInputElement>('#dbFrom');
          const to = $<HTMLInputElement>('#dbTo');
          const dbOut = $<HTMLElement>('#dbOut');
          const daBase = $<HTMLInputElement>('#daBase');
          const daAmount = $<HTMLInputElement>('#daAmount');
          const daUnit = $<HTMLSelectElement>('#daUnit');
          const daOut = $<HTMLElement>('#daOut');

          from.value = toInput(today());
          to.value = toInput(new Date(today().getTime() + 30 * DAY));
          daBase.value = toInput(today());

          function renderBetween(): void {
            const a = parse(from.value);
            const b = parse(to.value);
            if (!a || !b) return;
            const days = Math.round(Math.abs(b.getTime() - a.getTime()) / DAY);
            dbOut.className = 'tool-status ok';
            dbOut.textContent = `${days.toLocaleString('ko-KR')}일 (양쪽 끝 포함 ${(days + 1).toLocaleString('ko-KR')}일) · 평일 ${businessDays(a, b).toLocaleString('ko-KR')}일 · 주말 ${(days - businessDays(a, b)).toLocaleString('ko-KR')}일`;
          }
          function renderAdd(): void {
            const a = parse(daBase.value);
            if (!a) return;
            const n = parseInt(daAmount.value.replace(/[^0-9-]/g, ''), 10) || 0;
            let d: Date;
            switch (daUnit.value) {
              case 'week':
                d = new Date(a.getTime() + n * 7 * DAY);
                break;
              case 'month':
                d = new Date(a.getFullYear(), a.getMonth() + n, a.getDate());
                break;
              case 'year':
                d = new Date(a.getFullYear() + n, a.getMonth(), a.getDate());
                break;
              default:
                d = new Date(a.getTime() + n * DAY);
            }
            daOut.className = 'tool-status ok';
            daOut.textContent = `${label(a)} 에서 ${n.toLocaleString('ko-KR')}${daUnit.options[daUnit.selectedIndex].text} → ${label(d)}`;
          }
          [from, to].forEach((el) => el.addEventListener('change', renderBetween));
          [daBase, daAmount, daUnit].forEach((el) => {
            el.addEventListener('change', renderAdd);
            el.addEventListener('input', renderAdd);
          });
          renderBetween();
          renderAdd();
        }
      },
      {
        id: 'age',
        label: '만 나이',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">생년월일</label>
              <input type="date" id="agBirth" aria-label="생년월일">
            </div>
            <div class="tool-display" id="agResult">-</div>
            <div class="cc-stats" id="agStats"></div>
            <div class="tool-status">2023년 6월부터 법적 나이는 「만 나이」로 통일되었습니다.</div>
          `;
          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const birth = $<HTMLInputElement>('#agBirth');
          const out = $<HTMLElement>('#agResult');
          const stats = $<HTMLElement>('#agStats');
          birth.value = '1996-01-01';

          function render(): void {
            const b = parse(birth.value);
            if (!b) return;
            const now = today();
            if (b.getTime() > now.getTime()) {
              out.textContent = '-';
              stats.innerHTML = '';
              return;
            }
            const a = ageOf(b, now);
            const livedDays = Math.round((now.getTime() - b.getTime()) / DAY);
            out.textContent = `만 ${a.full}세`;
            const cells: Array<[string, string]> = [
              ['세는 나이', `${a.korean}세`],
              ['태어난 요일', WEEKDAY[b.getDay()] + '요일'],
              ['살아온 날', `${livedDays.toLocaleString('ko-KR')}일`],
              ['다음 생일', label(a.nextBirthday)],
              ['생일까지', `${a.daysToBirthday}일`],
              ['10000일', label(new Date(b.getTime() + 10000 * DAY))]
            ];
            stats.innerHTML = cells
              .map(([k, v]) => `<div class="cc-stat"><div class="cc-stat-label">${k}</div><div class="cc-stat-value">${v}</div></div>`)
              .join('');
          }
          birth.addEventListener('change', render);
          birth.addEventListener('input', render);
          render();
        }
      }
    ]
  });
})();
