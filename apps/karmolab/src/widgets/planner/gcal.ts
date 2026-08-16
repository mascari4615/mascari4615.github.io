/**
 * 구글 캘린더·할 일 — 말 바꾸기 층 (TASK-KL-321)
 *
 * 화면이 안 들어 있다. 구글이 주는 모양 ↔ 달력이 쓰는 모양을 **양방향으로 바꾸는 순수 함수**와,
 * 그걸 실제로 주고받는 얇은 fetch 몇 개뿐이다. 순수 함수를 떼어 둔 이유는 하나 —
 * 종일 일정의 「끝나는 날」이 이 바닥에서 제일 잘 틀리는 자리이고, 그건 브라우저를 안 켜고
 * 시험할 수 있어야 하기 때문이다 (`scripts/test-planner-core.mjs`).
 *
 * ★ 종일 일정의 끝은 **다음 날**이다 (구글이 그렇게 준다: 8/16 하루짜리 → end.date = 8/17).
 *   FullCalendar 도 같은 규약을 쓴다. 그래서 옛 React 판이 하던 「받을 때 -1일, 보낼 때 +1일」
 *   맞바꿈이 **여기엔 없다** — 규약이 같은 둘 사이에 손으로 하루를 옮기면 그게 곧 버그다.
 *   (옛 판은 달력 라이브러리가 끝을 포함으로 봐서 어쩔 수 없었다.)
 */

const CAL_API = 'https://www.googleapis.com/calendar/v3';
const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';

/** 구글 색 번호 → 실제 색 (구글이 색 값을 안 주고 번호만 줄 때가 있다) */
const GOOGLE_COLORS: Record<string, string> = {
    '1': '#ac725e', '2': '#d06b64', '3': '#f83a22', '4': '#fa573c',
    '5': '#ff7537', '6': '#ffad46', '7': '#42d692', '8': '#16a765',
    '9': '#7bd148', '10': '#b3dc6c', '11': '#fbe983', '12': '#fad165',
    '13': '#92e1c0', '14': '#9fe1e7', '15': '#9fc6e7', '16': '#4986e7',
    '17': '#9a9cff', '18': '#b99aff', '19': '#c2c2c2', '20': '#cabdbf',
    '21': '#cca6ac', '22': '#f691b2', '23': '#cd74e6', '24': '#a47ae2'
};

const PALETTE = ['#4285f4', '#0f9d58', '#db4437', '#f4b400', '#ab47bc', '#00acc1', '#ff7043', '#43a047'];

export interface GoogleCalendar {
    id: string;
    summary: string;
    backgroundColor?: string;
}

export interface GoogleEvent {
    id: string;
    summary?: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
    htmlLink?: string;
    colorId?: string;
}

/** FullCalendar 가 먹는 모양 */
export interface FcEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    allDay: boolean;
    backgroundColor: string;
    borderColor: string;
    extendedProps: {
        calendarId: string;
        calendarName: string;
        googleId: string;
        htmlLink: string;
    };
}

/** 캘린더가 제 색을 안 주면 id 로 늘 같은 색을 뽑는다 — 새로고침마다 색이 바뀌면 못 알아본다. */
export function calendarColor(calId: string, backgroundColor?: string): string {
    if (backgroundColor) return backgroundColor;
    let hash = 0;
    for (let i = 0; i < calId.length; i++) hash = (hash * 31 + calId.charCodeAt(i)) & 0xffffffff;
    return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** 일정 하나의 색 — 일정에 박힌 색이 캘린더 색을 이긴다 (구글 화면과 같은 순서) */
export function eventColor(item: GoogleEvent, baseColor: string): string {
    return item.colorId ? GOOGLE_COLORS[item.colorId] || baseColor : baseColor;
}

/** 하루짜리 종일 일정이면 구글이 end 를 안 줄 때가 있다 — 그때는 다음 날로 채운다. */
function nextDay(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    return dt.toISOString().slice(0, 10);
}

export function toFcEvent(item: GoogleEvent, cal: GoogleCalendar): FcEvent {
    const base = calendarColor(cal.id, cal.backgroundColor);
    const color = eventColor(item, base);
    const allDay = !!item.start.date;
    const start = (allDay ? item.start.date : item.start.dateTime) || '';
    const end = (allDay ? item.end?.date || nextDay(start) : item.end?.dateTime) || start;
    return {
        /* 캘린더가 달라도 일정 id 가 겹칠 수 있어 앞에 캘린더를 붙인다 */
        id: `${cal.id}__${item.id}`,
        title: item.summary || '',
        start,
        end,
        allDay,
        backgroundColor: color,
        borderColor: color,
        extendedProps: {
            calendarId: cal.id,
            calendarName: cal.summary,
            googleId: item.id,
            htmlLink: item.htmlLink || ''
        }
    };
}

/** 로컬 달력 기준 YYYY-MM-DD (UTC 로 자르면 한국 새벽에 하루가 밀린다) */
export function ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface EventDraft {
    title: string;
    start: Date;
    end: Date;
    allDay: boolean;
}

/** 구글에 보낼 모양. 종일이면 날짜만, 아니면 시각까지. 끝은 양쪽 다 「다음」이다. */
export function toGooglePayload(draft: EventDraft): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (draft.title) body.summary = draft.title;
    if (draft.allDay) {
        const startYmd = ymd(draft.start);
        const endYmd = ymd(draft.end);
        body.start = { date: startYmd };
        /* 끝이 시작과 같거나 앞이면 하루짜리로 본다 — 구글은 end > start 를 요구한다 */
        body.end = { date: endYmd > startYmd ? endYmd : nextDay(startYmd) };
    } else {
        body.start = { dateTime: draft.start.toISOString() };
        body.end = { dateTime: draft.end.toISOString() };
    }
    return body;
}

/* ===== 주고받기 ===== */

function authHeaders(token: string, json = false): Record<string, string> {
    const h: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (json) h['Content-Type'] = 'application/json';
    return h;
}

export async function fetchCalendars(token: string): Promise<GoogleCalendar[]> {
    const res = await fetch(`${CAL_API}/users/me/calendarList`, { headers: authHeaders(token) });
    if (!res.ok) throw new Error(`calendarList ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
}

/**
 * 여러 캘린더의 일정을 한 번에. 하나가 죽어도 나머지는 보여 준다 —
 * 공유 캘린더 하나의 권한이 빠졌다고 내 일정까지 안 보이면 안 된다.
 */
export async function fetchEvents(
    token: string,
    calendars: GoogleCalendar[],
    start: Date,
    end: Date
): Promise<FcEvent[]> {
    const targets = calendars.length ? calendars : [{ id: 'primary', summary: '' }];
    const results = await Promise.all(
        targets.map(async (cal) => {
            const params = new URLSearchParams({
                timeMin: start.toISOString(),
                timeMax: end.toISOString(),
                singleEvents: 'true',
                orderBy: 'startTime',
                maxResults: '2500'
            });
            try {
                const res = await fetch(
                    `${CAL_API}/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
                    { headers: authHeaders(token) }
                );
                if (!res.ok) return [];
                const data = await res.json();
                return (Array.isArray(data.items) ? data.items : []).map((it: GoogleEvent) => toFcEvent(it, cal));
            } catch {
                return [];
            }
        })
    );
    return results.flat();
}

export async function createEvent(token: string, calendarId: string, draft: EventDraft): Promise<void> {
    const res = await fetch(`${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify(toGooglePayload(draft))
    });
    if (!res.ok) throw new Error(`createEvent ${res.status}`);
}

export async function patchEvent(
    token: string,
    calendarId: string,
    eventId: string,
    draft: Partial<EventDraft> & { start: Date; end: Date; allDay: boolean }
): Promise<void> {
    const res = await fetch(
        `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { method: 'PATCH', headers: authHeaders(token, true), body: JSON.stringify(toGooglePayload(draft as EventDraft)) }
    );
    if (!res.ok) throw new Error(`patchEvent ${res.status}`);
}

export async function deleteEvent(token: string, calendarId: string, eventId: string): Promise<void> {
    const res = await fetch(
        `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { method: 'DELETE', headers: authHeaders(token) }
    );
    /* 이미 지워진 것(410)은 성공으로 친다 — 두 번 눌렀다고 빨간 글씨를 볼 이유가 없다 */
    if (!res.ok && res.status !== 410) throw new Error(`deleteEvent ${res.status}`);
}

/* ===== 할 일 (칸반) ===== */

export type KanbanColumn = 'todo' | 'inProgress' | 'done';

export interface GoogleTask {
    id: string;
    title: string;
    notes?: string;
    status: 'needsAction' | 'completed';
}

/**
 * 구글 할 일에는 「진행 중」이 없다 (안 함/함 둘뿐). 그래서 메모에 표식을 박아 셋으로 쓴다.
 * 표식은 화면에서 지워서 보여 준다 — 사용자가 쓴 메모가 아니니까.
 */
export const IN_PROGRESS_TAG = '[IN_PROGRESS]';

export function classifyTask(task: GoogleTask): KanbanColumn {
    if (task.status === 'completed') return 'done';
    if (task.notes && task.notes.includes(IN_PROGRESS_TAG)) return 'inProgress';
    return 'todo';
}

/** 표식을 걷어 낸, 사람이 쓴 메모만 */
export function visibleNotes(notes?: string): string {
    return (notes || '').split(IN_PROGRESS_TAG).join('').trim();
}

/** 칸을 옮겼을 때 구글에 보낼 것 */
export function taskMovePayload(task: GoogleTask, to: KanbanColumn): Record<string, unknown> {
    if (to === 'done') return { status: 'completed' };
    const notes = visibleNotes(task.notes);
    if (to === 'inProgress') {
        return { status: 'needsAction', notes: notes ? `${notes}\n${IN_PROGRESS_TAG}` : IN_PROGRESS_TAG };
    }
    return { status: 'needsAction', notes };
}

export async function fetchTasks(token: string): Promise<Record<KanbanColumn, GoogleTask[]>> {
    const out: Record<KanbanColumn, GoogleTask[]> = { todo: [], inProgress: [], done: [] };
    const res = await fetch(`${TASKS_API}/lists/@default/tasks?showCompleted=true&showHidden=true&maxResults=100`, {
        headers: authHeaders(token)
    });
    if (!res.ok) throw new Error(`tasks ${res.status}`);
    const data = await res.json();
    for (const task of Array.isArray(data.items) ? data.items : []) {
        out[classifyTask(task)].push(task);
    }
    return out;
}

export async function patchTask(token: string, taskId: string, payload: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${TASKS_API}/lists/@default/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: authHeaders(token, true),
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`patchTask ${res.status}`);
}

export async function createTask(token: string, title: string): Promise<void> {
    const res = await fetch(`${TASKS_API}/lists/@default/tasks`, {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ title })
    });
    if (!res.ok) throw new Error(`createTask ${res.status}`);
}
