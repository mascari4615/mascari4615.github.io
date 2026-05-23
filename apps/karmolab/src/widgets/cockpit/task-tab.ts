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

// 도메인별 포스터 설정 (gradient 종료색, 이니셜, 이미지 URL hook)
interface DomainPoster {
  from: string;
  to: string;
  initial: string;
  imageUrl?: string; // 실제 포스터 이미지 경로 (없으면 gradient fallback)
}
const DOMAIN_POSTERS: Record<string, DomainPoster> = {
  wm:        { from: '#1a0a2e', to: '#3b1f6b', initial: 'W' },
  karmolab:  { from: '#071929', to: '#0c3f6e', initial: 'K' },
  yawnbot:   { from: '#1c1200', to: '#5a3b00', initial: 'Y' },
  life:      { from: '#051a10', to: '#0e4d2a', initial: 'L' },
  hobby:     { from: '#1f0a18', to: '#5a1f42', initial: 'H' },
  learning:  { from: '#0a0f25', to: '#1e3068', initial: 'E' },
  _default:  { from: '#111418', to: '#1f2630', initial: '?' },
};

const STATUS_COLORS: Record<string, string> = {
  seed:   '#55555a',
  ready:  '#7fa6d4',
  active: '#d4a849',
  hold:   '#a08060',
  done:   '#9ec4a8',
  sealed: '#b7a3d6',
};

const STATUS_ORDER = ['active', 'ready', 'hold', 'seed', 'done', 'sealed'];
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

// ── LIST 모드 ────────────────────────────────────────────────────────────────

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

// ── QUEST 모드 ───────────────────────────────────────────────────────────────

function buildStatusBadges(tasks: MemoTaskNode[]): string {
  const counts: Record<string, number> = {};
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
  return STATUS_ORDER
    .filter((s) => counts[s] > 0)
    .map((s) => `<span class="ckt-qbadge" style="color:${STATUS_COLORS[s] ?? '#9a9a94'}">${esc(s)} ${counts[s]}</span>`)
    .join('');
}

function buildPosterStyle(poster: DomainPoster): string {
  if (poster.imageUrl) {
    return `background: linear-gradient(to right, ${poster.from}ee, ${poster.from}88), url(${poster.imageUrl}) center/cover no-repeat;`;
  }
  return `background: linear-gradient(135deg, ${poster.from} 0%, ${poster.to} 100%);`;
}

function renderQuestSection(domain: string, tasks: MemoTaskNode[]): string {
  const domainInfo = DOMAINS.find((d) => d.value === domain);
  const label = domainInfo?.label ?? domain.toUpperCase();
  const poster = DOMAIN_POSTERS[domain] ?? DOMAIN_POSTERS['_default'];

  const taskRows = tasks
    .map((t) => {
      const sc = STATUS_COLORS[t.status] ?? '#55555a';
      return `<div class="ckt-qrow" data-file="${esc(t.filePath)}">
        <span class="ckt-qdot" style="background:${sc}"></span>
        <span class="ckt-qid">${esc(t.id)}</span>
        <span class="ckt-qstatus" style="color:${sc}">${esc(t.status)}</span>
        <span class="ckt-qtitle">${esc(t.title)}</span>
      </div>`;
    })
    .join('');

  return `<div class="ckt-qsection">
    <div class="ckt-qposter" style="${buildPosterStyle(poster)}">
      <div class="ckt-qinitial">${esc(poster.initial)}</div>
      <div class="ckt-qposter-info">
        <div class="ckt-qlabel">${esc(label)}</div>
        <div class="ckt-qbadges">${buildStatusBadges(tasks)}</div>
      </div>
    </div>
    <div class="ckt-qtasks">${taskRows}</div>
  </div>`;
}

function renderQuestLog(listEl: HTMLElement, sorted: MemoTaskNode[]): void {
  if (sorted.length === 0) {
    listEl.innerHTML = '<div class="ckt-empty">조건에 맞는 TASK 없음</div>';
    return;
  }

  // 도메인 순서: DOMAINS 정의 순 우선, 나머지 알파벳
  const domainOrder = DOMAINS.map((d) => d.value);
  const groups = new Map<string, MemoTaskNode[]>();
  for (const t of sorted) {
    const d = t.path[0] ?? '_other';
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d)!.push(t);
  }

  const orderedKeys = [
    ...domainOrder.filter((k) => groups.has(k)),
    ...[...groups.keys()].filter((k) => !domainOrder.includes(k)).sort(),
  ];

  listEl.innerHTML = orderedKeys.map((k) => renderQuestSection(k, groups.get(k)!)).join('');
}

// ── 모달 ─────────────────────────────────────────────────────────────────────

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

// ── CSS ──────────────────────────────────────────────────────────────────────

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

/* 모드 토글 */
.ckt-mode-toggle { display: flex; gap: 0; border: 1px solid var(--line2); border-radius: 4px; overflow: hidden; flex-shrink: 0; }
.ckt-mode-btn {
  background: var(--bg2); color: var(--ink2); border: none;
  padding: 7px 12px; font-size: 11px; cursor: pointer; white-space: nowrap;
  font-family: 'JetBrains Mono', monospace; transition: background 0.15s, color 0.15s;
}
.ckt-mode-btn.on { background: var(--accent2); color: var(--bg); }
.ckt-mode-btn:not(.on):hover { background: var(--line2); color: var(--ink); }

.ckt-chips { display: flex; gap: 4px; flex-wrap: wrap; }
.ckt-chip {
  background: var(--bg2); color: var(--ink2); border: 1px solid var(--line2);
  border-radius: 3px; padding: 3px 8px; font-size: 10px;
  font-family: 'JetBrains Mono', monospace; text-transform: uppercase; cursor: pointer;
}
.ckt-chip.on { background: var(--accent); color: var(--bg); border-color: var(--accent); }
.ckt-meta { font-size: 11px; color: var(--ink3); }
.ckt-list { flex: 1; overflow-y: auto; border: 1px solid var(--line); border-radius: 4px; }

/* LIST 모드 */
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

/* QUEST 모드 */
.ckt-qsection { margin-bottom: 20px; }
.ckt-qsection:last-child { margin-bottom: 0; }

.ckt-qposter {
  position: relative; height: 160px; border-radius: 6px 6px 0 0;
  overflow: hidden; display: flex; align-items: flex-end; padding: 16px;
  border: 1px solid rgba(255,255,255,0.06); border-bottom: none;
}
.ckt-qinitial {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -55%);
  font-size: 96px; font-weight: 900; color: rgba(255,255,255,0.07);
  font-family: 'JetBrains Mono', monospace; letter-spacing: -0.05em;
  user-select: none; pointer-events: none;
}
.ckt-qposter-info { position: relative; z-index: 1; }
.ckt-qlabel { font-size: 18px; font-weight: 700; color: #f2f2ee; line-height: 1.2; margin-bottom: 6px; }
.ckt-qbadges { display: flex; gap: 10px; flex-wrap: wrap; }
.ckt-qbadge { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; }

.ckt-qtasks {
  border: 1px solid rgba(255,255,255,0.06); border-top: none;
  border-radius: 0 0 6px 6px; overflow: hidden;
}
.ckt-qrow {
  display: grid; grid-template-columns: 8px 130px 72px 1fr;
  gap: 10px; padding: 9px 14px; border-bottom: 1px solid var(--line);
  cursor: pointer; align-items: center;
}
.ckt-qrow:last-child { border-bottom: none; }
.ckt-qrow:hover { background: var(--bg2); }
.ckt-qdot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.ckt-qid { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--accent2); }
.ckt-qstatus { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; }
.ckt-qtitle { font-size: 13px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 모달 */
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

// ── 진입점 ────────────────────────────────────────────────────────────────────

const _taskUnlisten = new WeakMap<HTMLElement, () => void>();

export function buildTaskTab(container: HTMLElement): void {
  if (!document.getElementById(TASK_TAB_STYLE_ID)) {
    const tag = document.createElement('style');
    tag.id = TASK_TAB_STYLE_ID;
    tag.textContent = TASK_TAB_CSS;
    document.head.appendChild(tag);
  }

  const prev = _taskUnlisten.get(container);
  if (typeof prev === 'function') { try { prev(); } catch (_) { /* noop */ } _taskUnlisten.delete(container); }

  container.innerHTML = `
    <div class="ckt-wrap">
      <div class="ckt-header">
        <div class="ckt-mode-toggle">
          <button class="ckt-mode-btn on" data-mode="list">≡ LIST</button>
          <button class="ckt-mode-btn" data-mode="quest">◉ QUEST</button>
        </div>
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
  let viewMode: 'list' | 'quest' = 'list';

  const rerender = () => {
    if (viewMode === 'quest') {
      renderQuestLog(listEl, filteredTasks);
    } else {
      renderList(listEl, filteredTasks, selectedIdx);
    }
  };

  const refilter = () => {
    filteredTasks = applyFilter(currentTasks, searchEl.value, statusFilter, sortMode);
    if (selectedIdx >= filteredTasks.length) selectedIdx = 0;
    rerender();
  };

  const reload = async () => {
    const tree = await fetchTree();
    if (!tree) { listEl.innerHTML = '<div class="ckt-empty">데이터 로딩 실패</div>'; metaEl.textContent = '오류'; return; }
    currentTasks = tree.tasks;
    metaEl.textContent = `${currentTasks.length} TASK`;
    refilter();
  };

  void reload();

  // 모드 토글
  wrap.querySelector('.ckt-mode-toggle')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-mode]') as HTMLButtonElement | null;
    if (!btn) return;
    const next = btn.dataset.mode as 'list' | 'quest';
    if (viewMode === next) return;
    viewMode = next;
    wrap.querySelectorAll('.ckt-mode-btn').forEach((b) =>
      b.classList.toggle('on', (b as HTMLElement).dataset.mode === next));
    rerender();
  });

  searchEl.addEventListener('input', () => { selectedIdx = 0; refilter(); });
  searchEl.addEventListener('keydown', (e) => {
    if (viewMode !== 'list') return;
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
    const row = (e.target as HTMLElement).closest('[data-file]') as HTMLElement | null;
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
