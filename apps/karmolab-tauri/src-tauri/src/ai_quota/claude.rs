//! Claude — OAuth usage API 라이브 조회. TASK-KL-248.
//!
//! 토큰은 `~/.claude/.credentials.json` 에서 읽어 **이 파일 안에서만** 쓴다.
//! DTO 에 담지 않고 에러 문자열에도 응답 본문을 그대로 싣지 않는다.

use serde::Deserialize;
use std::path::PathBuf;

use super::shared::*;

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA: &str = "oauth-2025-04-20";

#[derive(Debug, Deserialize)]
struct CredsFile {
    #[serde(rename = "claudeAiOauth")]
    claude_ai_oauth: Option<Oauth>,
}

#[derive(Debug, Deserialize)]
pub struct Oauth {
    #[serde(rename = "accessToken")]
    pub access_token: String,
    /// epoch **밀리초** (파일 규약).
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<i64>,
    #[serde(rename = "subscriptionType")]
    pub subscription_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UsageWindow {
    /// 0~100 퍼센트. (5시간 창 1.0 = 1% 사용. 0~1 비율이 아니다 — 실측 확인.)
    utilization: Option<f64>,
    resets_at: Option<String>,
}

/// 우리가 그리는 창들. 나머지 필드(프로모션 슬롯 등)는 무시.
#[derive(Debug, Deserialize)]
struct UsageDto {
    five_hour: Option<UsageWindow>,
    seven_day: Option<UsageWindow>,
    seven_day_opus: Option<UsageWindow>,
    seven_day_sonnet: Option<UsageWindow>,
}

pub fn read_token() -> Result<Oauth, String> {
    let home = home_dir().ok_or_else(|| "no-home".to_string())?;
    let path = home.join(".claude").join(".credentials.json");
    let raw = std::fs::read_to_string(&path).map_err(|_| "no-credentials".to_string())?;
    let parsed: CredsFile = serde_json::from_str(&raw).map_err(|_| "bad-credentials".to_string())?;
    parsed
        .claude_ai_oauth
        .ok_or_else(|| "no-oauth-block".to_string())
}

fn push_window(out: &mut Vec<QuotaWindow>, key: &str, w: &Option<UsageWindow>) {
    // 벤더가 슬롯을 null 로 주는 경우가 흔하다 (해당 요금제에 없는 창).
    // 빈 게이지를 그리느니 카드에서 빼는 편이 읽기 쉽다.
    if let Some(w) = w {
        if w.utilization.is_none() && w.resets_at.is_none() {
            return;
        }
        out.push(QuotaWindow {
            key: key.to_string(),
            used_percent: w.utilization,
            resets_at: w.resets_at.as_deref().and_then(iso_to_epoch),
        });
    }
}

/// 로그인 창 띄우기. 토큰 갱신은 CLI 몫, 사용자의 터미널 직접 열기 없음
/// `claude auth status`: 파일 읽기만, 갱신 없음 (2026-09-13 번들 실측)
/// 그래서 브라우저 OAuth 를 다시 도는 `claude auth login` 을 새 콘솔에
/// 끝나도 창 유지 (pause): 실패 문구 읽을 틈
fn spawn_login() -> Result<(), String> {
    use std::process::Command;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        Command::new("cmd")
            .raw_arg(r#"/c start "Claude login" cmd /c "claude auth login & pause""#)
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW: 띄우는 쪽 콘솔은 안 보이게
            .spawn()
            .map_err(|e| format!("spawn-failed: {e}"))?;
    }
    #[cfg(not(windows))]
    {
        Command::new("claude")
            .args(["auth", "login"])
            .spawn()
            .map_err(|e| format!("spawn-failed: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn ai_quota_claude_login() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(spawn_login)
        .await
        .map_err(|e| format!("join-error: {e}"))?
}

/// 마지막 라이브 성공값 파일. 로그인 만료나 429 로 라이브가 막혀도 남는 값
/// 토큰 없음 (VendorQuota 에 토큰 자리 없음)
fn snapshot_path(dir: &Option<PathBuf>) -> Option<PathBuf> {
    dir.as_ref().map(|d| d.join("claude-last.json"))
}

fn save_snapshot(path: &Option<PathBuf>, q: &VendorQuota) {
    let Some(p) = path else { return };
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(q) {
        let _ = std::fs::write(p, json);
    }
}

/// 저장된 마지막 라이브값을 스냅샷으로. 이미 리셋된 창 제외 (5시간 창은 금방 무의미)
fn load_snapshot(path: &Option<PathBuf>) -> Option<VendorQuota> {
    let p = path.as_ref()?;
    let raw = std::fs::read_to_string(p).ok()?;
    let mut q: VendorQuota = serde_json::from_str(&raw).ok()?;
    let now = now_secs();
    q.live = false;
    q.windows.retain(|w| w.resets_at.map_or(true, |r| r > now));
    if q.is_empty() {
        return None;
    }
    Some(q)
}

#[cfg(test)]
pub fn save_snapshot_for_test(dir: &std::path::Path, q: &VendorQuota) {
    save_snapshot(&snapshot_path(&Some(dir.to_path_buf())), q);
}

#[cfg(test)]
pub fn load_snapshot_for_test(dir: &std::path::Path) -> Option<VendorQuota> {
    load_snapshot(&snapshot_path(&Some(dir.to_path_buf())))
}

pub async fn probe(snapshot_dir: Option<PathBuf>) -> Result<VendorQuota, String> {
    let path = snapshot_path(&snapshot_dir);
    let live_err = match probe_live().await {
        Ok(q) => {
            save_snapshot(&path, &q);
            return Ok(q);
        }
        Err(e) => e,
    };
    // 라이브가 막혀도 마지막 성공값은 남음. 낡음 표시와 막힌 이유를 달아 표시
    match load_snapshot(&path) {
        Some(mut q) => {
            q.notes.push("live-failed".to_string());
            q.notes.push(format!("why:{live_err}"));
            Ok(q)
        }
        None => Err(live_err),
    }
}

async fn probe_live() -> Result<VendorQuota, String> {
    let creds = tauri::async_runtime::spawn_blocking(read_token)
        .await
        .map_err(|e| format!("join-error: {e}"))??;

    // 만료된 토큰으로 굳이 네트워크를 때리지 않는다 — 갱신은 claude CLI 의 몫.
    if let Some(exp_ms) = creds.expires_at {
        if now_secs() * 1000 >= exp_ms {
            return Err("token-expired".to_string());
        }
    }

    let res = http()?
        .get(USAGE_URL)
        .bearer_auth(&creds.access_token)
        .header("anthropic-beta", OAUTH_BETA)
        .send()
        .await
        .map_err(|e| format!("http-error: {e}"))?;

    let status = res.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("token-expired".to_string());
    }
    if !status.is_success() {
        // 본문은 싣지 않는다 — 토큰이 되비쳐 나올 여지를 두지 않기 위해.
        return Err(format!("http-status: {}", status.as_u16()));
    }

    let dto: UsageDto = res.json().await.map_err(|e| format!("bad-response: {e}"))?;

    let mut out = VendorQuota::new(true);
    out.observed_at = Some(now_secs());
    out.plan = creds.subscription_type;
    push_window(&mut out.windows, "five_hour", &dto.five_hour);
    push_window(&mut out.windows, "seven_day", &dto.seven_day);
    push_window(&mut out.windows, "seven_day_opus", &dto.seven_day_opus);
    push_window(&mut out.windows, "seven_day_sonnet", &dto.seven_day_sonnet);
    Ok(out)
}
