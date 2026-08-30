//! Grok — CLI 프록시 라이브 조회, 실패하면 로컬 로그 신호. TASK-KL-248.
//!
//! 라이브 창구 = `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits`
//! (`~/.grok/auth.json` 의 OIDC access token). **비공식이다** — x.ai 공식 문서에
//! 잔량 조회의 공식 공개 API는 없고, 이 주소는 CLI가 쓰는 비공식 경로다. 그래서
//! 실패를 정상 경로로 취급하고 로컬 로그 신호로 떨어진다. 2026-08-30 실측 형식:
//! `config.currentPeriod`와 `config.productUsage`의 camelCase
//!
//! 로컬 신호 = 이미지 생성 잔량 + 마지막으로 429 를 맞은 시각. 퍼센트 게이지는
//! 지어내지 않는다.

use super::shared::*;

const BILLING_URL: &str = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";

/// 로그가 계속 자라므로 끝에서 이만큼만 읽는다 (최근 사실만 필요).
const TAIL_BYTES: u64 = 4 * 1024 * 1024;

// ── 라이브 ────────────────────────────────────────────────────────────────────

fn read_token() -> Result<String, String> {
    let home = home_dir().ok_or_else(|| "no-home".to_string())?;
    let path = home.join(".grok").join("auth.json");
    let raw = std::fs::read_to_string(&path).map_err(|_| "no-credentials".to_string())?;
    let parsed: serde_json::Value =
        serde_json::from_str(&raw).map_err(|_| "bad-credentials".to_string())?;

    // 파일은 `{"<issuer>::<client-id>": { key, expires_at, ... }}` 꼴이다 —
    // 바깥 열쇠 이름이 발급자마다 달라 값 쪽에서 찾는다.
    let entry = parsed
        .as_object()
        .and_then(|m| m.values().next())
        .ok_or_else(|| "no-credentials".to_string())?;

    // 만료면 네트워크를 때리지 않는다 — 갱신은 grok CLI 의 몫.
    if let Some(exp) = entry.get("expires_at").and_then(|v| v.as_str()) {
        if let Some(exp) = iso_to_epoch(exp) {
            if now_secs() >= exp {
                return Err("token-expired".to_string());
            }
        }
    }
    entry
        .get("key")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| "no-credentials".to_string())
}

async fn probe_live() -> Result<VendorQuota, String> {
    let token = tauri::async_runtime::spawn_blocking(read_token)
        .await
        .map_err(|e| format!("join-error: {e}"))??;

    let res = http()?
        .get(BILLING_URL)
        .bearer_auth(&token)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("http-error: {e}"))?;

    let status = res.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err("token-expired".to_string());
    }
    if !status.is_success() {
        return Err(format!("http-status: {}", status.as_u16()));
    }

    let body: serde_json::Value = res.json().await.map_err(|e| format!("bad-response: {e}"))?;
    extract_live(&body)
}

/// 비공식 billing 응답: 과거 snake_case와 현재 `config` 아래 camelCase
/// 기간 끝과 사용률을 같은 응답에서만 짝지어 추정 게이지 금지
fn extract_live(body: &serde_json::Value) -> Result<VendorQuota, String> {
    let config = body.get("config").unwrap_or(body);
    let mut out = VendorQuota::new(true);
    out.observed_at = Some(now_secs());
    out.plan = find_key(config, "tier")
        .or_else(|| find_key(config, "plan"))
        .or_else(|| find_key(config, "subscription_tier"))
        .and_then(|v| v.as_str())
        .map(str::to_string);

    // productUsage 우선 — Grok Build 제품 한도 / 전체 credit 사용률은 보조 신호
    let used = find_key(config, "usagePercent")
        .or_else(|| find_key(config, "used_percent"))
        .or_else(|| find_key(config, "usage_percent"))
        .or_else(|| find_key(config, "creditUsagePercent"))
        .and_then(|v| v.as_f64());
    let resets = find_key(config, "reset_at")
        .and_then(|v| v.as_i64())
        .or_else(|| {
            find_key(config, "reset_at")
                .and_then(|v| v.as_str())
                .and_then(iso_to_epoch)
        })
        .or_else(|| {
            config
                .get("currentPeriod")
                .and_then(|period| period.get("end"))
                .and_then(|v| v.as_str())
                .and_then(iso_to_epoch)
        })
        .or_else(|| {
            find_key(config, "billingPeriodEnd")
                .and_then(|v| v.as_str())
                .and_then(iso_to_epoch)
        });
    let window = find_key(config, "window_seconds")
        .and_then(|v| v.as_i64())
        .or_else(|| {
            config
                .get("currentPeriod")
                .and_then(|period| period.get("type"))
                .and_then(|v| v.as_str())
                .and_then(|kind| match kind {
                    "USAGE_PERIOD_TYPE_WEEKLY" => Some(604_800),
                    "USAGE_PERIOD_TYPE_DAILY" => Some(86_400),
                    _ => None,
                })
        });

    if used.is_some() || resets.is_some() {
        out.windows.push(QuotaWindow {
            key: window_key_from_secs(window, "primary"),
            used_percent: used,
            resets_at: resets,
        });
    }

    if out.is_empty() {
        return Err("no-signal".to_string());
    }
    Ok(out)
}

// ── 로컬 로그 신호 ────────────────────────────────────────────────────────────

pub fn probe_log() -> Result<VendorQuota, String> {
    let home = home_dir().ok_or_else(|| "no-home".to_string())?;
    let grok = home.join(".grok");
    if !grok.is_dir() {
        return Err("not-installed".to_string());
    }
    let log = grok.join("logs").join("unified.jsonl");
    let tail = read_tail(&log, TAIL_BYTES)?;

    let mut out = VendorQuota::new(false);
    let mut images: Option<(i64, Option<i64>)> = None;

    for line in tail.lines().rev() {
        let want_images = images.is_none() && line.contains("\"images_remaining\"");
        let want_limit = out.last_rate_limited_at.is_none() && line.contains("rate_limited");
        if !want_images && !want_limit {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let ts = value
            .get("ts")
            .and_then(|v| v.as_str())
            .and_then(iso_to_epoch);

        if want_images {
            if let Some(n) = find_key(&value, "images_remaining").and_then(|v| v.as_i64()) {
                images = Some((n, ts));
            }
        }
        if want_limit {
            // "rate_limited" 는 kind / error_type 어느 쪽으로도 온다.
            let is_event = find_key(&value, "kind").and_then(|v| v.as_str())
                == Some("rate_limited")
                || find_key(&value, "error_type").and_then(|v| v.as_str()) == Some("rate_limited");
            if is_event {
                out.last_rate_limited_at = ts;
            }
        }
        if images.is_some() && out.last_rate_limited_at.is_some() {
            break;
        }
    }

    if let Some((n, ts)) = images {
        out.counts.push(QuotaCount {
            key: "images".to_string(),
            remaining: n,
        });
        out.observed_at = ts;
    }
    if out.observed_at.is_none() {
        out.observed_at = mtime_secs(&log);
    }
    if out.is_empty() {
        return Err("no-signal".to_string());
    }
    Ok(out)
}

pub async fn probe() -> Result<VendorQuota, String> {
    let live_err = match probe_live().await {
        Ok(q) => return Ok(q),
        Err(e) => e,
    };
    match tauri::async_runtime::spawn_blocking(probe_log).await {
        Ok(Ok(mut q)) => {
            q.notes.push("live-failed".to_string());
            // 퍼센트가 없는 이유를 화면이 스스로 말하게 한다.
            q.notes.push("no-percent-api".to_string());
            Ok(q)
        }
        _ => Err(live_err),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn current_billing_shape_yields_a_weekly_usage_window() {
        let body = json!({
            "config": {
                "creditUsagePercent": 100.0,
                "currentPeriod": {
                    "type": "USAGE_PERIOD_TYPE_WEEKLY",
                    "start": "2026-08-24T12:42:12.372630+00:00",
                    "end": "2026-08-31T12:42:12.372630+00:00"
                },
                "productUsage": { "product": "GrokBuild", "usagePercent": 100.0 }
            }
        });

        let quota = extract_live(&body).expect("current billing shape should parse");
        assert!(quota.live);
        assert_eq!(quota.windows.len(), 1);
        assert_eq!(quota.windows[0].key, "seven_day");
        assert_eq!(quota.windows[0].used_percent, Some(100.0));
        assert_eq!(quota.windows[0].resets_at, Some(1788180132));
    }
}
