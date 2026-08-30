/**
 * 달력. 구글 캘린더를 보고 고친다 (TASK-KL-321)
 *
 * 옛 React 판(`CalendarView.tsx` 595줄)을 그대로 옮겼다. 달력 알맹이는 FullCalendar 의
 * **틀 없는 판**을 쓴다. React 판이 쓰던 `react-big-calendar` 는 React 가 있어야만 돌아가고,
 * FullCalendar 는 같은 기능(월, 주, 일, 끌어 옮기기, 늘리기)을 아무 틀 없이 낸다.
 *
 * 왼쪽 작은 달력과 캘린더 목록은 손으로 그린다(60줄쯤). 라이브러리로 하면 같은 달력 엔진을
 * 두 번 띄우게 되는데, 그 값에 비해 하는 일이 달을 넘기고 날을 고른다뿐이다.
 */
import { t } from '../../lib/i18n';
import {
    createEvent,
    deleteEvent,
    fetchCalendars,
    fetchEvents,
    patchEvent,
    ymd,
    type FcEvent,
    type GoogleCalendar
} from './gcal';
import {
    LOCAL_CALENDAR_ID,
    LOCAL_COLOR,
    createEvent as createLocalEvent,
    deleteEvent as deleteLocalEvent,
    isLocal,
    listEvents as listLocalEvents,
    updateEvent as updateLocalEvent
} from './local-store';
import { diaryDates } from './diary-store';

import { Calendar, type CalendarOptions, type EventApi } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import koLocale from '@fullcalendar/core/locales/ko';

const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const HIDDEN_KEY = 'karmolab_planner_hidden_calendars';

function loadHidden(): Set<string> {
    try {
        const raw = localStorage.getItem(HIDDEN_KEY);
        if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
        /* 무시 */
    }
    return new Set();
}

function saveHidden(hidden: Set<string>): void {
    try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
    } catch {
        /* 무시 */
    }
}

/** `<input type="datetime-local">` 이 먹는 모양 */
function localInputValue(d: Date): string {
    return `${ymd(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function addHours(d: Date, n: number): Date {
    return new Date(d.getTime() + n * 3600000);
}

interface Draft {
    start: Date;
    end: Date;
    allDay: boolean;
    /** 고치는 중이면 원래 일정 */
    event?: EventApi;
}

export interface CalendarViewHandle {
    destroy: () => void;
}

/**
 * 달력을 그린다. `token` 이 없으면 **이 브라우저 캘린더만** 쓴다 . 
 * 구글은 얹는 것이지 있어야 하는 것이 아니다.
 */
export function buildCalendarView(
    container: HTMLElement,
    token: string | null,
    onOpenDiary?: (date: string) => void
): CalendarViewHandle {
    container.innerHTML = `
        <div class="pl-cal-layout">
            <aside class="pl-cal-side">
                <button type="button" class="btn btn-accent pl-cal-create">${esc(t('planner.t10'))}</button>
                <div class="pl-mini"></div>
                <div class="pl-cal-list"></div>
            </aside>
            <div class="pl-cal-main">
                <div class="pl-cal-loading" hidden>${esc(t('planner.t11'))}</div>
                <div class="pl-cal-mount"></div>
            </div>
        </div>`;

    const sideMini = container.querySelector<HTMLElement>('.pl-mini')!;
    const sideList = container.querySelector<HTMLElement>('.pl-cal-list')!;
    const mount = container.querySelector<HTMLElement>('.pl-cal-mount')!;
    const loading = container.querySelector<HTMLElement>('.pl-cal-loading')!;

    /** 목록의 첫 줄은 늘 이 브라우저 캘린더다 (구글은 그 뒤에 붙는다) */
    const localCalendar = (): GoogleCalendar => ({
        id: LOCAL_CALENDAR_ID,
        summary: t('planner.t50'),
        backgroundColor: LOCAL_COLOR
    });
    let calendars: GoogleCalendar[] = [localCalendar()];
    let allEvents: FcEvent[] = [];
    const hidden = loadHidden();
    let miniMonth = new Date();
    let destroyed = false;

    const visible = (): FcEvent[] => allEvents.filter((e) => !hidden.has(e.extendedProps.calendarId));

    /* ===== 달력 알맹이 ===== */

    /* 판을 그리는 순간 datesSet 이 먼저 울고, 그 손이 reload 를 부른다. 이 줄이 아래 있으면
       그때는 아직 죽은 자리(TDZ)라 달력이 통째로 안 뜬다 (2026-08-31 실측) */
    let lastRange: { start: Date; end: Date } | null = null;

    const options: CalendarOptions = {
        plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
        locale: koLocale,
        initialView: 'timeGridWeek',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        height: '100%',
        nowIndicator: true,
        scrollTime: '08:00:00',
        dayMaxEvents: true,
        selectable: true,
        editable: true,
        eventStartEditable: true,
        eventDurationEditable: true,
        eventDisplay: 'block',
        select: (info) => openModal({ start: info.start, end: info.end, allDay: info.allDay }),
        eventClick: (info) => {
            info.jsEvent.preventDefault();
            openPopover(info.event, info.jsEvent.clientX, info.jsEvent.clientY);
        },
        /* 자판만 쓰는 사람도 일정을 열 수 있어야 한다. 끌어 옮기기는 마우스만 되므로,
           초점을 받을 수 있게 하고 Enter/Space 로 같은 풍선을 연다(거기서 시각을 고친다). */
        eventDidMount: (info) => {
            info.el.tabIndex = 0;
            info.el.setAttribute('role', 'button');
            info.el.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                const r = info.el.getBoundingClientRect();
                openPopover(info.event, r.left, r.bottom);
            });
        },
        /* 끌어 옮기기, 늘리기. 화면은 이미 옮겨져 있으니 구글에만 알리면 된다.
           실패하면 되돌린다(`revert`), 안 그러면 화면과 구글이 갈라진 채로 남는다. */
        eventDrop: (info) => void saveMove(info.event, info.revert),
        eventResize: (info) => void saveMove(info.event, info.revert),
        /* 날짜 칸마다 일기 단추 하나. 쓴 날은 켜져 있고, 안 쓴 날은 마우스를 올려야 보인다 . 
           빈 날마다 표식이 켜져 있으면 쓴 날이 눈에 안 들어온다. */
        dayCellDidMount: (info) => {
            if (!onOpenDiary) return;
            const date = ymd(info.date);
            const written = diaryDates().has(date);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `pl-daycell-diary${written ? ' pl-daycell-diary--on' : ''}`;
            btn.textContent = '✎';
            btn.title = written ? t('planner.t91') : t('planner.t92');
            btn.setAttribute('aria-label', `${date} ${written ? t('planner.t91') : t('planner.t92')}`);
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                onOpenDiary(date);
            });
            /* 누르는 자리가 칸 선택(일정 만들기)으로 번지지 않게 */
            btn.addEventListener('mousedown', (e) => e.stopPropagation());
            info.el.appendChild(btn);
        },
        datesSet: (info) => {
            miniMonth = new Date(info.view.currentStart);
            renderMini();
            void reload(info.start, info.end);
        }
    };

    const calendar = new Calendar(mount, options);
    calendar.render();

    /* ===== 받아 오기 ===== */


    async function reload(start: Date, end: Date): Promise<void> {
        lastRange = { start, end };
        loading.hidden = false;
        try {
            /* 이 브라우저 것은 늘 있다. 구글은 연동돼 있을 때만 얹는다. */
            const local = listLocalEvents(t('planner.t50'));
            let remote: FcEvent[] = [];
            if (token) {
                /* 보이는 구간의 앞뒤로 조금 더 받아 둔다. 달을 넘길 때마다 빈 화면이 깜빡이지 않게 */
                const pad = 7 * 86400000;
                const googleCals = calendars.filter((c) => c.id !== LOCAL_CALENDAR_ID);
                remote = await fetchEvents(token, googleCals, new Date(+start - pad), new Date(+end + pad));
            }
            if (destroyed) return;
            allEvents = [...local, ...remote];
            applyEvents();
            renderMini();
        } finally {
            loading.hidden = true;
        }
    }

    function applyEvents(): void {
        calendar.removeAllEvents();
        for (const ev of visible()) {
            calendar.addEvent({ ...ev, title: ev.title || t('planner.t12') });
        }
    }

    /* ===== 왼쪽: 작은 달력 ===== */

    function renderMini(): void {
        const first = new Date(miniMonth.getFullYear(), miniMonth.getMonth(), 1);
        const startDow = first.getDay(); // 일요일 시작. 옆의 큰 달력(ko)과 같은 줄에 서야 헷갈리지 않는다
        const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - startDow);
        const today = ymd(new Date());
        const busy = new Set(visible().map((e) => e.start.slice(0, 10)));

        const cells: string[] = [];
        for (let i = 0; i < 42; i++) {
            const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
            const key = ymd(d);
            const cls = [
                'pl-mini-day',
                d.getMonth() === miniMonth.getMonth() ? '' : 'pl-mini-day--out',
                key === today ? 'pl-mini-day--today' : '',
                busy.has(key) ? 'pl-mini-day--busy' : ''
            ]
                .filter(Boolean)
                .join(' ');
            cells.push(`<button type="button" class="${cls}" data-date="${key}">${d.getDate()}</button>`);
        }

        const dowLabels = [t('planner.t26'), t('planner.t20'), t('planner.t21'), t('planner.t22'), t('planner.t23'), t('planner.t24'), t('planner.t25')];
        sideMini.innerHTML = `
            <div class="pl-mini-head">
                <button type="button" class="pl-mini-nav" data-nav="-1" aria-label="${esc(t('planner.t13'))}">◀</button>
                <span class="pl-mini-title">${miniMonth.getFullYear()}. ${miniMonth.getMonth() + 1}</span>
                <button type="button" class="pl-mini-nav" data-nav="1" aria-label="${esc(t('planner.t14'))}">▶</button>
            </div>
            <div class="pl-mini-grid">
                ${dowLabels.map((d) => `<span class="pl-mini-dow">${esc(d)}</span>`).join('')}
                ${cells.join('')}
            </div>`;
    }

    sideMini.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const nav = target.closest<HTMLElement>('[data-nav]');
        if (nav) {
            miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() + Number(nav.dataset.nav), 1);
            renderMini();
            return;
        }
        const day = target.closest<HTMLElement>('[data-date]');
        if (day?.dataset.date) {
            calendar.changeView('timeGridDay', day.dataset.date);
        }
    });

    /* ===== 왼쪽: 캘린더 목록 ===== */

    function renderList(): void {
        sideList.innerHTML = `
            <div class="pl-cal-list-title">${esc(t('planner.t15'))}</div>
            ${calendars
                .map((c) => {
                    const color = c.backgroundColor || '#4285f4';
                    const on = !hidden.has(c.id);
                    return `<label class="pl-cal-item">
                        <input type="checkbox" name="calendar-${esc(c.id)}" data-cal="${esc(c.id)}" ${on ? 'checked' : ''}>
                        <span class="pl-cal-dot" style="background:${esc(color)}"></span>
                        <span class="pl-cal-name">${esc(c.summary)}</span>
                    </label>`;
                })
                .join('')}`;
    }

    sideList.addEventListener('change', (e) => {
        const box = e.target as HTMLInputElement;
        const id = box.dataset.cal;
        if (!id) return;
        if (box.checked) hidden.delete(id);
        else hidden.add(id);
        saveHidden(hidden);
        applyEvents();
        renderMini();
    });

    /* ===== 만들기, 고치기 창 ===== */

    let modalEl: HTMLElement | null = null;

    function closeModal(): void {
        modalEl?.remove();
        modalEl = null;
    }

    function openModal(draft: Draft): void {
        closePopover();
        closeModal();
        const ev = draft.event;
        const startDate = ev ? ev.start ?? draft.start : draft.start;
        const endDate = ev ? ev.end ?? addHours(startDate, 1) : draft.end;
        const allDay = ev ? ev.allDay : draft.allDay;
        const currentCal = (ev?.extendedProps.calendarId as string) || calendars[0]?.id || 'primary';

        const wrap = document.createElement('div');
        wrap.className = 'pl-modal-overlay';
        wrap.innerHTML = `
            <div class="pl-modal" role="dialog" aria-modal="true">
                <div class="pl-modal-head">
                    <h3 class="pl-modal-title">${esc(ev ? t('planner.t16') : t('planner.t17'))}</h3>
                    <button type="button" class="pl-modal-x" aria-label="${esc(t('planner.t18'))}">✕</button>
                </div>
                <form class="pl-modal-body">
                    <input type="text" name="event-title" class="pl-input pl-modal-name" placeholder="${esc(t('planner.t19'))}" value="${esc(ev?.title ?? '')}">
                    ${
                        calendars.length > 1 && !ev
                            ? `<label class="pl-field"><span class="pl-label">${esc(t('planner.t15'))}</span>
                                 <select name="event-calendar" class="pl-input">
                                   ${calendars.map((c) => `<option value="${esc(c.id)}"${c.id === currentCal ? ' selected' : ''}>${esc(c.summary)}</option>`).join('')}
                                 </select></label>`
                            : ''
                    }
                    <label class="pl-check"><input type="checkbox" name="event-allday" ${allDay ? 'checked' : ''}><span>${esc(t('planner.t27'))}</span></label>
                    <div class="pl-times" data-allday="${allDay ? '1' : '0'}">
                        <label class="pl-field"><span class="pl-label">${esc(t('planner.t28'))}</span>
                            <input type="datetime-local" name="event-start" class="pl-input pl-start-time" value="${localInputValue(startDate)}">
                            <input type="date" name="event-start-date" class="pl-input pl-start-date" value="${ymd(startDate)}">
                        </label>
                        <label class="pl-field pl-end-field"><span class="pl-label">${esc(t('planner.t29'))}</span>
                            <input type="datetime-local" name="event-end" class="pl-input pl-end-time" value="${localInputValue(endDate)}">
                        </label>
                    </div>
                    <div class="pl-modal-actions">
                        <button type="button" class="btn btn-ghost pl-modal-cancel">${esc(t('planner.t30'))}</button>
                        <button type="submit" class="btn btn-accent">${esc(t('planner.t31'))}</button>
                    </div>
                </form>
            </div>`;
        container.appendChild(wrap);
        modalEl = wrap;

        const form = wrap.querySelector('form')!;
        const allDayBox = wrap.querySelector<HTMLInputElement>('[name="event-allday"]')!;
        const times = wrap.querySelector<HTMLElement>('.pl-times')!;
        const syncAllDay = (): void => {
            times.dataset.allday = allDayBox.checked ? '1' : '0';
        };
        allDayBox.addEventListener('change', syncAllDay);
        syncAllDay();

        wrap.querySelector('.pl-modal-x')!.addEventListener('click', closeModal);
        wrap.querySelector('.pl-modal-cancel')!.addEventListener('click', closeModal);
        wrap.addEventListener('click', (e) => {
            if (e.target === wrap) closeModal();
        });
        wrap.querySelector<HTMLInputElement>('[name="event-title"]')!.focus();

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = wrap.querySelector<HTMLInputElement>('[name="event-title"]')!.value.trim();
            if (!title) return;
            const isAllDay = allDayBox.checked;
            let start: Date;
            let end: Date;
            if (isAllDay) {
                const dateStr = wrap.querySelector<HTMLInputElement>('[name="event-start-date"]')!.value;
                const [y, m, d] = dateStr.split('-').map(Number);
                start = new Date(y, m - 1, d);
                end = new Date(y, m - 1, d);
            } else {
                start = new Date(wrap.querySelector<HTMLInputElement>('[name="event-start"]')!.value);
                end = new Date(wrap.querySelector<HTMLInputElement>('[name="event-end"]')!.value);
                if (!(end > start)) end = addHours(start, 1);
            }
            const calId =
                (wrap.querySelector<HTMLSelectElement>('[name="event-calendar"]')?.value as string) || currentCal;
            closeModal();
            void save(title, start, end, isAllDay, calId, ev);
        });
    }

    /** 저장할 값. 종일이면 날짜만, 아니면 ISO 시각 (구글, FullCalendar 와 같은 규약) */
    function stored(start: Date, end: Date, allDay: boolean): { start: string; end: string } {
        if (!allDay) return { start: start.toISOString(), end: end.toISOString() };
        const s = ymd(start);
        const e = ymd(end);
        return { start: s, end: e > s ? e : ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)) };
    }

    async function save(
        title: string,
        start: Date,
        end: Date,
        allDay: boolean,
        calId: string,
        ev?: EventApi
    ): Promise<void> {
        try {
            /* 어디에 쓸지는 **id 앞머리**가 정한다. 이 브라우저 것과 구글 것이 한 화면에 섞여 있다 */
            if (ev && isLocal(ev.id)) {
                updateLocalEvent(ev.id, { title, allDay, ...stored(start, end, allDay) });
            } else if (ev) {
                await patchEvent(token!, calId, ev.extendedProps.googleId as string, { title, start, end, allDay });
            } else if (calId === LOCAL_CALENDAR_ID || !token) {
                createLocalEvent({ title, allDay, ...stored(start, end, allDay) });
            } else {
                await createEvent(token, calId, { title, start, end, allDay });
            }
            if (lastRange) await reload(lastRange.start, lastRange.end);
        } catch {
            Toolbox?.showToast?.(t('planner.t32'), 'error');
        }
    }

    async function saveMove(ev: EventApi, revert: () => void): Promise<void> {
        const start = ev.start ?? new Date();
        const end = ev.end ?? addHours(start, 1);
        if (isLocal(ev.id)) {
            updateLocalEvent(ev.id, { allDay: ev.allDay, ...stored(start, end, ev.allDay) });
            return;
        }
        try {
            await patchEvent(token!, ev.extendedProps.calendarId as string, ev.extendedProps.googleId as string, {
                start,
                end,
                allDay: ev.allDay
            });
        } catch {
            revert();
            Toolbox?.showToast?.(t('planner.t32'), 'error');
        }
    }

    /* ===== 일정 하나 눌렀을 때 ===== */

    let popoverEl: HTMLElement | null = null;

    function closePopover(): void {
        popoverEl?.remove();
        popoverEl = null;
        document.removeEventListener('mousedown', onOutside, true);
    }

    function onOutside(e: MouseEvent): void {
        if (popoverEl && !popoverEl.contains(e.target as Node)) closePopover();
    }

    function openPopover(ev: EventApi, atX: number, atY: number): void {
        closePopover();
        closeModal();
        const link = (ev.extendedProps.htmlLink as string) || '';
        const calName = (ev.extendedProps.calendarName as string) || '';
        const box = document.createElement('div');
        box.className = 'pl-pop';
        box.innerHTML = `
            <div class="pl-pop-head">
                <span class="pl-pop-dot" style="background:${esc(ev.backgroundColor || '#4285f4')}"></span>
                <button type="button" class="pl-modal-x" aria-label="${esc(t('planner.t18'))}">✕</button>
            </div>
            <div class="pl-pop-title">${esc(ev.title)}</div>
            <div class="pl-pop-time">${esc(describeWhen(ev))}</div>
            ${calName ? `<div class="pl-pop-cal">${esc(calName)}</div>` : ''}
            <div class="pl-pop-actions">
                <button type="button" class="btn btn-ghost pl-pop-edit">${esc(t('planner.t16'))}</button>
                ${link ? `<a class="btn btn-ghost" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Google ↗</a>` : ''}
                <button type="button" class="btn btn-ghost pl-pop-del">${esc(t('planner.t33'))}</button>
            </div>`;
        container.appendChild(box);
        popoverEl = box;

        /* 화면 밖으로 안 나가게 */
        const rect = box.getBoundingClientRect();
        const host = container.getBoundingClientRect();
        box.style.left = `${Math.max(8, Math.min(atX - host.left, host.width - rect.width - 8))}px`;
        box.style.top = `${Math.max(8, Math.min(atY - host.top + 8, host.height - rect.height - 8))}px`;
        box.querySelector<HTMLElement>('.pl-pop-edit')?.focus();

        box.querySelector('.pl-modal-x')!.addEventListener('click', closePopover);
        box.querySelector('.pl-pop-edit')!.addEventListener('click', () => {
            const start = ev.start ?? new Date();
            closePopover();
            openModal({ start, end: ev.end ?? addHours(start, 1), allDay: ev.allDay, event: ev });
        });
        box.querySelector('.pl-pop-del')!.addEventListener('click', () => {
            closePopover();
            void remove(ev);
        });
        setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
    }

    function describeWhen(ev: EventApi): string {
        const start = ev.start;
        if (!start) return '';
        const day = `${start.getFullYear()}. ${start.getMonth() + 1}. ${start.getDate()}`;
        if (ev.allDay) return day;
        const hm = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        return ev.end ? `${day} ${hm(start)} - ${hm(ev.end)}` : `${day} ${hm(start)}`;
    }

    async function remove(ev: EventApi): Promise<void> {
        if (!confirm(t('planner.t34', { title: ev.title }))) return;
        try {
            if (isLocal(ev.id)) deleteLocalEvent(ev.id);
            else await deleteEvent(token!, ev.extendedProps.calendarId as string, ev.extendedProps.googleId as string);
            ev.remove();
            allEvents = allEvents.filter((e) => e.extendedProps.googleId !== ev.extendedProps.googleId);
            renderMini();
        } catch {
            Toolbox?.showToast?.(t('planner.t35'), 'error');
        }
    }

    container.querySelector('.pl-cal-create')!.addEventListener('click', () => {
        const now = new Date();
        openModal({ start: now, end: addHours(now, 1), allDay: false });
    });

    /* ===== 시작 ===== */

    void (async () => {
        if (token) {
            try {
                calendars = [localCalendar(), ...(await fetchCalendars(token))];
            } catch {
                /* 구글이 안 되면 이 브라우저 것만으로 계속 쓴다. 화면이 통째로 죽지 않는다 */
                Toolbox?.showToast?.(t('planner.t36'), 'error');
            }
        }
        if (destroyed) return;
        renderList();
        const view = calendar.view;
        await reload(view.activeStart, view.activeEnd);
    })();

    return {
        destroy: () => {
            destroyed = true;
            closePopover();
            closeModal();
            calendar.destroy();
        }
    };
}
