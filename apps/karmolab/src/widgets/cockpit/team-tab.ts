/**
 * team-tab.ts — 에이전트 팀 콘솔 (Cockpit 탭, TASK-KL-082 병합).
 * agent-team.ts build() 로직 이식. Toolbox.register X — cockpit.ts 가 탭으로 마운트.
 */
import { invoke as tauriInvoke } from '../../tauri-bridge';
import { t, loadNamespace, locale } from '../../lib/i18n';

/** 화면에 그대로 박는 글은 태그로 읽히면 안 된다. */
const esc = (v: unknown): string =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type AgentInfo = {
  id: string;
  display_name?: string;
  emoji?: string;
  role?: string;
  kind?: string;
  status?: string;
  default_skin?: string;
  last_activity_ts?: string;
  activity_count: number;
};

type ObjectiveInfo = {
  id: string;
  goal: string;
  status: string;
  align: string;
};

type SessionInfo = {
  name: string;
  task: string;
  started_kst: string;
  topic: string;
  target_files: string;
  state: string;
};

type ProposalInfo = {
  id: string;
  ts: string;
  target?: string;
  kind?: string;
  domain?: string;
  title?: string;
  body?: string;
  decided: boolean;
  decision?: string;
};

type BusEntry = {
  ts: string;
  slot: string;
  headline: string;
  body_preview: string;
  task_ids: string[];
};

type TaskBoardEntry = {
  task_id: string;
  status: string;
  title: string;
  md_path: string;
};

type CardInfo = {
  ts: string;
  source: string;
  session?: string;
  kind?: string;
  topic?: string;
  summary: string;
  task_ids: string[];
};

const REFRESH_MS = 5000;


function relativeTime(iso: string | undefined): string {
  if (!iso) return t('cockpit.t18');
  const at = new Date(iso).getTime();
  if (isNaN(at)) return iso.slice(0, 16);
  const ms = Date.now() - at;
  if (ms < 60_000) return t('cockpit.t19');
  const m = Math.floor(ms / 60_000);
  if (m < 60) return t('cockpit.ago.min', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('cockpit.ago.hour', { n: h });
  const d = Math.floor(h / 24);
  return d < 14 ? t('cockpit.ago.day', { n: d }) : iso.slice(0, 10);
}

function statusDot(color: string): string {
  return `<span style="display:inline-block;width:.5rem;height:.5rem;border-radius:50%;background:${color};margin-right:.3rem"></span>`;
}

function agentStatusColor(s: string | undefined): string {
  switch ((s || '').toLowerCase()) {
    case 'active': return '#3a3';
    case 'draft': return '#ca0';
    case 'inactive': case 'retired': return '#888';
    default: return '#888';
  }
}

function sessionStateColor(s: string): string {
  const l = s.toLowerCase();
  if (l.includes('in_progress') || l.includes('active')) return '#3a8';
  if (l.includes('deploy')) return '#39c';
  return '#888';
}

function objectiveBadge(s: string): string {
  const map: Record<string, string> = { proposed: '#ca0', approved: '#3a3', active: '#39c', retired: '#888' };
  const color = map[s.toLowerCase()] || '#888';
  return `<span style="display:inline-block;padding:.05rem .35rem;border-radius:.3rem;font-size:.7rem;background:${color};color:#fff">${esc(s)}</span>`;
}

function slotColor(slot: string): string {
  const m = slot.match(/slot-([A-Z])/);
  const idx = m ? m[1].charCodeAt(0) - 65 : 0;
  const palette = ['#39c', '#3a8', '#c63', '#a36', '#69a', '#c93', '#669', '#893'];
  return palette[idx % palette.length];
}

function taskStatusVisual(s: string): { color: string; emoji: string; label: string } {
  const l = s.toLowerCase();
  if (l === 'in_progress' || l === 'in-progress' || l === 'active') return { color: '#3a8', emoji: '⏳', label: l };
  if (l === 'in_review' || l === 'unit_verified') return { color: '#38a', emoji: '✅', label: l };
  if (l === 'design') return { color: '#a83', emoji: '🎨', label: l };
  if (l === 'ready') return { color: '#3a3', emoji: '🟢', label: l };
  if (l === 'hold') return { color: '#888', emoji: '⏸', label: l };
  if (l === 'seed') return { color: '#ca0', emoji: '🌱', label: l };
  return { color: '#888', emoji: '·', label: l };
}

function taskDomain(id: string): { color: string; emoji: string; label: string } {
  if (id.startsWith('TASK-WM-')) return { color: '#8b5fff', emoji: '🧙', label: 'WM' };
  if (id.startsWith('TASK-KL-')) return { color: '#3aa', emoji: '🧪', label: 'KL' };
  if (id.startsWith('TASK-YB-')) return { color: '#c83', emoji: '📣', label: 'YB' };
  if (id.startsWith('TASK-LIFE-')) return { color: '#a3a', emoji: '🌿', label: 'LIFE' };
  return { color: '#88a', emoji: '🛰', label: 'KAR' };
}

function renderProposalBody(raw: string): string {
  const escaped = esc(raw);
  const lines = escaped.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const m = line.match(/^\s*-\s+(.*)$/);
    if (m) {
      if (!inList) { out.push('<ul style="margin:.2rem 0 .2rem 1.1rem;padding:0;line-height:1.55">'); inList = true; }
      const inline = m[1]
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code style="background:rgba(127,127,127,.15);padding:0 .25rem;border-radius:.2rem">$1</code>');
      out.push(`<li>${inline}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(line.trim() === '' ? '<div style="height:.3rem"></div>' : `<div>${line}</div>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

export function buildTeamTab(container: HTMLElement): void {
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem;padding:1rem;font-size:.9rem;height:100%;overflow-y:auto;box-sizing:border-box">
      <header style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
        <h2 style="margin:0;font-size:1.1rem">${esc(t('cockpit.t05'))}</h2>
        <span class="at-meta" style="opacity:.6;font-size:.8rem;flex:1"></span>
        <label style="font-size:.78rem;opacity:.65;display:flex;align-items:center;gap:.25rem">
          <input class="at-autorefresh" type="checkbox" checked /> ${esc(t('cockpit.t06'))}
        </label>
        <button class="at-refresh" type="button" style="padding:.3rem .7rem">${esc(t('cockpit.t07'))}</button>
        <button class="at-cadence" type="button" style="padding:.3rem .7rem;background:#39c;color:#fff;border:0;border-radius:.25rem;cursor:pointer" title="${esc(t('cockpit.t01'))}">⚡ Dev</button>
        <button class="at-cadence-prod" type="button" style="padding:.3rem .7rem;background:#c63;color:#fff;border:0;border-radius:.25rem;cursor:pointer" title="${esc(t('cockpit.t02'))}">⚡ Prod</button>
      </header>
      <div class="at-cadence-out" style="display:none;font-size:.74rem;font-family:monospace;background:rgba(127,127,127,.1);padding:.5rem;border-radius:.3rem;white-space:pre-wrap;max-height:8rem;overflow:auto"></div>

      <section>
        <div style="display:flex;align-items:center;gap:.5rem;margin:0 0 .4rem">
          <h3 style="margin:0;font-size:.95rem;opacity:.85">${esc(t('cockpit.t08'))}<span class="at-count-tasks">-</span>)</h3>
          <input class="at-tasks-search" type="search" placeholder="${esc(t('cockpit.t03'))}" style="margin-left:auto;padding:.2rem .4rem;min-width:14rem;font-size:.78rem" />
        </div>
        <div class="at-tasks-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:.4rem"></div>
      </section>

      <section>
        <div style="display:flex;align-items:center;gap:.5rem;margin:0 0 .4rem">
          <h3 style="margin:0;font-size:.95rem;opacity:.85">${esc(t('cockpit.t09'))}<span class="at-count-proposals">-</span>)</h3>
          <input class="at-proposals-search" type="search" placeholder="${esc(t('cockpit.t04'))}" style="margin-left:auto;padding:.2rem .4rem;min-width:12rem;font-size:.78rem" />
        </div>
        <div class="at-proposals-list" style="display:flex;flex-direction:column;gap:.4rem"></div>
      </section>

      <section>
        <h3 style="margin:0 0 .4rem;font-size:.95rem;opacity:.85">${esc(t('cockpit.t10'))}<span class="at-count-agents">-</span>)</h3>
        <div class="at-roster-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.5rem"></div>
      </section>

      <section>
        <h3 style="margin:0 0 .4rem;font-size:.95rem;opacity:.85">${esc(t('cockpit.t11'))}<span class="at-count-sessions">-</span>)</h3>
        <div class="at-sessions-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.5rem"></div>
      </section>

      <section>
        <h3 style="margin:0 0 .4rem;font-size:.95rem;opacity:.85">${esc(t('cockpit.t12'))}<span class="at-count-objectives">-</span>)</h3>
        <div class="at-objectives-list" style="display:flex;flex-direction:column;gap:.3rem"></div>
      </section>

      <section>
        <h3 style="margin:0 0 .4rem;font-size:.95rem;opacity:.85">${esc(t('cockpit.t13'))}<span class="at-count-bus">-</span>)</h3>
        <div class="at-bus-list" style="display:flex;flex-direction:column;gap:.3rem"></div>
      </section>

      <div class="at-err" style="display:none;color:#e66;padding:.5rem;border:1px solid #e66;border-radius:.3rem;white-space:pre-wrap"></div>
    </div>
  `;

  const q = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel)!;
  const meta           = q<HTMLSpanElement>('.at-meta');
  const errBox         = q<HTMLDivElement>('.at-err');
  const refreshBtn     = q<HTMLButtonElement>('.at-refresh');
  const autoChk        = q<HTMLInputElement>('.at-autorefresh');
  const cadenceBtn     = q<HTMLButtonElement>('.at-cadence');
  const cadenceProdBtn = q<HTMLButtonElement>('.at-cadence-prod');
  const cadenceOut     = q<HTMLDivElement>('.at-cadence-out');
  const tasksList      = q<HTMLDivElement>('.at-tasks-list');
  const countTasks     = q<HTMLSpanElement>('.at-count-tasks');
  const tasksSearch    = q<HTMLInputElement>('.at-tasks-search');
  const proposalsList  = q<HTMLDivElement>('.at-proposals-list');
  const countProposals = q<HTMLSpanElement>('.at-count-proposals');
  const proposalsSearch= q<HTMLInputElement>('.at-proposals-search');
  const rosterList     = q<HTMLDivElement>('.at-roster-list');
  const countAgents    = q<HTMLSpanElement>('.at-count-agents');
  const sessionsList   = q<HTMLDivElement>('.at-sessions-list');
  const countSessions  = q<HTMLSpanElement>('.at-count-sessions');
  const objectivesList = q<HTMLDivElement>('.at-objectives-list');
  const countObjectives= q<HTMLSpanElement>('.at-count-objectives');
  const busList        = q<HTMLDivElement>('.at-bus-list');
  const countBus       = q<HTMLSpanElement>('.at-count-bus');

  let cachedTasks: TaskBoardEntry[] = [];
  let cachedProposals: ProposalInfo[] = [];
  let cachedRepoRoot: string | null = null;
  let intervalHandle: number | null = null;

  function renderAgents(rows: AgentInfo[]): void {
    countAgents.textContent = String(rows.length);
    rosterList.innerHTML = rows.map((a) => {
      const dot = statusDot(agentStatusColor(a.status));
      const emoji = a.emoji ? esc(a.emoji) + ' ' : '';
      const kind = a.kind ? `<span style="opacity:.6;font-size:.72rem;margin-left:.3rem">[${esc(a.kind)}]</span>` : '';
      const role = a.role ? `<div style="opacity:.7;font-size:.78rem;line-height:1.35;margin-top:.2rem">${esc(a.role)}</div>` : '';
      const count = a.activity_count > 0 ? t('cockpit.activityCount', { n: a.activity_count }) : '';
      return `<div style="padding:.5rem .65rem;border:1px solid rgba(127,127,127,.25);border-radius:.4rem;background:rgba(127,127,127,.05)">
        <div style="display:flex;align-items:center">${dot}<strong>${emoji}${esc(a.display_name || a.id)}</strong>${kind}
          <span style="margin-left:auto;font-size:.72rem;opacity:.55">${esc(a.id)}</span></div>
        ${role}
        <div style="margin-top:.25rem;font-size:.72rem;opacity:.6">📊 ${esc(relativeTime(a.last_activity_ts))}${count}</div>
      </div>`;
    }).join('');
  }

  function renderSessions(rows: SessionInfo[]): void {
    countSessions.textContent = String(rows.length);
    sessionsList.innerHTML = rows.map((s) => {
      const dot = statusDot(sessionStateColor(s.state));
      const topic = s.topic && s.topic !== '-' ? `<div style="opacity:.75;font-size:.78rem;margin-top:.25rem">${esc(s.topic)}</div>` : '';
      const task = s.task && s.task !== '-' ? `<span style="font-size:.72rem;opacity:.7;margin-left:.4rem">${esc(s.task)}</span>` : '';
      return `<div style="padding:.5rem .65rem;border:1px solid rgba(127,127,127,.25);border-radius:.4rem;background:rgba(127,127,127,.05)">
        <div style="display:flex;align-items:center">${dot}<strong>slot-${esc(s.name)}</strong>${task}
          <span style="margin-left:auto;font-size:.7rem;opacity:.55">${esc(s.started_kst)}</span></div>
        ${topic}
        <div style="font-size:.7rem;opacity:.5;margin-top:.2rem;font-family:monospace">${esc(s.state)}</div>
      </div>`;
    }).join('');
  }

  function renderObjectives(rows: ObjectiveInfo[]): void {
    countObjectives.textContent = String(rows.length);
    objectivesList.innerHTML = rows.map((o) =>
      `<div style="display:flex;align-items:flex-start;gap:.5rem;padding:.4rem .55rem;border:1px solid rgba(127,127,127,.2);border-radius:.3rem">
        <span style="font-family:monospace;font-size:.78rem;opacity:.7;min-width:4.5rem">${esc(o.id)}</span>
        ${objectiveBadge(o.status)}
        <span style="flex:1;line-height:1.4">${esc(o.goal)}</span>
        <span style="font-size:.7rem;opacity:.55;font-family:monospace">${esc(o.align)}</span>
      </div>`
    ).join('');
  }

  function renderBus(rows: BusEntry[]): void {
    countBus.textContent = String(rows.length);
    if (rows.length === 0) { busList.innerHTML = t('cockpit.t20'); return; }
    busList.innerHTML = rows.map((b) => {
      const color = slotColor(b.slot);
      const preview = b.body_preview
        ? `<div style="margin-top:.2rem;font-size:.76rem;opacity:.75;line-height:1.45;white-space:pre-wrap;max-height:6em;overflow:hidden">${esc(b.body_preview)}</div>`
        : '';
      return `<div style="padding:.4rem .55rem;border:1px solid rgba(127,127,127,.2);border-radius:.3rem;border-left:3px solid ${color}">
        <div style="display:flex;align-items:center;gap:.4rem">
          <span style="font-size:.7rem;padding:.05rem .3rem;border-radius:.2rem;background:${color};color:#fff;font-family:monospace">${esc(b.slot)}</span>
          <strong style="flex:1;font-size:.82rem;line-height:1.4">${esc(b.headline)}</strong>
          <span style="font-size:.66rem;opacity:.55;font-family:monospace">${esc(b.ts)}</span>
        </div>${preview}
      </div>`;
    }).join('');
  }

  function renderTasks(rows: TaskBoardEntry[]): void {
    const sq = tasksSearch.value.trim().toLowerCase();
    const filtered = sq ? rows.filter((task) => (task.task_id + ' ' + task.title + ' ' + task.status).toLowerCase().includes(sq)) : rows;
    countTasks.textContent = rows.length === filtered.length ? String(rows.length) : `${filtered.length}/${rows.length}`;
    if (filtered.length === 0) { tasksList.innerHTML = t('cockpit.t21'); return; }
    tasksList.innerHTML = filtered.map((task) => {
      const sv = taskStatusVisual(task.status);
      const dv = taskDomain(task.task_id);
      return `<div style="padding:.55rem .7rem;border:1px solid rgba(127,127,127,.25);border-radius:.4rem;background:rgba(127,127,127,.05)">
        <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap">
          <span style="background:${dv.color};color:#fff;padding:.05rem .35rem;border-radius:.25rem;font-size:.7rem">${dv.emoji} ${dv.label}</span>
          <strong style="font-family:monospace;font-size:.82rem">${esc(task.task_id)}</strong>
          <span style="background:${sv.color};color:#fff;padding:.05rem .35rem;border-radius:.25rem;font-size:.7rem">${sv.emoji} ${esc(sv.label)}</span>
        </div>
        <div style="margin-top:.25rem;font-size:.82rem;line-height:1.35">${esc(task.title)}</div>
        <div style="margin-top:.2rem;font-size:.7rem;opacity:.5;font-family:monospace">${esc(task.md_path)}</div>
      </div>`;
    }).join('');
  }

  function renderProposals(rows: ProposalInfo[]): void {
    cachedProposals = rows;
    let pending = rows.filter((p) => !p.decided);
    const pq = proposalsSearch.value.trim().toLowerCase();
    if (pq) pending = pending.filter((p) => `${p.title ?? ''} ${p.body ?? ''} ${p.domain ?? ''} ${p.id}`.toLowerCase().includes(pq));
    countProposals.textContent = pq ? `${pending.length}/${rows.filter((p) => !p.decided).length}` : String(pending.length);
    if (pending.length === 0) { proposalsList.innerHTML = t('cockpit.t22'); return; }
    proposalsList.innerHTML = pending.slice(0, 12).map((p) => {
      const title = p.title || p.id;
      const domain = p.domain ? `<span style="padding:.05rem .3rem;border-radius:.25rem;font-size:.66rem;background:rgba(127,127,127,.25);font-family:monospace">${esc(p.domain)}</span>` : '';
      const body = p.body
        ? `<details style="margin-top:.3rem"><summary style="cursor:pointer;font-size:.78rem;opacity:.7">${esc(t('cockpit.t14'))}</summary><div style="font-size:.82rem;margin:.3rem 0 0;opacity:.9">${renderProposalBody(p.body)}</div></details>`
        : '';
      return `<div class="at-prop" data-id="${esc(p.id)}" style="padding:.5rem .65rem;border:1px solid rgba(127,127,127,.25);border-radius:.4rem;background:rgba(127,127,127,.05)">
        <div style="display:flex;align-items:center;gap:.4rem">${domain}
          <strong style="flex:1;line-height:1.4">${esc(title)}</strong>
          <span style="font-size:.66rem;opacity:.5;font-family:monospace">${esc(p.id)}</span></div>
        ${body}
        <div style="display:flex;gap:.3rem;margin-top:.4rem">
          <button data-decision="approved" type="button" style="padding:.25rem .55rem;font-size:.78rem;background:#3a3;color:#fff;border:0;border-radius:.25rem;cursor:pointer">${esc(t('cockpit.t15'))}</button>
          <button data-decision="rejected" type="button" style="padding:.25rem .55rem;font-size:.78rem;background:#c44;color:#fff;border:0;border-radius:.25rem;cursor:pointer">${esc(t('cockpit.t16'))}</button>
          <button data-decision="deferred" type="button" style="padding:.25rem .55rem;font-size:.78rem;background:#888;color:#fff;border:0;border-radius:.25rem;cursor:pointer">${esc(t('cockpit.t17'))}</button>
          <span class="at-prop-msg" style="margin-left:.3rem;font-size:.72rem;opacity:.7;align-self:center"></span>
        </div>
      </div>`;
    }).join('');
    proposalsList.querySelectorAll<HTMLButtonElement>('button[data-decision]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest<HTMLDivElement>('.at-prop');
        if (!card) return;
        const id = card.dataset.id || '';
        const decision = btn.dataset.decision || '';
        const msgSpan = card.querySelector<HTMLSpanElement>('.at-prop-msg');
        if (msgSpan) msgSpan.textContent = t('cockpit.t23');
        card.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = true));
        try {
          await tauriInvoke('agent_team_decide_proposal', { repoRoot: cachedRepoRoot, id, decision, note: 'karmoapp-gui' });
          if (msgSpan) msgSpan.textContent = t('cockpit.decisionSaved', { decision });
          void load();
        } catch (e) {
          if (msgSpan) msgSpan.textContent = t('cockpit.failed', { why: String(e) });
          card.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = false));
        }
      });
    });
  }

  async function load(): Promise<void> {
    errBox.style.display = 'none';
    try {
      const repoRoot = (await tauriInvoke('localdev_get_repo_root')) as string | null;
      if (!repoRoot) {
        errBox.style.display = 'block';
        errBox.textContent = t('cockpit.t24');
        return;
      }
      cachedRepoRoot = repoRoot;
      const [agents, objectives, sessions, proposals, bus, cards, tasks] = (await Promise.all([
        tauriInvoke('agent_team_list_agents', { repoRoot }),
        tauriInvoke('agent_team_list_objectives', { repoRoot }),
        tauriInvoke('agent_team_list_sessions', { repoRoot }),
        tauriInvoke('agent_team_list_proposals', { repoRoot }),
        tauriInvoke('agent_team_list_bus', { repoRoot, limit: 15 }),
        tauriInvoke('agent_team_list_cards', { repoRoot, limit: 240 }),
        tauriInvoke('agent_team_list_tasks', { repoRoot }),
      ])) as [AgentInfo[], ObjectiveInfo[], SessionInfo[], ProposalInfo[], BusEntry[], CardInfo[], TaskBoardEntry[]];

      renderAgents(agents);
      renderObjectives(objectives);
      renderSessions(sessions);
      renderProposals(proposals);
      renderBus(bus);
      cachedTasks = tasks;
      renderTasks(tasks);

      const now = Date.now();
      const last24h = (cards as CardInfo[]).filter((c) => { const ms = new Date(c.ts).getTime(); return !isNaN(ms) && now - ms < 86_400_000; }).length;
      const activeAgents = (agents as AgentInfo[]).filter((a) => (a.status || '').toLowerCase() === 'active').length;
      const pendingProposals = (proposals as ProposalInfo[]).filter((p) => !p.decided).length;
      const liveSessions = (sessions as SessionInfo[]).filter((s) => /in_progress|active|deploy/i.test(s.state)).length;
      const time = new Date().toLocaleTimeString(locale(), { hour12: false });
      const repoShort = repoRoot.split(/[\\/]/).slice(-2).join('/');
      meta.innerHTML = t('cockpit.statusLine', { time: esc(time), repo: esc(repoShort), cores: activeAgents, sessions: liveSessions, pending: pendingProposals, tasks: tasks.length, last24h });
    } catch (e) {
      errBox.style.display = 'block';
      errBox.textContent = t('cockpit.loadFailed', { why: String(e) });
    }
  }

  function applyAutoRefresh(): void {
    if (intervalHandle !== null) { clearInterval(intervalHandle); intervalHandle = null; }
    if (autoChk.checked) intervalHandle = window.setInterval(() => void load(), REFRESH_MS);
  }

  async function runCadence(target: 'dev' | 'prod', btn: HTMLButtonElement): Promise<void> {
    if (!cachedRepoRoot) { cadenceOut.style.display = 'block'; cadenceOut.textContent = t('cockpit.t25'); return; }
    const cmd = target === 'prod' ? 'agent_team_run_cadence_tick_prod' : 'agent_team_run_cadence_tick';
    const label = target === 'prod' ? '⚡ Prod' : '⚡ Dev';
    btn.disabled = true;
    const orig = btn.textContent || label;
    btn.textContent = t('cockpit.t26');
    cadenceOut.style.display = 'block';
    cadenceOut.textContent = `${label} cadence 실행 중...`;
    try {
      const r = (await tauriInvoke(cmd, { repoRoot: cachedRepoRoot, includeWorker: false })) as {
        ok: boolean; elapsed_ms: number; stdout_tail: string; stderr_tail: string; exit_code: number | null;
      };
      const head = r.ok ? `✓ ${label} OK (${r.elapsed_ms}ms, exit=${r.exit_code ?? '?'})` : `✗ ${label} FAIL (${r.elapsed_ms}ms, exit=${r.exit_code ?? '?'})`;
      cadenceOut.textContent = `${head}\n--- stdout ---\n${r.stdout_tail}\n--- stderr ---\n${r.stderr_tail}`;
      void load();
    } catch (e) {
      cadenceOut.textContent = t('cockpit.actionFailed', { label, why: String(e) });
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  tasksSearch.addEventListener('input', () => renderTasks(cachedTasks));
  proposalsSearch.addEventListener('input', () => renderProposals(cachedProposals));
  refreshBtn.addEventListener('click', () => void load());
  autoChk.addEventListener('change', applyAutoRefresh);
  cadenceBtn.addEventListener('click', () => void runCadence('dev', cadenceBtn));
  cadenceProdBtn.addEventListener('click', () => void runCadence('prod', cadenceProdBtn));

  void load();
  applyAutoRefresh();
}
