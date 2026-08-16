/**
 * 플래너 — 구글 캘린더·할 일·연속일 (TASK-KL-321)
 *
 * 여기 있던 것은 원래 **React 앱을 불러다 붙이는 12줄**이었다. 화면 하나 때문에 React 19 +
 * Tailwind + 달력 라이브러리 두 벌이 따로 지어져 나갔고, 사용자 기록(`toolbox_user_data`)을
 * 본체와 섬이 **각자 다른 규칙으로** 만졌다. 섬을 걷어 내고 본체와 같은 자리로 가져왔다.
 *
 * 구성:
 *   gcal.ts         구글과 주고받기 + 모양 바꾸기 (순수 함수 — 노드에서 시험한다)
 *   gauth.ts        연동 토큰 한 장
 *   calendar-view   달력 (FullCalendar 틀 없는 판)
 *   kanban-view     할 일 세 칸
 *   streaks-view    연속일·레벨
 */
import { t, loadNamespace } from '../../lib/i18n';
import { GOOGLE_CLIENT_ID, forgetToken, requestToken, storedToken } from './gauth';
import { buildCalendarView, type CalendarViewHandle } from './calendar-view';
import { buildKanbanView, type KanbanViewHandle } from './kanban-view';
import { buildStreaksView } from './streaks-view';
import { buildDiaryView, type DiaryViewHandle } from './diary-view';

(function (): void {
    const esc = (v: string): string =>
        v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const CSS = `
        .pl-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }
        .pl-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 4px 12px; flex-wrap: wrap; }
        .pl-bar-tabs { display: flex; gap: 6px; }
        .pl-bar-tab { padding: 6px 14px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary); font-size: var(--font-size-sm); font-weight: 600; cursor: pointer; }
        .pl-bar-tab.active { background: var(--accent-subtle, var(--bg-tertiary)); color: var(--text-primary); border-color: var(--accent, var(--border)); }
        .pl-bar-right { display: flex; align-items: center; gap: 8px; font-size: var(--font-size-xs); color: var(--text-tertiary); }
        .pl-pane { flex: 1; min-height: 0; position: relative; overflow: auto; }

        .pl-gate { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; height: 100%; text-align: center; padding: 40px 16px; }
        .pl-gate-icon { font-size: 40px; }
        .pl-gate-title { margin: 0; font-size: var(--font-size-lg); color: var(--text-primary); }
        .pl-gate-desc { margin: 0; font-size: var(--font-size-sm); color: var(--text-tertiary); max-width: 420px; line-height: 1.6; }

        .pl-input { padding: 6px 10px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: var(--font-size-sm); }
        .pl-field { display: flex; flex-direction: column; gap: 4px; }
        .pl-label { font-size: var(--font-size-xs); color: var(--text-secondary); font-weight: 600; }
        .pl-check { display: flex; align-items: center; gap: 6px; font-size: var(--font-size-sm); color: var(--text-secondary); }

        /* 달력 */
        /* FullCalendar 를 이 사이트 옷으로 갈아입힌다 — 라이브러리 기본색이 남으면 혼자 튄다.
           v6 는 색·굵기를 전부 CSS 변수로 내주므로 우리 토큰만 이어 주면 된다. */
        .pl-cal-main {
            --fc-page-bg-color: transparent;
            --fc-border-color: var(--border);
            --fc-neutral-bg-color: var(--bg-secondary);
            --fc-neutral-text-color: var(--text-tertiary);
            --fc-today-bg-color: color-mix(in srgb, var(--accent, #4285f4) 10%, transparent);
            --fc-now-indicator-color: #ef4444;
            --fc-button-bg-color: var(--bg-secondary);
            --fc-button-border-color: var(--border);
            --fc-button-text-color: var(--text-secondary);
            --fc-button-hover-bg-color: var(--bg-tertiary);
            --fc-button-hover-border-color: var(--border);
            --fc-button-active-bg-color: var(--accent, #4285f4);
            --fc-button-active-border-color: var(--accent, #4285f4);
            --fc-small-font-size: var(--font-size-xs);
        }
        .pl-cal-main .fc { font-size: var(--font-size-sm); color: var(--text-primary); }
        .pl-cal-main .fc .fc-toolbar-title { font-size: var(--font-size-md); font-weight: 700; }
        .pl-cal-main .fc .fc-button { padding: 4px 10px; font-size: var(--font-size-xs); box-shadow: none; }
        .pl-cal-main .fc .fc-col-header-cell-cushion,
        .pl-cal-main .fc .fc-daygrid-day-number { color: var(--text-secondary); text-decoration: none; }
        .pl-cal-main .fc .fc-event { cursor: pointer; }
        .pl-cal-main .fc .fc-event:focus-visible { outline: 2px solid var(--accent, #4285f4); outline-offset: 1px; }

        .pl-cal-layout { display: flex; gap: 16px; height: 100%; min-height: 0; }
        .pl-cal-side { width: 210px; flex: 0 0 auto; display: flex; flex-direction: column; gap: 14px; overflow: auto; }
        .pl-cal-create { align-self: flex-start; }
        .pl-cal-main { flex: 1; min-width: 0; min-height: 420px; position: relative; }
        .pl-cal-mount { height: 100%; min-height: 420px; }
        .pl-cal-loading { position: absolute; inset: 0 0 auto 0; margin: 8px auto; width: max-content; z-index: 5; padding: 4px 12px; border-radius: var(--radius-md); background: var(--bg-tertiary); color: var(--text-secondary); font-size: var(--font-size-xs); }

        .pl-mini-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .pl-mini-title { font-size: var(--font-size-sm); font-weight: 600; color: var(--text-primary); }
        .pl-mini-nav { border: none; background: none; color: var(--text-tertiary); cursor: pointer; padding: 2px 6px; }
        .pl-mini-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
        .pl-mini-dow { font-size: 10px; color: var(--text-tertiary); text-align: center; padding: 2px 0; }
        .pl-mini-day { font-size: 11px; padding: 4px 0; border: none; background: none; color: var(--text-secondary); border-radius: var(--radius-sm); cursor: pointer; position: relative; }
        .pl-mini-day:hover { background: var(--bg-tertiary); }
        .pl-mini-day--out { color: var(--text-tertiary); opacity: .45; }
        .pl-mini-day--today { background: var(--accent, #4285f4); color: #fff; font-weight: 700; }
        .pl-mini-day--busy::after { content: ''; position: absolute; left: 50%; bottom: 2px; width: 3px; height: 3px; border-radius: 50%; background: currentColor; transform: translateX(-50%); }

        .pl-cal-list-title { font-size: var(--font-size-xs); color: var(--text-tertiary); font-weight: 600; margin-bottom: 6px; }
        .pl-cal-item { display: flex; align-items: center; gap: 6px; font-size: var(--font-size-xs); color: var(--text-secondary); padding: 3px 0; cursor: pointer; }
        .pl-cal-dot { width: 10px; height: 10px; border-radius: 3px; flex: 0 0 auto; }
        .pl-cal-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* 창 */
        .pl-modal-overlay { position: absolute; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 40; }
        .pl-modal { width: min(420px, 92%); background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: 0 12px 40px rgba(0,0,0,.3); }
        .pl-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border); }
        .pl-modal-title { margin: 0; font-size: var(--font-size-md); color: var(--text-primary); }
        .pl-modal-x { border: none; background: none; color: var(--text-tertiary); cursor: pointer; font-size: 14px; }
        .pl-modal-body { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
        .pl-modal-name { font-size: var(--font-size-md); }
        .pl-times { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .pl-times[data-allday="1"] { grid-template-columns: 1fr; }
        .pl-times[data-allday="1"] .pl-start-time, .pl-times[data-allday="1"] .pl-end-field { display: none; }
        .pl-times[data-allday="0"] .pl-start-date { display: none; }
        .pl-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }

        /* 일정 풍선 */
        .pl-pop { position: absolute; z-index: 45; width: 260px; padding: 12px 14px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 8px 28px rgba(0,0,0,.25); }
        .pl-pop-head { display: flex; align-items: center; justify-content: space-between; }
        .pl-pop-dot { width: 10px; height: 10px; border-radius: 50%; }
        .pl-pop-title { font-weight: 700; color: var(--text-primary); margin: 4px 0; word-break: break-word; }
        .pl-pop-time, .pl-pop-cal { font-size: var(--font-size-xs); color: var(--text-tertiary); }
        .pl-pop-actions { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }

        /* 일기 */
        .pl-diary { display: flex; gap: 16px; height: 100%; min-height: 0; }
        .pl-diary-side { width: 260px; flex: 0 0 auto; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
        .pl-diary-search { width: 100%; }
        .pl-diary-list { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
        .pl-diary-empty { font-size: var(--font-size-xs); color: var(--text-tertiary); margin: 4px 2px; }
        .pl-diary-item { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 8px 10px; border: 1px solid transparent; border-radius: var(--radius-md); background: none; cursor: pointer; }
        .pl-diary-item:hover { background: var(--bg-tertiary); }
        .pl-diary-item--on { border-color: var(--accent, #4285f4); background: var(--bg-secondary); }
        .pl-diary-item-date { font-size: var(--font-size-xs); font-weight: 700; color: var(--text-secondary); }
        .pl-diary-item-preview { font-size: var(--font-size-xs); color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pl-diary-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
        .pl-diary-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .pl-diary-date { margin: 0; font-size: var(--font-size-md); color: var(--text-primary); }
        .pl-diary-head-right { display: flex; align-items: center; gap: 8px; }
        .pl-diary-count { font-size: var(--font-size-xs); color: var(--text-tertiary); }
        .pl-diary-text { flex: 1; min-height: 240px; resize: none; padding: 14px 16px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: var(--font-size-sm); line-height: 1.8; font-family: inherit; }
        .pl-diary-text:focus { outline: 2px solid var(--accent, #4285f4); outline-offset: -2px; }
        .pl-diary-saved { margin: 0; min-height: 1.2em; font-size: var(--font-size-xs); color: var(--text-tertiary); }

        /* 달력 칸의 일기 단추 */
        /* 단추는 **그 칸 안에서** 자리를 잡아야 한다 — 칸에 자리 기준이 없으면 표 전체를 기준으로
           잡혀 모든 날의 단추가 한 자리에 겹쳐 쌓인다(실제로 그래서 옆 날 단추가 눌렸다). */
        .fc .fc-daygrid-day, .fc .fc-daygrid-day-frame { position: relative; }
        .pl-daycell-diary { position: absolute; left: 4px; top: 2px; z-index: 2; border: none; background: none; cursor: pointer; font-size: 11px; line-height: 1; padding: 2px 3px; border-radius: var(--radius-sm); color: var(--text-tertiary); opacity: 0; }
        .fc-daygrid-day:hover .pl-daycell-diary, .pl-daycell-diary:focus-visible { opacity: 1; }
        .pl-daycell-diary--on { opacity: 1; color: var(--accent, #4285f4); }
        .pl-daycell-diary:hover { background: var(--bg-tertiary); color: var(--text-primary); }

        /* 칸반 */
        .pl-kanban { display: flex; flex-direction: column; gap: 14px; height: 100%; min-height: 0; }
        .pl-kanban-add { display: flex; gap: 8px; }
        .pl-kanban-add .pl-input { flex: 1; }
        .pl-kanban-board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; flex: 1; min-height: 0; }
        .pl-col { display: flex; flex-direction: column; min-height: 0; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); }
        .pl-col--over { border-color: var(--accent, #4285f4); }
        .pl-col-head { padding: 10px 12px; font-size: var(--font-size-sm); font-weight: 700; color: var(--text-secondary); border-bottom: 1px solid var(--border); }
        .pl-col-count { color: var(--text-tertiary); font-weight: 500; }
        .pl-col-body { flex: 1; overflow: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; min-height: 80px; }
        .pl-col-empty { font-size: var(--font-size-xs); color: var(--text-tertiary); margin: 0; }
        .pl-card { display: block; padding: 10px 12px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: grab; }
        .pl-card--dragging { opacity: .5; }
        .pl-card--done .pl-card-title { text-decoration: line-through; color: var(--text-tertiary); }
        .pl-card-title { font-size: var(--font-size-sm); color: var(--text-primary); word-break: break-word; }
        .pl-card-notes { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: 4px; white-space: pre-wrap; }
        .pl-card-moves { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
        .pl-card-move { font-size: 10px; padding: 2px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: none; color: var(--text-tertiary); cursor: pointer; }
        .pl-card-move:hover { color: var(--text-primary); border-color: var(--accent, var(--border)); }

        /* 연속일 */
        .pl-streaks { display: flex; flex-direction: column; gap: 16px; max-width: 720px; }
        .pl-level { display: flex; align-items: center; gap: 16px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); }
        .pl-level-badge { width: 52px; height: 52px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--accent, #4285f4); color: #fff; font-size: 22px; font-weight: 800; }
        .pl-level-info { flex: 1; min-width: 0; }
        .pl-level-title { font-weight: 700; color: var(--text-primary); }
        .pl-level-exp { font-size: var(--font-size-xs); color: var(--text-tertiary); margin: 4px 0 8px; }
        .pl-level-bar { height: 6px; border-radius: 3px; background: var(--bg-tertiary); overflow: hidden; }
        .pl-level-fill { height: 100%; background: var(--accent, #4285f4); }
        .pl-track-row { display: flex; flex-direction: column; gap: 8px; }
        .pl-track { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; border: 1px solid var(--border); border-radius: var(--radius-md); }
        .pl-track--done { opacity: .7; }
        .pl-track-label { font-weight: 600; color: var(--text-secondary); }
        .pl-track-stat { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: 4px; }

        @media (max-width: 720px) {
            .pl-diary { flex-direction: column; }
            .pl-diary-side { width: 100%; max-height: 180px; }
            .pl-cal-layout { flex-direction: column; }
            .pl-cal-side { width: 100%; flex-direction: row; flex-wrap: wrap; align-items: flex-start; }
            .pl-kanban-board { grid-template-columns: 1fr; }
        }`;

    type PaneId = 'calendar' | 'diary' | 'kanban' | 'streaks';

    function build(container: HTMLElement): void {
        Mdd.injectCSS('planner', CSS);
        Object.assign(container.style, { height: '100%', display: 'flex', flexDirection: 'column', minHeight: '0', padding: '0' });
        container.innerHTML = `<div class="pl-root"></div>`;
        const root = container.querySelector<HTMLElement>('.pl-root')!;

        let token: string | null = storedToken();
        let pane: PaneId = 'calendar';
        let live: CalendarViewHandle | KanbanViewHandle | DiaryViewHandle | null = null;
        /** 달력에서 「그 날 일기」로 건너올 때 그 날짜 */
        let diaryDate: string | undefined;

        const dispose = (): void => {
            live?.destroy();
            live = null;
        };
        Toolbox?.onDispose?.(dispose);

        function render(): void {
            dispose();
            /* 구글은 **선택**이다 — 연동 전에도 세 칸이 전부 돈다(이 브라우저에 적힌다).
               연동하면 구글 캘린더·할 일이 같은 화면에 얹힌다. */
            const right = !GOOGLE_CLIENT_ID
                ? `<span title="${esc(t('planner.t02'))}">${esc(t('planner.t01'))}</span>`
                : token
                  ? `<span>${esc(t('planner.t72'))}</span>
                     <button type="button" class="btn btn-ghost btn-xs pl-logout">${esc(t('planner.t73'))}</button>`
                  : `<button type="button" class="btn btn-ghost btn-xs pl-login">${esc(t('planner.t05'))}</button>`;

            root.innerHTML = `
                <div class="pl-bar">
                    <div class="pl-bar-tabs">
                        <button type="button" class="pl-bar-tab${pane === 'calendar' ? ' active' : ''}" data-pane="calendar">${esc(t('planner.t07'))}</button>
                        <button type="button" class="pl-bar-tab${pane === 'diary' ? ' active' : ''}" data-pane="diary">${esc(t('planner.t93'))}</button>
                        <button type="button" class="pl-bar-tab${pane === 'kanban' ? ' active' : ''}" data-pane="kanban">${esc(t('planner.t08'))}</button>
                        <button type="button" class="pl-bar-tab${pane === 'streaks' ? ' active' : ''}" data-pane="streaks">${esc(t('planner.t09'))}</button>
                    </div>
                    <div class="pl-bar-right">${right}</div>
                </div>
                <div class="pl-pane"></div>`;

            const paneEl = root.querySelector<HTMLElement>('.pl-pane')!;
            const openDiary = (date?: string): void => {
                diaryDate = date;
                pane = 'diary';
                render();
            };
            if (pane === 'calendar') live = buildCalendarView(paneEl, token, openDiary);
            else if (pane === 'diary') {
                live = buildDiaryView(paneEl, diaryDate);
                diaryDate = undefined; // 한 번 쓰고 놓는다 — 다음에 탭을 다시 열면 오늘부터
            } else if (pane === 'kanban') live = buildKanbanView(paneEl, token);
            else buildStreaksView(paneEl, () => openDiary());

            root.querySelectorAll<HTMLElement>('[data-pane]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    pane = btn.dataset.pane as PaneId;
                    render();
                });
            });
            root.querySelector('.pl-login')?.addEventListener('click', () => {
                void (async () => {
                    try {
                        token = await requestToken();
                    } catch {
                        Toolbox?.showToast?.(t('planner.t06'), 'error');
                        return;
                    }
                    if (token) render();
                })();
            });
            root.querySelector('.pl-logout')?.addEventListener('click', () => {
                forgetToken();
                token = null;
                render();
            });
        }

        /* 말 묶음이 오기 전에 그리면 열쇠가 그대로 화면에 뜬다 — 받은 뒤에 그린다 */
        void loadNamespace('planner').then(render);
    }

    Toolbox.register({
        id: 'planner',
        title: t('widgets.planner.title', undefined, '플래너'),
        category: 'lab',
        desc: t('widgets-desc.planner.desc', undefined, '구글 캘린더·할 일·연속일을 한 자리에서'),
        icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/>',
        layout: 'full',
        noHero: true,
        tabs: [{ id: 'planner-main', label: t('planner.t74', undefined, '대시보드'), build }]
    });
})();
