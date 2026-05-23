#!/usr/bin/env node
// generate.mjs — karmoddrine-pulse static + polling 상황판 생성기.
//
// substrate read → JSON 스냅샷(pulse-data.json) + 정적 HTML(index.html).
// HTML 은 sibling JSON 을 ~10s 폴링해 카드 라이브 갱신 (TASK-KAR-119 end-state #1).
//
// 데이터 source: agent-state.json (live_slots/sessions) · session-bus.md ·
// agents/README.md · proposals.jsonl · evolution-events.jsonl · git log ·
// laptop-ops /status + /exec · repo-metrics.mjs --json · heavy-ops/*.lock(있을 때).

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UMBRELLA = path.resolve(__dirname, '..', '..', '..');
const OUT_HTML = path.join(__dirname, 'index.html');
const OUT_JSON = path.join(__dirname, 'pulse-data.json');

function safeRead(p) {
    try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}
function safeReadJson(p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function safeReadDir(d) {
    try { return fs.readdirSync(d); } catch { return []; }
}
function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function tailJsonl(p, n) {
    const body = safeRead(p);
    if (!body) return [];
    const lines = body.split('\n').filter(l => l.startsWith('{'));
    const out = [];
    for (const ln of lines.slice(-n)) {
        try { out.push(JSON.parse(ln)); } catch {}
    }
    return out.reverse();
}

// 1. 활성 슬롯 — agent-state.json 정본 (active-sessions.md 폐기 후 대체).
const state = safeReadJson(path.join(UMBRELLA, 'memo', '.claude', 'agent-state.json')) || {};
const sessions = Array.isArray(state.sessions) ? state.sessions : [];
const liveSlots = Array.isArray(state.live_slots) ? state.live_slots : [];
const slotRows = sessions.map(s => ({
    slot: s.slot,
    task: s.task || '-',
    started: s.started || '-',
    topic: (s.topic || '').slice(0, 80),
    target: s.target || '-',
    status: s.status || '-',
    live: liveSlots.includes(s.slot),
}));

// 2. session-bus 최근 헤드라인 N=10
const bus = safeRead(path.join(UMBRELLA, 'memo', '.claude', 'session-bus.md'));
const busHeads = [];
for (const ln of bus.split('\n')) {
    const m = /^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2} KST · slot-\S+ · .+)$/.exec(ln);
    if (m) busHeads.push(m[1]);
    if (busHeads.length >= 10) break;
}

// 3. agents 로스터 (README 표 파싱)
const agentsReadme = safeRead(path.join(UMBRELLA, 'memo', '.claude', 'agents', 'README.md'));
const agentRows = [];
let inTable = false;
for (const ln of agentsReadme.split('\n')) {
    if (/^\| id \|/.test(ln)) { inTable = true; continue; }
    if (inTable && /^\|/.test(ln) && !/^\| ---/.test(ln)) {
        const cells = ln.split('|').map(s => s.trim());
        if (cells.length >= 7) {
            agentRows.push({ id: cells[1], display: cells[2], role: cells[3], kind: cells[4], domain: cells[5], status: cells[6] });
        }
    } else if (inTable && !/^\|/.test(ln) && ln.trim() !== '') {
        inTable = false;
    }
}

// 4. 최근 24h discoveries
const discDir = path.join(UMBRELLA, 'memo', '.claude', 'discoveries');
const discFiles = safeReadDir(discDir).filter(f => f.endsWith('.jsonl'));
let discCount = 0;
const cutoff = Date.now() - 24 * 60 * 60 * 1000;
for (const f of discFiles) {
    try {
        const stat = fs.statSync(path.join(discDir, f));
        if (stat.mtimeMs > cutoff) {
            const body = safeRead(path.join(discDir, f));
            discCount += body.split('\n').filter(l => l.startsWith('{')).length;
        }
    } catch {}
}

// 5. proposals + evolution-events 누적 + 최근 tail
const proposalsPath = path.join(UMBRELLA, 'memo', '.claude', 'proposals.jsonl');
const evoPath = path.join(UMBRELLA, 'memo', '.claude', 'evolution-events.jsonl');
const proposalsBody = safeRead(proposalsPath);
const proposalCount = proposalsBody.split('\n').filter(l => l.startsWith('{')).length;
const evoBody = safeRead(evoPath);
const evoCount = evoBody.split('\n').filter(l => l.startsWith('{')).length;

const proposalsTail = tailJsonl(proposalsPath, 5).map(p => {
    const env = p.envelope || {};
    const payload = env.payload || {};
    const summary = (payload.summary || payload.title || env.kind || '').toString().slice(0, 100);
    return {
        id: p.id || '',
        ts: p.ts || '',
        project: env.projectId || payload.projectId || '-',
        kind: env.kind || payload.kind || '-',
        summary,
    };
});
const evoTail = tailJsonl(evoPath, 5).map(e => ({
    ts: e.ts || '',
    code: e.code || '-',
    severity: e.severity || '-',
    source: e.source || '-',
    detail: (e.detail || '').toString().slice(0, 100),
}));

// 6. 3 레포 최근 commit (5개씩)
const repos = ['memo', 'Mascari4615.github.io', 'WitchMendokusai'];
const commitMap = {};
for (const r of repos) {
    try {
        const out = execSync(`git -C "${path.join(UMBRELLA, r)}" log -5 --oneline`, { encoding: 'utf8' });
        commitMap[r] = out.split('\n').map(l => l.trim()).filter(Boolean);
    } catch {
        commitMap[r] = [];
    }
}

// 7. TASK in_progress count
let taskInProg = 0;
for (const d of [
    path.join(UMBRELLA, 'memo', 'tasks'),
    path.join(UMBRELLA, 'memo', 'wm', 'tasks'),
    path.join(UMBRELLA, 'memo', 'projects', 'karmolab', 'tasks'),
    path.join(UMBRELLA, 'memo', 'projects', 'yawnbot', 'tasks'),
]) {
    for (const f of safeReadDir(d)) {
        if (!f.endsWith('.md')) continue;
        const body = safeRead(path.join(d, f));
        if (/^status: in_progress$/m.test(body)) taskInProg++;
    }
}

// 7b. 자율 발굴 TASK
const agentDiscDir = path.join(UMBRELLA, 'memo', 'tasks', 'agent-discovered');
let agentDiscoveredCount = 0;
let agentDiscoveredLatest = [];
if (fs.existsSync(agentDiscDir)) {
    const files = safeReadDir(agentDiscDir)
        .filter(f => f.startsWith('TASK-') && f.endsWith('.md'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(agentDiscDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
    agentDiscoveredCount = files.length;
    agentDiscoveredLatest = files.slice(0, 5).map(f => f.name.replace(/^TASK-/, '').replace(/\.md$/, ''));
}

// 7c. heavy-ops locks (있을 때만 graceful)
const heavyOpsDir = path.join(UMBRELLA, 'memo', '.claude', 'heavy-ops');
let heavyOpLocks = [];
if (fs.existsSync(heavyOpsDir)) {
    heavyOpLocks = safeReadDir(heavyOpsDir)
        .filter(f => f.endsWith('.lock'))
        .map(f => {
            const p = path.join(heavyOpsDir, f);
            let mtime = 0;
            try { mtime = fs.statSync(p).mtimeMs; } catch {}
            const ageMin = Math.floor((Date.now() - mtime) / 60000);
            return { name: f.replace(/\.lock$/, ''), ageMin };
        })
        .sort((a, b) => b.ageMin - a.ageMin);
}

// 7d. repo-metrics --json (옵션 — 무거우면 skip)
let repoMetrics = null;
try {
    const out = execSync(`node "${path.join(UMBRELLA, 'memo', 'scripts', 'repo-metrics.mjs')}" --json --days 7`, {
        encoding: 'utf8',
        timeout: 30000,
    });
    repoMetrics = JSON.parse(out);
} catch {}

// 8. INIT 라이브 (laptop-ops). PowerShell stdout CP949 트랩 회피 — UTF8 강제.
let initCard = { tick: '(미연결)', services: {}, error: null };
try {
    const tokenPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.laptop-ops-token');
    if (fs.existsSync(tokenPath)) {
        const token = fs.readFileSync(tokenPath, 'utf8').trim();
        const headers = { 'Authorization': `Bearer ${token}` };

        const statusRes = await fetch('https://laptop.mascari4615.com/status', { headers });
        if (statusRes.ok) {
            const s = await statusRes.json();
            initCard.services = s.services || {};
        }

        // UTF8 강제: $OutputEncoding + Console::OutputEncoding 둘 다 (PS 5.1 native exe RX 트랩 회피).
        const cmd = [
            '$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;',
            "Get-Content C:/nssm-logs/yawnbot-prod/stdout.log -Tail 200 -Encoding UTF8 | Select-String -Pattern '\\[AgentCadence\\] tick' | Select-Object -Last 1 | ForEach-Object { $_.Line }",
        ].join(' ');
        const execRes = await fetch('https://laptop.mascari4615.com/exec', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd }),
        });
        if (execRes.ok) {
            const ex = await execRes.json();
            const stdout = (ex.stdout || '').trim();
            if (stdout) {
                const initMatch = /init:[^+]+(?:\+[a-z-]+:[^+]+)*/.exec(stdout);
                initCard.tick = initMatch ? initMatch[0] : stdout.slice(0, 200);
            }
        }
    } else {
        initCard.error = '.laptop-ops-token 없음';
    }
} catch (e) {
    initCard.error = String(e.message || e).slice(0, 100);
}

const now = new Date();
const tsKst = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

// 9. pulse-data.json — 폴링 정본. 클라이언트 JS 가 이걸 fetch.
const data = {
    generated: now.toISOString(),
    generated_kst: tsKst,
    slots: slotRows,
    live_slots: liveSlots,
    bus_heads: busHeads,
    agents: agentRows,
    metrics: {
        disc_24h: discCount,
        proposals_total: proposalCount,
        evo_total: evoCount,
        task_in_progress: taskInProg,
        agent_discovered: agentDiscoveredCount,
        agent_active: agentRows.filter(r => /active/.test(r.status || '')).length,
        agent_draft: agentRows.filter(r => /draft/.test(r.status || '')).length,
        agent_inactive: agentRows.filter(r => /inactive/.test(r.status || '')).length,
    },
    agent_discovered_latest: agentDiscoveredLatest,
    init_card: initCard,
    commits: commitMap,
    proposals_tail: proposalsTail,
    evo_tail: evoTail,
    heavy_op_locks: heavyOpLocks,
    repo_metrics: repoMetrics
        ? repoMetrics.repos.map(r => ({
            repo: r.repo,
            total: r.total,
            fixup_ratio: r.fixupRatio,
            avg_hunk: r.avgHunk,
            revert_count: r.revertCount,
            drift_top: (r.driftFiles || []).slice(0, 3),
        }))
        : null,
};
fs.writeFileSync(OUT_JSON, JSON.stringify(data, null, 2), 'utf8');

// 10. HTML — 초기 렌더(서버사이드 inline) + 클라이언트 ~10s 폴링 JS.
const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>karmoddrine pulse</title>
<style>
  body { font-family: ui-monospace, Consolas, monospace; background:#0e1014; color:#dde; margin:0; padding:16px; }
  h1 { font-size:18px; margin:0 0 12px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(360px, 1fr)); gap:12px; }
  .card { background:#161922; border:1px solid #2a2f3d; border-radius:6px; padding:12px; }
  .card h2 { font-size:14px; margin:0 0 8px; color:#9ad; border-bottom:1px solid #2a2f3d; padding-bottom:4px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  td, th { padding:3px 6px; vertical-align:top; border-bottom:1px dotted #2a2f3d; }
  th { text-align:left; color:#789; }
  .small { font-size:11px; color:#789; }
  .head { font-size:11px; color:#dda; padding:2px 0; }
  .status-active { color:#7d7; }
  .status-draft { color:#dd7; }
  .status-inactive, .status-pending { color:#777; }
  .sev-warn { color:#dd7; }
  .sev-crit, .sev-critical { color:#d77; }
  .sev-info { color:#7ad; }
  .live-dot { color:#7d7; }
  footer { margin-top:16px; font-size:11px; color:#567; }
  #pulse-status { float:right; font-size:11px; color:#567; }
  .stale { color:#d77 !important; }
</style>
</head>
<body>
<h1>🫀 karmoddrine pulse <span class="small">— <span id="pulse-ts">${esc(tsKst)}</span> KST · poll 10s</span> <span id="pulse-status">●</span></h1>

<div class="grid" id="grid"></div>

<footer>
  데이터 source: <code>agent-state.json</code> · <code>session-bus.md</code> · <code>agents/README.md</code> · <code>discoveries/*.jsonl</code> · <code>proposals.jsonl</code> · <code>evolution-events.jsonl</code> · <code>repo-metrics.mjs --json</code> · <code>laptop-ops /status·/exec</code> · <code>git log</code>.
  <br>regenerate = <code>node Mascari4615.github.io/apps/karmoddrine-pulse/generate.mjs</code>. 클라이언트 폴링 = <code>pulse-data.json</code> (10s). TASK-KAR-119 정본.
</footer>

<script>
const INITIAL = ${JSON.stringify(data)};

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function statusClass(s) {
  const k = (s || '').toString().toLowerCase().split(' ')[0];
  return k ? 'status-' + k : '';
}
function sevClass(s) {
  const k = (s || '').toString().toLowerCase();
  if (k.startsWith('crit')) return 'sev-crit';
  if (k.startsWith('warn')) return 'sev-warn';
  if (k.startsWith('info')) return 'sev-info';
  return '';
}

function render(d) {
  const cards = [];

  // 활성 슬롯
  cards.push(\`<div class="card">
    <h2>활성 슬롯 (\${d.slots.length} · live=\${d.live_slots.length})</h2>
    <table><tr><th>slot</th><th>task</th><th>topic</th><th>status</th></tr>
    \${d.slots.map(r => \`<tr><td>\${r.live ? '<span class="live-dot">●</span> ' : ''}\${esc(r.slot)}</td><td class="small">\${esc(r.task)}</td><td>\${esc(r.topic)}</td><td class="\${statusClass(r.status)}">\${esc(r.status)}</td></tr>\`).join('')}
    </table>
  </div>\`);

  // 에이전트 코어 로스터
  cards.push(\`<div class="card">
    <h2>에이전트 코어 로스터 (\${d.agents.length})</h2>
    <table><tr><th>id</th><th>role</th><th>kind</th><th>status</th></tr>
    \${d.agents.map(r => \`<tr><td>\${esc(r.id)}</td><td class="small">\${esc(r.role)}</td><td>\${esc(r.kind)}</td><td class="\${statusClass(r.status)}">\${esc(r.status)}</td></tr>\`).join('')}
    </table>
  </div>\`);

  // session-bus 최근
  cards.push(\`<div class="card">
    <h2>session-bus 최근 \${d.bus_heads.length} entry</h2>
    \${d.bus_heads.map(h => \`<div class="head">· \${esc(h)}</div>\`).join('')}
  </div>\`);

  // 활동 메트릭
  cards.push(\`<div class="card">
    <h2>활동 메트릭</h2>
    <table>
      <tr><td>최근 24h discoveries</td><td>\${d.metrics.disc_24h} entries</td></tr>
      <tr><td>proposals.jsonl 누적</td><td>\${d.metrics.proposals_total}</td></tr>
      <tr><td>evolution-events.jsonl 누적</td><td>\${d.metrics.evo_total}</td></tr>
      <tr><td>TASK in_progress</td><td>\${d.metrics.task_in_progress}</td></tr>
      <tr><td>에이전트 코어 (active / draft / inactive)</td><td>\${d.metrics.agent_active} / \${d.metrics.agent_draft} / \${d.metrics.agent_inactive}</td></tr>
      <tr><td>🌱 자율 발굴 TASK (agent-discovered)</td><td>\${d.metrics.agent_discovered}</td></tr>
    </table>
    \${d.agent_discovered_latest.length ? \`<h3 class="small" style="margin:8px 0 4px;color:#9ad;">최근 자율 발의 TASK</h3>\${d.agent_discovered_latest.map(t => \`<div class="head">· \${esc(t)}</div>\`).join('')}\` : ''}
  </div>\`);

  // INIT 라이브
  cards.push(\`<div class="card">
    <h2>🤖 자율 팀 라이브 (laptop-ops)</h2>
    <table>
      \${Object.entries(d.init_card.services || {}).map(([k, v]) => \`<tr><td>\${esc(k)}</td><td class="\${v === 'SERVICE_RUNNING' ? 'status-active' : 'status-inactive'}">\${esc(v)}</td></tr>\`).join('')}
    </table>
    <h3 class="small" style="margin:8px 0 4px;color:#9ad;">최근 cadence tick</h3>
    <div class="head" style="word-break:break-all;">\${esc(d.init_card.tick)}</div>
    \${d.init_card.error ? \`<div class="small" style="color:#d77;">⚠ \${esc(d.init_card.error)}</div>\` : ''}
  </div>\`);

  // 자율 사이클 — proposals tail (lifecycle 가시)
  cards.push(\`<div class="card">
    <h2>📜 최근 발의 (proposals)</h2>
    \${d.proposals_tail && d.proposals_tail.length ? d.proposals_tail.map(p => \`<div class="head">· <span class="small">[\${esc((p.ts || '').slice(5, 16))}]</span> <code>\${esc(p.project)}/\${esc(p.kind)}</code> \${esc(p.summary)}</div>\`).join('') : '<div class="small">(없음)</div>'}
  </div>\`);

  // 자율 사이클 — evolution-events tail
  cards.push(\`<div class="card">
    <h2>🧬 evolution-events 최근</h2>
    \${d.evo_tail && d.evo_tail.length ? d.evo_tail.map(e => \`<div class="head">· <span class="small">[\${esc((e.ts || '').slice(5, 16))}]</span> <span class="\${sevClass(e.severity)}">\${esc(e.code)}</span> \${esc(e.detail)}</div>\`).join('') : '<div class="small">(없음)</div>'}
  </div>\`);

  // heavy-op locks (있을 때만)
  if (d.heavy_op_locks && d.heavy_op_locks.length) {
    cards.push(\`<div class="card">
      <h2>🔒 heavy-op locks (\${d.heavy_op_locks.length})</h2>
      <table><tr><th>name</th><th>age (min)</th></tr>
      \${d.heavy_op_locks.map(l => \`<tr><td>\${esc(l.name)}</td><td class="\${l.ageMin > 30 ? 'sev-warn' : ''}">\${l.ageMin}</td></tr>\`).join('')}
      </table>
    </div>\`);
  }

  // 운영 메트릭 — repo-metrics
  if (d.repo_metrics && d.repo_metrics.length) {
    cards.push(\`<div class="card">
      <h2>📊 운영 메트릭 (7d, repo-metrics)</h2>
      <table><tr><th>repo</th><th>총 commit</th><th>fixup%</th><th>avg hunk</th><th>revert</th></tr>
      \${d.repo_metrics.map(r => \`<tr><td class="small">\${esc(r.repo)}</td><td>\${r.total}</td><td class="\${r.fixup_ratio > 0.3 ? 'sev-warn' : ''}">\${(r.fixup_ratio * 100).toFixed(1)}%</td><td>\${r.avg_hunk}</td><td>\${r.revert_count}</td></tr>\`).join('')}
      </table>
    </div>\`);
  }

  // 3 레포 최근 commit
  cards.push(\`<div class="card">
    <h2>3 레포 최근 commit</h2>
    \${Object.entries(d.commits).map(([r, ls]) => \`<h3 class="small" style="margin:8px 0 4px;color:#9ad;">\${esc(r)}</h3>
      \${(ls || []).map(l => \`<div class="head">\${esc(l)}</div>\`).join('')}\`).join('')}
  </div>\`);

  document.getElementById('grid').innerHTML = cards.join('');
  document.getElementById('pulse-ts').textContent = d.generated_kst;
}

render(INITIAL);

let lastGen = INITIAL.generated;
async function poll() {
  try {
    const r = await fetch('pulse-data.json?ts=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('http ' + r.status);
    const d = await r.json();
    render(d);
    const status = document.getElementById('pulse-status');
    const ageMs = Date.now() - new Date(d.generated).getTime();
    // 5분 이상이면 stale (regenerator 가 죽었거나 cron 안 도는 상태).
    if (ageMs > 5 * 60 * 1000) {
      status.classList.add('stale');
      status.title = 'pulse-data.json 이 ' + Math.floor(ageMs / 60000) + '분 stale — generate.mjs 가 안 돌고 있음';
    } else {
      status.classList.remove('stale');
      status.title = 'fresh — ' + d.generated_kst + ' KST';
    }
    lastGen = d.generated;
  } catch (e) {
    document.getElementById('pulse-status').classList.add('stale');
    document.getElementById('pulse-status').title = 'fetch fail: ' + (e && e.message || e);
  }
}
setInterval(poll, 10000);
</script>
</body>
</html>
`;

fs.writeFileSync(OUT_HTML, html, 'utf8');
console.log(`[pulse] generated: ${OUT_HTML}`);
console.log(`[pulse] data: ${OUT_JSON}`);
console.log(`[pulse] slots=${slotRows.length} live=${liveSlots.length} cores=${agentRows.length} bus=${busHeads.length} disc24h=${discCount} proposals=${proposalCount} evo=${evoCount} task-in-prog=${taskInProg} heavy-locks=${heavyOpLocks.length} repo-metrics=${repoMetrics ? 'ok' : 'skip'}`);
