#!/usr/bin/env node
// generate.mjs — karmoddrine-pulse static HTML generator (1차 구현).
//
// substrate 들 read → 카드 5장 + 메트릭 → index.html. 비주얼 톤 baseline
// (사용자 컨펌 후 교체). cron 또는 수동 trigger.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UMBRELLA = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(__dirname, 'index.html');

function safeRead(p) {
    try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}
function safeReadDir(d) {
    try { return fs.readdirSync(d); } catch { return []; }
}
function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 1. active-sessions 보드 (행 파싱)
const board = safeRead(path.join(UMBRELLA, 'memo', '.claude', 'active-sessions.md'));
const boardRows = [];
for (const ln of board.split('\n')) {
    const m = /^\|\s*([A-Z])\s*\|\s*(\S+)\s*\|\s*([\d-]+ [\d:]+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\S+)\s*\|$/.exec(ln);
    if (m && m[1] !== 'Name' && m[1] !== '----') {
        boardRows.push({ slot: m[1], task: m[2], started: m[3], topic: m[4], target: m[5], status: m[6] });
    }
}

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

// 5. proposals jsonl count + evolution events
const proposals = safeRead(path.join(UMBRELLA, 'memo', '.claude', 'proposals.jsonl'));
const proposalCount = proposals.split('\n').filter(l => l.startsWith('{')).length;
const evoEvents = safeRead(path.join(UMBRELLA, 'memo', '.claude', 'evolution-events.jsonl'));
const evoCount = evoEvents.split('\n').filter(l => l.startsWith('{')).length;

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

// 7. TASK in_progress count (간단 grep)
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

// 7b. INIT/⑦' 자율 발굴 TASK count + 최근 (사용자 발화 "자기들끼리 만든" 직접 증거)
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

// 8. INIT 라이브 카드 (laptop-ops 경유, TASK-KAR-119 후속).
//    yawnbot-prod stdout 의 마지막 [AgentCadence] tick 라벨 + services status.
let initCard = { tick: '(미연결)', services: {}, error: null };
try {
    const tokenPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.laptop-ops-token');
    if (fs.existsSync(tokenPath)) {
        const token = fs.readFileSync(tokenPath, 'utf8').trim();
        const headers = { 'Authorization': `Bearer ${token}` };

        // /status (services + memory)
        const statusRes = await fetch('https://laptop.mascari4615.com/status', { headers });
        if (statusRes.ok) {
            const s = await statusRes.json();
            initCard.services = s.services || {};
        }

        // /exec — yawnbot-prod stdout 의 마지막 [AgentCadence] tick
        const cmd = `Get-Content C:/nssm-logs/yawnbot-prod/stdout.log -Tail 200 | Select-String -Pattern '\\[AgentCadence\\] tick' | Select-Object -Last 1 | ForEach-Object { $_.Line }`;
        const execRes = await fetch('https://laptop.mascari4615.com/exec', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd }),
        });
        if (execRes.ok) {
            const ex = await execRes.json();
            const stdout = (ex.stdout || '').trim();
            if (stdout) {
                // Extract init: section
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
  .status-inactive { color:#777; }
  footer { margin-top:16px; font-size:11px; color:#567; }
</style>
</head>
<body>
<h1>🫀 karmoddrine pulse <span class="small">— ${esc(tsKst)} KST · generated by generate.mjs</span></h1>

<div class="grid">

  <div class="card">
    <h2>활성 슬롯 (${boardRows.length})</h2>
    <table><tr><th>slot</th><th>task</th><th>topic</th><th>status</th></tr>
    ${boardRows.map(r => `<tr><td>${esc(r.slot)}</td><td class="small">${esc(r.task)}</td><td>${esc(r.topic)}</td><td class="status-${esc(r.status)}">${esc(r.status)}</td></tr>`).join('')}
    </table>
  </div>

  <div class="card">
    <h2>에이전트 코어 로스터 (${agentRows.length})</h2>
    <table><tr><th>id</th><th>role</th><th>kind</th><th>status</th></tr>
    ${agentRows.map(r => `<tr><td>${esc(r.id)}</td><td class="small">${esc(r.role)}</td><td>${esc(r.kind)}</td><td class="status-${esc((r.status || '').split(' ')[0])}">${esc(r.status)}</td></tr>`).join('')}
    </table>
  </div>

  <div class="card">
    <h2>session-bus 최근 ${busHeads.length} entry</h2>
    ${busHeads.map(h => `<div class="head">· ${esc(h)}</div>`).join('')}
  </div>

  <div class="card">
    <h2>활동 메트릭</h2>
    <table>
      <tr><td>최근 24h discoveries</td><td>${discCount} entries</td></tr>
      <tr><td>proposals.jsonl 누적</td><td>${proposalCount}</td></tr>
      <tr><td>evolution-events.jsonl 누적</td><td>${evoCount}</td></tr>
      <tr><td>TASK in_progress</td><td>${taskInProg}</td></tr>
      <tr><td>에이전트 코어 (active / draft / inactive)</td><td>${agentRows.filter(r => /active/.test(r.status || '')).length} / ${agentRows.filter(r => /draft/.test(r.status || '')).length} / ${agentRows.filter(r => /inactive/.test(r.status || '')).length}</td></tr>
      <tr><td>🌱 자율 발굴 TASK (agent-discovered)</td><td>${agentDiscoveredCount}</td></tr>
    </table>
    ${agentDiscoveredLatest.length ? `<h3 class="small" style="margin:8px 0 4px;color:#9ad;">최근 자율 발의 TASK</h3>${agentDiscoveredLatest.map(t => `<div class="head">· ${esc(t)}</div>`).join('')}` : ''}
  </div>

  <div class="card">
    <h2>🤖 자율 팀 라이브 (laptop-ops)</h2>
    <table>
      ${Object.entries(initCard.services).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="status-${v === 'SERVICE_RUNNING' ? 'active' : 'inactive'}">${esc(v)}</td></tr>`).join('')}
    </table>
    <h3 class="small" style="margin:8px 0 4px;color:#9ad;">최근 cadence tick</h3>
    <div class="head" style="word-break:break-all;">${esc(initCard.tick)}</div>
    ${initCard.error ? `<div class="small" style="color:#d77;">⚠ ${esc(initCard.error)}</div>` : ''}
  </div>

  <div class="card">
    <h2>3 레포 최근 commit</h2>
    ${repos.map(r => `<h3 class="small" style="margin:8px 0 4px;color:#9ad;">${esc(r)}</h3>
      ${(commitMap[r] || []).map(l => `<div class="head">${esc(l)}</div>`).join('')}`).join('')}
  </div>

</div>

<footer>
  데이터 source: <code>memo/.claude/active-sessions.md</code> · <code>session-bus.md</code> · <code>agents/README.md</code> · <code>discoveries/*.jsonl</code> · <code>proposals.jsonl</code> · <code>evolution-events.jsonl</code> · <code>git log</code> (3 레포).
  <br>regenerate = <code>node Mascari4615.github.io/apps/karmoddrine-pulse/generate.mjs</code>. TASK-KAR-119 정본.
</footer>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log(`[pulse] generated: ${OUT}`);
console.log(`[pulse] slots=${boardRows.length} cores=${agentRows.length} bus=${busHeads.length} disc24h=${discCount} proposals=${proposalCount} evo=${evoCount} task-in-prog=${taskInProg}`);
