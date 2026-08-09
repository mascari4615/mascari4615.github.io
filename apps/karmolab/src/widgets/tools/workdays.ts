/**
 * 영업일 계산 (TASK-KL-088)
 *
 * 「접수일로부터 영업일 7일 이내」 같은 기한은 주말만 빼서는 안 맞는다. 공휴일과 대체공휴일까지
 * 빼야 진짜 날짜가 나온다. 그런데 달력을 세어 보다 보면 설·추석이 며칠인지부터 막힌다.
 *
 * 그래서 한국 공휴일을 담아 두고 **어떤 날을 뺐는지 보여 준다** — 결과 날짜만 던지면
 * 맞는지 확인할 방법이 없다. 음력 명절은 해마다 날짜가 달라 표로 담는다(계산으로는 못 낸다).
 */
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  /** 양력 고정 공휴일 (월-일) */
  const FIXED: Array<[number, number, () => string]> = [
    [1, 1, () => t('workdays.holiday.h00')],
    [3, 1, () => t('workdays.holiday.h01')],
    [5, 5, () => t('workdays.holiday.h02')],
    [6, 6, () => t('workdays.holiday.h03')],
    [8, 15, () => t('workdays.holiday.h04')],
    [10, 3, () => t('workdays.holiday.h05')],
    [10, 9, () => t('workdays.holiday.h06')],
    [12, 25, () => t('workdays.holiday.h07')]
  ];

  /**
   * 음력 명절과 부처님오신날은 해마다 양력 날짜가 달라 계산으로 못 낸다 — 표로 담는다.
   * 담지 않은 해는 「모른다」고 말한다. 조용히 틀린 날짜를 내놓는 것보다 낫다.
   */
  const LUNAR: Record<number, Array<[number, number, () => string]>> = {
    2024: [[2, 9, () => t('workdays.holiday.h08')], [2, 10, () => t('workdays.holiday.h09')], [2, 11, () => t('workdays.holiday.h08')], [2, 12, () => t('workdays.holiday.h10')], [4, 10, () => t('workdays.holiday.h11')], [5, 15, () => t('workdays.holiday.h12')], [9, 16, () => t('workdays.holiday.h13')], [9, 17, () => t('workdays.holiday.h14')], [9, 18, () => t('workdays.holiday.h13')]],
    /* 2025-01-27 은 정부가 내수 진작을 위해 지정한 **임시공휴일**이다. 규칙으로는 안 나오고
       그해에만 있는 날이라, 표에 없으면 그해 영업일이 하루씩 틀어진다(실제로 빠져 있었다). */
    2025: [[1, 27, () => t('workdays.holiday.h15')], [1, 28, () => t('workdays.holiday.h08')], [1, 29, () => t('workdays.holiday.h09')], [1, 30, () => t('workdays.holiday.h08')], [3, 3, () => t('workdays.holiday.h10')], [5, 5, () => t('workdays.holiday.h12')], [5, 6, () => t('workdays.holiday.h10')], [10, 5, () => t('workdays.holiday.h13')], [10, 6, () => t('workdays.holiday.h14')], [10, 7, () => t('workdays.holiday.h13')], [10, 8, () => t('workdays.holiday.h10')]],
    2026: [[2, 16, () => t('workdays.holiday.h08')], [2, 17, () => t('workdays.holiday.h09')], [2, 18, () => t('workdays.holiday.h08')], [3, 2, () => t('workdays.holiday.h10')], [5, 24, () => t('workdays.holiday.h12')], [5, 25, () => t('workdays.holiday.h10')], [8, 17, () => t('workdays.holiday.h10')], [9, 24, () => t('workdays.holiday.h13')], [9, 25, () => t('workdays.holiday.h14')], [9, 26, () => t('workdays.holiday.h13')], [10, 5, () => t('workdays.holiday.h10')]],
    2027: [[2, 6, () => t('workdays.holiday.h08')], [2, 7, () => t('workdays.holiday.h09')], [2, 8, () => t('workdays.holiday.h08')], [2, 9, () => t('workdays.holiday.h10')], [5, 13, () => t('workdays.holiday.h12')], [9, 14, () => t('workdays.holiday.h13')], [9, 15, () => t('workdays.holiday.h14')], [9, 16, () => t('workdays.holiday.h13')]]
  };

  const KNOWN_YEARS = Object.keys(LUNAR).map(Number);
  const key = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

  function holidaysOf(year: number): Map<string, string> {
    const map = new Map<string, string>();
    /* 이름은 **찾을 때** 정한다. 표를 만들 때 정하면 그 시점엔 말 묶음이 아직 안 와서
       열쇠가 그대로 굳는다(단위 변환에서 겪은 것과 같다). */
    for (const [m, d, name] of FIXED) map.set(`${year}-${m}-${d}`, name());
    for (const [m, d, name] of LUNAR[year] || []) map.set(`${year}-${m}-${d}`, name());
    return map;
  }

  Toolbox.register({
    id: 'workdays',
    title: t('widgets.workdays.title', undefined, '영업일 계산'),
    category: 'tool',
    desc: t('widgets-desc.workdays.desc', undefined, '주말과 공휴일을 뺀 영업일을 셉니다. 어떤 날을 뺐는지 보여 줍니다'),
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9 15l2 2 4-4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('workdays.tab', undefined, '영업일'),
        /* 말을 받아온 뒤에 그린다 — 안 기다리면 화면에 열쇠 이름이 뜬다. */
        build: function (container: HTMLElement): void {
          void loadNamespace('workdays').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    /* 번역 글에 꺾쇠가 들어와도 화면이 안 깨지게. */
    const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          const today = new Date();
          const iso = (d: Date): string =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

          container.innerHTML = `
            <div class="tool-chips" style="margin-bottom:var(--space-lg);">
              <button type="button" class="tool-chip active" id="wdModeAfter">${esc(t('workdays.mode.after'))}</button>
              <button type="button" class="tool-chip" id="wdModeBetween">${esc(t('workdays.mode.between'))}</button>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('workdays.label.from'))}</div>
                  <input type="date" id="wdFrom" aria-label="${esc(t('workdays.label.from'))}" value="${iso(today)}">
                </div>
                <div id="wdAfterWrap">
                  <div class="tool-sublabel">${esc(t('workdays.label.days'))} <span id="wdDaysVal" class="range-value">${esc(t('workdays.value.days', { n: 7 }))}</span></div>
                  <input type="range" id="wdDays" aria-label="${esc(t('workdays.label.daysAria'))}" min="1" max="60" value="7">
                </div>
                <div id="wdToWrap" style="display:none;">
                  <div class="tool-sublabel">${esc(t('workdays.label.to'))}</div>
                  <input type="date" id="wdTo" aria-label="${esc(t('workdays.label.to'))}" value="${iso(new Date(today.getTime() + 14 * 86400000))}">
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="wdSat"> ${esc(t('workdays.opt.saturday'))}</label>
                <label class="tool-chip"><input type="checkbox" id="wdIncludeStart"> ${esc(t('workdays.opt.includeStart'))}</label>
              </div>
            </div>

            <div class="tool-display" id="wdOut">—</div>
            <div class="cc-stats" id="wdStats"></div>
            <div class="tool-list" id="wdSkipped"></div>

            <div class="tool-status" id="wdStatus">${esc(t('workdays.status.idle'))}</div>
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
          const WEEK = [0, 1, 2, 3, 4, 5, 6].map((i) => t(`workdays.week.${i}`));
          /* 날짜 적는 법은 언어마다 다르다 — 손으로 「년 월 일」을 붙이지 않고 브라우저에 맡긴다. */
          const fmt = (d: Date): string =>
            `${new Intl.DateTimeFormat(locale(), { dateStyle: 'long' }).format(d)} (${WEEK[d.getDay()]})`;

          /** 그 날이 쉬는 날이면 이유를, 아니면 빈 문자열을 준다. */
          function restReason(d: Date, satWorks: boolean): string {
            const day = d.getDay();
            if (day === 0) return t('workdays.day.sunday');
            if (day === 6 && !satWorks) return t('workdays.day.saturday');
            return holidaysOf(d.getFullYear()).get(key(d)) || '';
          }

          function warnUnknown(years: number[]): void {
            const unknown = [...new Set(years)].filter((y) => !KNOWN_YEARS.includes(y));
            if (unknown.length) {
              say(
                t('workdays.warn.lunar', { years: unknown.join('·') }),
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
              $<HTMLElement>('#wdDaysVal').textContent = t('workdays.value.days', { n: need });
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
                stat(t('workdays.stat.business'), t('workdays.value.days', { n: need }), true) +
                stat(t('workdays.stat.actual'), t('workdays.value.days', { n: Math.round((cur.getTime() - from.getTime()) / 86400000) })) +
                stat(t('workdays.stat.off'), t('workdays.value.days', { n: skipped.length }));
              warnUnknown([from.getFullYear(), cur.getFullYear()]);
            } else {
              const to = new Date(toEl.value + 'T00:00:00');
              if (isNaN(to.getTime()) || to < from) {
                out.textContent = '—';
                say(t('workdays.error.endBeforeStart'), 'error');
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
              out.textContent = t('workdays.out.business', { n: work });
              stats.innerHTML =
                stat(t('workdays.stat.business'), t('workdays.value.days', { n: work }), true) +
                stat(t('workdays.stat.calendar'), t('workdays.value.days', { n: total })) +
                stat(t('workdays.stat.off'), t('workdays.value.days', { n: skipped.length }));
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
              : `<div class="tool-list-row"><span class="tool-list-val">${esc(t('workdays.list.none'))}</span></div>`;
            if (!status.className.includes('error')) say(t('workdays.status.listed'), 'ok');
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
})();
