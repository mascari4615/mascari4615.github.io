//! TASK-WM-087 — WM Editor.log watcher → yawnbot 봇 webhook.
//!
//! 의도: Unity Mono runtime 의 *진짜* 컴파일 결과 (`error CS\d+` / `warning CS\d+`) 를
//! 자동 발견해서 yawnbot 디스코드 봇으로 즉시 알림. KAR-003 sub-A (post-commit dotnet build)
//! 폐기 (2026-05-10) 후 자동 발견 가치 보존.
//!
//! 흐름:
//! 1. dedicated thread 가 Editor.log 5초마다 polling (notify crate 박혀있지만 polling 더 robust)
//! 2. last_offset 박힘 — 새 부분만 line 단위 read. file truncate/회전 감지 시 reset
//! 3. line grep — `error CS\d+` / `warning CS\d+` 패턴 추출
//! 4. compile cycle 끝 (quiet 5s) → batch flush. 같은 fingerprint 면 skip (동일 에러 반복 알림 X)
//! 5. yawnbot 봇 (`http://127.0.0.1:4615/webhook/local`) POST — `local-webhook.ts` 가 디스코 broadcast
//!
//! Env 노브:
//! - `WM_EDITOR_LOG_PATH` — Editor.log 비표준 경로 override (default = `%LOCALAPPDATA%\Unity\Editor\Editor.log`)
//! - `YAWNBOT_LOCAL_WEBHOOK_URL` — yawnbot endpoint override (default = `http://127.0.0.1:4615/webhook/local`)
//! - `LOCAL_WEBHOOK_SECRET` — 박혀있으면 `X-Yawnbot-Secret` header 박음. yawnbot 봇 env 와 일치 필요.
//!
//! LIFE-B-2 의 dedicated thread + AtomicBool guard 패턴 정합.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

const POLL_INTERVAL: Duration = Duration::from_secs(5);
const QUIET_BATCH_DURATION: Duration = Duration::from_secs(5);
const YAWNBOT_LOCAL_URL_DEFAULT: &str = "http://127.0.0.1:4615/webhook/local";
const SOURCE_LABEL: &str = "karmolab-tauri/wm_log_watcher";
const MAX_LINES_IN_SUMMARY: usize = 8;

static STARTED: AtomicBool = AtomicBool::new(false);

pub fn start() {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    let path = match resolve_editor_log_path() {
        Some(p) => p,
        None => {
            eprintln!("[wm-log-watcher] Editor.log path 결정 실패 — 비활성 (env WM_EDITOR_LOG_PATH 또는 %LOCALAPPDATA%/Unity/Editor/Editor.log 확인)");
            return;
        }
    };

    let _ = std::thread::Builder::new()
        .name("wm-log-watcher".into())
        .spawn(move || watcher_loop(path));
}

fn resolve_editor_log_path() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("WM_EDITOR_LOG_PATH") {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Some(pb);
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let pb = PathBuf::from(local)
            .join("Unity")
            .join("Editor")
            .join("Editor.log");
        if pb.exists() {
            return Some(pb);
        }
    }
    None
}

fn watcher_loop(path: PathBuf) {
    let yawnbot_url = std::env::var("YAWNBOT_LOCAL_WEBHOOK_URL")
        .unwrap_or_else(|_| YAWNBOT_LOCAL_URL_DEFAULT.to_string());
    let secret = std::env::var("LOCAL_WEBHOOK_SECRET")
        .ok()
        .filter(|s| !s.is_empty());

    // 첫 read 는 file 끝부터 (이미 박힌 옛 에러 알림 X — 시작 시점 기준 새 에러만)
    let mut last_offset: u64 = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let mut line_buffer = String::new();

    let mut current_errors: Vec<CompileMessage> = Vec::new();
    let mut current_warnings: Vec<CompileMessage> = Vec::new();
    let mut last_change: Option<Instant> = None;
    let mut last_batch_fingerprint: Option<u64> = None;

    eprintln!(
        "[wm-log-watcher] 시작 — Editor.log poll {}s ({}), yawnbot={}, secret={}",
        POLL_INTERVAL.as_secs(),
        path.display(),
        yawnbot_url,
        if secret.is_some() { "박힘" } else { "X (dev)" }
    );

    loop {
        std::thread::sleep(POLL_INTERVAL);

        match read_new_lines(&path, &mut last_offset, &mut line_buffer) {
            Ok(new_lines) => {
                for line in new_lines {
                    if let Some(msg) = parse_line(&line) {
                        match msg.severity {
                            Severity::Error => current_errors.push(msg),
                            Severity::Warning => current_warnings.push(msg),
                        }
                        last_change = Some(Instant::now());
                    }
                }
            }
            Err(e) => {
                eprintln!("[wm-log-watcher] Editor.log read 실패: {e}");
            }
        }

        // batch flush — quiet 5s 이상이면
        if let Some(t) = last_change {
            if t.elapsed() >= QUIET_BATCH_DURATION {
                if !current_errors.is_empty() || !current_warnings.is_empty() {
                    let fp = fingerprint(&current_errors, &current_warnings);
                    if Some(fp) != last_batch_fingerprint {
                        send_batch(&yawnbot_url, secret.as_deref(), &current_errors, &current_warnings);
                        last_batch_fingerprint = Some(fp);
                    } else {
                        eprintln!(
                            "[wm-log-watcher] 같은 fingerprint — 알림 skip ({} error / {} warning)",
                            current_errors.len(),
                            current_warnings.len()
                        );
                    }
                }
                current_errors.clear();
                current_warnings.clear();
                last_change = None;
            }
        }
    }
}

fn read_new_lines(
    path: &PathBuf,
    last_offset: &mut u64,
    line_buffer: &mut String,
) -> std::io::Result<Vec<String>> {
    let mut file = std::fs::File::open(path)?;
    let size = file.metadata()?.len();

    if size < *last_offset {
        // file truncate / Unity 새 session — Editor-prev.log 회전.
        eprintln!("[wm-log-watcher] Editor.log 회전 감지 (size={} < last_offset={}) — reset", size, last_offset);
        *last_offset = 0;
        line_buffer.clear();
    }

    if size == *last_offset {
        return Ok(Vec::new());
    }

    file.seek(SeekFrom::Start(*last_offset))?;
    let mut chunk = Vec::new();
    let n = file.read_to_end(&mut chunk)?;
    *last_offset += n as u64;

    // Editor.log 는 UTF-8 (Unity 표준) — invalid byte 는 lossy 변환.
    let text = String::from_utf8_lossy(&chunk);
    line_buffer.push_str(&text);

    let mut out = Vec::new();
    while let Some(pos) = line_buffer.find('\n') {
        // \r\n / \n 둘 다 안전하게 처리
        let mut line = line_buffer[..pos].to_string();
        if line.ends_with('\r') {
            line.pop();
        }
        line_buffer.drain(..=pos);
        out.push(line);
    }
    Ok(out)
}

#[derive(Debug, Clone, PartialEq)]
enum Severity {
    Error,
    Warning,
}

#[derive(Debug, Clone)]
struct CompileMessage {
    severity: Severity,
    cs_code: String,  // "CS0103"
    location: String, // "Assets/.../Foo.cs(12,45)"
    message: String,  // "The name `Foo' does not exist..."
}

impl CompileMessage {
    fn fingerprint_key(&self) -> String {
        format!("{:?}|{}|{}", self.severity, self.cs_code, self.location)
    }
}

/// Unity Editor.log 의 컴파일 메시지 패턴 parse.
///
/// 표준 포맷 (csc.exe / Unity msbuild 둘 다):
///   `Assets/Foo.cs(12,45): error CS0103: The name 'Foo' does not exist...`
///   `Library/.../Bar.cs(1,1): warning CS0168: ...`
///
/// 첫 ": error CS" / ": warning CS" 위치를 기준으로 location / cs_code / message 분리.
fn parse_line(line: &str) -> Option<CompileMessage> {
    let (severity, marker_idx, marker_len) = if let Some(idx) = line.find(": error CS") {
        (Severity::Error, idx, ": error ".len())
    } else if let Some(idx) = line.find(": warning CS") {
        (Severity::Warning, idx, ": warning ".len())
    } else {
        return None;
    };

    let location = line[..marker_idx].trim().to_string();
    if location.is_empty() {
        return None;
    }
    // after_marker = "CS0103: The name..."
    let after_marker = &line[marker_idx + marker_len..];
    let colon_pos = after_marker.find(':')?;
    let cs_code = after_marker[..colon_pos].trim().to_string();
    if !cs_code.starts_with("CS") {
        return None;
    }
    let message = after_marker[colon_pos + 1..].trim().to_string();

    Some(CompileMessage {
        severity,
        cs_code,
        location,
        message,
    })
}

fn fingerprint(errors: &[CompileMessage], warnings: &[CompileMessage]) -> u64 {
    let mut h = DefaultHasher::new();
    for m in errors.iter().chain(warnings.iter()) {
        m.fingerprint_key().hash(&mut h);
    }
    h.finish()
}

fn send_batch(
    url: &str,
    secret: Option<&str>,
    errors: &[CompileMessage],
    warnings: &[CompileMessage],
) {
    let level = if errors.is_empty() { "warning" } else { "error" };
    let kind = if errors.is_empty() {
        "wm-compile-warning"
    } else {
        "wm-compile-error"
    };

    let title = if !errors.is_empty() && !warnings.is_empty() {
        format!(
            "WM Editor.log: {} error · {} warning",
            errors.len(),
            warnings.len()
        )
    } else if !errors.is_empty() {
        format!("WM Editor.log: {} error", errors.len())
    } else {
        format!("WM Editor.log: {} warning", warnings.len())
    };

    let mut summary = String::new();
    let mut shown = 0usize;

    for m in errors.iter() {
        if shown >= MAX_LINES_IN_SUMMARY {
            break;
        }
        summary.push_str(&format!(
            "`{}` {}\n{}\n\n",
            m.cs_code,
            truncate(&m.location, 120),
            truncate(&m.message, 240)
        ));
        shown += 1;
    }
    if errors.len() > shown {
        summary.push_str(&format!("…+{} 더\n\n", errors.len() - shown));
    }
    let warn_room = MAX_LINES_IN_SUMMARY.saturating_sub(shown);
    if !warnings.is_empty() && warn_room > 0 {
        summary.push_str("---\n");
        for m in warnings.iter().take(warn_room) {
            summary.push_str(&format!(
                "`{}` (warning) {}\n{}\n\n",
                m.cs_code,
                truncate(&m.location, 120),
                truncate(&m.message, 240)
            ));
        }
        if warnings.len() > warn_room {
            summary.push_str(&format!("…+{} warning 더", warnings.len() - warn_room));
        }
    }

    let payload = serde_json::json!({
        "kind": kind,
        "source": SOURCE_LABEL,
        "title": title,
        "summary": summary,
        "level": level,
    });

    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[wm-log-watcher] reqwest client build 실패: {e}");
            return;
        }
    };

    let mut req = client.post(url).json(&payload);
    if let Some(s) = secret {
        req = req.header("X-Yawnbot-Secret", s);
    }

    match req.send() {
        Ok(resp) => {
            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().unwrap_or_default();
                eprintln!(
                    "[wm-log-watcher] yawnbot POST 실패 status={} body={}",
                    status,
                    truncate(&body, 200)
                );
            } else {
                eprintln!(
                    "[wm-log-watcher] yawnbot POST OK ({} error / {} warning)",
                    errors.len(),
                    warnings.len()
                );
            }
        }
        Err(e) => {
            eprintln!("[wm-log-watcher] yawnbot POST 실패 (yawnbot 봇 down 가능): {e}");
        }
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max).collect();
        out.push('…');
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_error_line() {
        let line = "Assets/Foo.cs(12,45): error CS0103: The name 'Foo' does not exist in the current context";
        let m = parse_line(line).expect("parse 실패");
        assert_eq!(m.severity, Severity::Error);
        assert_eq!(m.cs_code, "CS0103");
        assert_eq!(m.location, "Assets/Foo.cs(12,45)");
        assert!(m.message.starts_with("The name 'Foo'"));
    }

    #[test]
    fn parse_warning_line() {
        let line = "Library/PackageCache/Bar.cs(1,1): warning CS0168: The variable 'x' is declared but never used";
        let m = parse_line(line).expect("parse 실패");
        assert_eq!(m.severity, Severity::Warning);
        assert_eq!(m.cs_code, "CS0168");
        assert_eq!(m.location, "Library/PackageCache/Bar.cs(1,1)");
    }

    #[test]
    fn parse_non_compile_line_returns_none() {
        assert!(parse_line("Loading scene SampleScene...").is_none());
        assert!(parse_line("- Loaded all assemblies in 0.123s").is_none());
        assert!(parse_line("error CS9999 (no colon prefix)").is_none()); // location 없음
    }

    #[test]
    fn fingerprint_stable_for_same_messages() {
        let m1 = CompileMessage {
            severity: Severity::Error,
            cs_code: "CS0103".into(),
            location: "Assets/Foo.cs(1,1)".into(),
            message: "msg A".into(),
        };
        let m2 = CompileMessage {
            severity: Severity::Error,
            cs_code: "CS0103".into(),
            location: "Assets/Foo.cs(1,1)".into(),
            message: "msg B (다른 텍스트)".into(),
        };
        // fingerprint 는 message text 무관 — severity+code+location 만.
        assert_eq!(fingerprint(&[m1.clone()], &[]), fingerprint(&[m2], &[]));
    }

    #[test]
    fn fingerprint_changes_with_new_error() {
        let m1 = CompileMessage {
            severity: Severity::Error,
            cs_code: "CS0103".into(),
            location: "Assets/Foo.cs(1,1)".into(),
            message: "".into(),
        };
        let m2 = CompileMessage {
            severity: Severity::Error,
            cs_code: "CS0246".into(),
            location: "Assets/Bar.cs(2,2)".into(),
            message: "".into(),
        };
        assert_ne!(fingerprint(&[m1.clone()], &[]), fingerprint(&[m1, m2], &[]));
    }

    #[test]
    fn truncate_handles_unicode() {
        assert_eq!(truncate("안녕하세요", 3), "안녕하…");
        assert_eq!(truncate("hi", 5), "hi");
    }
}
