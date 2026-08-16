/**
 * 칸반 — 구글 할 일을 세 칸으로 (TASK-KL-321)
 *
 * 옛 React 판은 끌어 옮기기에 `@hello-pangea/dnd`(묶어서 97KB)를 썼다. 여기서 필요한 것은
 * 「카드를 집어 다른 칸에 놓는다」 하나뿐이라, 브라우저에 이미 있는 끌어 놓기(HTML5 DnD)로 한다.
 * 받아 오는 코드가 0KB 다.
 *
 * 손가락(터치)으로는 HTML5 끌어 놓기가 안 먹는 브라우저가 있어, 카드마다 **옮길 칸 단추**를
 * 같이 둔다 — 끌기는 편의고, 단추가 정본이다. 이러면 키보드로도 옮길 수 있다.
 */
import { t } from '../../lib/i18n';
import {
    createTask,
    fetchTasks,
    patchTask,
    taskMovePayload,
    visibleNotes,
    type GoogleTask,
    type KanbanColumn
} from './gcal';
import { EXP_REWARDS, addExp } from '../../lib/gamification';
import {
    createTask as createLocalTask,
    isLocal,
    listTasks as listLocalTasks,
    moveTask as moveLocalTask
} from './local-store';

const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const COLUMNS: Array<{ id: KanbanColumn; labelKey: string }> = [
    { id: 'todo', labelKey: 'planner.t40' },
    { id: 'inProgress', labelKey: 'planner.t41' },
    { id: 'done', labelKey: 'planner.t42' }
];

export interface KanbanViewHandle {
    destroy: () => void;
}

/**
 * 할 일 세 칸. `token` 이 없으면 **이 브라우저 할 일만** 쓴다 — 구글은 얹는 것이다.
 * 어느 쪽 것인지는 id 앞머리(`local__`)가 정한다.
 */
export function buildKanbanView(container: HTMLElement, token: string | null): KanbanViewHandle {
    let data: Record<KanbanColumn, GoogleTask[]> = { todo: [], inProgress: [], done: [] };
    let destroyed = false;

    container.innerHTML = `
        <div class="pl-kanban">
            <form class="pl-kanban-add">
                <input type="text" name="task-title" class="pl-input" placeholder="${esc(t('planner.t43'))}">
                <button type="submit" class="btn btn-accent">${esc(t('planner.t44'))}</button>
            </form>
            <div class="pl-kanban-board"></div>
        </div>`;

    const board = container.querySelector<HTMLElement>('.pl-kanban-board')!;
    const form = container.querySelector<HTMLFormElement>('.pl-kanban-add')!;
    const input = container.querySelector<HTMLInputElement>('[name="task-title"]')!;

    function render(): void {
        board.innerHTML = COLUMNS.map((col) => {
            const tasks = data[col.id];
            return `<section class="pl-col" data-col="${col.id}">
                <header class="pl-col-head">${esc(t(col.labelKey))} <span class="pl-col-count">${tasks.length}</span></header>
                <div class="pl-col-body" role="list">
                    ${tasks.map((task) => card(task, col.id)).join('') || `<p class="pl-col-empty">${esc(t('planner.t45'))}</p>`}
                </div>
            </section>`;
        }).join('');
    }

    function card(task: GoogleTask, col: KanbanColumn): string {
        const notes = visibleNotes(task.notes);
        const moves = COLUMNS.filter((c) => c.id !== col)
            .map(
                (c) =>
                    `<button type="button" class="pl-card-move" data-task="${esc(task.id)}" data-to="${c.id}" title="${esc(t(c.labelKey))}">→ ${esc(t(c.labelKey))}</button>`
            )
            .join('');
        return `<article class="pl-card${col === 'done' ? ' pl-card--done' : ''}" draggable="true" tabindex="0" role="listitem" data-task="${esc(task.id)}" data-col="${col}">
            <div class="pl-card-title">${esc(task.title || t('planner.t12'))}</div>
            ${notes ? `<div class="pl-card-notes">${esc(notes)}</div>` : ''}
            <div class="pl-card-moves">${moves}</div>
        </article>`;
    }

    async function reload(): Promise<void> {
        const local = listLocalTasks();
        let remote: Record<KanbanColumn, GoogleTask[]> = { todo: [], inProgress: [], done: [] };
        if (token) {
            try {
                remote = await fetchTasks(token);
            } catch {
                /* 구글이 안 되면 이 브라우저 것만 보여 준다 — 화면이 비어 버리지 않는다 */
                Toolbox?.showToast?.(t('planner.t46'), 'error');
            }
        }
        if (destroyed) return;
        data = {
            todo: [...local.todo, ...remote.todo],
            inProgress: [...local.inProgress, ...remote.inProgress],
            done: [...local.done, ...remote.done]
        };
        render();
    }

    function findTask(id: string): { task: GoogleTask; from: KanbanColumn } | null {
        for (const col of COLUMNS) {
            const task = data[col.id].find((x) => x.id === id);
            if (task) return { task, from: col.id };
        }
        return null;
    }

    async function move(id: string, to: KanbanColumn): Promise<void> {
        const found = findTask(id);
        if (!found || found.from === to) return;
        const { task, from } = found;

        /* 화면부터 옮긴다 — 구글을 기다리는 동안 카드가 멈춰 있으면 두 번 누르게 된다 */
        data[from] = data[from].filter((x) => x.id !== id);
        const payload = taskMovePayload(task, to);
        const moved: GoogleTask = {
            ...task,
            status: to === 'done' ? 'completed' : 'needsAction',
            notes: typeof payload.notes === 'string' ? payload.notes : task.notes
        };
        data[to] = [moved, ...data[to]];
        render();

        try {
            if (isLocal(id)) moveLocalTask(id, to);
            else await patchTask(token!, id, payload);
            /* 끝낸 것·손댄 것에 경험치 — 스트릭과 같은 지갑을 쓴다 */
            if (to === 'done') addExp(EXP_REWARDS.TASK_COMPLETE);
            else if (to === 'inProgress' && from === 'todo') addExp(EXP_REWARDS.TASK_IN_PROGRESS);
        } catch {
            Toolbox?.showToast?.(t('planner.t47'), 'error');
            await reload();
        }
    }

    /* ===== 끌어 놓기 ===== */

    let dragging: string | null = null;

    board.addEventListener('dragstart', (e) => {
        const card = (e.target as HTMLElement).closest<HTMLElement>('.pl-card');
        if (!card) return;
        dragging = card.dataset.task ?? null;
        card.classList.add('pl-card--dragging');
        e.dataTransfer?.setData('text/plain', dragging ?? '');
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });

    board.addEventListener('dragend', (e) => {
        (e.target as HTMLElement).closest('.pl-card')?.classList.remove('pl-card--dragging');
        board.querySelectorAll('.pl-col--over').forEach((el) => el.classList.remove('pl-col--over'));
        dragging = null;
    });

    board.addEventListener('dragover', (e) => {
        const col = (e.target as HTMLElement).closest<HTMLElement>('.pl-col');
        if (!col || !dragging) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        board.querySelectorAll('.pl-col--over').forEach((el) => el.classList.remove('pl-col--over'));
        col.classList.add('pl-col--over');
    });

    board.addEventListener('drop', (e) => {
        const col = (e.target as HTMLElement).closest<HTMLElement>('.pl-col');
        const id = dragging || e.dataTransfer?.getData('text/plain') || '';
        dragging = null;
        board.querySelectorAll('.pl-col--over').forEach((el) => el.classList.remove('pl-col--over'));
        if (!col || !id) return;
        e.preventDefault();
        void move(id, col.dataset.col as KanbanColumn);
    });

    /* ===== 자판으로 옮기기 =====
       카드에 초점을 두고 ←/→ 를 누르면 옆 칸으로 간다. 끌기는 마우스만 되므로
       같은 일을 하는 길을 자판에도 낸다 (옮긴 뒤에도 초점이 그 카드에 남는다). */

    board.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const card = (e.target as HTMLElement).closest<HTMLElement>('.pl-card');
        const id = card?.dataset.task;
        if (!id || !card?.dataset.col) return;
        const at = COLUMNS.findIndex((c) => c.id === card.dataset.col);
        const to = COLUMNS[at + (e.key === 'ArrowRight' ? 1 : -1)];
        if (!to) return;
        e.preventDefault();
        void move(id, to.id).then(() => {
            board.querySelector<HTMLElement>(`.pl-card[data-task="${CSS.escape(id)}"]`)?.focus();
        });
    });

    /* ===== 단추로 옮기기 (손가락) ===== */

    board.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('.pl-card-move');
        if (!btn?.dataset.task) return;
        void move(btn.dataset.task, btn.dataset.to as KanbanColumn);
    });

    /* ===== 새 할 일 ===== */

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = input.value.trim();
        if (!title) return;
        input.value = '';
        void (async () => {
            try {
                /* 연동 전이면 이 브라우저에 적는다 — 구글이 없다고 못 적을 이유가 없다 */
                if (token) await createTask(token, title);
                else createLocalTask(title);
                await reload();
            } catch {
                Toolbox?.showToast?.(t('planner.t48'), 'error');
                input.value = title;
            }
        })();
    });

    render();
    void reload();

    return {
        destroy: () => {
            destroyed = true;
        }
    };
}
