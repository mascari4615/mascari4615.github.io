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
  { value: 'wm', label: 'WitchMendokusai' },
  { value: 'karmolab', label: 'KarmoLab' },
  { value: 'yawnbot', label: 'YawnBot' },
  { value: 'life', label: '인생' },
  { value: 'hobby', label: '취미' },
  { value: 'learning', label: '학습' },
];

const DOMAIN_ICON: Record<string, string> = {
  wm: '🔮', karmolab: '🧪', yawnbot: '🤖',
  life: '🏠', hobby: '🎨', learning: '📚',
};

const DOMAIN_SUBTITLE: Record<string, string> = {
  wm:       '메인 프로젝트 · 주황머리 마녀와 인형들',
  karmolab: 'Tauri 데스크톱 + 웹 위젯 + AI',
  yawnbot:  'Discord 봇 · 캐릭터 호스트',
  life:     '인생 일반 — 건강·금융·집·관계',
  hobby:    '취미 — 음악·독서·게임·여행',
  learning: '학습 — 책·강의·언어·기술',
};

// quest-log 의 HEROES 이미지를 도메인별 포스터로 활용
const DOMAIN_IMAGE: Record<string, string> = {
  wm:       '/apps/karmolab/img/widgets/quest-log/240714-071225.jpg',
  karmolab: '/apps/karmolab/img/widgets/quest-log/250315-170647.png',
  yawnbot:  '/apps/karmolab/img/widgets/quest-log/250315-173653.png',
  life:     '/apps/karmolab/img/widgets/quest-log/240330-000000.png',
  hobby:    '/apps/karmolab/img/widgets/quest-log/240330-111546.png',
  learning: '/apps/karmolab/img/widgets/quest-log/240513-131941.png',
};

// 이미지 없는 도메인용 gradient fallback 색상
const DOMAIN_GRADIENT: Record<string, string> = {
  _default: 'radial-gradient(ellipse at 30% 60%, #182033 0%, #0a0d14 70%)',
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
const DOMAIN_ORDER = ['wm', 'karmolab', 'yawnbot', 'life', 'hobby', 'learning'];

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

function buildStatusBar(tasks: MemoTaskNode[]): string {
  const counts: Record<string, number> = {};
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
  const parts = STATUS_ORDER
    .filter((s) => counts[s] > 0)
    .map((s) => `<span class="ckt-qstat-item" style="color:${STATUS_COLORS[s] ?? '#9a9a94'}">${s.toUpperCase()} <b>${counts[s]}</b></span>`);
  return parts.join('<span class="ckt-qstat-sep">·</span>');
}

// SVG 별자리 fallback (이미지 없는 도메인)
function svgStarField(seed: number): string {
  const h = (n: number) => ((seed * 2654435761 + n * 40503) >>> 0);
  const stars = Array.from({ length: 18 }, (_, i) => ({
    x: h(i * 3) % 100,
    y: ((h(i * 3 + 1) % 70) + 8),
    r: ((h(i * 3 + 2) % 14) / 10 + 0.4),
    bright: i < 6,
  }));
  const bright = stars.filter((s) => s.bright);
  const lines = bright.slice(0, -1).map((s, i) =>
    `<line x1="${s.x}" y1="${s.y}" x2="${bright[i + 1].x}" y2="${bright[i + 1].y}" stroke="#3d4557" stroke-width="0.2" stroke-dasharray="0.6 0.8" opacity="0.8"/>`
  ).join('');
  return `<svg viewBox="0 0 100 50" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;">
    <defs><radialGradient id="cktg${seed}"><stop offset="0" stop-color="#182033" stop-opacity="0.9"/><stop offset="1" stop-color="#0a0d14" stop-opacity="1"/></radialGradient></defs>
    <rect width="100" height="50" fill="url(#cktg${seed})"/>
    ${lines}
    ${stars.map((s) => `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="${s.bright ? '#f2f2ee' : '#9a9a94'}" opacity="${s.bright ? 1 : 0.6}"/>`).join('')}
    ${bright.slice(0, 3).map((s) => `<circle cx="${s.x}" cy="${s.y}" r="${s.r * 2.8}" fill="none" stroke="#f2f2ee" stroke-width="0.15" opacity="0.3"/>`).join('')}
  </svg>`;
}

function renderQuestSection(domain: string, tasks: MemoTaskNode[], domainIdx: number, expanded: boolean): string {
  const domainInfo = DOMAINS.find((d) => d.value === domain);
  const label = domainInfo?.label ?? domain.toUpperCase();
  const icon = DOMAIN_ICON[domain] ?? '📦';
  const subtitle = DOMAIN_SUBTITLE[domain] ?? '';
  const imgSrc = DOMAIN_IMAGE[domain];
  const isMain = domain === 'wm';
  const tagLabel = isMain ? '★ MAIN PROJECT' : `DOMAIN №${String(domainIdx + 1).padStart(2, '0')}`;
  const chevron = expanded ? '▾' : '▸';

  const posterInner = imgSrc
    ? `<img src="${esc(imgSrc)}" alt="" class="ckt-qposter-img">`
    : svgStarField(domain.charCodeAt(0) + domain.length);

  const taskRows = tasks
    .map((t) => {
      const sc = STATUS_COLORS[t.status] ?? '#55555a';
      const isActive = t.status === 'active';
      const prefix = isActive ? '<span class="ckt-qrow-prefix" style="color:#d4a849">✦</span>' : '<span class="ckt-qrow-prefix" style="color:#33363d">◇</span>';
      return `<div class="ckt-qrow" data-file="${esc(t.filePath)}">
        ${prefix}
        <span class="ckt-qid">${esc(t.id)}</span>
        <span class="ckt-qmag" style="color:${sc};border-color:${sc}33">${esc(t.status.toUpperCase())}</span>
        <span class="ckt-qtitle" data-status="${esc(t.status)}">${esc(t.title)}</span>
      </div>`;
    })
    .join('');

  const bodyDisplay = expanded ? '' : ' style="display:none"';

  return `<div class="ckt-qsection" data-domain="${esc(domain)}">
    <div class="ckt-qposter ckt-qposter--toggle" data-toggle-domain="${esc(domain)}">
      ${posterInner}
      <div class="ckt-qposter-veil"></div>
      <div class="ckt-qcoord">
        <span class="ckt-qcoord-k">DOMAIN</span> ${esc(domain.toUpperCase())}<br>
        <span class="ckt-qcoord-k">TASKS </span> ${tasks.length}
      </div>
      <div class="ckt-qtag">${esc(tagLabel)}</div>
      <div class="ckt-qoverlay">
        <div class="ckt-qoverlay-sub">${esc(icon)} ${esc(subtitle)}</div>
        <div class="ckt-qoverlay-title">${esc(label)}</div>
      </div>
      <div class="ckt-qchevron" data-chevron="${esc(domain)}">${chevron}</div>
    </div>
    <div class="ckt-qbody" data-body="${esc(domain)}"${bodyDisplay}>
      <div class="ckt-qstatbar">${buildStatusBar(tasks)}</div>
      <div class="ckt-qtasks">${taskRows || '<div class="ckt-qempty">조건에 맞는 TASK 없음</div>'}</div>
    </div>
  </div>`;
}

function renderQuestLog(listEl: HTMLElement, sorted: MemoTaskNode[], expandedDomains: Set<string>): void {
  if (sorted.length === 0) {
    listEl.innerHTML = '<div class="ckt-empty">조건에 맞는 TASK 없음</div>';
    return;
  }

  const groups = new Map<string, MemoTaskNode[]>();
  for (const t of sorted) {
    const d = t.path[0] ?? '_other';
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d)!.push(t);
  }

  const orderedKeys = [
    ...DOMAIN_ORDER.filter((k) => groups.has(k)),
    ...[...groups.keys()].filter((k) => !DOMAIN_ORDER.includes(k)).sort(),
  ];

  listEl.innerHTML = orderedKeys.map((k, i) => renderQuestSection(k, groups.get(k)!, i, expandedDomains.has(k))).join('');
}

// ── 모달 ─────────────────────────────────────────────────────────────────────

const DOMAINS_FULL: Array<{ value: string; label: string }> = [
  { value: 'wm', label: 'WitchMendokusai (WM)' },
  { value: 'karmolab', label: 'KarmoLab (KL)' },
  { value: 'yawnbot', label: 'YawnBot (YB)' },
  { value: 'life', label: '인생 (LIFE)' },
  { value: 'hobby', label: '취미 (HOBBY)' },
  { value: 'learning', label: '학습 (LEARN)' },
];

function showCreateModal(root: HTMLElement, onCreated: (path: string) => void): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'ckt-modal-backdrop';
  backdrop.innerHTML = `
    <div class="ckt-modal">
      <h3>+ 새 TASK 생성</h3>
      <label>도메인</label>
      <select class="ckt-domain">
        ${DOMAINS_FULL.map((d) => `<option value="${d.value}">${esc(d.label)}</option>`).join('')}
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
  --line: #1f242d; --line2: #2a3040; --line3: #3d4557;
  --accent: #d4a849; --accent2: #7fa6d4;
  background: var(--bg); color: var(--ink);
  font-family: 'Noto Sans KR', system-ui, sans-serif;
  height: 100%; display: flex; flex-direction: column;
  padding: 16px; gap: 10px; overflow: hidden;
}
.ckt-wrap *, .ckt-wrap *::before, .ckt-wrap *::after { box-sizing: border-box; }

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
  background: var(--bg2); color: var(--ink3); border: none;
  padding: 7px 12px; font-size: 11px; cursor: pointer; white-space: nowrap;
  font-family: 'JetBrains Mono', monospace; letter-spacing: 0.1em; transition: background 0.15s, color 0.15s;
}
.ckt-mode-btn.on { background: var(--accent2); color: var(--bg); }
.ckt-mode-btn:not(.on):hover { background: var(--line2); color: var(--ink); }

/* status chips */
.ckt-chips { display: flex; gap: 4px; flex-wrap: wrap; }
.ckt-chip {
  background: var(--bg2); color: var(--ink2); border: 1px dashed var(--line3);
  border-radius: 2px; padding: 3px 8px; font-size: 10px;
  font-family: 'JetBrains Mono', monospace; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer;
}
.ckt-chip.on { background: var(--accent); color: var(--bg); border-color: var(--accent); border-style: solid; }
.ckt-meta { font-size: 11px; color: var(--ink3); font-family: 'JetBrains Mono', monospace; letter-spacing: 0.14em; }
.ckt-list { flex: 1; overflow-y: auto; border: 1px solid var(--line); border-radius: 4px; }

/* LIST 모드 rows */
.ckt-row {
  display: grid; grid-template-columns: 120px 72px 1fr auto;
  gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--line);
  cursor: pointer; align-items: center;
}
.ckt-row:hover { background: var(--bg2); }
.ckt-row.selected { background: var(--bg2); border-left: 3px solid var(--accent); padding-left: 9px; }
.ckt-id { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--accent2); letter-spacing: 0.05em; }
.ckt-status { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; }
.ckt-title { font-size: 13px; }
.ckt-tags { font-size: 10px; color: var(--ink3); white-space: nowrap; }
.ckt-empty { padding: 40px; text-align: center; color: var(--ink3); font-family: 'JetBrains Mono', monospace; letter-spacing: 0.2em; font-size: 12px; }
.ckt-empty::before, .ckt-empty::after { content: '— '; opacity: 0.5; }
.ckt-empty::after { content: ' —'; }

/* QUEST 모드 — 섹션 */
.ckt-qsection { margin-bottom: 28px; position: relative; }
.ckt-qsection::before {
  content: ''; position: absolute; top: -1px; left: -1px; width: 12px; height: 12px;
  border-top: 1px solid var(--accent); border-left: 1px solid var(--accent);
}
.ckt-qsection::after {
  content: ''; position: absolute; bottom: -1px; right: -1px; width: 12px; height: 12px;
  border-bottom: 1px solid var(--line3); border-right: 1px solid var(--line3);
}
.ckt-qsection:last-child { margin-bottom: 0; }

/* QUEST 포스터 (quest-log .sky.photo 참고) */
.ckt-qposter {
  position: relative; height: 200px;
  overflow: hidden; border: 1px solid var(--line2); border-bottom: none;
  background: #0a0d14;
}
.ckt-qposter-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ckt-qposter-veil {
  position: absolute; inset: 0;
  background: linear-gradient(to bottom, rgba(11,13,18,0.25) 0%, rgba(11,13,18,0.82) 100%);
}

/* 좌상단 좌표 오버레이 */
.ckt-qcoord {
  position: absolute; left: 14px; top: 14px; z-index: 3;
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: var(--ink2); letter-spacing: 0.15em; line-height: 1.8;
}
.ckt-qcoord-k { color: var(--ink3); }

/* 우상단 태그 뱃지 */
.ckt-qtag {
  position: absolute; right: 14px; top: 14px; z-index: 3;
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: var(--ink); letter-spacing: 0.18em; text-transform: uppercase;
  padding: 3px 8px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.09);
}

/* 우하단 chevron */
.ckt-qchevron {
  position: absolute; right: 14px; bottom: 14px; z-index: 3;
  font-family: 'JetBrains Mono', monospace; font-size: 18px;
  color: rgba(255,255,255,0.5); line-height: 1;
  transition: color 0.15s;
}
.ckt-qposter--toggle { cursor: pointer; }
.ckt-qposter--toggle:hover .ckt-qchevron { color: var(--accent); }
.ckt-qposter--toggle:hover .ckt-qposter-veil {
  background: linear-gradient(to bottom, rgba(11,13,18,0.35) 0%, rgba(11,13,18,0.88) 100%);
}

/* 좌하단 제목 오버레이 */
.ckt-qoverlay {
  position: absolute; left: 18px; right: 18px; bottom: 16px; z-index: 3;
}
.ckt-qoverlay-sub {
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  letter-spacing: 0.22em; color: var(--accent); text-transform: uppercase;
  margin-bottom: 5px;
}
.ckt-qoverlay-title {
  font-family: 'Noto Serif KR', serif; font-style: italic; font-weight: 700;
  font-size: 28px; color: var(--ink); line-height: 1.05;
  letter-spacing: -0.01em; text-shadow: 0 2px 20px rgba(0,0,0,0.9);
}

/* status 바 (포스터 하단 — col-head bar-meta 스타일) */
.ckt-qstatbar {
  display: flex; gap: 0; flex-wrap: wrap; align-items: center;
  padding: 7px 14px; gap: 8px;
  background: var(--paper); border: 1px solid var(--line2); border-top: none; border-bottom: none;
  font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em;
}
.ckt-qstat-item b { font-weight: 700; }
.ckt-qstat-sep { color: var(--line3); margin: 0 2px; }

/* QUEST task 행 (obs 스타일 참고) */
.ckt-qtasks {
  border: 1px solid var(--line2); border-top: none; overflow: hidden;
}
.ckt-qrow {
  display: grid; grid-template-columns: 16px 130px 72px 1fr;
  gap: 10px; padding: 9px 14px; border-bottom: 1px dashed var(--line);
  cursor: pointer; align-items: center;
}
.ckt-qrow:last-child { border-bottom: none; }
.ckt-qrow:hover { background: var(--bg2); }
.ckt-qrow-prefix { font-size: 12px; line-height: 1; }
.ckt-qid {
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: var(--accent); letter-spacing: 0.05em;
}
.ckt-qmag {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  letter-spacing: 0.14em; text-transform: uppercase;
  padding: 2px 5px; border: 1px solid; white-space: nowrap;
}
.ckt-qtitle {
  font-family: 'Noto Serif KR', serif; font-size: 13.5px; color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  letter-spacing: -0.01em;
}
.ckt-qtitle[data-status="done"],
.ckt-qtitle[data-status="sealed"] { color: var(--ink3); text-decoration: line-through; text-decoration-thickness: 1px; }
.ckt-qtitle[data-status="active"]::before { content: ''; }
.ckt-qempty {
  padding: 24px 14px; text-align: center; color: var(--ink3);
  font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.2em;
}

/* 모달 */
.ckt-modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 200;
  display: flex; align-items: center; justify-content: center;
}
.ckt-modal {
  background: var(--paper); border: 1px solid var(--line2); border-radius: 6px;
  padding: 22px; min-width: 380px; max-width: 90%;
  position: relative;
}
.ckt-modal::before {
  content: ''; position: absolute; top: -1px; left: -1px; width: 12px; height: 12px;
  border-top: 1px solid var(--accent); border-left: 1px solid var(--accent);
}
.ckt-modal h3 { margin: 0 0 14px; font-family: 'Noto Serif KR', serif; font-size: 16px; font-weight: 700; }
.ckt-modal label { display: block; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink2); margin-bottom: 4px; }
.ckt-modal select, .ckt-modal input {
  width: 100%; background: var(--bg2); border: 1px solid var(--line2); color: var(--ink);
  padding: 8px 10px; border-radius: 3px; font-size: 13px; outline: none; margin-bottom: 12px;
}
.ckt-modal-actions { display: flex; gap: 6px; justify-content: flex-end; }
.ckt-cancel { background: var(--line2); color: var(--ink); border: none; padding: 8px 14px; border-radius: 3px; cursor: pointer; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; letter-spacing: 0.1em; }
.ckt-create { background: var(--accent); color: var(--bg); border: none; padding: 8px 14px; border-radius: 3px; cursor: pointer; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-weight: 700; letter-spacing: 0.1em; }
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
  const expandedDomains = new Set<string>(); // 기본 전체 접힘

  const rerender = () => {
    if (viewMode === 'quest') {
      renderQuestLog(listEl, filteredTasks, expandedDomains);
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
    // task 행 클릭 (파일 오픈) — 포스터 내부가 아닌 경우
    const row = (e.target as HTMLElement).closest('[data-file]') as HTMLElement | null;
    if (row) { void openInEditor(row.dataset.file ?? ''); return; }

    // 포스터 토글
    const poster = (e.target as HTMLElement).closest('[data-toggle-domain]') as HTMLElement | null;
    if (poster) {
      const domain = poster.dataset.toggleDomain ?? '';
      if (!domain) return;
      const body = listEl.querySelector(`[data-body="${CSS.escape(domain)}"]`) as HTMLElement | null;
      const chevron = listEl.querySelector(`[data-chevron="${CSS.escape(domain)}"]`) as HTMLElement | null;
      if (expandedDomains.has(domain)) {
        expandedDomains.delete(domain);
        if (body) body.style.display = 'none';
        if (chevron) chevron.textContent = '▸';
      } else {
        expandedDomains.add(domain);
        if (body) body.style.display = '';
        if (chevron) chevron.textContent = '▾';
      }
    }
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
