//! Grok — CLI 프록시 라이브 조회, 실패하면 로컬 로그 신호. TASK-KL-248.
//!
//! 라이브 창구 = `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits`
//! (`~/.grok/auth.json` 의 OIDC access token). **비공식이다** — x.ai 공식 문서에
//! 잔량 조회 엔드포인트는 없고(rate-limit 은 콘솔 UI 로만 안내), 이 주소는 CLI 의
//! `/usage` 가 쓰는 것으로 알려진 경로다. 그래서 실패를 정상 경로로 취급하고
//! 로컬 로그 신호로 떨어진다.
//!
//! 로컬 신호 = 이미지 생성 잔량 + 마지막으로 429 를 맞은 시각. 퍼센트 게이지는
//! 지어내지 않는다.

use serde::Deserialize;

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

    // 비공식 경로라 응답 모양이 언제 바뀔지 모른다 — 필드 이름으로 더듬어
    // 찾고, 못 찾으면 지어내지 말고 스냅샷으로 떨어진다.
    let mut out = VendorQuota::new(true);
    out.observed_at = Some(now_secs());
    out.plan = find_key(&body, "tier")
        .or_else(|| find_key(&body, "plan"))
        .or_else(|| find_key(&body, "subscription_tier"))
        .and_then(|v| v.as_str())
        .map(str::to_string);

    let used = find_key(&body, "used_percent")
        .or_else(|| find_key(&body, "usage_percent"))
        .and_then(|v| v.as_f64());
    let resets = find_key(&body, "reset_at")
        .and_then(|v| v.as_i64())
        .or_else(|| {
            find_key(&body, "reset_at")
                .and_then(|v| v.as_str())
                .and_then(iso_to_epoch)
        });
    let window = find_key(&body, "window_seconds").and_then(|v| v.as_i64());

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
            let is_event = find_key(&value, "kind").and_then(|v| v.as_str()) == Some("rate_limited")
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
