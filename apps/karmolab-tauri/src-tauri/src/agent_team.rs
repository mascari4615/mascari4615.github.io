// agent_team — KarmoApp 에이전트 팀 운영 GUI 의 read-only substrate (TASK-KAR-116-A).
//
// 본 모듈은 *읽기 전용*. 데이터 정본은 `memo/` 안 평문 파일이며, 본 GUI 는
// yawnbot Discord 표면과 *peer adapter* 관계(KAR-103 정합). 쓰기 액션
// (cadence run / proposal decide / agent toggle) 은 yawnbot HTTP endpoint 우회
// — Phase 2 (TASK-KAR-116-C) 에서 추가.
//
// 정본 데이터 소스:
//   - 에이전트 roster: `memo/.claude/agents/<id>/core.md` (YAML frontmatter)
//   - objectives: `memo/.claude/objectives.md` (markdown 표)
//   - 활성 세션: `memo/.claude/active-sessions.md` (markdown 표)
//
// 패턴:
//   - 모든 command = async + `tauri::async_runtime::spawn_blocking` (KL-043 정합 — 다중 파일 read = IO heavy)
//   - repo_root 는 인자로 받음 — 호출자(widget)가 `localdev_get_repo_root` 캐싱 후 전달
//     (LocalDevState 와 결합 회피, Server Monitor 패턴 정합)

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AgentInfo {
    pub id: String,
    pub display_name: Option<String>,
    pub emoji: Option<String>,
    pub role: Option<String>,
    pub kind: Option<String>,
    pub status: Option<String>,
    pub default_skin: Option<String>,
    /// `agents/<id>/mem/*.jsonl` 의 가장 최근 ts (RFC3339). None = mem 디렉토리 비어있음 또는 미존재.
    pub last_activity_ts: Option<String>,
    /// 같은 mem/ 안 총 jsonl 라인 수 (활동량 proxy).
    pub activity_count: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ObjectiveInfo {
    pub id: String,
    pub goal: String,
    pub status: String,
    pub align: String,
}

/// `TASK-PREFIX-NNN(-suffix)?` 패턴 토큰 추출 (중복 제거, 삽입 순서 보존).
fn extract_task_ids(text: &str) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut ids: Vec<String> = Vec::new();
    let mut tok_start: Option<usize> = None;
    let char_indices: Vec<(usize, char)> = text.char_indices().collect();
    let flush = |s: usize, e: usize, seen: &mut std::collections::HashSet<String>, ids: &mut Vec<String>| {
        let tok = &text[s..e];
        if !tok.starts_with("TASK-") { return; }
        let rest = &tok["TASK-".len()..];
        let mut parts = rest.splitn(3, '-');
        let prefix = parts.next().unwrap_or("");
        let num_part = parts.next().unwrap_or("");
        if prefix.is_empty() || !prefix.chars().all(|c| c.is_ascii_uppercase()) { return; }
        if num_part.is_empty() || !num_part.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) { return; }
        if seen.insert(tok.to_string()) { ids.push(tok.to_string()); }
    };
    for (i, c) in &char_indices {
        if c.is_alphanumeric() || *c == '-' {
            if tok_start.is_none() { tok_start = Some(*i); }
        } else if let Some(s) = tok_start.take() {
            flush(s, *i, &mut seen, &mut ids);
        }
    }
    if let Some(s) = tok_start {
        flush(s, text.len(), &mut seen, &mut ids);
    }
    ids
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BusEntry {
    pub ts: String,
    pub slot: String,
    pub headline: String,
    pub body_preview: String,
    /// 헤드라인+본문에서 추출한 TASK id 목록 (프론트 인덱싱용).
    pub task_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProposalInfo {
    pub id: String,
    pub ts: String,
    pub target: Option<String>,
    pub kind: Option<String>,
    pub domain: Option<String>,
    pub title: Option<String>,
    pub body: Option<String>,
    pub decided: bool,
    pub decision: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CardInfo {
    pub ts: String,
    pub source: String,
    pub session: Option<String>,
    pub kind: Option<String>,
    pub topic: Option<String>,
    pub summary: String,
    /// topic+summary에서 추출한 TASK id 목록 (프론트 인덱싱용).
    pub task_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SessionInfo {
    pub name: String,
    pub task: String,
    pub started_kst: String,
    pub topic: String,
    pub target_files: String,
    pub state: String,
}

fn memo_root(repo_root: &str) -> PathBuf {
    // 4 케이스 — 분기 기준 = `.claude/agents` 디렉토리 (단순 `.claude` X).
    // 사유: umbrella `karmoddrine/.claude` 도 별 dotfile 로 존재 (active-sessions.md 등). 단순
    // `.claude` exists 로 분기하면 그쪽을 잘못 잡음. 진짜 memo 정본 = `.claude/agents` 가 있는 곳.
    let p = PathBuf::from(repo_root);
    let has_agents = |c: &PathBuf| c.join(".claude").join("agents").exists();

    // ① umbrella karmoddrine — repo_root/memo (가장 보편)
    let nested = p.join("memo");
    if has_agents(&nested) {
        return nested;
    }
    // ② repo_root 자체가 memo
    if has_agents(&p) {
        return p;
    }
    // ③ 형제 (repo_root 가 github.io 일 때)
    if let Some(parent) = p.parent() {
        let sibling = parent.join("memo");
        if has_agents(&sibling) {
            return sibling;
        }
    }
    // ④ fallback (어디도 못 찾으면 직계 — 그러면 read 시 error 가 분명한 path 로 노출)
    p.join("memo")
}

fn parse_yaml_frontmatter(content: &str) -> serde_yml::Value {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return serde_yml::Value::Null;
    }
    let after = &trimmed[3..];
    let Some(end) = after.find("\n---") else {
        return serde_yml::Value::Null;
    };
    let yaml_block = &after[..end];
    serde_yml::from_str(yaml_block).unwrap_or(serde_yml::Value::Null)
}

fn yaml_str(v: &serde_yml::Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(|x| x.as_str().map(|s| s.to_string()))
}

fn agents_dir(memo: &Path) -> PathBuf {
    memo.join(".claude").join("agents")
}

fn read_agents_blocking(repo_root: String) -> Result<Vec<AgentInfo>, String> {
    let memo = memo_root(&repo_root);
    let dir = agents_dir(&memo);
    let entries = fs::read_dir(&dir).map_err(|e| format!("agents dir read 실패 ({}): {e}", dir.display()))?;
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let core_md = path.join("core.md");
        if !core_md.exists() {
            continue;
        }
        let id = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "?".to_string());
        let content = fs::read_to_string(&core_md).map_err(|e| format!("core.md read 실패 ({}): {e}", core_md.display()))?;
        let fm = parse_yaml_frontmatter(&content);

        // mem/*.jsonl scan — 마지막 ts + 총 라인 수
        let mut last_ts: Option<String> = None;
        let mut activity_count: u32 = 0;
        let mem_dir = path.join("mem");
        if let Ok(rd) = fs::read_dir(&mem_dir) {
            for f in rd.flatten() {
                let fp = f.path();
                if fp.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                    continue;
                }
                let Ok(c) = fs::read_to_string(&fp) else { continue };
                for line in c.lines() {
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }
                    activity_count = activity_count.saturating_add(1);
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                        if let Some(ts) = v.get("ts").and_then(|x| x.as_str()) {
                            if last_ts.as_deref().map_or(true, |prev| ts > prev) {
                                last_ts = Some(ts.to_string());
                            }
                        }
                    }
                }
            }
        }

        out.push(AgentInfo {
            id: yaml_str(&fm, "id").unwrap_or(id.clone()),
            display_name: yaml_str(&fm, "display_name"),
            emoji: yaml_str(&fm, "emoji"),
            role: yaml_str(&fm, "role"),
            kind: yaml_str(&fm, "kind"),
            status: yaml_str(&fm, "status"),
            default_skin: yaml_str(&fm, "default_skin"),
            last_activity_ts: last_ts,
            activity_count,
        });
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

fn read_objectives_blocking(repo_root: String) -> Result<Vec<ObjectiveInfo>, String> {
    let memo = memo_root(&repo_root);
    let path = memo.join(".claude").join("objectives.md");
    let content = fs::read_to_string(&path).map_err(|e| format!("objectives.md read 실패 ({}): {e}", path.display()))?;
    let mut out = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if !line.starts_with("| OBJ-") {
            continue;
        }
        let cells: Vec<&str> = line.split('|').map(|s| s.trim()).collect();
        // 표 헤더: | id | 한 줄 목표 | 도출 근거 | 정렬 | status | 승인 | 파생 TASK |
        // cells[0] = "" (선두 |), cells[1] = id, cells[2] = goal, cells[4] = align, cells[5] = status
        if cells.len() < 6 {
            continue;
        }
        out.push(ObjectiveInfo {
            id: cells[1].to_string(),
            goal: cells[2].to_string(),
            align: cells[4].to_string(),
            status: cells[5].to_string(),
        });
    }
    Ok(out)
}

fn read_sessions_blocking(repo_root: String) -> Result<Vec<SessionInfo>, String> {
    let memo = memo_root(&repo_root);
    let path = memo.join(".claude").join("active-sessions.md");
    let content = fs::read_to_string(&path).map_err(|e| format!("active-sessions.md read 실패 ({}): {e}", path.display()))?;
    let mut out = Vec::new();
    let mut in_table = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("| Name") {
            in_table = true;
            continue;
        }
        if trimmed.starts_with("| ---") {
            continue;
        }
        if !in_table {
            continue;
        }
        if !trimmed.starts_with('|') {
            in_table = false;
            continue;
        }
        let cells: Vec<&str> = trimmed.split('|').map(|s| s.trim()).collect();
        // | Name | Task | 시작 (KST) | 주제 | 타겟 파일 | 상태 |
        if cells.len() < 7 {
            continue;
        }
        out.push(SessionInfo {
            name: cells[1].to_string(),
            task: cells[2].to_string(),
            started_kst: cells[3].to_string(),
            topic: cells[4].to_string(),
            target_files: cells[5].to_string(),
            state: cells[6].to_string(),
        });
    }
    Ok(out)
}

fn read_bus_blocking(repo_root: String, limit: usize) -> Result<Vec<BusEntry>, String> {
    // session-bus.md 의 헤더 라인 = `## YYYY-MM-DD HH:MM KST · slot-X · <헤드라인>`.
    // 본문 = 다음 헤더 또는 EOF 까지. preview = 본문 첫 ~200 글자 (개행 보존, 끝 줄임).
    let memo = memo_root(&repo_root);
    let path = memo.join(".claude").join("session-bus.md");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("session-bus.md read 실패 ({}): {e}", path.display()))?;
    let mut entries: Vec<BusEntry> = Vec::new();
    let mut cur: Option<(String, String, String, Vec<String>)> = None;
    for line in content.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("## ") {
            // 헤더 — 이전 entry 마감
            if let Some((ts, slot, headline, body)) = cur.take() {
                let joined = body.join("\n").trim().to_string();
                let preview = if joined.chars().count() > 200 {
                    let cut: String = joined.chars().take(200).collect();
                    format!("{cut}…")
                } else {
                    joined
                };
                let task_ids = extract_task_ids(&format!("{headline} {preview}"));
                entries.push(BusEntry {
                    ts,
                    slot,
                    headline,
                    body_preview: preview,
                    task_ids,
                });
            }
            // 새 헤더 파싱: `2026-05-23 13:50 KST · slot-E · <헤드라인>`
            let parts: Vec<&str> = rest.splitn(3, " · ").collect();
            if parts.len() < 3 {
                continue;
            }
            cur = Some((parts[0].to_string(), parts[1].to_string(), parts[2].to_string(), Vec::new()));
        } else if let Some((_, _, _, ref mut body)) = cur.as_mut() {
            body.push(line.to_string());
        }
    }
    if let Some((ts, slot, headline, body)) = cur {
        let joined = body.join("\n").trim().to_string();
        let preview = if joined.chars().count() > 200 {
            let cut: String = joined.chars().take(200).collect();
            format!("{cut}…")
        } else {
            joined
        };
        let task_ids = extract_task_ids(&format!("{headline} {preview}"));
        entries.push(BusEntry {
            ts,
            slot,
            headline,
            body_preview: preview,
            task_ids,
        });
    }
    // 본 파일 위(최신)→아래(과거) append-only. 입력 순서 그대로가 ts desc.
    entries.truncate(limit);
    Ok(entries)
}

#[tauri::command]
pub async fn agent_team_list_bus(
    repo_root: String,
    limit: Option<usize>,
) -> Result<Vec<BusEntry>, String> {
    let lim = limit.unwrap_or(15);
    tauri::async_runtime::spawn_blocking(move || read_bus_blocking(repo_root, lim))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {e}"))?
}

fn read_proposals_blocking(repo_root: String) -> Result<Vec<ProposalInfo>, String> {
    let memo = memo_root(&repo_root);
    let p_path = memo.join(".claude").join("proposals.jsonl");
    let a_path = memo.join(".claude").join("agent-approvals.jsonl");

    // approvals 안의 id set 로 decided 여부 마킹
    let mut decided_map: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    if let Ok(content) = fs::read_to_string(&a_path) {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
            let id = v.get("objId").and_then(|x| x.as_str()).map(|s| s.to_string());
            let st = v.get("status").and_then(|x| x.as_str()).map(|s| s.to_string());
            if let (Some(i), Some(s)) = (id, st) {
                decided_map.insert(i, s);
            }
        }
    }

    let content = fs::read_to_string(&p_path)
        .map_err(|e| format!("proposals.jsonl read 실패 ({}): {e}", p_path.display()))?;
    let mut out = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
        if id.is_empty() {
            continue;
        }
        let env = v.get("envelope");
        let payload = env.and_then(|e| e.get("payload"));
        let title = payload
            .and_then(|p| p.get("title"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
        let body = payload
            .and_then(|p| p.get("body"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
        let domain = payload
            .and_then(|p| p.get("domain"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
        let kind = env
            .and_then(|e| e.get("kind"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
        let target = v.get("target").and_then(|x| x.as_str()).map(|s| s.to_string());
        let decision = decided_map.get(&id).cloned();
        let decided = decision.is_some();
        out.push(ProposalInfo {
            id,
            ts: v.get("ts").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            target,
            kind,
            domain,
            title,
            body,
            decided,
            decision,
        });
    }
    // 최신이 위
    out.sort_by(|a, b| b.ts.cmp(&a.ts));
    Ok(out)
}

#[tauri::command]
pub async fn agent_team_list_proposals(repo_root: String) -> Result<Vec<ProposalInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || read_proposals_blocking(repo_root))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {e}"))?
}

fn decide_proposal_blocking(
    repo_root: String,
    id: String,
    decision: String,
    note: Option<String>,
) -> Result<(), String> {
    if id.is_empty() {
        return Err("proposal id 비어있음".to_string());
    }
    let normalized = decision.to_lowercase();
    if !matches!(normalized.as_str(), "approved" | "rejected" | "deferred") {
        return Err(format!("decision 값 부적합 (approved/rejected/deferred 만): {decision}"));
    }
    let memo = memo_root(&repo_root);
    let path = memo.join(".claude").join("agent-approvals.jsonl");
    let ts = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let mut entry = serde_json::Map::new();
    entry.insert("ts".into(), serde_json::Value::String(ts));
    entry.insert("objId".into(), serde_json::Value::String(id));
    entry.insert("core".into(), serde_json::Value::String("karmoapp-gui".into()));
    entry.insert("status".into(), serde_json::Value::String(normalized));
    if let Some(n) = note {
        if !n.is_empty() {
            entry.insert("reason".into(), serde_json::Value::String(n));
        }
    }
    let line = serde_json::to_string(&entry).map_err(|e| format!("serialize: {e}"))?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open {} 실패: {e}", path.display()))?;
    use std::io::Write;
    writeln!(file, "{line}").map_err(|e| format!("write {} 실패: {e}", path.display()))?;
    Ok(())
}

#[tauri::command]
pub async fn agent_team_decide_proposal(
    repo_root: String,
    id: String,
    decision: String,
    note: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || decide_proposal_blocking(repo_root, id, decision, note))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {e}"))?
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CadenceTickResult {
    pub ok: bool,
    pub elapsed_ms: u128,
    pub stdout_tail: String,
    pub stderr_tail: String,
    pub exit_code: Option<i32>,
}

fn yawnbot_dir(repo_root: &str) -> PathBuf {
    // 3 케이스 동형 — KAR-116 path-resolve fix.
    let p = PathBuf::from(repo_root);
    let direct = p.join("apps").join("discord-bots").join("apps").join("yawnbot");
    if direct.exists() {
        return direct;
    }
    // umbrella karmoddrine: repo_root/Mascari4615.github.io/...
    let nested = p
        .join("Mascari4615.github.io")
        .join("apps")
        .join("discord-bots")
        .join("apps")
        .join("yawnbot");
    if nested.exists() {
        return nested;
    }
    // memo 형제: repo_root/../Mascari4615.github.io/...
    if let Some(parent) = p.parent() {
        let sibling = parent
            .join("Mascari4615.github.io")
            .join("apps")
            .join("discord-bots")
            .join("apps")
            .join("yawnbot");
        if sibling.exists() {
            return sibling;
        }
    }
    direct
}

fn tail_lines(s: &str, max: usize) -> String {
    let lines: Vec<&str> = s.lines().collect();
    let start = lines.len().saturating_sub(max);
    lines[start..].join("\n")
}

fn run_cadence_tick_blocking(repo_root: String, include_worker: bool) -> Result<CadenceTickResult, String> {
    let yawnbot = yawnbot_dir(&repo_root);
    if !yawnbot.exists() {
        return Err(format!("yawnbot 디렉토리 없음: {}", yawnbot.display()));
    }
    let dist = yawnbot.join("dist").join("src").join("bot").join("agent-cadence.js");
    if !dist.exists() {
        return Err(format!(
            "yawnbot dist 산출물 없음 ({}). 먼저 `cd {} && npm run build` 실행.",
            dist.display(),
            yawnbot.display()
        ));
    }

    let memo = memo_root(&repo_root);
    let started = std::time::Instant::now();
    let mut cmd = std::process::Command::new(if cfg!(windows) { "npm.cmd" } else { "npm" });
    cmd.current_dir(&yawnbot).arg("run").arg("cadence-tick");
    if include_worker {
        cmd.arg("--").arg("--include-worker");
    }
    cmd.env("MEMO_REPO_PATH", memo.as_os_str());
    cmd.stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);

    let output = cmd
        .output()
        .map_err(|e| format!("npm spawn 실패: {e}"))?;
    let elapsed_ms = started.elapsed().as_millis();
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Ok(CadenceTickResult {
        ok: output.status.success(),
        elapsed_ms,
        stdout_tail: tail_lines(&stdout, 30),
        stderr_tail: tail_lines(&stderr, 30),
        exit_code: output.status.code(),
    })
}

#[tauri::command]
pub async fn agent_team_run_cadence_tick(
    repo_root: String,
    include_worker: Option<bool>,
) -> Result<CadenceTickResult, String> {
    let iw = include_worker.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || run_cadence_tick_blocking(repo_root, iw))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {e}"))?
}

fn run_cadence_tick_prod_blocking(
    repo_root: String,
    include_worker: bool,
) -> Result<CadenceTickResult, String> {
    // 노트북 yawnbot-prod cadence 1회 = memo/scripts/yawnbot-prod-cadence-tick.mjs
    // (laptop-ops `/exec` 게이트웨이 우회). 데스크톱 측 ~/.laptop-ops-token 자동 로드.
    let memo = memo_root(&repo_root);
    let script = memo.join("scripts").join("yawnbot-prod-cadence-tick.mjs");
    if !script.exists() {
        return Err(format!("prod-cadence-tick script 없음: {}", script.display()));
    }

    let started = std::time::Instant::now();
    let mut cmd = std::process::Command::new(if cfg!(windows) { "node.exe" } else { "node" });
    cmd.current_dir(&memo).arg(&script);
    if include_worker {
        cmd.arg("--include-worker");
    }
    cmd.stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);

    let output = cmd.output().map_err(|e| format!("node spawn 실패: {e}"))?;
    let elapsed_ms = started.elapsed().as_millis();
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Ok(CadenceTickResult {
        ok: output.status.success(),
        elapsed_ms,
        stdout_tail: tail_lines(&stdout, 30),
        stderr_tail: tail_lines(&stderr, 30),
        exit_code: output.status.code(),
    })
}

#[tauri::command]
pub async fn agent_team_run_cadence_tick_prod(
    repo_root: String,
    include_worker: Option<bool>,
) -> Result<CadenceTickResult, String> {
    let iw = include_worker.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || run_cadence_tick_prod_blocking(repo_root, iw))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {e}"))?
}

fn read_cards_blocking(repo_root: String, limit: usize) -> Result<Vec<CardInfo>, String> {
    let memo = memo_root(&repo_root);
    let mut all: Vec<CardInfo> = Vec::new();

    // 1) agents/<id>/mem/*.jsonl
    let agents = agents_dir(&memo);
    if let Ok(rd) = fs::read_dir(&agents) {
        for entry in rd.flatten() {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let mem = dir.join("mem");
            let Ok(mem_rd) = fs::read_dir(&mem) else { continue };
            let agent_id = dir
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_string())
                .unwrap_or_default();
            for f in mem_rd.flatten() {
                let path = f.path();
                if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                    continue;
                }
                let Ok(content) = fs::read_to_string(&path) else { continue };
                for line in content.lines() {
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }
                    let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
                    let topic = v.get("topic").and_then(|x| x.as_str()).map(|s| s.to_string());
                    let summary = v.get("summary").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    let task_ids = extract_task_ids(&format!("{} {summary}", topic.as_deref().unwrap_or("")));
                    all.push(CardInfo {
                        ts: v.get("ts").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                        source: format!("agent:{agent_id}"),
                        session: v.get("session").and_then(|x| x.as_str()).map(|s| s.to_string()),
                        kind: v.get("type").and_then(|x| x.as_str()).map(|s| s.to_string()),
                        topic,
                        summary,
                        task_ids,
                    });
                }
            }
        }
    }

    // 2) discoveries/*.jsonl
    let disc = memo.join(".claude").join("discoveries");
    if let Ok(rd) = fs::read_dir(&disc) {
        for entry in rd.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let slug = path
                .file_stem()
                .and_then(|n| n.to_str())
                .map(|s| s.to_string())
                .unwrap_or_default();
            let Ok(content) = fs::read_to_string(&path) else { continue };
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
                let topic = v.get("topic").and_then(|x| x.as_str()).map(|s| s.to_string());
                let summary = v.get("summary").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let task_ids = extract_task_ids(&format!("{} {summary}", topic.as_deref().unwrap_or("")));
                all.push(CardInfo {
                    ts: v.get("ts").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                    source: format!("discovery:{slug}"),
                    session: v.get("session").and_then(|x| x.as_str()).map(|s| s.to_string()),
                    kind: v.get("type").and_then(|x| x.as_str()).map(|s| s.to_string()),
                    topic,
                    summary,
                    task_ids,
                });
            }
        }
    }

    // ts 내림차순 (가장 최근이 위)
    all.sort_by(|a, b| b.ts.cmp(&a.ts));
    all.truncate(limit);
    Ok(all)
}

#[tauri::command]
pub async fn agent_team_list_cards(
    repo_root: String,
    limit: Option<usize>,
) -> Result<Vec<CardInfo>, String> {
    let lim = limit.unwrap_or(80);
    tauri::async_runtime::spawn_blocking(move || read_cards_blocking(repo_root, lim))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {e}"))?
}

#[tauri::command]
pub async fn agent_team_list_agents(repo_root: String) -> Result<Vec<AgentInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || read_agents_blocking(repo_root))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {e}"))?
}

#[tauri::command]
pub async fn agent_team_list_objectives(repo_root: String) -> Result<Vec<ObjectiveInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || read_objectives_blocking(repo_root))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {e}"))?
}

#[tauri::command]
pub async fn agent_team_list_sessions(repo_root: String) -> Result<Vec<SessionInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || read_sessions_blocking(repo_root))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {e}"))?
}

// ────────────────────────────────────────────────────────────────────────
// TASK Board (TASK-YB-043 — TASK 정리 표면의 단일 창구).
//
// memo TASK md = 정본. 예전엔 yawnbot 이 같은 TASK 를 Discord #team-work
// forum-post 로도 투영했고 이 목록이 그 포스트 링크를 얹었으나, 두 표면을
// 나란히 두는 값이 없어 Discord 쪽을 걷어냈다. 남은 표면 = 이 화면 하나.
//
// 본 명령은 read-only — 5 TASK_DIRS scan → entry 목록.

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TaskBoardEntry {
    pub task_id: String,
    pub status: String,
    pub title: String,
    /// memoRoot 기준 상대 경로 (open-in-editor 등 호출자 활용).
    pub md_path: String,
}

const TASK_DIRS: [&str; 5] = [
    "tasks",
    "wm/tasks",
    "life/tasks",
    "projects/karmolab/tasks",
    "projects/yawnbot/tasks",
];

const PICKABLE_STATUSES: [&str; 9] = [
    "ready",
    "in_progress",
    "in-progress",
    "active",
    "seed",
    "in_review",
    "unit_verified",
    "design",
    "hold",
];

/// `TASK-(KAR|WM|KL|YB|LIFE|HOBBY|LEARN)-NNN[-suffix]` 추출 — filename 기준.
fn parse_task_id(filename: &str) -> Option<String> {
    let base = filename.strip_suffix(".md").unwrap_or(filename);
    let prefixes = ["TASK-KAR-", "TASK-WM-", "TASK-KL-", "TASK-YB-", "TASK-LIFE-", "TASK-HOBBY-", "TASK-LEARN-"];
    for p in prefixes.iter() {
        if base.starts_with(p) {
            // 다음 - 또는 끝까지를 id 본체
            let rest = &base[p.len()..];
            let end = rest.find('-').unwrap_or(rest.len());
            return Some(format!("{}{}", p, &rest[..end]));
        }
    }
    None
}

/// frontmatter status / title 추출. title 우선순위: `title:` 필드 > 첫 `# H1` > filename body.
fn parse_status_title(content: &str, filename: &str) -> (Option<String>, String) {
    let mut status: Option<String> = None;
    let mut fm_title: Option<String> = None;
    let mut h1_title: Option<String> = None;
    let mut in_fm = false;
    let mut fm_done = false;
    for line in content.lines() {
        if !fm_done {
            if line.starts_with("---") {
                if in_fm {
                    fm_done = true;
                } else {
                    in_fm = true;
                }
                continue;
            }
            if in_fm {
                if let Some(v) = line.strip_prefix("status:").map(|s| s.trim()) {
                    status = Some(v.trim_matches(|c| c == '"' || c == '\'').to_string());
                } else if let Some(v) = line.strip_prefix("title:").map(|s| s.trim()) {
                    fm_title = Some(v.trim_matches(|c| c == '"' || c == '\'').to_string());
                }
            }
        } else if h1_title.is_none() {
            if let Some(t) = line.strip_prefix("# ") {
                h1_title = Some(t.trim().to_string());
            }
        }
    }
    let fallback = filename
        .strip_suffix(".md")
        .unwrap_or(filename)
        .splitn(4, '-')
        .nth(3)
        .unwrap_or("")
        .replace('-', " ");
    let title = fm_title
        .or(h1_title)
        .unwrap_or_else(|| if fallback.trim().is_empty() { "(제목 없음)".to_string() } else { fallback });
    (status, title)
}

fn read_tasks_blocking(repo_root: String) -> Result<Vec<TaskBoardEntry>, String> {
    let memo = memo_root(&repo_root);

    // 5 TASK_DIRS scan
    let mut out: Vec<TaskBoardEntry> = Vec::new();
    for dir in TASK_DIRS.iter() {
        let dir_abs = memo.join(dir);
        if !dir_abs.exists() {
            continue;
        }
        let Ok(entries) = fs::read_dir(&dir_abs) else { continue };
        for e in entries.flatten() {
            let p = e.path();
            let Some(name) = p.file_name().and_then(|s| s.to_str()) else { continue };
            if !name.ends_with(".md") {
                continue;
            }
            let Some(task_id) = parse_task_id(name) else { continue };
            let Ok(content) = fs::read_to_string(&p) else { continue };
            let (status, title) = parse_status_title(&content, name);
            let Some(status) = status else { continue };
            if !PICKABLE_STATUSES.contains(&status.as_str()) {
                continue;
            }
            let rel = format!("{}/{}", dir, name);
            out.push(TaskBoardEntry {
                task_id,
                status,
                title,
                md_path: rel,
            });
        }
    }
    // 정렬: in_progress 우선, 그 다음 status 순, 같으면 id 순
    fn status_prio(s: &str) -> u8 {
        match s {
            "in_progress" | "in-progress" | "active" => 0,
            "in_review" | "unit_verified" => 1,
            "design" => 2,
            "ready" => 3,
            "hold" => 4,
            "seed" => 5,
            _ => 6,
        }
    }
    out.sort_by(|a, b| {
        status_prio(&a.status)
            .cmp(&status_prio(&b.status))
            .then(a.task_id.cmp(&b.task_id))
    });
    Ok(out)
}

#[tauri::command]
pub async fn agent_team_list_tasks(repo_root: String) -> Result<Vec<TaskBoardEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || read_tasks_blocking(repo_root))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {e}"))?
}
