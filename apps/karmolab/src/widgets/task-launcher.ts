/**
 * TASK Launcher 위젯 (TASK-KL-025) — Tauri 데스크톱 전용 (category: 'desktop').
 *
 * QuestLog (tree) 와 다른 axis: flat 검색 + 외부 에디터 즉시 오픈 + 새 TASK 즉석 생성.
 *
 * 데이터:
 *   - get_quest_tree (KL-009) 로 모든 TASK 읽음
 *   - 검색은 클라이언트 측 부분 일치 (id / title / tag / status)
 *
 * 명령:
 *   - open_task_in_editor (KL-025) — 행 클릭
 *   - create_task (KL-025) — "+ 새 TASK" 모달
 *
 * 자동 새로고침: KL-024 'quest-tree-changed' 이벤트 listen.
 */
import { t, loadNamespace } from '../lib/i18n';

const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

;(function (): void {
  interface MemoTaskNode {
    id: string;
    status: string;
    priority: string;
    path: string[];
    parent: string | null;
    tags: string[];
    title: string;
    filePath: string;
    modifiedUnix: number;
  }
  interface MemoQuestTree {
    tasks: MemoTaskNode[];
    generatedAtUnix: number;
    memoPath: string;
  }

  /* 이름은 **쓸 때 정한다** — 이 배열이 모듈 뜨는 순간에 굳으면 한국어로 굳는다. */
  const domains = (): Array<{ value: string; label: string; prefix: string }> => [
    { value: 'wm', label: 'WitchMendokusai (WM)', prefix: 'WM' },
    { value: 'karmolab', label: 'KarmoLab (KL)', prefix: 'KL' },
    { value: 'yawnbot', label: 'YawnBot (YB)', prefix: 'YB' },
    { value: 'life', label: t('task-launcher.t14'), prefix: 'LIFE' },
    { value: 'hobby', label: t('task-launcher.t15'), prefix: 'HOBBY' },
    { value: 'learning', label: t('task-launcher.t16'), prefix: 'LEARN' }
  ];

  const STATUS_COLORS: Record<string, string> = {
    seed: 'var(--ink-3)',
    ready: 'var(--accent-2)',
    active: 'var(--accent)',
    hold: '#a08060',
    done: 'var(--mag-project)',
    sealed: 'var(--mag-learn)',
  };

  const _launcherUnlisten = new WeakMap<HTMLElement, () => void>();

  const STYLE_ID = 'kl-task-launcher-styles';
  const CSS = `
.kl-task-launcher {
  /* 앱 테마 토큰의 별명. 예전엔 다크 색을 직접 박아 라이트에서 이 판만 까맣게 남았다.
     --accent 는 일부러 안 덮는다 — 바깥에서 내려오는 테마 강조색을 그대로 쓴다. */
  --bg: var(--bg-void);
  --bg-2: var(--bg-primary);
  --paper: var(--bg-secondary);
  --ink: var(--text-primary);
  --ink-2: var(--text-secondary);
  --ink-3: var(--text-tertiary);
  --line: var(--bg-tertiary);
  --line-2: var(--bg-hover);
  --accent-2: var(--secondary);
  --mag-project: #9ec4a8;
  --mag-learn: #b7a3d6;
  background: var(--bg); color: var(--ink); font-family: 'KarmoSans', sans-serif;
  height: 100%; display: flex; flex-direction: column; padding: 24px; gap: 16px; overflow: hidden;
}
.kl-task-launcher .header { display: flex; gap: 12px; align-items: center; }
.kl-task-launcher .search {
  flex: 1; background: var(--paper); border: 1px solid var(--line-2); border-radius: 4px;
  padding: 10px 14px; font-size: 14px; color: var(--ink); outline: none;
}
.kl-task-launcher .search:focus { border-color: var(--accent); }
.kl-task-launcher .new-btn {
  background: var(--accent); color: var(--bg); border: none; border-radius: 4px;
  padding: 10px 16px; font-weight: 600; cursor: pointer; font-size: 13px;
}
.kl-task-launcher .new-btn:hover { background: #e6b85a; }
.kl-task-launcher .sort-mode {
  background: var(--paper); color: var(--ink); border: 1px solid var(--line-2);
  padding: 9px 10px; border-radius: 4px; font-size: 13px; cursor: pointer; outline: none;
}
.kl-task-launcher .sort-mode:focus { border-color: var(--accent); }
.kl-task-launcher .meta { font-size: 12px; color: var(--ink-3); }
.kl-task-launcher .list { flex: 1; overflow-y: auto; border: 1px solid var(--line); border-radius: 4px; }
.kl-task-launcher .row {
  display: grid; grid-template-columns: 130px 80px 1fr auto;
  gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line);
  cursor: pointer; transition: background 0.12s; align-items: center;
}
.kl-task-launcher .row:hover { background: var(--bg-2); }
.kl-task-launcher .row.selected { background: var(--bg-2); border-left: 3px solid var(--accent); padding-left: 11px; }
.kl-task-launcher .row:last-child { border-bottom: none; }
.kl-task-launcher .filter-chips {
  display: flex; gap: 4px; flex-wrap: wrap; align-items: center;
}
.kl-task-launcher .chip {
  background: var(--bg-2); color: var(--ink-2); border: 1px solid var(--line-2);
  border-radius: 3px; padding: 4px 10px; font-size: 11px; font-family: 'KarmoMono', monospace;
  text-transform: uppercase; cursor: pointer; transition: background 0.12s, color 0.12s;
}
.kl-task-launcher .chip:hover { background: var(--line-2); }
.kl-task-launcher .chip.on { background: var(--accent); color: var(--bg); border-color: var(--accent); }
.kl-task-launcher .row .id { font-family: 'KarmoMono', monospace; font-size: 12px; color: var(--accent-2); }
.kl-task-launcher .row .status {
  font-family: 'KarmoMono', monospace; font-size: 11px; text-transform: uppercase;
  text-align: center; padding: 2px 6px; border: 1px solid currentColor; border-radius: 3px;
}
.kl-task-launcher .row .title { font-size: 14px; }
.kl-task-launcher .row .tags { font-size: 11px; color: var(--ink-3); white-space: nowrap; }
.kl-task-launcher .empty { padding: 48px; text-align: center; color: var(--ink-3); }

/* 모달 */
.kl-task-launcher .modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100;
  display: flex; align-items: center; justify-content: center;
}
.kl-task-launcher .modal {
  background: var(--paper); border: 1px solid var(--line-2); border-radius: 6px;
  padding: 24px; min-width: 420px; max-width: 90%;
}
.kl-task-launcher .modal h3 { margin: 0 0 16px; font-size: 16px; color: var(--ink); }
.kl-task-launcher .modal label { display: block; font-size: 12px; color: var(--ink-2); margin-bottom: 4px; }
.kl-task-launcher .modal select, .kl-task-launcher .modal input {
  width: 100%; background: var(--bg-2); border: 1px solid var(--line-2); color: var(--ink);
  padding: 8px 10px; border-radius: 3px; font-size: 14px; outline: none; margin-bottom: 12px;
}
.kl-task-launcher .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
.kl-task-launcher .modal-cancel, .kl-task-launcher .modal-create {
  border: none; padding: 8px 16px; border-radius: 3px; font-size: 13px; cursor: pointer;
}
.kl-task-launcher .modal-cancel { background: var(--line-2); color: var(--ink); }
.kl-task-launcher .modal-create { background: var(--accent); color: var(--bg); font-weight: 600; }
`;

  function isKarmolabDesktop(): boolean {
    return typeof window.__TAURI__ !== 'undefined';
  }


  async function fetchTree(): Promise<MemoQuestTree | null> {
    const invoke = window.__TAURI__?.core?.invoke;
    if (typeof invoke !== 'function') return null;
    try {
      return (await invoke('get_quest_tree')) as MemoQuestTree;
    } catch (err) {
      console.error(t('task-launcher.t17'), err);
      return null;
    }
  }

  function matches(task: MemoTaskNode, query: string, statusFilter: string): boolean {
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    if (task.id.toLowerCase().includes(q)) return true;
    if (task.title.toLowerCase().includes(q)) return true;
    if (task.status.toLowerCase().includes(q)) return true;
    if (task.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
    return false;
  }

  /// 필터링된 + 정렬된 task 배열 반환 (DOM 변경 없이 데이터만).
  /// sortMode: 'mtime' (최근 수정 desc) 또는 'id' (도메인 → id asc).
  function applyFilter(
    tasks: MemoTaskNode[],
    query: string,
    statusFilter: string,
    sortMode: string,
  ): MemoTaskNode[] {
    const filtered = [...tasks.filter((task) => matches(task, query, statusFilter))];
    if (sortMode === 'mtime') {
      filtered.sort((a, b) => (b.modifiedUnix ?? 0) - (a.modifiedUnix ?? 0));
    } else {
      filtered.sort((a, b) => {
        const domainA = a.path[0] ?? '';
        const domainB = b.path[0] ?? '';
        if (domainA !== domainB) return domainA.localeCompare(domainB);
        return a.id.localeCompare(b.id);
      });
    }
    return filtered;
  }

  function renderList(listEl: HTMLElement, sorted: MemoTaskNode[], selectedIdx: number): void {
    if (sorted.length === 0) {
      listEl.innerHTML = `<div class="empty">${esc(t('task-launcher.t04'))}</div>`;
      return;
    }
    listEl.innerHTML = sorted
      .map((task, i) => {
        const statusColor = STATUS_COLORS[task.status] ?? 'var(--ink-3)';
        const tagsLabel = task.tags.length > 0 ? `[${task.tags.slice(0, 3).join(', ')}${task.tags.length > 3 ? '…' : ''}]` : '';
        const selectedClass = i === selectedIdx ? ' selected' : '';
        return `
          <div class="row${selectedClass}" data-file="${esc(task.filePath)}" data-idx="${i}">
            <span class="id">${esc(task.id)}</span>
            <span class="status" style="color:${statusColor};">${esc(task.status)}</span>
            <span class="title">${esc(task.title)}</span>
            <span class="tags">${esc(tagsLabel)}</span>
          </div>
        `;
      })
      .join('');
    // 선택 행이 보이게 스크롤
    const selectedEl = listEl.querySelector('.row.selected') as HTMLElement | null;
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }

  function showCreateModal(root: HTMLElement, onCreated: (newPath: string) => void): void {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3>${esc(t('task-launcher.t05'))}</h3>
        <label>${esc(t('task-launcher.t06'))}</label>
        <select class="modal-domain">
          ${domains().map((d) => `<option value="${d.value}">${d.label}</option>`).join('')}
        </select>
        <label>${esc(t('task-launcher.t07'))}</label>
        <input type="text" class="modal-title" placeholder="${esc(t('task-launcher.t01'))}" autofocus>
        <div class="modal-actions">
          <button class="modal-cancel">${esc(t('task-launcher.t08'))}</button>
          <button class="modal-create">${esc(t('task-launcher.t09'))}</button>
        </div>
      </div>
    `;
    root.appendChild(backdrop);

    const domainSelect = backdrop.querySelector('.modal-domain') as HTMLSelectElement;
    const titleInput = backdrop.querySelector('.modal-title') as HTMLInputElement;
    const cancelBtn = backdrop.querySelector('.modal-cancel') as HTMLButtonElement;
    const createBtn = backdrop.querySelector('.modal-create') as HTMLButtonElement;

    setTimeout(() => titleInput.focus(), 50);

    const close = () => backdrop.remove();
    cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    const submit = async () => {
      const domain = domainSelect.value;
      const title = titleInput.value.trim();
      if (!title) {
        titleInput.style.borderColor = '#d4504e';
        return;
      }
      const invoke = window.__TAURI__?.core?.invoke;
      if (typeof invoke !== 'function') {
        alert(t('task-launcher.t18'));
        return;
      }
      try {
        const newPath = (await invoke('create_task', { domain, title })) as string;
        close();
        onCreated(newPath);
      } catch (err) {
        console.error(t('task-launcher.t19'), err);
        alert(t('task-launcher.createFailed', { why: String(err) }));
      }
    };

    createBtn.addEventListener('click', () => { void submit(); });
    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); void submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
  }

  async function openInEditor(filePath: string): Promise<void> {
    const invoke = window.__TAURI__?.core?.invoke;
    if (typeof invoke !== 'function') return;
    try {
      await invoke('open_task_in_editor', { filePath });
    } catch (err) {
      console.error(t('task-launcher.t20'), err);
      alert(t('task-launcher.openFailed', { why: String(err) }));
    }
  }

  function build(container: HTMLElement): void {
             void loadNamespace('task-launcher').then(function () {

    if (!isKarmolabDesktop()) {
      container.innerHTML = `<div class="kl-task-launcher"><div class="empty">${esc(t('task-launcher.t10'))}</div></div>`;
      return;
    }

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    // 이전 마운트의 unlisten 정리
    const prevUnlisten = _launcherUnlisten.get(container);
    if (typeof prevUnlisten === 'function') {
      try { prevUnlisten(); } catch (e) { console.error(t('task-launcher.t21'), e); }
      _launcherUnlisten.delete(container);
    }

    const STATUS_FILTERS = ['all', 'seed', 'ready', 'active', 'hold', 'done', 'sealed'];

    container.innerHTML = `
      <div class="kl-task-launcher">
        <div class="header">
          <input type="text" class="search" placeholder="${esc(t('task-launcher.t02'))}">
          <select class="sort-mode" data-sort title="${esc(t('task-launcher.t03'))}">
            <option value="mtime">${esc(t('task-launcher.opt.mtime'))}</option>
            <option value="id">ID</option>
          </select>
          <button class="new-btn">${esc(t('task-launcher.t11'))}</button>
        </div>
        <div class="filter-chips" data-chips>
          ${STATUS_FILTERS.map((s) => `<button class="chip${s === 'all' ? ' on' : ''}" data-filter="${s}">${s.toUpperCase()}</button>`).join('')}
        </div>
        <div class="meta" data-meta>${esc(t('task-launcher.t12'))}</div>
        <div class="list" data-list></div>
      </div>
    `;

    const root = container.querySelector('.kl-task-launcher') as HTMLElement;
    const searchEl = root.querySelector('.search') as HTMLInputElement;
    const listEl = root.querySelector('[data-list]') as HTMLElement;
    const metaEl = root.querySelector('[data-meta]') as HTMLElement;
    const newBtn = root.querySelector('.new-btn') as HTMLButtonElement;
    const chipsEl = root.querySelector('[data-chips]') as HTMLElement;
    const sortEl = root.querySelector('[data-sort]') as HTMLSelectElement;

    let currentTasks: MemoTaskNode[] = [];
    let filteredTasks: MemoTaskNode[] = [];
    let selectedIdx = 0;
    let statusFilter = 'all';
    let sortMode = 'mtime';

    const refilter = (): void => {
      filteredTasks = applyFilter(currentTasks, searchEl.value, statusFilter, sortMode);
      // 검색·필터 변경 시 첫 행 자동 선택 (범위 밖이면 0)
      if (selectedIdx >= filteredTasks.length) selectedIdx = 0;
      renderList(listEl, filteredTasks, selectedIdx);
    };

    const reload = async (): Promise<void> => {
      const tree = await fetchTree();
      if (!tree) {
        listEl.innerHTML = `<div class="empty">${esc(t('task-launcher.t13'))}</div>`;
        metaEl.textContent = t('task-launcher.t22');
        return;
      }
      currentTasks = tree.tasks;
      metaEl.textContent = `${currentTasks.length} TASK · memo: ${tree.memoPath}`;
      refilter();
    };

    void reload();

    searchEl.addEventListener('input', () => {
      selectedIdx = 0;
      refilter();
    });

    // 키보드 nav — ↑↓ Enter Esc
    searchEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredTasks.length === 0) return;
        selectedIdx = Math.min(selectedIdx + 1, filteredTasks.length - 1);
        renderList(listEl, filteredTasks, selectedIdx);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredTasks.length === 0) return;
        selectedIdx = Math.max(selectedIdx - 1, 0);
        renderList(listEl, filteredTasks, selectedIdx);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = filteredTasks[selectedIdx];
        if (target) void openInEditor(target.filePath);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (searchEl.value) {
          searchEl.value = '';
          selectedIdx = 0;
          refilter();
        } else {
          searchEl.blur();
        }
      }
    });

    chipsEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-filter]') as HTMLButtonElement | null;
      if (!btn) return;
      const next = btn.dataset.filter ?? 'all';
      if (statusFilter === next) return;
      statusFilter = next;
      chipsEl.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', (c as HTMLElement).dataset.filter === next));
      selectedIdx = 0;
      refilter();
      searchEl.focus();
    });

    sortEl.addEventListener('change', () => {
      sortMode = sortEl.value;
      selectedIdx = 0;
      refilter();
      searchEl.focus();
    });

    listEl.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest('.row') as HTMLElement | null;
      if (!row) return;
      const filePath = row.dataset.file;
      if (filePath) void openInEditor(filePath);
    });

    newBtn.addEventListener('click', () => {
      showCreateModal(root, async (newPath) => {
        // 생성 후 자동 오픈 + 트리 새로고침 (file watcher 도 잡지만 즉시 반영)
        await openInEditor(newPath);
        await reload();
      });
    });

    setTimeout(() => searchEl.focus(), 100);

    // KL-024 file watcher 이벤트 listen — 외부 변경 시 자동 새로고침
    const tauriListen = window.__TAURI__?.event?.listen;
    if (typeof tauriListen === 'function') {
      void (async () => {
        try {
          const unlisten = await tauriListen('quest-tree-changed', () => { void reload(); });
          _launcherUnlisten.set(container, unlisten);
        } catch (err) {
          console.error(t('task-launcher.t23'), err);
        }
      })();
    }
               });
           }

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta('task-launcher'),
    tabs: [{ id: 'task-launcher-main', label: 'Launcher', build }],
  });
})();
