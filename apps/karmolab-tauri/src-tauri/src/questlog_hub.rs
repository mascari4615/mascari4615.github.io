// questlog_hub.rs
// QuestLog Hub 용 상태 스냅샷 명령 (TASK-KL-035 — KarmoDDrine 대시보드 흡수).
//
// 데이터 소스 (모두 로컬, github.io 레포 외부):
//   - ~/repos/karmoddrine/memo/.claude/active-sessions.md  (보드)
//   - ~/repos/karmoddrine/memo/INDEX.md                    (룰 단일 출처 표)
//   - 3 레포 git log -10                                    (memo / Mascari4615.github.io / WitchMendokusai)
//   - ~/.claude/commands/, ~/.claude/hooks/                (도구 인벤토리)
//   - ~/.claude/settings.json                              (hooks 등록)
//
// 클라이언트는 invoke('get_questlog_hub') 로 호출, 주기 폴링.

use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Tauri GUI 앱에서 console subsystem 자식(git, tasklist 등)을 spawn 하면 매번
/// console 창이 잠깐 깜빡인다. `CREATE_NO_WINDOW` 로 그걸 막는다 — 폴링 invoke
/// 가 매 N초 트리거이므로 hidden flag 빠지면 즉시 사용자 시야에 노이즈.
///
/// 또 `stdin = Stdio::null()` 강제 — Tauri GUI 프로세스의 stdin handle 은 NULL 인데
/// default `Stdio::inherit()` 면 자식이 stdin read 시 무한 hang (TASK-KL-035 v0.1.16
/// 원인 의심). git 자체는 stdin read 안 하지만 안전망.
fn apply_no_window(cmd: &mut Command) {
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.stdin(Stdio::null());
}

/// 단계별 진단 로그 — `%TEMP%/karmolab-questlog-hub.log` 에 append.
/// Tauri release build 가 console 없어 println 안 보임. file log 가 정본.
fn diag_log(stage: &str, elapsed_ms: u128, detail: &str) {
    let path = std::env::temp_dir().join("karmolab-questlog-hub.log");
    let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let line = format!("[{}] {:>5}ms · {} · {}\n", ts, elapsed_ms, stage, detail);
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = f.write_all(line.as_bytes());
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestlogHub {
    generated_at_unix: u64,
    home: Option<String>,
    umbrella: Option<String>,
    board: Option<BoardData>,
    commits: BTreeMap<String, Vec<CommitInfo>>,
    rules: Vec<RuleRow>,
    tools: Tools,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardData {
    raw: String,
    rows: Vec<BoardRow>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardRow {
    start: String,
    topic: String,
    targets: String,
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    hash: String,
    date: String,
    subject: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleRow {
    category: String,
    canonical: String,
    cite: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tools {
    commands: Vec<String>,
    hooks: Vec<String>,
    settings_hooks: BTreeMap<String, String>,
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

fn umbrella_dir() -> Option<PathBuf> {
    home_dir().map(|h| h.join("repos").join("karmoddrine"))
}

fn read_text(path: &Path) -> Option<String> {
    let raw = fs::read_to_string(path).ok()?;
    Some(
        raw.strip_prefix('\u{FEFF}')
            .map(|x| x.to_string())
            .unwrap_or(raw),
    )
}

/// Markdown 표 행 파싱. 지정한 `## <pattern>` 섹션 안의 `|...|` 라인만 수집.
/// 분리자 라인 (`| --- | --- |`) 과 컬럼 헤더 (첫 데이터 라인) 는 제외.
fn parse_table_rows(content: &str, section_pattern: &str) -> Vec<Vec<String>> {
    let mut in_section = false;
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut is_first_row = true;
    for raw_line in content.split('\n') {
        let line = raw_line.trim_end_matches('\r');
        if line.starts_with("##") && line.contains(section_pattern) {
            in_section = true;
            is_first_row = true;
            continue;
        }
        if !in_section {
            continue;
        }
        if line.starts_with("##") {
            break;
        }
        if !line.starts_with('|') {
            continue;
        }
        let inner = line.trim_start_matches('|').trim_end_matches('|');
        // 분리자 라인
        let is_separator = inner.split('|').all(|c| {
            let t = c.trim();
            t.is_empty() || t.chars().all(|ch| ch == '-' || ch == ':')
        });
        if is_separator {
            continue;
        }
        if is_first_row {
            is_first_row = false;
            continue;
        }
        let cells: Vec<String> = inner.split('|').map(|c| c.trim().to_string()).collect();
        rows.push(cells);
    }
    rows
}

fn parse_board(content: &str) -> BoardData {
    let rows_raw = parse_table_rows(content, "활성 세션");
    let rows = rows_raw
        .into_iter()
        .filter(|r| r.len() >= 4)
        .map(|r| BoardRow {
            start: r[0].clone(),
            topic: r[1].clone(),
            targets: r[2].clone(),
            status: r[3].clone(),
        })
        .collect();
    BoardData {
        raw: content.to_string(),
        rows,
    }
}

fn parse_rules(content: &str) -> Vec<RuleRow> {
    parse_table_rows(content, "룰 단일 출처")
        .into_iter()
        .filter(|r| r.len() >= 3)
        .map(|r| RuleRow {
            category: r[0].clone(),
            canonical: r[1].clone(),
            cite: r[2].clone(),
        })
        .collect()
}

fn git_log(repo: &Path, n: usize) -> Vec<CommitInfo> {
    if !repo.join(".git").exists() {
        return Vec::new();
    }
    let mut cmd = Command::new("git");
    cmd.arg("-C")
        .arg(repo)
        .arg("log")
        .arg(format!("-{}", n))
        .arg("--pretty=format:%h%x09%ad%x09%s")
        .arg("--date=short");
    apply_no_window(&mut cmd);
    let out = cmd.output();
    match out {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .lines()
            .filter(|l| !l.is_empty())
            .filter_map(|l| {
                let parts: Vec<&str> = l.splitn(3, '\t').collect();
                if parts.len() == 3 {
                    Some(CommitInfo {
                        hash: parts[0].to_string(),
                        date: parts[1].to_string(),
                        subject: parts[2].to_string(),
                    })
                } else {
                    None
                }
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn list_files(dir: &Path, ext: &str) -> Vec<String> {
    fs::read_dir(dir)
        .ok()
        .map(|rd| {
            let mut out: Vec<String> = rd
                .filter_map(|e| e.ok())
                .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some(ext))
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect();
            out.sort();
            out
        })
        .unwrap_or_default()
}

fn read_settings_hooks(path: &Path) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    let Some(text) = read_text(path) else {
        return out;
    };
    let json: Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return out,
    };
    let Some(hooks) = json.get("hooks") else {
        return out;
    };
    let Some(obj) = hooks.as_object() else {
        return out;
    };
    for (event, value) in obj {
        let mut cmds: Vec<String> = Vec::new();
        if let Some(arr) = value.as_array() {
            for entry in arr {
                if let Some(inner_hooks) = entry.get("hooks").and_then(|h| h.as_array()) {
                    for h in inner_hooks {
                        if let Some(cmd) = h.get("command").and_then(|c| c.as_str()) {
                            cmds.push(cmd.to_string());
                        }
                    }
                }
            }
        }
        out.insert(event.clone(), cmds.join(" ; "));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_BOARD: &str = "# 보드\n\n## 규칙\n- 첫 행 추가\n\n## 활성 세션\n| 시작 (KST) | 주제 | 타겟 파일 | 상태 |\n| ---------- | ---- | ---------- | ---- |\n| 2026-04-26 | TASK-A | `WitchMendokusai/Foo.cs` | pending-verify |\n| 2026-04-30 | dashboard | `apps/karmolab-tauri/src-tauri/src/karmoddrine_state.rs` | step1 |\n";

    const SAMPLE_INDEX: &str = "# INDEX\n\n## 시작점\n| 파일 | 스코프 |\n| --- | --- |\n| K | umbrella |\n\n## 룰 단일 출처\n> 어떤 룰\n\n| 룰 카테고리 | Canonical | Cite |\n| --- | --- | --- |\n| **공통 작업 원칙** | K § 공통 작업 원칙 | S #10 |\n| WM C# | W | M cite |\n";

    #[test]
    fn parses_board_two_rows() {
        let board = parse_board(SAMPLE_BOARD);
        assert_eq!(board.rows.len(), 2);
        assert_eq!(board.rows[0].start, "2026-04-26");
        assert_eq!(board.rows[0].status, "pending-verify");
        assert_eq!(board.rows[1].topic, "dashboard");
    }

    #[test]
    fn parses_rules_two_rows() {
        let rules = parse_rules(SAMPLE_INDEX);
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[0].canonical, "K § 공통 작업 원칙");
        assert_eq!(rules[1].category, "WM C#");
    }

    #[test]
    fn parses_no_section_returns_empty() {
        let rules = parse_rules("# 다른 문서\n## 다른 섹션\n| a | b | c |\n");
        assert_eq!(rules.len(), 0);
    }

    #[test]
    fn skips_table_separator() {
        let rows = parse_table_rows("## 활성 세션\n| a | b |\n| --- | --- |\n| 1 | 2 |\n", "활성 세션");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0], vec!["1", "2"]);
    }
}

/// async + spawn_blocking — sync command 의 main thread block 을 피한다 (TASK-KL-035 v0.1.16
/// stuck 원인 분석에서 떠오른 후속 fix). 단계별 file log + 단계 timeout.
#[tauri::command]
pub async fn get_questlog_hub() -> Result<QuestlogHub, String> {
    tauri::async_runtime::spawn_blocking(get_questlog_hub_blocking)
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

fn get_questlog_hub_blocking() -> Result<QuestlogHub, String> {
    let t_start = Instant::now();
    diag_log("entry", 0, "get_questlog_hub_blocking 진입");

    let home = home_dir();
    let umbrella = umbrella_dir();
    diag_log(
        "paths",
        t_start.elapsed().as_millis(),
        &format!(
            "home={:?} umbrella={:?}",
            home.as_ref().map(|p| p.display().to_string()),
            umbrella.as_ref().map(|p| p.display().to_string())
        ),
    );

    let generated_at_unix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // 보드
    let t_board = Instant::now();
    let board = umbrella.as_ref().and_then(|u| {
        let p = u.join("memo").join(".claude").join("active-sessions.md");
        read_text(&p).map(|c| parse_board(&c))
    });
    diag_log(
        "board",
        t_board.elapsed().as_millis(),
        &format!(
            "rows={}",
            board.as_ref().map(|b| b.rows.len()).unwrap_or(0)
        ),
    );

    // INDEX 룰 단일 출처
    let t_rules = Instant::now();
    let rules = umbrella
        .as_ref()
        .and_then(|u| {
            let p = u.join("memo").join("INDEX.md");
            read_text(&p).map(|c| parse_rules(&c))
        })
        .unwrap_or_default();
    diag_log(
        "rules",
        t_rules.elapsed().as_millis(),
        &format!("count={}", rules.len()),
    );

    // 3 레포 git log
    let mut commits: BTreeMap<String, Vec<CommitInfo>> = BTreeMap::new();
    if let Some(u) = umbrella.as_ref() {
        for repo in ["memo", "Mascari4615.github.io", "WitchMendokusai"] {
            let t_repo = Instant::now();
            let path = u.join(repo);
            let log = git_log(&path, 10);
            diag_log(
                &format!("git-log:{}", repo),
                t_repo.elapsed().as_millis(),
                &format!("count={}", log.len()),
            );
            commits.insert(repo.to_string(), log);
        }
    }

    // 도구 인벤토리
    let t_tools = Instant::now();
    let (commands, hooks_files, settings_hooks) = if let Some(h) = home.as_ref() {
        let claude = h.join(".claude");
        let cmds = list_files(&claude.join("commands"), "md");
        let hks = list_files(&claude.join("hooks"), "sh");
        let sh = read_settings_hooks(&claude.join("settings.json"));
        (cmds, hks, sh)
    } else {
        (Vec::new(), Vec::new(), BTreeMap::new())
    };
    diag_log(
        "tools",
        t_tools.elapsed().as_millis(),
        &format!(
            "cmds={} hooks={} settings={}",
            commands.len(),
            hooks_files.len(),
            settings_hooks.len()
        ),
    );

    diag_log(
        "done",
        t_start.elapsed().as_millis(),
        "get_questlog_hub_blocking 완료",
    );

    Ok(QuestlogHub {
        generated_at_unix,
        home: home.map(|p| p.to_string_lossy().to_string()),
        umbrella: umbrella.map(|p| p.to_string_lossy().to_string()),
        board,
        commits,
        rules,
        tools: Tools {
            commands,
            hooks: hooks_files,
            settings_hooks,
        },
    })
}
