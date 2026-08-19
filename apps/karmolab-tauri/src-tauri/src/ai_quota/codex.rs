//! Codex — ChatGPT 백엔드 라이브 조회, 실패하면 로컬 세션 스냅샷. TASK-KL-248.
//!
//! 라이브 창구 = `GET https://chatgpt.com/backend-api/wham/usage`
//! (`~/.codex/auth.json` 의 ChatGPT OAuth access_token + `chatgpt-account-id`).
//! 형제 경로 `codex/usage` 는 403 이다 — 실측으로 고른 주소다.
//!
//! 왜 라이브가 필요한가: 스냅샷은 **마지막으로 Codex 를 쓴 순간**에 멈춰 있다.
//! 실제로 6일 묵은 스냅샷이 20% 라고 말하는 동안 라이브는 96% 였다.

use serde::Deserialize;
use std::path::{Path, PathBuf};

use super::shared::*;

const USAGE_URL: &str = "https://chatgpt.com/backend-api/wham/usage";

// ── 라이브 ────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct AuthFile {
    tokens: Option<Tokens>,
}

#[derive(Debug, Deserialize)]
struct Tokens {
    access_token: String,
    account_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UsageDto {
    plan_type: Option<String>,
    rate_limit: Option<RateLimit>,
}

#[derive(Debug, Deserialize)]
struct RateLimit {
    primary_window: Option<Window>,
    secondary_window: Option<Window>,
}

#[derive(Debug, Deserialize)]
struct Window {
    used_percent: Option<f64>,
    limit_window_seconds: Option<i64>,
    reset_at: Option<i64>,
}

fn read_tokens() -> Result<Tokens, String> {
    let home = home_dir().ok_or_else(|| "no-home".to_string())?;
    let path = home.join(".codex").join("auth.json");
    let raw = std::fs::read_to_string(&path).map_err(|_| "no-credentials".to_string())?;
    let parsed: AuthFile = serde_json::from_str(&raw).map_err(|_| "bad-credentials".to_string())?;
    parsed.tokens.ok_or_else(|| "no-oauth-block".to_string())
}

fn push_window(out: &mut Vec<QuotaWindow>, w: &Option<Window>, fallback: &str) {
    if let Some(w) = w {
        out.push(QuotaWindow {
            key: window_key_from_secs(w.limit_window_seconds, fallback),
            used_percent: w.used_percent,
            resets_at: w.reset_at,
        });
    }
}

async fn probe_live() -> Result<VendorQuota, String> {
    let tokens = tauri::async_runtime::spawn_blocking(read_tokens)
        .await
        .map_err(|e| format!("join-error: {e}"))??;

    let mut req = http()?.get(USAGE_URL).bearer_auth(&tokens.access_token);
    if let Some(acct) = tokens.account_id.as_deref() {
        req = req.header("chatgpt-account-id", acct);
    }
    let res = req.send().await.map_err(|e| format!("http-error: {e}"))?;

    let status = res.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err("token-expired".to_string());
    }
    if !status.is_success() {
        return Err(format!("http-status: {}", status.as_u16()));
    }

    let dto: UsageDto = res.json().await.map_err(|e| format!("bad-response: {e}"))?;
    let limits = dto.rate_limit.ok_or_else(|| "no-signal".to_string())?;

    let mut out = VendorQuota::new(true);
    out.observed_at = Some(now_secs());
    out.plan = dto.plan_type;
    push_window(&mut out.windows, &limits.primary_window, "primary");
    push_window(&mut out.windows, &limits.secondary_window, "secondary");
    if out.is_empty() {
        return Err("no-signal".to_string());
    }
    Ok(out)
}

// ── 스냅샷 (라이브가 막혔을 때) ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct SnapshotLimits {
    primary: Option<SnapshotWindow>,
    secondary: Option<SnapshotWindow>,
    plan_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SnapshotWindow {
    used_percent: Option<f64>,
    /// 세션 기록은 **분** 단위로 적는다 (라이브 응답은 초 — 단위가 다르다).
    window_minutes: Option<i64>,
    resets_at: Option<i64>,
}

/// `~/.codex/sessions/**` 는 연/월/일로 중첩된다. 재귀 깊이를 제한해
/// 엉뚱한 트리를 훑는 사고를 막는다.
fn collect_jsonl(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    if depth == 0 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl(&path, depth - 1, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            out.push(path);
        }
    }
}

fn last_rate_limits(path: &Path) -> Option<SnapshotLimits> {
    let raw = std::fs::read_to_string(path).ok()?;
    for line in raw.lines().rev() {
        if !line.contains("\"rate_limits\"") {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        if let Some(found) = find_key(&value, "rate_limits") {
            if let Ok(parsed) = serde_json::from_value::<SnapshotLimits>(found.clone()) {
                return Some(parsed);
            }
        }
    }
    None
}

fn push_snapshot_window(out: &mut Vec<QuotaWindow>, w: &Option<SnapshotWindow>, fallback: &str) {
    if let Some(w) = w {
        out.push(QuotaWindow {
            key: window_key_from_secs(w.window_minutes.map(|m| m * 60), fallback),
            used_percent: w.used_percent,
            resets_at: w.resets_at,
        });
    }
}

pub fn probe_snapshot() -> Result<VendorQuota, String> {
    let home = home_dir().ok_or_else(|| "no-home".to_string())?;
    let codex = home.join(".codex");
    if !codex.is_dir() {
        return Err("not-installed".to_string());
    }

    let mut files = Vec::new();
    collect_jsonl(&codex.join("sessions"), 4, &mut files);
    collect_jsonl(&codex.join("archived_sessions"), 1, &mut files);
    if files.is_empty() {
        return Err("no-sessions".to_string());
    }

    // 최신 것부터 훑되, rate_limits 가 실린 첫 파일에서 멈춘다 — 마지막 세션이
    // 인증만 하고 끝났으면 그 파일엔 스냅샷이 없다.
    files.sort_by_key(|p| std::cmp::Reverse(mtime_secs(p).unwrap_or(0)));
    for path in files.iter().take(64) {
        let Some(limits) = last_rate_limits(path) else {
            continue;
        };
        let mut out = VendorQuota::new(false);
        out.observed_at = mtime_secs(path);
        out.plan = limits.plan_type.clone();
        push_snapshot_window(&mut out.windows, &limits.primary, "primary");
        push_snapshot_window(&mut out.windows, &limits.secondary, "secondary");
        return Ok(out);
    }
    Err("no-snapshot".to_string())
}

pub async fn probe() -> Result<VendorQuota, String> {
    let live_err = match probe_live().await {
        Ok(q) => return Ok(q),
        Err(e) => e,
    };
    // 라이브가 막혀도 로컬 기록은 남아 있다 — 낡았다는 표시를 달고 그거라도 보여준다.
    match tauri::async_runtime::spawn_blocking(probe_snapshot).await {
        Ok(Ok(mut q)) => {
            q.notes.push("live-failed".to_string());
            Ok(q)
        }
        // 둘 다 실패면 사용자가 손 쓸 수 있는 쪽(라이브)의 이유를 돌려준다.
        _ => Err(live_err),
    }
}
