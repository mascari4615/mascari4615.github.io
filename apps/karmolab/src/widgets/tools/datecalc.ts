/**
 * 날짜 계산기 · D-Day (TASK-KL-088)
 * 모든 계산은 로컬 자정 기준 Date 로 정규화한다 — 시:분이 섞이면 하루가 밀린다(경계 버그의 단골).
 */
import { t, loadNamespace, locale } from '../../lib/i18n';

import { midnight, parseDate, toInput } from '../../core/datecalc';

(function (): void {
  const DAY = 86400000;
  /* 요일 이름은 **쓸 때** 정한다 — 파일 실릴 때 정하면 열쇠가 굳는다. */
  const weekday = (i: number): string => t(`datecalc.week.${i}`);

  /* 날짜 다루기는 `src/core/datecalc.ts` 가 소유한다 — 특히 `parseDate` 는 2월 30일 같은 값을
     Date 가 3월로 조용히 넘기는 것을 막는다(여기 있던 판은 그걸 통과시켰다). TASK-KL-205 */
  const today = (): Date => midnight(new Date());
  const parse = parseDate;
  const label = (d: Date): string => `${toInput(d)} (${weekday(d.getDay())})`;

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
    title: t('widgets.datecalc.title', undefined, '날짜 계산기 · D-Day'),
    category: 'tool',
    desc: t('widgets-desc.datecalc.desc', undefined, '두 날짜 사이 일수, D-Day, 며칠 후 날짜, 만 나이를 계산합니다'),
    layout: 'form',
    icon: '<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'dday',
        label: 'D-Day',
        build: function (container: HTMLElement): void {
          void loadNamespace('datecalc').then(function () {
            drawDday(container);
          });
        }
      },
      {
        id: 'between',
        label: t('datecalc.tab.between', undefined, '날짜 차이 · 더하기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('datecalc').then(function () {
            drawBetween(container);
          });
        }
      },
      {
        id: 'age',
        label: t('datecalc.tab.age', undefined, '만 나이'),
        build: function (container: HTMLElement): void {
          void loadNamespace('datecalc').then(function () {
            drawAge(container);
          });
        }
      }
    ]
  });

  function drawDday(container: HTMLElement): void {
    /* 번역 글에 꺾쇠가 들어와도 화면이 안 깨지게. */
    const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          Mdd.linePreset('tool_run', { msg: t('datecalc.mdd') });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('datecalc.label.baseToday'))}</label>
              <input type="date" id="ddBase" aria-label="${esc(t('datecalc.label.base'))}">
            </div>
            <div class="field-group">
              <label class="field-label">${esc(t('datecalc.label.target'))}</label>
              <input type="date" id="ddTarget" aria-label="${esc(t('datecalc.label.target'))}">
              <div style="display:flex; gap:6px; margin-top:10px; flex-wrap:wrap;">
                <button class="btn btn-ghost dd-quick" data-add="7">${esc(t('datecalc.quick.add', { n: 7 }))}</button>
                <button class="btn btn-ghost dd-quick" data-add="30">${esc(t('datecalc.quick.add', { n: 30 }))}</button>
                <button class="btn btn-ghost dd-quick" data-add="100">${esc(t('datecalc.quick.add', { n: 100 }))}</button>
                <button class="btn btn-ghost dd-quick" data-add="365">${esc(t('datecalc.quick.add', { n: 365 }))}</button>
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
              [t('datecalc.stat.target'), label(b)],
              [t('datecalc.stat.daysLeft'), t('datecalc.value.days', { n: Math.abs(diff).toLocaleString(locale()) })],
              [t('datecalc.stat.weeks'), t('datecalc.value.weeksDays', { w: Math.floor(Math.abs(diff) / 7), d: Math.abs(diff) % 7 })],
              [t('datecalc.stat.weekdays'), t('datecalc.value.days', { n: businessDays(a, b).toLocaleString(locale()) })],
              [t('datecalc.stat.inclusive'), t('datecalc.value.nth', { n: (Math.abs(diff) + 1).toLocaleString(locale()) })],
              [t('datecalc.stat.months'), t('datecalc.value.months', { n: (Math.abs(diff) / 30.44).toFixed(1) })]
            ];
            stats.innerHTML = cells
              .map(([k, v]) => `<div class="cc-stat"><div class="cc-stat-label">${k}</div><div class="cc-stat-value">${v}</div></div>`)
              .join('');

            /* 기념일은 **기준일을 1일째**로 센다(한국식) — 100일은 기준일+99일이다.
               이걸 틀리면 하루씩 밀려서 정작 그날 축하를 못 한다. */
            const marks: Array<[string, number]> = [
              [t('datecalc.mark.d100'), 99], [t('datecalc.mark.d200'), 199], [t('datecalc.mark.d300'), 299],
              [t('datecalc.mark.d500'), 499], [t('datecalc.mark.d1000'), 999],
              [t('datecalc.mark.y1'), -1], [t('datecalc.mark.y2'), -2], [t('datecalc.mark.y3'), -3]
            ];
            const now = today();
            $<HTMLElement>('#ddMarks').innerHTML = marks
              .map(([name, plus]) => {
                const day = plus < 0
                  ? new Date(a.getFullYear() - plus, a.getMonth(), a.getDate())
                  : new Date(a.getTime() + plus * DAY);
                const left = Math.round((day.getTime() - now.getTime()) / DAY);
                const 남은말 = left === 0 ? t('datecalc.mark.today') : left > 0 ? `D-${left}` : t('datecalc.mark.passed', { n: Math.abs(left) });
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

  function drawBetween(container: HTMLElement): void {
    /* 번역 글에 꺾쇠가 들어와도 화면이 안 깨지게. */
    const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('datecalc.label.betweenTwo'))}</label>
              <div class="tool-grid-2">
                <input type="date" id="dbFrom" aria-label="${esc(t('datecalc.label.from'))}">
                <input type="date" id="dbTo" aria-label="${esc(t('datecalc.label.to'))}">
              </div>
              <div class="tool-status" id="dbOut" style="margin-top:10px;"></div>
            </div>
            <div class="field-group">
              <label class="field-label">${esc(t('datecalc.label.addSubtract'))}</label>
              <div class="tool-grid-2">
                <input type="date" id="daBase" aria-label="${esc(t('datecalc.label.baseDate'))}">
                <div style="display:flex; gap:6px;">
                  <input type="text" id="daAmount" inputmode="numeric" value="100" placeholder="${esc(t('datecalc.label.number'))}">
                  <select id="daUnit" aria-label="${esc(t('datecalc.label.unit'))}" style="width:auto;">
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

  function drawAge(container: HTMLElement): void {
    /* 번역 글에 꺾쇠가 들어와도 화면이 안 깨지게. */
    const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('datecalc.label.birth'))}</label>
              <input type="date" id="agBirth" aria-label="${esc(t('datecalc.label.birth'))}">
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
            out.textContent = t('datecalc.age.full', { n: a.full });
            const cells: Array<[string, string]> = [
              [t('datecalc.stat.koreanAge'), t('datecalc.value.age', { n: a.korean })],
              [t('datecalc.stat.weekday'), weekday(b.getDay())],
              [t('datecalc.stat.lived'), t('datecalc.value.days', { n: livedDays.toLocaleString(locale()) })],
              [t('datecalc.stat.nextBirthday'), label(a.nextBirthday)],
              [t('datecalc.stat.untilBirthday'), t('datecalc.value.days', { n: a.daysToBirthday })],
              [t('datecalc.stat.day10000'), label(new Date(b.getTime() + 10000 * DAY))]
            ];
            stats.innerHTML = cells
              .map(([k, v]) => `<div class="cc-stat"><div class="cc-stat-label">${k}</div><div class="cc-stat-value">${v}</div></div>`)
              .join('');
          }
          birth.addEventListener('change', render);
          birth.addEventListener('input', render);
          render();
  }
})();
