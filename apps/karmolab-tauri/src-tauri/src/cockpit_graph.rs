// cockpit_graph — Cockpit 위젯 (TASK-KL-082) 의 Rust substrate.
//
// 역할:
//   - graph.json (memo/.claude/graph.json) read / coord patch write
//   - 5 활성 신호 수집: active-sessions / proposals / git-commits / nssm-service / ci-runs
//
// 패턴:
//   - 모든 command = async + spawn_blocking (KL-043 정합 — IO heavy)
//   - repo_root 는 호출자(widget) 가 localdev_get_repo_root 로 가져와서 전달
//   - 15s TTL 캐시는 TS activity-collector.ts 쪽이 담당; 여기서는 캐시 없이 1-shot

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

// ─── graph.json 스키마 (최소 필요 필드만, 나머지는 as-is JSON Value) ────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NodeCoord {
    pub id: String,
    pub x: f64,
    pub y: f64,
    /// 어느 컬렉션을 patch 할지. 미설정 시 'node' (하위호환).
    /// 값: "node" | "anchor" | "group"
    #[serde(default)]
    pub kind: Option<String>,
}

/// cockpit_get_graph_spec 반환 타입.
/// serde_json::Value 로 전체 graph.json 을 그대로 넘기면 TS 타입 검증 부담이 없음.
/// 필드 추가 시 graph.json 만 수정하면 되는 Deep Module 정합.
#[derive(Serialize, Debug)]
pub struct GraphSpecResponse {
    pub ok: bool,
    pub spec: serde_json::Value,
}

/// cockpit_save_graph_coords 의 payload.
#[derive(Deserialize, Debug)]
pub struct SaveCoordsPayload {
    pub repo_root: String,
    pub updates: Vec<NodeCoord>,
}

// ─── 활성 신호 스키마 ────────────────────────────────────────────────────────

#[derive(Serialize, Debug, Default)]
pub struct SlotInfo {
    pub slot: String,
    pub pwd_short: String,
    pub topic: String,
}

#[derive(Serialize, Debug, Default)]
pub struct ProposalInfo {
    pub id: String,
    pub short_summary: String,
}

#[derive(Serialize, Debug, Default)]
pub struct RepoCommitInfo {
    pub count: u32,
    pub last_sha: String,
    pub last_msg: String,
}

#[derive(Serialize, Debug, Default)]
pub struct CiRunInfo {
    pub workflow: String,
    pub status: String,
    pub run_id: String,
}

#[derive(Serialize, Debug, Default)]
pub struct InProgressTaskInfo {
    pub id: String,
    pub title: String,
    pub domain: String,
}

#[derive(Serialize, Debug, Default)]
pub struct ActivitySnapshot {
    pub ts: u64,
    pub slots: Vec<SlotInfo>,
    pub proposals: Vec<ProposalInfo>,
    pub commits_by_repo: std::collections::HashMap<String, RepoCommitInfo>,
    pub services: std::collections::HashMap<String, String>,
    pub ci_runs: Vec<CiRunInfo>,
    pub in_progress_tasks: Vec<InProgressTaskInfo>,
}

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

fn graph_json_path(repo_root: &str) -> PathBuf {
    // umbrella(karmoddrine) 구조 — memo 는 github.io 의 *형제* (각자 독립 repo).
    // repoRoot=...\Mascari4615.github.io → parent=...\karmoddrine → memo/.claude/graph.json
    let p = Path::new(repo_root);
    p.parent().unwrap_or(p).join("memo").join(".claude").join("graph.json")
}

fn now_epoch() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// active-sessions.md 파싱. 파이프 구분 마크다운 표 형식.
/// 헤더 행 / 구분 행 건너뜀. slot / pwd_short / topic 열 읽음.
fn parse_active_sessions(content: &str) -> Vec<SlotInfo> {
    let mut result = Vec::new();
    let mut header: Vec<String> = Vec::new();
    let mut past_separator = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with('|') || trimmed.ends_with('|') == false {
            continue;
        }
        let cols: Vec<String> = trimmed
            .trim_matches('|')
            .split('|')
            .map(|s| s.trim().to_string())
            .collect();
        if header.is_empty() {
            header = cols.iter().map(|s| s.to_lowercase()).collect();
            continue;
        }
        // 구분 행 (---) 건너뜀
        if cols.iter().all(|c| c.chars().all(|ch| ch == '-' || ch == ':' || ch == ' ')) {
            past_separator = true;
            continue;
        }
        if !past_separator { continue; }

        let get_any = |keys: &[&str]| -> String {
            for k in keys {
                if let Some(i) = header.iter().position(|h| h.contains(k)) {
                    if let Some(v) = cols.get(i) {
                        if !v.is_empty() { return v.clone(); }
                    }
                }
            }
            String::new()
        };

        // 헤더: Name | Task | 시작 (KST) | 주제 | 타겟 파일 | 상태  (한글)
        let slot = get_any(&["slot", "name"]);
        if slot.is_empty() || slot.chars().all(|c| c == '-' || c == ' ') { continue; }
        result.push(SlotInfo {
            slot,
            pwd_short: get_any(&["pwd", "타겟", "파일"]),
            topic: get_any(&["topic", "주제"]),
        });
    }
    result
}

/// proposals 디렉토리 안 .md/.json 파일 스캔.
fn collect_proposals(proposals_dir: &Path) -> Vec<ProposalInfo> {
    let Ok(entries) = fs::read_dir(proposals_dir) else { return Vec::new(); };
    let mut result = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "md" && ext != "json" { continue; }
        let id = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
        let short_summary = fs::read_to_string(&path)
            .ok()
            .and_then(|c| {
                c.lines()
                    .find(|l| !l.trim().is_empty() && !l.starts_with("---") && !l.starts_with('#'))
                    .map(|l| l.trim().chars().take(60).collect())
            })
            .unwrap_or_else(|| id.clone());
        result.push(ProposalInfo { id, short_summary });
    }
    result
}

/// git log --since="15 minutes ago" --oneline.
fn git_recent_commits_safe(repo_path: &Path) -> RepoCommitInfo {
    let mut cmd = std::process::Command::new("git");
    cmd.args(["log", "--since=15 minutes ago", "--oneline"])
        .current_dir(repo_path);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let Ok(out) = cmd.output() else { return RepoCommitInfo::default(); };
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let count = lines.len() as u32;
    let (last_sha, last_msg) = if let Some(first) = lines.first() {
        let mut parts = first.splitn(2, ' ');
        let sha = parts.next().unwrap_or("").to_string();
        let msg = parts.next().unwrap_or("").to_string();
        (sha, msg)
    } else {
        (String::new(), String::new())
    };
    RepoCommitInfo { count, last_sha, last_msg }
}

/// laptop-ops HTTP 로 nssm 서비스 status 조회.
/// 토큰: env LAPTOP_OPS_TOKEN 또는 ~/.laptop-ops-token
/// 실패 시 "unknown" 반환.
fn get_service_status(service: &str, token: &str) -> String {
    let url = format!("https://laptop.mascari4615.com/service/{}/status", service);
    let mut cmd = std::process::Command::new("curl");
    cmd.args([
        "-s", "--max-time", "5",
        "-H", &format!("Authorization: Bearer {}", token),
        &url,
    ]);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);

    let Ok(out) = cmd.output() else { return "unknown".to_string(); };
    let body = String::from_utf8_lossy(&out.stdout).to_string();
    // body 예: {"status":"running"} 또는 {"status":"stopped"}
    if body.contains("\"running\"") { "running".to_string() }
    else if body.contains("\"stopped\"") { "stopped".to_string() }
    else { "unknown".to_string() }
}

fn home_dir() -> Option<PathBuf> {
    // Windows: USERPROFILE. Unix: HOME.
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()
        .map(PathBuf::from)
}

fn load_laptop_ops_token() -> String {
    // env 우선
    if let Ok(t) = std::env::var("LAPTOP_OPS_TOKEN") {
        if !t.trim().is_empty() { return t.trim().to_string(); }
    }
    // ~/.laptop-ops-token
    if let Some(home) = home_dir() {
        if let Ok(t) = fs::read_to_string(home.join(".laptop-ops-token")) {
            let trimmed = t.trim().to_string();
            if !trimmed.is_empty() { return trimmed; }
        }
    }
    String::new()
}

/// gh run list --json status,name,databaseId --limit 5 × 3 repo.
fn collect_ci_runs() -> Vec<CiRunInfo> {
    let repos = [
        "mascari4615/Witch-Mendokusai",
        "mascari4615/mascari4615.github.io",
        "mascari4615/memo",
    ];
    let mut result = Vec::new();
    for repo in &repos {
        let mut cmd = std::process::Command::new("gh");
        cmd.args([
            "run", "list",
            "--repo", repo,
            "--json", "status,name,databaseId",
            "--limit", "5",
        ]);
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000);
        let Ok(out) = cmd.output() else { continue; };
        let text = String::from_utf8_lossy(&out.stdout).to_string();
        let Ok(arr) = serde_json::from_str::<serde_json::Value>(&text) else { continue; };
        if let Some(items) = arr.as_array() {
            for item in items {
                let workflow = item["name"].as_str().unwrap_or("").to_string();
                let status = item["status"].as_str().unwrap_or("").to_string();
                let run_id = item["databaseId"].to_string();
                result.push(CiRunInfo { workflow, status, run_id });
            }
        }
    }
    result
}

// ─── Tauri commands ──────────────────────────────────────────────────────────

/// graph.json 전체를 JSON Value 로 반환.
/// repo_root = karmoddrine umbrella 루트 (localdev_get_repo_root 결과).
#[tauri::command]
pub async fn cockpit_get_graph_spec(repo_root: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = graph_json_path(&repo_root);
        let text = fs::read_to_string(&path)
            .map_err(|e| format!("graph.json 읽기 실패 ({}): {}", path.display(), e))?;
        serde_json::from_str::<serde_json::Value>(&text)
            .map_err(|e| format!("graph.json JSON 파싱 실패: {}", e))
    })
    .await
    .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

/// 드래그로 이동한 노드들의 x/y 만 graph.json 에 patch write.
/// 다른 필드 (edges / groups / _meta 등) 는 절대 건드리지 않음.
#[tauri::command]
pub async fn cockpit_save_graph_coords(
    repo_root: String,
    updates: Vec<NodeCoord>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = graph_json_path(&repo_root);
        let text = fs::read_to_string(&path)
            .map_err(|e| format!("graph.json 읽기 실패: {}", e))?;
        let mut spec: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("graph.json 파싱 실패: {}", e))?;

        // kind 별 분기 patch. 디폴트 = "node".
        for upd in &updates {
            let kind = upd.kind.as_deref().unwrap_or("node");
            match kind {
                "node" => {
                    if let Some(arr) = spec["nodes"].as_array_mut() {
                        if let Some(n) = arr.iter_mut().find(|n| n["id"].as_str() == Some(&upd.id)) {
                            n["x"] = serde_json::json!(upd.x);
                            n["y"] = serde_json::json!(upd.y);
                        }
                    }
                }
                "anchor" => {
                    if let Some(arr) = spec["ephemeral_anchors"].as_array_mut() {
                        if let Some(n) = arr.iter_mut().find(|n| n["id"].as_str() == Some(&upd.id)) {
                            n["x"] = serde_json::json!(upd.x);
                            n["y"] = serde_json::json!(upd.y);
                        }
                    }
                }
                "group" => {
                    if let Some(arr) = spec["groups"].as_array_mut() {
                        if let Some(g) = arr.iter_mut().find(|g| g["id"].as_str() == Some(&upd.id)) {
                            if let Some(bbox) = g["bbox"].as_object_mut() {
                                bbox.insert("x".to_string(), serde_json::json!(upd.x));
                                bbox.insert("y".to_string(), serde_json::json!(upd.y));
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        let out = serde_json::to_string_pretty(&spec)
            .map_err(|e| format!("graph.json 직렬화 실패: {}", e))?;
        fs::write(&path, out)
            .map_err(|e| format!("graph.json 쓰기 실패: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

/// 5 신호 통합 1-shot 수집. 캐시는 TS 측(activity-collector.ts) 이 담당.
#[tauri::command]
pub async fn cockpit_get_activity(repo_root: String) -> Result<ActivitySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        cockpit_get_activity_blocking(&repo_root)
    })
    .await
    .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

fn cockpit_get_activity_blocking(repo_root: &str) -> Result<ActivitySnapshot, String> {
    // umbrella 구조 — repoRoot=github.io, 형제 = memo / WitchMendokusai. parent 로 올라가 umbrella 기준.
    let p = Path::new(repo_root);
    let base = p.parent().unwrap_or(p);
    let memo = base.join("memo");

    // 1. active-sessions
    let sessions_path = memo.join(".claude").join("active-sessions.md");
    let slots = fs::read_to_string(&sessions_path)
        .map(|c| parse_active_sessions(&c))
        .unwrap_or_default();

    // 2. proposals
    let proposals_dir = memo.join(".claude").join("proposals");
    let proposals = collect_proposals(&proposals_dir);

    // 3. git commits (15m) × 3 repo
    let mut commits_by_repo = std::collections::HashMap::new();
    let repos = [
        ("WitchMendokusai", base.join("WitchMendokusai")),
        ("memo", memo.clone()),
        ("Mascari4615.github.io", base.join("Mascari4615.github.io")),
    ];
    for (name, path) in &repos {
        commits_by_repo.insert(name.to_string(), git_recent_commits_safe(path));
    }

    // 4. prod services (laptop-ops HTTP)
    let token = load_laptop_ops_token();
    let mut services = std::collections::HashMap::new();
    if !token.is_empty() {
        for svc in &["yawnbot-prod", "laptop-ops", "cloudflared"] {
            services.insert(svc.to_string(), get_service_status(svc, &token));
        }
    } else {
        for svc in &["yawnbot-prod", "laptop-ops", "cloudflared"] {
            services.insert(svc.to_string(), "unknown".to_string());
        }
    }

    // 5. CI runs
    let ci_runs = collect_ci_runs();

    // 6. in_progress TASKs — quest_index 재활용 (memo path 명시).
    let in_progress_tasks = collect_in_progress_tasks(&memo);

    Ok(ActivitySnapshot {
        ts: now_epoch(),
        slots,
        proposals,
        commits_by_repo,
        services,
        ci_runs,
        in_progress_tasks,
    })
}

/// memo 안 모든 TASK 중 status=in_progress 만 추출 (defer 항목 v1.5).
fn collect_in_progress_tasks(memo: &Path) -> Vec<InProgressTaskInfo> {
    let memo_str = memo.to_string_lossy().to_string();
    let tree = match crate::quest_index::get_quest_tree_blocking(Some(memo_str)) {
        Ok(t) => t,
        Err(_) => return Vec::new(),
    };
    tree.tasks.into_iter()
        .filter(|t| t.status == "in_progress")
        .map(|t| {
            let domain = t.path.first().cloned().unwrap_or_default();
            InProgressTaskInfo { id: t.id, title: t.title, domain }
        })
        .collect()
}
