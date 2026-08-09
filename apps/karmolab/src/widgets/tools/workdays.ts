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
import { region } from '../../lib/region';
import { holidayKeys, knowsYear, hasCalendar } from '../../lib/holidays';
import { spec } from '../../core/workdays';
import { readInvocation } from '../../lib/tool-url';

(function (): void {
  /* 쉬는 날 표는 **나라별로** `src/lib/holidays.ts` 에 있다 (TASK-KL-203 S13).
     여기 두면 「한국에서만 쓰는 도구」가 되고, 그건 이 도구가 하는 일(영업일 세기)의 잘못이
     아니라 우리가 한 나라만 담았기 때문이다. */
  const key = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

  /** 그 해 쉬는 날 → 이름. 이름은 **찾을 때** 정한다(표를 만들 때 정하면 열쇠가 굳는다). */
  function holidaysOf(year: number): Map<string, string> {
    const named = new Map<string, string>();
    for (const [at, nameKey] of holidayKeys(region(), year)) {
      named.set(at, t(`workdays.holiday.${nameKey}`));
    }
    return named;
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
            /* 두 가지를 말해 준다 — ① 그 나라 달력이 아예 없다 ② 있는데 그 해를 모른다.
               둘을 뭉뚱그리면 「왜 공휴일이 안 빠지지」를 알 수 없다. 모르면 **모른다고 말한다**. */
            if (!hasCalendar(region())) {
              say(t('workdays.warn.noCalendar'), 'error');
              return;
            }
            const unknown = [...new Set(years)].filter((y) => !knowsYear(region(), y));
            if (unknown.length) {
              say(t('workdays.warn.lunar', { years: unknown.join('·') }), 'error');
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

          // 주소로 부른 경우 (`?op=after&start=2026-09-21&days=5`) (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined) {
            if (call.args.start !== undefined) fromEl.value = String(call.args.start);
            if (call.op === 'between') {
              setMode('between');
              if (call.args.end !== undefined) toEl.value = String(call.args.end);
            } else if (call.args.days !== undefined) {
              daysEl.value = String(call.args.days);
            }
            if (call.args.saturday === true) $<HTMLInputElement>('#wdSat').checked = true;
          }
          refresh();
  }
})();
