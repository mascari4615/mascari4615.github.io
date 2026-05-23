/**
 * task-tab.ts — TASK Launcher 로직 이식 (TASK-KL-082 단위 I).
 *
 * task-launcher.ts 의 핵심 로직을 Cockpit 의 TASK 탭 안에 직접 렌더.
 * 원본 task-launcher.ts 는 삭제 X (v1 안정 1주 후 별 commit).
 */

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

const DOMAINS: Array<{ value: string; label: string }> = [
  { value: 'wm', label: 'WitchMendokusai (WM)' },
  { value: 'karmolab', label: 'KarmoLab (KL)' },
  { value: 'yawnbot', label: 'YawnBot (YB)' },
  { value: 'life', label: '인생 (LIFE)' },
  { value: 'hobby', label: '취미 (HOBBY)' },
  { value: 'learning', label: '학습 (LEARN)' },
];

const STATUS_COLORS: Record<string, string> = {
  seed: '#55555a',
  ready: '#7fa6d4',
  active: '#d4a849',
  hold: '#a08060',
  done: '#9ec4a8',
  sealed: '#b7a3d6',
};

const STATUS_FILTERS = ['all', 'seed', 'ready', 'active', 'hold', 'done', 'sealed'];

function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const t = (window as unknown as { __TAURI__?: { core?: { invoke?: unknown } } }).__TAURI__;
  const fn_ = t?.core?.invoke;
  return typeof fn_ === 'function' ? (fn_ as (cmd: string, args?: Record<string, unknown>) => Promise<unknown>) : null;
}

async function fetchTree(): Promise<MemoQuestTree | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  try {
    return (await invoke('get_quest_tree')) as MemoQuestTree;
  } catch (e) {
    console.error('[cockpit-task] get_quest_tree 실패', e);
    return null;
  }
}

async function openInEditor(filePath: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  try {
    await invoke('open_task_in_editor', { filePath });
  } catch (e) {
    console.error('[cockpit-task] open_task_in_editor 실패', e);
    alert(`에디터 오픈 실패: ${e}`);
  }
}

function applyFilter(
  tasks: MemoTaskNode[],
  query: string,
  statusFilter: string,
  sortMode: string,
): MemoTaskNode[] {
  const q = query.toLowerCase();
  const filtered = tasks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (!q) return true;
    return (
      t.id.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      t.status.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  });
  if (sortMode === 'mtime') {
    filtered.sort((a, b) => (b.modifiedUnix ?? 0) - (a.modifiedUnix ?? 0));
  } else {
    filtered.sort((a, b) => {
      const da = a.path[0] ?? '';
      const db = b.path[0] ?? '';
      if (da !== db) return da.localeCompare(db);
      return a.id.localeCompare(b.id);
    });
  }
  return filtered;
}

function renderList(listEl: HTMLElement, sorted: MemoTaskNode[], selectedIdx: number): void {
  if (sorted.length === 0) {
    listEl.innerHTML = '<div class="ckt-empty">조건에 맞는 TASK 없음</div>';
    return;
  }
  listEl.innerHTML = sorted
    .map((t, i) => {
      const sc = STATUS_COLORS[t.status] ?? '#55555a';
      const sel = i === selectedIdx ? ' selected' : '';
      const tags = t.tags.length > 0
        ? `[${t.tags.slice(0, 3).join(', ')}${t.tags.length > 3 ? '…' : ''}]`
        : '';
      return `<div class="ckt-row${sel}" data-file="${esc(t.filePath)}" data-idx="${i}">
        <span class="ckt-id">${esc(t.id)}</span>
        <span class="ckt-status" style="color:${sc}">${esc(t.status)}</span>
        <span class="ckt-title">${esc(t.title)}</span>
        <span class="ckt-tags">${esc(tags)}</span>
      </div>`;
    })
    .join('');
  const sel = listEl.querySelector('.ckt-row.selected') as HTMLElement | null;
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function showCreateModal(root: HTMLElement, onCreated: (path: string) => void): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'ckt-modal-backdrop';
  backdrop.innerHTML = `
    <div class="ckt-modal">
      <h3>+ 새 TASK 생성</h3>
      <label>도메인</label>
      <select class="ckt-domain">
        ${DOMAINS.map((d) => `<option value="${d.value}">${esc(d.label)}</option>`).join('')}
      </select>
      <label>제목</label>
      <input type="text" class="ckt-title-input" placeholder="예: 새 시스템 시드" autofocus>
      <div class="ckt-modal-actions">
        <button class="ckt-cancel">취소</button>
        <button class="ckt-create">생성 + 오픈</button>
      </div>
    </div>
  `;
  root.appendChild(backdrop);
  const domainSel = backdrop.querySelector('.ckt-domain') as HTMLSelectElement;
  const titleInput = backdrop.querySelector('.ckt-title-input') as HTMLInputElement;
  const close = () => backdrop.remove();
  backdrop.querySelector('.ckt-cancel')!.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  setTimeout(() => titleInput.focus(), 50);

  const submit = async () => {
    const domain = domainSel.value;
    const title = titleInput.value.trim();
    if (!title) { titleInput.style.borderColor = '#d4504e'; return; }
    const invoke = getInvoke();
    if (!invoke) { alert('Tauri invoke 불가'); return; }
    try {
      const newPath = (await invoke('create_task', { domain, title })) as string;
      close();
      onCreated(newPath);
    } catch (e) {
      alert(`생성 실패: ${e}`);
    }
  };

  backdrop.querySelector('.ckt-create')!.addEventListener('click', () => { void submit(); });
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); void submit(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
}

const TASK_TAB_STYLE_ID = 'ck-task-tab-styles';
const TASK_TAB_CSS = `
.ckt-wrap {
  --bg: #0b0d12; --bg2: #0f1218; --paper: #12151c;
  --ink: #f2f2ee; --ink2: #9a9a94; --ink3: #55555a;
  --line: #1f242d; --line2: #2a3040;
  --accent: #d4a849; --accent2: #7fa6d4;
  background: var(--bg); color: var(--ink);
  font-family: 'Noto Sans KR', system-ui, sans-serif;
  height: 100%; display: flex; flex-direction: column;
  padding: 16px; gap: 10px; overflow: hidden;
}
.ckt-header { display: flex; gap: 8px; align-items: center; }
.ckt-search {
  flex: 1; background: var(--paper); border: 1px solid var(--line2);
  border-radius: 4px; padding: 8px 12px; font-size: 13px; color: var(--ink); outline: none;
}
.ckt-search:focus { border-color: var(--accent); }
.ckt-new-btn {
  background: var(--accent); color: var(--bg); border: none; border-radius: 4px;
  padding: 8px 14px; font-weight: 600; cursor: pointer; font-size: 12px;
}
.ckt-sort {
  background: var(--paper); color: var(--ink); border: 1px solid var(--line2);
  padding: 7px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; outline: none;
}
.ckt-chips { display: flex; gap: 4px; flex-wrap: wrap; }
.ckt-chip {
  background: var(--bg2); color: var(--ink2); border: 1px solid var(--line2);
  border-radius: 3px; padding: 3px 8px; font-size: 10px;
  font-family: 'JetBrains Mono', monospace; text-transform: uppercase; cursor: pointer;
}
.ckt-chip.on { background: var(--accent); color: var(--bg); border-color: var(--accent); }
.ckt-meta { font-size: 11px; color: var(--ink3); }
.ckt-list { flex: 1; overflow-y: auto; border: 1px solid var(--line); border-radius: 4px; }
.ckt-row {
  display: grid; grid-template-columns: 120px 72px 1fr auto;
  gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--line);
  cursor: pointer; align-items: center;
}
.ckt-row:hover { background: var(--bg2); }
.ckt-row.selected { background: var(--bg2); border-left: 3px solid var(--accent); padding-left: 9px; }
.ckt-id { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--accent2); }
.ckt-status { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; }
.ckt-title { font-size: 13px; }
.ckt-tags { font-size: 10px; color: var(--ink3); white-space: nowrap; }
.ckt-empty { padding: 40px; text-align: center; color: var(--ink3); }
.ckt-modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 200;
  display: flex; align-items: center; justify-content: center;
}
.ckt-modal {
  background: var(--paper); border: 1px solid var(--line2); border-radius: 6px;
  padding: 20px; min-width: 380px; max-width: 90%;
}
.ckt-modal h3 { margin: 0 0 12px; font-size: 14px; }
.ckt-modal label { display: block; font-size: 11px; color: var(--ink2); margin-bottom: 3px; }
.ckt-modal select, .ckt-modal input {
  width: 100%; background: var(--bg2); border: 1px solid var(--line2); color: var(--ink);
  padding: 7px 9px; border-radius: 3px; font-size: 13px; outline: none; margin-bottom: 10px;
}
.ckt-modal-actions { display: flex; gap: 6px; justify-content: flex-end; }
.ckt-cancel { background: var(--line2); color: var(--ink); border: none; padding: 7px 14px; border-radius: 3px; cursor: pointer; font-size: 12px; }
.ckt-create { background: var(--accent); color: var(--bg); border: none; padding: 7px 14px; border-radius: 3px; cursor: pointer; font-size: 12px; font-weight: 600; }
`;

const _taskUnlisten = new WeakMap<HTMLElement, () => void>();

export function buildTaskTab(container: HTMLElement): void {
  if (!document.getElementById(TASK_TAB_STYLE_ID)) {
    const tag = document.createElement('style');
    tag.id = TASK_TAB_STYLE_ID;
    tag.textContent = TASK_TAB_CSS;
    document.head.appendChild(tag);
  }

  // 이전 listener 정리
  const prev = _taskUnlisten.get(container);
  if (typeof prev === 'function') { try { prev(); } catch (_) { /* noop */ } _taskUnlisten.delete(container); }

  container.innerHTML = `
    <div class="ckt-wrap">
      <div class="ckt-header">
        <input type="text" class="ckt-search" placeholder="검색 — id / title / tag / status (↑↓ Enter)">
        <select class="ckt-sort">
          <option value="mtime">최근 수정 ▾</option>
          <option value="id">ID</option>
        </select>
        <button class="ckt-new-btn">+ 새 TASK</button>
      </div>
      <div class="ckt-chips" data-chips>
        ${STATUS_FILTERS.map((s) => `<button class="ckt-chip${s === 'all' ? ' on' : ''}" data-filter="${s}">${s.toUpperCase()}</button>`).join('')}
      </div>
      <div class="ckt-meta" data-meta>로딩 중…</div>
      <div class="ckt-list" data-list></div>
    </div>
  `;

  const wrap = container.querySelector('.ckt-wrap') as HTMLElement;
  const searchEl = wrap.querySelector('.ckt-search') as HTMLInputElement;
  const sortEl = wrap.querySelector('.ckt-sort') as HTMLSelectElement;
  const newBtn = wrap.querySelector('.ckt-new-btn') as HTMLButtonElement;
  const chipsEl = wrap.querySelector('[data-chips]') as HTMLElement;
  const metaEl = wrap.querySelector('[data-meta]') as HTMLElement;
  const listEl = wrap.querySelector('[data-list]') as HTMLElement;

  let currentTasks: MemoTaskNode[] = [];
  let filteredTasks: MemoTaskNode[] = [];
  let selectedIdx = 0;
  let statusFilter = 'all';
  let sortMode = 'mtime';

  const refilter = () => {
    filteredTasks = applyFilter(currentTasks, searchEl.value, statusFilter, sortMode);
    if (selectedIdx >= filteredTasks.length) selectedIdx = 0;
    renderList(listEl, filteredTasks, selectedIdx);
  };

  const reload = async () => {
    const tree = await fetchTree();
    if (!tree) { listEl.innerHTML = '<div class="ckt-empty">데이터 로딩 실패</div>'; metaEl.textContent = '오류'; return; }
    currentTasks = tree.tasks;
    metaEl.textContent = `${currentTasks.length} TASK`;
    refilter();
  };

  void reload();

  searchEl.addEventListener('input', () => { selectedIdx = 0; refilter(); });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, filteredTasks.length - 1); renderList(listEl, filteredTasks, selectedIdx); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); renderList(listEl, filteredTasks, selectedIdx); }
    else if (e.key === 'Enter') { e.preventDefault(); const t = filteredTasks[selectedIdx]; if (t) void openInEditor(t.filePath); }
    else if (e.key === 'Escape') { e.preventDefault(); if (searchEl.value) { searchEl.value = ''; selectedIdx = 0; refilter(); } else { searchEl.blur(); } }
  });

  chipsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-filter]') as HTMLButtonElement | null;
    if (!btn) return;
    const next = btn.dataset.filter ?? 'all';
    if (statusFilter === next) return;
    statusFilter = next;
    chipsEl.querySelectorAll('.ckt-chip').forEach((c) => c.classList.toggle('on', (c as HTMLElement).dataset.filter === next));
    selectedIdx = 0; refilter(); searchEl.focus();
  });

  sortEl.addEventListener('change', () => { sortMode = sortEl.value; selectedIdx = 0; refilter(); searchEl.focus(); });

  listEl.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest('.ckt-row') as HTMLElement | null;
    if (!row) return;
    const filePath = row.dataset.file;
    if (filePath) void openInEditor(filePath);
  });

  newBtn.addEventListener('click', () => {
    showCreateModal(wrap, async (newPath) => {
      await openInEditor(newPath);
      await reload();
    });
  });

  setTimeout(() => searchEl.focus(), 100);

  // file watcher 이벤트
  const tauriListen = (window as unknown as { __TAURI__?: { event?: { listen?: unknown } } }).__TAURI__?.event?.listen;
  if (typeof tauriListen === 'function') {
    void (async () => {
      try {
        const unlisten = await (tauriListen as (event: string, cb: () => void) => Promise<() => void>)('quest-tree-changed', () => { void reload(); });
        _taskUnlisten.set(container, unlisten);
      } catch (e) { console.warn('[cockpit-task] quest-tree-changed listen 실패', e); }
    })();
  }
}
