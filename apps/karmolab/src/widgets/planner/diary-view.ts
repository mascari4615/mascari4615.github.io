/**
 * 일기 화면 — 왼쪽에 지난 날들, 오른쪽에 오늘 (TASK-KL-322)
 *
 * 일기의 저장 단추는 **작을수록 좋다.** 쓰다가 탭을 옮기거나 창을 닫아서 글이 날아가면
 * 그 도구는 두 번 다시 안 쓰게 된다. 그래서 여기는 **저절로 저장한다** — 손을 멈추면
 * 0.6초 뒤에, 그리고 다른 곳을 누르거나 화면을 떠날 때 한 번 더.
 *
 * 셈은 여기 없다 — 전부 `diary-store.ts` 다. 여기는 그린다.
 */
import { t } from '../../lib/i18n';
import { ymd } from './gcal';
import {
    charCount,
    deleteDiary,
    listDiary,
    preview,
    readDiary,
    searchDiary,
    writeDiary
} from './diary-store';
import { recordStreakActivity } from '../../lib/gamification';

const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 「2026. 8. 17. (월)」 — 사람이 읽는 날짜 */
function humanDate(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    const names = [t('planner.t26'), t('planner.t20'), t('planner.t21'), t('planner.t22'), t('planner.t23'), t('planner.t24'), t('planner.t25')];
    return `${y}. ${m}. ${d}. (${names[dow]})`;
}

export interface DiaryViewHandle {
    destroy: () => void;
    /** 다른 화면(달력)에서 「그 날 일기」를 열 때 */
    open: (date: string) => void;
}

export function buildDiaryView(container: HTMLElement, startDate?: string): DiaryViewHandle {
    let current = startDate || ymd(new Date());
    let query = '';
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;
    /* 첫 그림을 그리기 **전에는** 저장하지 않는다. 안 그러면 화면을 새로 세울 때
       빈 칸이 그 날 일기를 덮어 지운다 — 실제로 그렇게 한 번 날렸다. */
    let ready = false;

    container.innerHTML = `
        <div class="pl-diary">
            <aside class="pl-diary-side">
                <input type="search" name="diary-search" class="pl-input pl-diary-search" placeholder="${esc(t('planner.t80'))}">
                <div class="pl-diary-list"></div>
            </aside>
            <section class="pl-diary-main">
                <header class="pl-diary-head">
                    <h3 class="pl-diary-date"></h3>
                    <div class="pl-diary-head-right">
                        <span class="pl-diary-count"></span>
                        <button type="button" class="btn btn-ghost btn-xs pl-diary-today">${esc(t('planner.t81'))}</button>
                        <button type="button" class="btn btn-ghost btn-xs pl-diary-del">${esc(t('planner.t33'))}</button>
                    </div>
                </header>
                <textarea class="pl-diary-text" name="diary-text" placeholder="${esc(t('planner.t82'))}"></textarea>
                <p class="pl-diary-saved" aria-live="polite"></p>
            </section>
        </div>`;

    const listEl = container.querySelector<HTMLElement>('.pl-diary-list')!;
    const dateEl = container.querySelector<HTMLElement>('.pl-diary-date')!;
    const countEl = container.querySelector<HTMLElement>('.pl-diary-count')!;
    const textEl = container.querySelector<HTMLTextAreaElement>('.pl-diary-text')!;
    const savedEl = container.querySelector<HTMLElement>('.pl-diary-saved')!;
    const searchEl = container.querySelector<HTMLInputElement>('.pl-diary-search')!;

    function renderList(): void {
        const items = searchDiary(query);
        if (!items.length) {
            listEl.innerHTML = `<p class="pl-diary-empty">${esc(query ? t('planner.t83') : t('planner.t84'))}</p>`;
            return;
        }
        listEl.innerHTML = items
            .map(
                (e) => `<button type="button" class="pl-diary-item${e.date === current ? ' pl-diary-item--on' : ''}" data-date="${esc(e.date)}">
                    <span class="pl-diary-item-date">${esc(humanDate(e.date))}</span>
                    <span class="pl-diary-item-preview">${esc(preview(e.text))}</span>
                </button>`
            )
            .join('');
    }

    function renderHead(): void {
        dateEl.textContent = humanDate(current);
        countEl.textContent = t('planner.t85', { n: charCount(textEl.value) });
    }

    function load(date: string): void {
        flush(); // 옮기기 전에 쓰던 것부터 저장한다 (첫 그림에서는 아무것도 안 한다)
        current = date;
        textEl.value = readDiary(date)?.text ?? '';
        savedEl.textContent = '';
        renderHead();
        renderList();
        ready = true;
    }

    /** 지금 값을 저장한다. 실제로 달라졌을 때만 적는다 (연속일이 헛되이 늘지 않게). */
    function flush(): void {
        if (!ready) return;
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        const before = readDiary(current)?.text ?? '';
        const now = textEl.value;
        if (before === now.trim()) return;
        const kept = writeDiary(current, now);
        if (kept) {
            /* 일기를 쓴 날 = 그 날의 연속일. 오늘 어제 것을 채워 넣어도 「어제 썼다」가 맞다. */
            const result = recordStreakActivity('diary', current);
            if (result.changed && result.leveledUp) {
                Toolbox?.showToast?.(t('planner.t71', { level: result.newLevel }), 'success');
            }
        }
        savedEl.textContent = kept ? t('planner.t86') : t('planner.t87');
        renderList();
    }

    textEl.addEventListener('input', () => {
        renderHead();
        savedEl.textContent = '';
        if (saveTimer) clearTimeout(saveTimer);
        /* 손을 멈추면 저장한다 — 저장 단추를 누르는 일을 사람에게 시키지 않는다 */
        saveTimer = setTimeout(() => {
            saveTimer = null;
            if (!destroyed) flush();
        }, 600);
    });
    textEl.addEventListener('blur', flush);

    searchEl.addEventListener('input', () => {
        query = searchEl.value;
        renderList();
    });

    listEl.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-date]');
        if (btn?.dataset.date) {
            load(btn.dataset.date);
            textEl.focus();
        }
    });

    container.querySelector('.pl-diary-today')!.addEventListener('click', () => {
        load(ymd(new Date()));
        textEl.focus();
    });

    container.querySelector('.pl-diary-del')!.addEventListener('click', () => {
        if (!readDiary(current)) return;
        if (!confirm(t('planner.t88', { date: humanDate(current) }))) return;
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        deleteDiary(current);
        textEl.value = '';
        savedEl.textContent = t('planner.t87');
        renderHead();
        renderList();
    });

    /* 화면을 떠나거나 창을 닫아도 쓰던 것이 남아야 한다 */
    const onHide = (): void => {
        if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);

    load(current);
    if (!listDiary().length) textEl.focus();

    return {
        destroy: () => {
            flush();
            destroyed = true;
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('pagehide', flush);
        },
        open: (date: string) => {
            load(date);
            textEl.focus();
        }
    };
}
