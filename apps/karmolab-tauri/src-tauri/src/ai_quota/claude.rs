//! Claude — OAuth usage API 라이브 조회. TASK-KL-248.
//!
//! 토큰은 `~/.claude/.credentials.json` 에서 읽어 **이 파일 안에서만** 쓴다.
//! DTO 에 담지 않고 에러 문자열에도 응답 본문을 그대로 싣지 않는다.

use serde::Deserialize;

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

pub async fn probe() -> Result<VendorQuota, String> {
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
