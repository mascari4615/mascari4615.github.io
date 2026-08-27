//! Files 금고 업로드 — 데스크톱이 전송기를 붙든다 (change.encrypted-vault 단계 8).
//!
//! 왜 있나: 전송기(`apps/files/src/upload.mjs`)를 사람이 터미널에서 띄우면 그 창·세션이
//! 죽을 때 같이 죽는다. 실제로 2026-08-26 세션에서 몇 시간짜리 업로드가 그렇게 끊겼다.
//! 앱이 detached 로 띄우고 PID 를 적어 두면 창을 닫아도 살아 있고, 앱을 껐다 켜도 다시 붙는다.
//!
//! 경계:
//! - UI 는 **집계 수치만** 본다. 원본 절대경로·파일 이름·열쇠는 command 반환값에도 로그에도 없다.
//! - 실행체는 고정이다 — `node src/upload.mjs --only <대상>`. UI 가 실행 파일·인자를 못 정한다.
//! - 열쇠·원본 뿌리는 `apps/files/.env` (저장소 밖·gitignore). 이 모듈은 그 값을 읽지도 옮기지도 않는다.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::local_dev::{
    is_pid_alive, kill_process_tree, list_all_processes, spawn_upload_process, LocalDevState,
};

const STATE_FILE_NAME: &str = "vault-upload-state.json";
const LOG_FILE_NAME: &str = "vault-upload.log";

/// 전송기가 사는 곳. 저장소 뿌리 기준 고정 — UI 가 못 바꾼다.
const UPLOADER_DIR: &str = "apps/files";
const UPLOADER_SCRIPT: &str = "src/upload.mjs";

#[derive(Default)]
pub struct VaultUploadState {
    /// 이 앱이 띄운 전송기 PID. 상태 파일과 이중으로 들고 있어 앱 생애 중에는 파일 I/O 없이 답한다.
    pub pid: Mutex<Option<u32>>,
}

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct PersistedRun {
    /// 실행 식별자. 시작 시각 기반 문자열 — 사람이 로그와 대조할 때만 쓴다.
    #[serde(default)]
    run_id: String,
    #[serde(default)]
    target: String,
    #[serde(default)]
    pid: Option<u32>,
    #[serde(default)]
    started_at: Option<String>,
    /// 마지막으로 사람이 조작한 결과. `stopped` 는 중지 버튼을 눌렀다는 뜻이지 실패가 아니다.
    #[serde(default)]
    last_action: String,
    /// 앱이 안 띄운 전송기를 붙든 경우. 진행 수치는 앱 로그가 아니라 그쪽에 있어 못 읽는다.
    #[serde(default)]
    external: bool,
}

/// UI 로 나가는 전부. 여기에 경로·이름·열쇠가 섞이면 안 된다.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UploadStatus {
    /// `idle` | `preparing` | `running` | `stopped` | `done` | `error`
    status: String,
    run_id: String,
    /// 대상 폴더 이름 한 조각. 원본 절대경로가 아니다.
    target: String,
    started_at: Option<String>,
    total: u64,
    done: u64,
    uploaded: u64,
    skipped: u64,
    /// 로그 마지막 줄에서 뽑은 사람 읽을 문구 (진행률·단계). 파일 이름은 안 들어온다.
    note: String,
    alive: bool,
    /// 앱 밖에서 띄운 전송기를 붙들고 있는가. 그때는 진행 수치가 안 보인다.
    external: bool,
}

/// 앱이 안 띄운 전송기도 찾아낸다.
///
/// 사람이 터미널에서 먼저 띄워 둔 경우, 앱이 그걸 모르면 화면은 「대기」인데 실제로는
/// 올라가는 중이다 — 그 상태에서 `올리기` 를 누르면 전송기가 **둘 겹쳐 돈다**
/// (2026-08-27 실제로 그 화면을 봤다). 명령줄에 전송기 스크립트가 있는 프로세스를 찾는다.
fn find_external_uploader() -> Option<u32> {
    // 경로 구분자는 신경 쓰지 않는다 — 스크립트 파일 이름만 보면 충분하다.
    let needle = "upload.mjs";
    list_all_processes()
        .into_iter()
        .find(|(_, cmd)| {
            cmd.contains(needle)
        })
        .map(|(pid, _)| pid)
}

fn state_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("app_local_data_dir 조회 실패: {}", e))?;
    fs::create_dir_all(&base).map_err(|e| format!("state 디렉토리 생성 실패: {}", e))?;
    Ok(base)
}

fn state_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(state_dir(app)?.join(STATE_FILE_NAME))
}

fn log_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(state_dir(app)?.join(LOG_FILE_NAME))
}

fn load_run(app: &tauri::AppHandle) -> PersistedRun {
    let Ok(path) = state_file(app) else {
        return PersistedRun::default();
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        return PersistedRun::default();
    };
    serde_json::from_str::<PersistedRun>(&raw).unwrap_or_default()
}

/// 원자적 저장 — 임시 파일에 쓰고 rename. 쓰다 죽어도 반쪽 파일이 안 남는다.
fn save_run(app: &tauri::AppHandle, run: &PersistedRun) -> Result<(), String> {
    let path = state_file(app)?;
    let tmp = path.with_extension("json.tmp");
    let raw = serde_json::to_string_pretty(run).map_err(|e| e.to_string())?;
    fs::write(&tmp, raw).map_err(|e| format!("state 쓰기 실패: {}", e))?;
    fs::rename(&tmp, &path).map_err(|e| format!("state 교체 실패: {}", e))?;
    Ok(())
}

/// 대상은 금고 뿌리 **바로 아래 폴더 한 조각**만 받는다.
/// 경로 구분자·상위 이동을 막아 전송기가 뿌리 밖을 훑지 못하게 한다.
fn validate_target(target: &str) -> Result<String, String> {
    let t = target.trim();
    if t.is_empty() {
        return Err("대상 폴더가 비었습니다.".into());
    }
    if t.len() > 120 {
        return Err("대상 폴더 이름이 너무 깁니다.".into());
    }
    if t.contains('/') || t.contains('\\') || t == "." || t == ".." {
        return Err("대상은 뿌리 바로 아래 폴더 하나여야 합니다.".into());
    }
    // 셸 메타문자는 전송기 인자로 나가기 전에 막는다.
    if t.chars().any(|c| "\"'`$|&;<>*?()[]{}!\n\r\t".contains(c)) {
        return Err("대상 이름에 허용되지 않은 문자가 있습니다.".into());
    }
    Ok(t.to_string())
}

fn repo_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let state = app
        .try_state::<LocalDevState>()
        .ok_or_else(|| "LocalDevState 가 없습니다.".to_string())?;
    let root = state
        .repo_root
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "저장소 뿌리가 아직 설정되지 않았습니다.".to_string())?;
    Ok(PathBuf::from(root))
}

/// 전송기 로그의 마지막 진행 줄에서 집계만 뽑는다.
/// 전송기는 기본 모드에서 파일 이름을 안 찍는다(`--verbose` 일 때만) — 그래서 여기로 이름이 새지 않는다.
/// 형식: `1040/7510 올림 360 건너뜀 680`
fn parse_progress(log_path: &Path) -> (u64, u64, u64, u64, String) {
    let Ok(raw) = fs::read_to_string(log_path) else {
        return (0, 0, 0, 0, String::new());
    };
    let mut total = 0u64;
    let mut done = 0u64;
    let mut uploaded = 0u64;
    let mut skipped = 0u64;
    let mut note = String::new();

    for line in raw.lines().rev().take(200) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if note.is_empty() {
            note = line.to_string();
        }
        if let Some((head, tail)) = line.split_once(' ') {
            if let Some((d, t)) = head.split_once('/') {
                if let (Ok(d), Ok(t)) = (d.parse::<u64>(), t.parse::<u64>()) {
                    done = d;
                    total = t;
                    let nums: Vec<u64> = tail
                        .split_whitespace()
                        .filter_map(|w| w.parse::<u64>().ok())
                        .collect();
                    if let Some(n) = nums.first() {
                        uploaded = *n;
                    }
                    if let Some(n) = nums.get(1) {
                        skipped = *n;
                    }
                    break;
                }
            }
        }
    }
    (total, done, uploaded, skipped, note)
}

fn build_status(app: &tauri::AppHandle, run: &PersistedRun, alive: bool) -> UploadStatus {
    let (total, done, uploaded, skipped, note) = log_file(app)
        .map(|p| parse_progress(&p))
        .unwrap_or_default();

    let status = if alive {
        // 전송기는 색인을 먼저 읽는다 — 그동안은 진행 줄이 아직 없다.
        if total == 0 {
            "preparing"
        } else {
            "running"
        }
    } else if run.run_id.is_empty() {
        "idle"
    } else if run.last_action == "stopped" {
        "stopped"
    } else if total > 0 && done >= total {
        "done"
    } else if run.pid.is_some() {
        // 사람이 멈추지 않았는데 프로세스가 없다 = 뭔가로 죽었다.
        "error"
    } else {
        "idle"
    };

    UploadStatus {
        status: status.to_string(),
        run_id: run.run_id.clone(),
        target: run.target.clone(),
        started_at: run.started_at.clone(),
        total,
        done,
        uploaded,
        skipped,
        note: if run.external && note.is_empty() {
            "앱 밖에서 띄운 전송기입니다 — 진행 수치는 안 보입니다".to_string()
        } else {
            note
        },
        alive,
        external: run.external,
    }
}

/// 상태 조회. PID 생존까지 확인하므로 외부 프로세스를 부른다 → async.
#[tauri::command]
pub async fn vault_upload_status(app: tauri::AppHandle) -> Result<UploadStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut run = load_run(&app);
        let mut alive = run.pid.map(is_pid_alive).unwrap_or(false);
        if !alive {
            // 우리가 안 띄운 전송기가 돌고 있을 수 있다. 있으면 그걸 붙든다 —
            // 그래야 「대기」로 보이다가 두 번째를 띄우는 사고가 안 난다.
            if let Some(pid) = find_external_uploader() {
                run.pid = Some(pid);
                run.external = true;
                if run.run_id.is_empty() {
                    run.run_id = format!("ext-{}", pid);
                }
                alive = true;
                let _ = save_run(&app, &run);
            }
        }
        build_status(&app, &run, alive)
    })
    .await
    .map_err(|e| format!("spawn_blocking join 실패: {}", e))
}

/// 시작 또는 이어하기. 전송기는 이미 올린 파일을 sha256 대조로 건너뛰므로
/// 「이어하기」는 그냥 같은 명령을 다시 거는 것이다 (별도 재개 상태가 없다).
#[tauri::command]
pub async fn vault_upload_start(
    app: tauri::AppHandle,
    target: String,
) -> Result<UploadStatus, String> {
    let target = validate_target(&target)?;

    tauri::async_runtime::spawn_blocking(move || {
        let prev = load_run(&app);
        if prev.pid.map(is_pid_alive).unwrap_or(false) || find_external_uploader().is_some() {
            return Err("이미 올리는 중입니다.".to_string());
        }

        let root = repo_root(&app)?;
        let cwd = root.join(UPLOADER_DIR);
        if !cwd.is_dir() {
            return Err("전송기 폴더를 못 찾았습니다.".to_string());
        }
        if !cwd.join(".env").is_file() {
            return Err("apps/files/.env 가 없습니다. 열쇠와 원본 뿌리를 먼저 두세요.".to_string());
        }

        let log = log_file(&app)?;
        let args = vec![
            UPLOADER_SCRIPT.to_string(),
            "--only".to_string(),
            target.clone(),
        ];
        let pid = spawn_upload_process("node", &args, &cwd, &log)?;

        let started = chrono_now();
        let run = PersistedRun {
            run_id: format!("up-{}", started.replace([':', '-', ' '], "")),
            target,
            pid: Some(pid),
            started_at: Some(started),
            last_action: "started".into(),
            external: false,
        };
        save_run(&app, &run)?;
        if let Some(state) = app.try_state::<VaultUploadState>() {
            if let Ok(mut g) = state.pid.lock() {
                *g = Some(pid);
            }
        }
        Ok(build_status(&app, &run, true))
    })
    .await
    .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

/// 중지. 이미 Drive 에 올라간 암호문은 건드리지 않는다 — 다음 시작이 그 지점부터 잇는다.
#[tauri::command]
pub async fn vault_upload_stop(app: tauri::AppHandle) -> Result<UploadStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut run = load_run(&app);
        let Some(pid) = run.pid else {
            return Ok(build_status(&app, &run, false));
        };
        if is_pid_alive(pid) {
            // 전송기는 rclone 데몬을 자식으로 띄운다 → 트리째 정리해야 데몬이 안 남는다.
            kill_process_tree(pid)?;
        }
        run.last_action = "stopped".into();
        save_run(&app, &run)?;
        if let Some(state) = app.try_state::<VaultUploadState>() {
            if let Ok(mut g) = state.pid.lock() {
                *g = None;
            }
        }
        Ok(build_status(&app, &run, false))
    })
    .await
    .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

/// 앱이 뜰 때 지난 판의 전송기에 다시 붙는다. 죽었으면 PID 만 지운다(로그·집계는 남긴다).
pub fn restore_upload_state(app: &tauri::AppHandle) {
    let mut run = load_run(app);
    let Some(pid) = run.pid else { return };
    if is_pid_alive(pid) {
        if let Some(state) = app.try_state::<VaultUploadState>() {
            if let Ok(mut g) = state.pid.lock() {
                *g = Some(pid);
            }
        }
        println!("[vault-upload] reattached pid {}", pid);
        return;
    }
    if run.last_action == "started" {
        run.last_action = "died".into();
        let _ = save_run(app, &run);
    }
}

/// 로컬 시각 문자열. 상태 파일과 UI 표시에만 쓴다.
fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // KST 고정 — 이 앱은 한 사람 기계에서만 돈다.
    let kst = secs as i64 + 9 * 3600;
    let days = kst / 86400;
    let rem = kst % 86400;
    let (y, m, d) = civil_from_days(days);
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}",
        y,
        m,
        d,
        rem / 3600,
        (rem % 3600) / 60
    )
}

/// days-from-epoch → (년, 월, 일). Howard Hinnant 의 civil_from_days.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 대상은_뿌리_바로_아래_한_조각만() {
        assert!(validate_target("정리").is_ok());
        assert!(validate_target(" 정리 ").is_ok());
        assert!(validate_target("").is_err());
        assert!(validate_target("..").is_err());
        assert!(validate_target("a/b").is_err());
        assert!(validate_target("a\\b").is_err());
        assert!(validate_target("a;rm -rf").is_err());
        assert!(validate_target("a$(x)").is_err());
    }

    #[test]
    fn 진행줄에서_집계만_뽑는다() {
        let dir = std::env::temp_dir().join("vault-upload-test");
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("progress.log");
        std::fs::write(
            &p,
            "파일 7510개\n금고 염\n1030/7510 올림 350 건너뜀 680\n1040/7510 올림 360 건너뜀 680\n",
        )
        .unwrap();
        let (total, done, up, skip, note) = parse_progress(&p);
        assert_eq!((total, done, up, skip), (7510, 1040, 360, 680));
        assert!(note.contains("1040/7510"));
    }

    #[test]
    fn 진행줄이_없으면_0() {
        let dir = std::env::temp_dir().join("vault-upload-test");
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("early.log");
        std::fs::write(&p, "파일 7510개\n금고 염\n").unwrap();
        let (total, done, _, _, note) = parse_progress(&p);
        assert_eq!((total, done), (0, 0));
        assert_eq!(note, "금고 염");
    }
}
