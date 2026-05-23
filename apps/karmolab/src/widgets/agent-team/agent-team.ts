/**
 * KarmoApp 에이전트 팀 운영 콘솔 — TASK-KAR-116-A (Phase 1 PoC, read-only).
 *
 * 데이터 정본 (Rust agent_team.rs 가 read):
 *   - roster: memo/.claude/agents/<id>/core.md frontmatter
 *   - objectives: memo/.claude/objectives.md
 *   - sessions: memo/.claude/active-sessions.md
 *
 * Phase 2 (KAR-116-C) = 액션 (cadence run / proposal decide) via yawnbot HTTP.
 * Phase 3 (KAR-116-B, KAR-112 흡수) = agent-driven Canvas 패널.
 */
import { invoke as tauriInvoke } from '../../tauri-bridge';

(function (): void {
  'use strict';

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

  type CardInfo = {
    ts: string;
    source: string;
    session?: string;
    kind?: string;
    topic?: string;
    summary: string;
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
  };

  // TASK-YB-039: Core/skin 분리 — memo TASK md = Core, KarmoLab/Discord = peer skin.
  // Rust agent_team_list_tasks 가 5 TASK_DIRS scan + bridge ledger 머지 후 반환.
  type TaskBoardEntry = {
    task_id: string;
    status: string;
    title: string;
    md_path: string;
    discord_post_id?: string;
    discord_channel_id?: string;
  };

  const REFRESH_INTERVAL_MS = 5000;

  const isApp = typeof Toolbox.isDesktopApp === 'function' && Toolbox.isDesktopApp();

  function build(container: HTMLElement): void {
    if (!isApp) {
      container.innerHTML =
        '<div style="padding:1.5rem;opacity:.7;line-height:1.6">에이전트 팀 콘솔은 데스크톱 앱(KarmoLab Tauri) 전용입니다.<br>브라우저에서는 표시되지 않습니다.</div>';
      return;
    }

    container.innerHTML = `
      <div class="agent-team-root" style="display:flex;flex-direction:column;gap:1rem;padding:1rem;font-size:.9rem;height:100%;overflow-y:auto;box-sizing:border-box">
        <header style="display:flex;align-items:center;gap:.75rem">
          <h2 style="margin:0;font-size:1.1rem">🛰 에이전트 팀</h2>
          <span class="at-meta" style="opacity:.6;font-size:.8rem"></span>
          <label style="font-size:.78rem;opacity:.65;display:flex;align-items:center;gap:.25rem;margin-left:auto">
            <input class="at-autorefresh" type="checkbox" checked /> 자동 5초
          </label>
          <button class="at-refresh" type="button" style="padding:.3rem .7rem">새로고침</button>
          <button class="at-cadence" type="button" title="로컬 데스크톱 yawnbot dev 인스턴스 cadence 1회 (yawnbot dist 빌드 필요)" style="padding:.3rem .7rem;background:#39c;color:#fff;border:0;border-radius:.25rem;cursor:pointer">⚡ Dev</button>
          <button class="at-cadence-prod" type="button" title="노트북 yawnbot-prod cadence 1회 (laptop-ops 게이트웨이 우회, ~/.laptop-ops-token 필요)" style="padding:.3rem .7rem;background:#c63;color:#fff;border:0;border-radius:.25rem;cursor:pointer">⚡ Prod</button>
        </header>
        <div class="at-cadence-out" style="display:none;font-size:.74rem;font-family:monospace;background:rgba(127,127,127,.1);padding:.5rem;border-radius:.3rem;white-space:pre-wrap;max-height:8rem;overflow:auto"></div>
        <section class="at-section at-tasks">
          <div style="display:flex;align-items:center;gap:.5rem;margin:0 0 .4rem 0">
            <h3 style="margin:0;font-size:.95rem;opacity:.85">📋 작업중 TASK (<span class="at-count-tasks">-</span>)</h3>
            <input class="at-tasks-search" type="search" placeholder="TASK 검색 (id·제목·status·domain)" style="margin-left:auto;padding:.2rem .4rem;min-width:14rem;font-size:.78rem" />
          </div>
          <div class="at-list at-tasks-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:.4rem"></div>
        </section>
        <section class="at-section at-proposals">
          <div style="display:flex;align-items:center;gap:.5rem;margin:0 0 .4rem 0">
            <h3 style="margin:0;font-size:.95rem;opacity:.85">📮 결재 대기 (<span class="at-count-proposals">-</span>)</h3>
            <input class="at-proposals-search" type="search" placeholder="제안 검색 (제목·본문·domain)" style="margin-left:auto;padding:.2rem .4rem;min-width:12rem;font-size:.78rem" />
          </div>
          <div class="at-list at-proposals-list" style="display:flex;flex-direction:column;gap:.4rem"></div>
        </section>
        <section class="at-section at-roster">
          <h3 style="margin:0 0 .4rem 0;font-size:.95rem;opacity:.85">코어 (<span class="at-count-agents">-</span>)</h3>
          <div class="at-list at-roster-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.5rem"></div>
        </section>
        <section class="at-section at-sessions">
          <h3 style="margin:0 0 .4rem 0;font-size:.95rem;opacity:.85">활성 Claude 세션 (<span class="at-count-sessions">-</span>)</h3>
          <div class="at-list at-sessions-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.5rem"></div>
        </section>
        <section class="at-section at-objectives">
          <h3 style="margin:0 0 .4rem 0;font-size:.95rem;opacity:.85">목표 (Objectives) (<span class="at-count-objectives">-</span>)</h3>
          <div class="at-list at-objectives-list" style="display:flex;flex-direction:column;gap:.3rem"></div>
        </section>
        <section class="at-section at-bus">
          <h3 style="margin:0 0 .4rem 0;font-size:.95rem;opacity:.85">💬 슬롯 간 메시지 (<span class="at-count-bus">-</span>)</h3>
          <div class="at-list at-bus-list" style="display:flex;flex-direction:column;gap:.3rem"></div>
        </section>
        <div class="at-err" style="display:none;color:#e66;padding:.5rem;border:1px solid #e66;border-radius:.3rem;white-space:pre-wrap"></div>
      </div>
    `;

    const meta = container.querySelector<HTMLSpanElement>('.at-meta')!;
    const errBox = container.querySelector<HTMLDivElement>('.at-err')!;
    const refreshBtn = container.querySelector<HTMLButtonElement>('.at-refresh')!;
    const autoChk = container.querySelector<HTMLInputElement>('.at-autorefresh')!;
    const proposalsList = container.querySelector<HTMLDivElement>('.at-proposals-list')!;
    const rosterList = container.querySelector<HTMLDivElement>('.at-roster-list')!;
    const sessionsList = container.querySelector<HTMLDivElement>('.at-sessions-list')!;
    const objectivesList = container.querySelector<HTMLDivElement>('.at-objectives-list')!;
    const busList = container.querySelector<HTMLDivElement>('.at-bus-list')!;
    const countProposals = container.querySelector<HTMLSpanElement>('.at-count-proposals')!;
    const countAgents = container.querySelector<HTMLSpanElement>('.at-count-agents')!;
    const countSessions = container.querySelector<HTMLSpanElement>('.at-count-sessions')!;
    const countObjectives = container.querySelector<HTMLSpanElement>('.at-count-objectives')!;
    const countBus = container.querySelector<HTMLSpanElement>('.at-count-bus')!;
    const tasksList = container.querySelector<HTMLDivElement>('.at-tasks-list')!;
    const countTasks = container.querySelector<HTMLSpanElement>('.at-count-tasks')!;
    const tasksSearch = container.querySelector<HTMLInputElement>('.at-tasks-search')!;
    let cachedTasks: TaskBoardEntry[] = [];

    let intervalHandle: number | null = null;
    let cachedRepoRoot: string | null = null;
    let cachedProposals: ProposalInfo[] = [];
    const proposalsSearch = container.querySelector<HTMLInputElement>('.at-proposals-search')!;

    function statusColor(s: string | undefined): string {
      switch ((s || '').toLowerCase()) {
        case 'active':
          return '#3a3';
        case 'draft':
          return '#ca0';
        case 'inactive':
        case 'retired':
          return '#888';
        default:
          return '#888';
      }
    }

    function escapeHtml(s: string): string {
      return s.replace(/[&<>"']/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
      );
    }

    function relativeTime(iso: string | undefined): string {
      if (!iso) return '활동 없음';
      const t = new Date(iso).getTime();
      if (isNaN(t)) return iso.slice(0, 16);
      const diffMs = Date.now() - t;
      if (diffMs < 60_000) return '방금';
      const m = Math.floor(diffMs / 60_000);
      if (m < 60) return `${m}분 전`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}시간 전`;
      const d = Math.floor(h / 24);
      if (d < 14) return `${d}일 전`;
      return iso.slice(0, 10);
    }

    function renderAgents(rows: AgentInfo[]): void {
      countAgents.textContent = String(rows.length);
      rosterList.innerHTML = rows
        .map((a) => {
          const dot = `<span style="display:inline-block;width:.5rem;height:.5rem;border-radius:50%;background:${statusColor(
            a.status
          )};margin-right:.3rem"></span>`;
          const name = escapeHtml(a.display_name || a.id);
          const emoji = a.emoji ? escapeHtml(a.emoji) + ' ' : '';
          const role = a.role ? `<div style="opacity:.7;font-size:.78rem;line-height:1.35;margin-top:.2rem">${escapeHtml(a.role)}</div>` : '';
          const kind = a.kind ? `<span style="opacity:.6;font-size:.72rem;margin-left:.3rem">[${escapeHtml(a.kind)}]</span>` : '';
          const lastSeen = a.last_activity_ts ? relativeTime(a.last_activity_ts) : '활동 없음';
          const countLabel = a.activity_count > 0 ? `·${a.activity_count}건` : '';
          return `
            <div style="padding:.5rem .65rem;border:1px solid rgba(127,127,127,.25);border-radius:.4rem;background:rgba(127,127,127,.05)">
              <div style="display:flex;align-items:center">
                ${dot}<strong>${emoji}${name}</strong>${kind}
                <span style="margin-left:auto;font-size:.72rem;opacity:.55">${escapeHtml(a.id)}</span>
              </div>
              ${role}
              <div style="margin-top:.25rem;font-size:.72rem;opacity:.6;display:flex;gap:.3rem">
                <span>📊 ${escapeHtml(lastSeen)}${countLabel}</span>
              </div>
            </div>`;
        })
        .join('');
    }

    function sessionStateColor(s: string): string {
      const low = s.toLowerCase();
      if (low.includes('in_progress') || low.includes('active')) return '#3a8';
      if (low.includes('pending') || low === '-') return '#888';
      if (low.includes('deploy')) return '#39c';
      return '#888';
    }

    function renderSessions(rows: SessionInfo[]): void {
      countSessions.textContent = String(rows.length);
      sessionsList.innerHTML = rows
        .map((s) => {
          const dot = `<span style="display:inline-block;width:.5rem;height:.5rem;border-radius:50%;background:${sessionStateColor(
            s.state
          )};margin-right:.3rem"></span>`;
          const topic = s.topic && s.topic !== '-' ? `<div style="opacity:.75;font-size:.78rem;margin-top:.25rem">${escapeHtml(s.topic)}</div>` : '';
          const task = s.task && s.task !== '-' ? `<span style="font-size:.72rem;opacity:.7;margin-left:.4rem">${escapeHtml(s.task)}</span>` : '';
          return `
            <div style="padding:.5rem .65rem;border:1px solid rgba(127,127,127,.25);border-radius:.4rem;background:rgba(127,127,127,.05)">
              <div style="display:flex;align-items:center">
                ${dot}<strong>slot-${escapeHtml(s.name)}</strong>${task}
                <span style="margin-left:auto;font-size:.7rem;opacity:.55">${escapeHtml(s.started_kst)}</span>
              </div>
              ${topic}
              <div style="font-size:.7rem;opacity:.5;margin-top:.2rem;font-family:monospace">${escapeHtml(s.state)}</div>
            </div>`;
        })
        .join('');
    }

    function objectiveStatusBadge(s: string): string {
      const map: Record<string, string> = {
        proposed: '#ca0',
        approved: '#3a3',
        active: '#39c',
        retired: '#888'
      };
      const color = map[s.toLowerCase()] || '#888';
      return `<span style="display:inline-block;padding:.05rem .35rem;border-radius:.3rem;font-size:.7rem;background:${color};color:#fff">${escapeHtml(s)}</span>`;
    }

    function renderObjectives(rows: ObjectiveInfo[]): void {
      countObjectives.textContent = String(rows.length);
      objectivesList.innerHTML = rows
        .map(
          (o) => `
        <div style="display:flex;align-items:flex-start;gap:.5rem;padding:.4rem .55rem;border:1px solid rgba(127,127,127,.2);border-radius:.3rem">
          <span style="font-family:monospace;font-size:.78rem;opacity:.7;min-width:4.5rem">${escapeHtml(o.id)}</span>
          ${objectiveStatusBadge(o.status)}
          <span style="flex:1;line-height:1.4">${escapeHtml(o.goal)}</span>
          <span style="font-size:.7rem;opacity:.55;font-family:monospace">${escapeHtml(o.align)}</span>
        </div>`
        )
        .join('');
    }

    function slotColor(slot: string): string {
      // slot-A/B/C/D/E/F ... 안정적 hash → 색상
      const m = slot.match(/slot-([A-Z])/);
      const idx = m ? m[1].charCodeAt(0) - 65 : 0;
      const palette = ['#39c', '#3a8', '#c63', '#a36', '#69a', '#c93', '#669', '#893'];
      return palette[idx % palette.length];
    }

    function renderBus(rows: BusEntry[]): void {
      countBus.textContent = String(rows.length);
      if (rows.length === 0) {
        busList.innerHTML =
          '<div style="opacity:.5;padding:.3rem .5rem;font-size:.8rem">슬롯 간 메시지 없음</div>';
        return;
      }
      busList.innerHTML = rows
        .map((b) => {
          const color = slotColor(b.slot);
          const preview = b.body_preview
            ? `<div style="margin-top:.2rem;font-size:.76rem;opacity:.75;line-height:1.45;white-space:pre-wrap;max-height:6em;overflow:hidden;text-overflow:ellipsis">${escapeHtml(b.body_preview)}</div>`
            : '';
          return `
            <div style="padding:.4rem .55rem;border:1px solid rgba(127,127,127,.2);border-radius:.3rem;border-left:3px solid ${color}">
              <div style="display:flex;align-items:center;gap:.4rem">
                <span style="font-size:.7rem;padding:.05rem .3rem;border-radius:.2rem;background:${color};color:#fff;font-family:monospace">${escapeHtml(b.slot)}</span>
                <strong style="flex:1;font-size:.82rem;line-height:1.4">${escapeHtml(b.headline)}</strong>
                <span style="font-size:.66rem;opacity:.55;font-family:monospace">${escapeHtml(b.ts)}</span>
              </div>
              ${preview}
            </div>`;
        })
        .join('');
    }

    // TASK-YB-039: 상태별 색·이모지 (Discord forum 태그와 정합).
    function taskStatusVisual(s: string): { color: string; emoji: string; label: string } {
      const l = s.toLowerCase();
      if (l === 'in_progress' || l === 'in-progress' || l === 'active')
        return { color: '#3a8', emoji: '⏳', label: l };
      if (l === 'in_review' || l === 'unit_verified')
        return { color: '#38a', emoji: '✅', label: l };
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

    function renderTasks(rows: TaskBoardEntry[]): void {
      const q = tasksSearch.value.trim().toLowerCase();
      const filtered = q
        ? rows.filter((t) =>
            (t.task_id + ' ' + t.title + ' ' + t.status).toLowerCase().includes(q),
          )
        : rows;
      countTasks.textContent =
        rows.length === filtered.length ? String(rows.length) : `${filtered.length}/${rows.length}`;
      if (filtered.length === 0) {
        tasksList.innerHTML =
          '<div style="opacity:.55;font-size:.82rem;padding:.5rem">진행 중 TASK 없음 (ledger 비었거나 검색 매치 0).</div>';
        return;
      }
      tasksList.innerHTML = filtered
        .map((t) => {
          const sv = taskStatusVisual(t.status);
          const dv = taskDomain(t.task_id);
          const discordLink = t.discord_post_id
            ? `<a href="#" class="at-task-discord" data-post="${escapeHtml(t.discord_post_id)}" data-ch="${escapeHtml(t.discord_channel_id || '')}" style="font-size:.72rem;opacity:.7;text-decoration:none">🔗 디코</a>`
            : '<span style="font-size:.72rem;opacity:.4">디코 미연결</span>';
          return `
            <div style="padding:.55rem .7rem;border:1px solid rgba(127,127,127,.25);border-radius:.4rem;background:rgba(127,127,127,.05)">
              <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap">
                <span style="background:${dv.color};color:#fff;padding:.05rem .35rem;border-radius:.25rem;font-size:.7rem">${dv.emoji} ${dv.label}</span>
                <strong style="font-family:monospace;font-size:.82rem">${escapeHtml(t.task_id)}</strong>
                <span style="background:${sv.color};color:#fff;padding:.05rem .35rem;border-radius:.25rem;font-size:.7rem">${sv.emoji} ${escapeHtml(sv.label)}</span>
                <span style="margin-left:auto">${discordLink}</span>
              </div>
              <div style="margin-top:.25rem;font-size:.82rem;line-height:1.35">${escapeHtml(t.title)}</div>
              <div style="margin-top:.2rem;font-size:.7rem;opacity:.5;font-family:monospace">${escapeHtml(t.md_path)}</div>
            </div>`;
        })
        .join('');
      // 디코 링크 click → discord:// 또는 https 우회 (Discord deep link)
      tasksList.querySelectorAll<HTMLAnchorElement>('.at-task-discord').forEach((a) => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          const post = a.dataset.post || '';
          const ch = a.dataset.ch || '';
          if (!post || !ch) return;
          // Discord forum-post = thread → URL `https://discord.com/channels/<guild>/<channelOrThreadId>`
          // forum-post 의 starter msg id == thread id == postId.
          // guild id 추적 불요 — discord.com 이 자동 라우팅 (channelId 가 unique).
          window.open(`https://discord.com/channels/@me/${post}`, '_blank');
        });
      });
    }

    tasksSearch.addEventListener('input', () => renderTasks(cachedTasks));

    function renderProposalBody(raw: string): string {
      // 단순 markdown 렌더 — 제안서 본문이 `- ...` 불릿 위주. 안전 1차 escape 후 가벼운 변환.
      const escaped = escapeHtml(raw);
      const lines = escaped.split(/\r?\n/);
      const out: string[] = [];
      let inList = false;
      for (const line of lines) {
        const m = line.match(/^\s*-\s+(.*)$/);
        if (m) {
          if (!inList) {
            out.push('<ul style="margin:.2rem 0 .2rem 1.1rem;padding:0;line-height:1.55">');
            inList = true;
          }
          // **bold** 와 `code` 만 인라인 처리 (안전 escape 이후이므로 token 만 매치).
          const inline = m[1]
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code style="background:rgba(127,127,127,.15);padding:0 .25rem;border-radius:.2rem">$1</code>');
          out.push(`<li>${inline}</li>`);
        } else {
          if (inList) {
            out.push('</ul>');
            inList = false;
          }
          if (line.trim() === '') {
            out.push('<div style="height:.3rem"></div>');
          } else {
            out.push(`<div>${line}</div>`);
          }
        }
      }
      if (inList) out.push('</ul>');
      return out.join('');
    }

    function renderProposals(rows: ProposalInfo[]): void {
      cachedProposals = rows;
      let pending = rows.filter((p) => !p.decided);
      const q = proposalsSearch.value.trim().toLowerCase();
      if (q) {
        pending = pending.filter((p) => {
          const hay = `${p.title ?? ''} ${p.body ?? ''} ${p.domain ?? ''} ${p.id}`.toLowerCase();
          return hay.includes(q);
        });
      }
      countProposals.textContent = q ? `${pending.length}/${rows.filter((p) => !p.decided).length}` : String(pending.length);
      if (pending.length === 0) {
        proposalsList.innerHTML =
          '<div style="opacity:.5;padding:.3rem .5rem;font-size:.8rem">결재 대기 없음</div>';
        return;
      }
      proposalsList.innerHTML = pending
        .slice(0, 12)
        .map((p) => {
          const title = p.title || p.id;
          const domain = p.domain
            ? `<span style="display:inline-block;padding:.05rem .3rem;border-radius:.25rem;font-size:.66rem;background:rgba(127,127,127,.25);font-family:monospace">${escapeHtml(p.domain)}</span>`
            : '';
          const body = p.body
            ? `<details style="margin-top:.3rem"><summary style="cursor:pointer;font-size:.78rem;opacity:.7">본문 펴기</summary><div style="font-size:.82rem;margin:.3rem 0 0 0;opacity:.9">${renderProposalBody(p.body)}</div></details>`
            : '';
          return `
            <div class="at-prop" data-id="${escapeHtml(p.id)}" style="padding:.5rem .65rem;border:1px solid rgba(127,127,127,.25);border-radius:.4rem;background:rgba(127,127,127,.05)">
              <div style="display:flex;align-items:center;gap:.4rem">
                ${domain}
                <strong style="flex:1;line-height:1.4">${escapeHtml(title)}</strong>
                <span style="font-size:.66rem;opacity:.5;font-family:monospace">${escapeHtml(p.id)}</span>
              </div>
              ${body}
              <div style="display:flex;gap:.3rem;margin-top:.4rem">
                <button data-decision="approved" type="button" style="padding:.25rem .55rem;font-size:.78rem;background:#3a3;color:#fff;border:0;border-radius:.25rem;cursor:pointer">✓ 승인</button>
                <button data-decision="rejected" type="button" style="padding:.25rem .55rem;font-size:.78rem;background:#c44;color:#fff;border:0;border-radius:.25rem;cursor:pointer">✗ 거절</button>
                <button data-decision="deferred" type="button" style="padding:.25rem .55rem;font-size:.78rem;background:#888;color:#fff;border:0;border-radius:.25rem;cursor:pointer">⏸ 보류</button>
                <span class="at-prop-msg" style="margin-left:.3rem;font-size:.72rem;opacity:.7;align-self:center"></span>
              </div>
            </div>`;
        })
        .join('');

      proposalsList.querySelectorAll<HTMLButtonElement>('button[data-decision]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const card = btn.closest<HTMLDivElement>('.at-prop');
          if (!card) return;
          const id = card.dataset.id || '';
          const decision = btn.dataset.decision || '';
          const msgSpan = card.querySelector<HTMLSpanElement>('.at-prop-msg');
          if (msgSpan) msgSpan.textContent = '처리 중...';
          card.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = true));
          try {
            await tauriInvoke('agent_team_decide_proposal', {
              repoRoot: cachedRepoRoot,
              id,
              decision,
              note: 'karmoapp-gui'
            });
            if (msgSpan) msgSpan.textContent = `✓ ${decision} 기록 완료`;
            void load();
          } catch (e) {
            if (msgSpan) msgSpan.textContent = `실패: ${String(e)}`;
            card.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = false));
          }
        });
      });
    }

    async function load(): Promise<void> {
      errBox.style.display = 'none';
      errBox.textContent = '';
      try {
        const repoRoot = (await tauriInvoke('localdev_get_repo_root')) as string | null;
        if (!repoRoot) {
          errBox.style.display = 'block';
          errBox.textContent = 'repo_root 미설정 — 서버 모니터 위젯에서 먼저 repo 폴더 선택해주세요.';
          meta.textContent = '';
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

        // 24h 카드 카운트 (활동 펄스)
        const now = Date.now();
        const last24h = cards.filter((c) => {
          const t = new Date(c.ts).getTime();
          return !isNaN(t) && now - t < 24 * 3600 * 1000;
        }).length;
        const activeAgents = agents.filter((a) => (a.status || '').toLowerCase() === 'active').length;
        const pendingProposals = proposals.filter((p) => !p.decided).length;
        const liveSessions = sessions.filter((s) => /in_progress|active|deploy/i.test(s.state)).length;

        const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        const repoShort = repoRoot.split(/[\\/]/).slice(-2).join('/');
        meta.innerHTML = `<span>${time} KST · repo=${escapeHtml(repoShort)}</span>
          <span style="margin-left:.75rem">🟢 ${activeAgents}코어</span>
          <span style="margin-left:.4rem">💼 ${liveSessions}세션</span>
          <span style="margin-left:.4rem">📮 ${pendingProposals}대기</span>
          <span style="margin-left:.4rem">📋 ${tasks.length}TASK</span>
          <span style="margin-left:.4rem">📈 24h ${last24h}</span>`;
      } catch (e) {
        errBox.style.display = 'block';
        errBox.textContent = `로드 실패: ${String(e)}`;
      }
    }

    function applyAutoRefresh(): void {
      if (intervalHandle !== null) {
        clearInterval(intervalHandle);
        intervalHandle = null;
      }
      if (autoChk.checked) {
        intervalHandle = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
      }
    }

    const cadenceBtn = container.querySelector<HTMLButtonElement>('.at-cadence')!;
    const cadenceProdBtn = container.querySelector<HTMLButtonElement>('.at-cadence-prod')!;
    const cadenceOut = container.querySelector<HTMLDivElement>('.at-cadence-out')!;

    async function runCadence(target: 'dev' | 'prod', btn: HTMLButtonElement): Promise<void> {
      if (!cachedRepoRoot) {
        cadenceOut.style.display = 'block';
        cadenceOut.textContent = 'repo_root 미설정';
        return;
      }
      const cmd = target === 'prod' ? 'agent_team_run_cadence_tick_prod' : 'agent_team_run_cadence_tick';
      const label = target === 'prod' ? '⚡ Prod' : '⚡ Dev';
      btn.disabled = true;
      const orig = btn.textContent || label;
      btn.textContent = '⏳ 실행 중...';
      cadenceOut.style.display = 'block';
      cadenceOut.textContent = `${label} cadence tick 1회 실행 중... (수 초 ~ 십수 초)`;
      try {
        const r = (await tauriInvoke(cmd, {
          repoRoot: cachedRepoRoot,
          includeWorker: false
        })) as {
          ok: boolean;
          elapsed_ms: number;
          stdout_tail: string;
          stderr_tail: string;
          exit_code: number | null;
        };
        const head = r.ok
          ? `✓ ${label} OK (${r.elapsed_ms}ms, exit=${r.exit_code ?? '?'})`
          : `✗ ${label} FAIL (${r.elapsed_ms}ms, exit=${r.exit_code ?? '?'})`;
        cadenceOut.textContent = `${head}\n--- stdout (tail) ---\n${r.stdout_tail}\n--- stderr (tail) ---\n${r.stderr_tail}`;
        void load();
      } catch (e) {
        cadenceOut.textContent = `${label} 실행 실패: ${String(e)}`;
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    }

    cadenceBtn.addEventListener('click', () => void runCadence('dev', cadenceBtn));
    cadenceProdBtn.addEventListener('click', () => void runCadence('prod', cadenceProdBtn));

    refreshBtn.addEventListener('click', () => void load());
    autoChk.addEventListener('change', applyAutoRefresh);
    proposalsSearch.addEventListener('input', () => renderProposals(cachedProposals));
    void load();
    applyAutoRefresh();
  }

  function escapeHtmlGlobal(s: string): string {
    return s.replace(/[&<>"']/g, (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    );
  }

  function kindColor(k: string | undefined): string {
    switch ((k || '').toLowerCase()) {
      case 'fix':
        return '#e85';
      case 'decision':
        return '#39c';
      case 'finding':
      case 'discovery':
        return '#3a8';
      case 'incident':
        return '#c44';
      case 'note':
        return '#888';
      default:
        return '#777';
    }
  }

  function formatTs(ts: string): string {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts.slice(0, 16);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
  }

  function buildCanvas(container: HTMLElement): void {
    const isApp = typeof Toolbox.isDesktopApp === 'function' && Toolbox.isDesktopApp();
    if (!isApp) {
      container.innerHTML =
        '<div style="padding:1.5rem;opacity:.7">Canvas 는 데스크톱 앱 전용입니다.</div>';
      return;
    }
    container.innerHTML = `
      <div class="agent-canvas-root" style="display:flex;flex-direction:column;gap:.75rem;padding:1rem;font-size:.9rem;height:100%;overflow-y:auto;box-sizing:border-box">
        <header style="display:flex;align-items:center;gap:.75rem">
          <h2 style="margin:0;font-size:1.05rem">🎴 에이전트 카드 피드</h2>
          <span class="ac-meta" style="opacity:.6;font-size:.78rem"></span>
          <input class="ac-search" type="search" placeholder="검색 (토픽·본문)" style="margin-left:auto;padding:.25rem .5rem;min-width:10rem" />
          <select class="ac-filter" style="padding:.25rem .4rem">
            <option value="all">전체</option>
            <option value="decision">결정</option>
            <option value="fix">수정</option>
            <option value="finding">발견</option>
            <option value="incident">사고</option>
          </select>
          <button class="ac-refresh" type="button" style="padding:.3rem .7rem">새로고침</button>
        </header>
        <div class="ac-list" style="display:flex;flex-direction:column;gap:.4rem"></div>
        <div class="ac-err" style="display:none;color:#e66;padding:.5rem;border:1px solid #e66;border-radius:.3rem;white-space:pre-wrap"></div>
      </div>
    `;
    const meta = container.querySelector<HTMLSpanElement>('.ac-meta')!;
    const filterSel = container.querySelector<HTMLSelectElement>('.ac-filter')!;
    const searchInput = container.querySelector<HTMLInputElement>('.ac-search')!;
    const refreshBtn = container.querySelector<HTMLButtonElement>('.ac-refresh')!;
    const list = container.querySelector<HTMLDivElement>('.ac-list')!;
    const errBox = container.querySelector<HTMLDivElement>('.ac-err')!;

    let allCards: CardInfo[] = [];

    function render(): void {
      const filter = filterSel.value;
      const q = searchInput.value.trim().toLowerCase();
      let rows =
        filter === 'all'
          ? allCards
          : allCards.filter((c) => (c.kind || '').toLowerCase() === filter);
      if (q) {
        rows = rows.filter((c) => {
          const hay = `${c.topic ?? ''} ${c.summary} ${c.session ?? ''} ${c.source}`.toLowerCase();
          return hay.includes(q);
        });
      }
      const matched = rows.length;
      const total = allCards.length;
      meta.textContent = q || filter !== 'all'
        ? `${matched} / ${total} (필터)`
        : `${total}건 (최근)`;
      list.innerHTML = rows
        .map((c) => {
          const k = c.kind || '?';
          const badge = `<span style="display:inline-block;padding:.05rem .35rem;border-radius:.25rem;font-size:.68rem;background:${kindColor(
            c.kind
          )};color:#fff;font-family:monospace">${escapeHtmlGlobal(k)}</span>`;
          const topic = c.topic
            ? `<span style="font-size:.74rem;opacity:.7;font-family:monospace;margin-left:.4rem">${escapeHtmlGlobal(c.topic)}</span>`
            : '';
          const session = c.session
            ? `<span style="font-size:.7rem;opacity:.55;margin-left:.4rem">@${escapeHtmlGlobal(c.session)}</span>`
            : '';
          return `
            <div style="padding:.45rem .6rem;border:1px solid rgba(127,127,127,.2);border-radius:.3rem">
              <div style="display:flex;align-items:center;gap:.3rem">
                ${badge}${topic}${session}
                <span style="margin-left:auto;font-size:.7rem;opacity:.55;font-family:monospace">${escapeHtmlGlobal(formatTs(c.ts))}</span>
              </div>
              <div style="margin-top:.25rem;line-height:1.5;font-size:.85rem">${escapeHtmlGlobal(c.summary)}</div>
              <div style="font-size:.66rem;opacity:.4;margin-top:.2rem;font-family:monospace">${escapeHtmlGlobal(c.source)}</div>
            </div>`;
        })
        .join('');
      if (rows.length === 0) {
        list.innerHTML = '<div style="opacity:.5;padding:1rem;text-align:center">표시할 카드 없음</div>';
      }
    }

    async function load(): Promise<void> {
      errBox.style.display = 'none';
      meta.textContent = '로딩 중...';
      try {
        const repoRoot = (await tauriInvoke('localdev_get_repo_root')) as string | null;
        if (!repoRoot) {
          errBox.style.display = 'block';
          errBox.textContent = 'repo_root 미설정 — 서버 모니터 위젯에서 먼저 repo 폴더 선택해주세요.';
          meta.textContent = '';
          return;
        }
        allCards = (await tauriInvoke('agent_team_list_cards', {
          repoRoot,
          limit: 240
        })) as CardInfo[];
        render();
      } catch (e) {
        errBox.style.display = 'block';
        errBox.textContent = `로드 실패: ${String(e)}`;
        meta.textContent = '';
      }
    }

    filterSel.addEventListener('change', render);
    searchInput.addEventListener('input', render);
    refreshBtn.addEventListener('click', () => void load());
    void load();
    window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
  }

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta?.('agent-team'),
    id: 'agent-team',
    title: '에이전트 팀',
    category: 'desktop',
    desc: 'KAR-018 에이전트 팀 운영 콘솔 (v1 PoC: roster + objectives + 활성 세션 read-only)',
    layout: 'full',
    icon: '<circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="10" x2="7" y2="14" stroke="currentColor" stroke-width="1.4"/><line x1="14" y1="10" x2="17" y2="14" stroke="currentColor" stroke-width="1.4"/>',
    tabs: [
      { id: 'agent-team-main', label: '팀 / 콘솔', build },
      { id: 'agent-team-canvas', label: '🎴 카드 피드', build: buildCanvas }
    ]
  });
})();
