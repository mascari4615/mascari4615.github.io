//! AI 구독 할당량 수집 — TASK-KL-248.
//!
//! Claude / Codex / Grok 세 구독의 남은 할당량을 한 화면에 모으기 위한 백엔드.
//! 벤더마다 잡히는 것이 다르고, **신선도가 다르다** — 그 차이를 숨기지 않는 게
//! 이 모듈의 핵심 계약이다 (라이브인 척 하면 「20% 남았네」 하고 들어갔다 벽 친다).
//!
//!   Claude — OAuth usage API 라이브 조회 (`live: true`)
//!   Codex  — 세션 rollout JSONL 의 마지막 `rate_limits` 스냅샷 (`live: false`)
//!   Grok   — unified 로그의 `images_remaining` + 429 이벤트 (`live: false`)
//!
//! Grok 에 퍼센트 게이지가 없는 것은 구현 미비가 아니다 — CLI 바이너리·번들
//! 전수 조사 결과 x.ai 쪽에 쿼터 조회 엔드포인트 자체가 없다 (api/accounts/
//! console/docs 뿐). 없는 게이지를 그리느니 있는 사실만 정직하게 싣는다.
//!
//! 보안: accessToken 은 이 모듈 안에서만 산다. DTO 에 담지 않고, 로그에도
//! 찍지 않는다 (에러 문자열에 응답 본문을 그대로 싣지 않는 이유이기도 하다).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// 사용량 창 하나 (예: Claude 5시간 창, Codex 7일 창).
#[derive(Debug, Clone, Serialize)]
pub struct QuotaWindow {
    /// 안정 키 — 프론트 i18n 이 이걸로 라벨을 고른다.
    pub key: String,
    /// 0.0 ~ 100.0. 벤더가 퍼센트를 안 주면 None.
    pub used_percent: Option<f64>,
    /// 창이 리셋되는 시각 (epoch 초). 모르면 None.
    pub resets_at: Option<i64>,
}

/// 퍼센트가 아닌 낱개 잔량 (예: Grok 이미지 N장).
#[derive(Debug, Clone, Serialize)]
pub struct QuotaCount {
    pub key: String,
    pub remaining: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct VendorQuota {
    /// "claude" | "codex" | "grok"
    pub vendor: String,
    /// true = 방금 벤더에 물어본 값 / false = 로컬에 남은 마지막 관측 스냅샷.
    pub live: bool,
    /// 스냅샷일 때 그 값이 관측된 시각 (epoch 초). live 면 조회 시각.
    pub observed_at: Option<i64>,
    /// 요금제 표기 (예: "max" / "plus"). 모르면 None.
    pub plan: Option<String>,
    pub windows: Vec<QuotaWindow>,
    pub counts: Vec<QuotaCount>,
    /// 마지막으로 429(벽)를 친 시각 (epoch 초).
    pub last_rate_limited_at: Option<i64>,
    /// 프론트가 i18n 으로 풀어 쓸 안정 코드 (예: "no-percent-api").
    pub notes: Vec<String>,
}

impl VendorQuota {
    fn empty(vendor: &str, live: bool) -> Self {
        Self {
            vendor: vendor.to_string(),
            live,
            observed_at: None,
            plan: None,
            windows: Vec::new(),
            counts: Vec::new(),
            last_rate_limited_at: None,
            notes: Vec::new(),
        }
    }
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn mtime_secs(path: &Path) -> Option<i64> {
    let meta = std::fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?;
    modified
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs() as i64)
}

/// ISO-8601 → epoch 초. 벤더가 주는 형식이 제각각이라 chrono 에 맡긴다.
fn iso_to_epoch(s: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.timestamp())
}

/// 키 이름으로 재귀 탐색 — 벤더가 이벤트 스키마의 깊이를 바꿔도 덜 부러지게.
fn find_key<'a>(value: &'a serde_json::Value, key: &str) -> Option<&'a serde_json::Value> {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(hit) = map.get(key) {
                return Some(hit);
            }
            map.values().find_map(|v| find_key(v, key))
        }
        serde_json::Value::Array(items) => items.iter().find_map(|v| find_key(v, key)),
        _ => None,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude — ~/.claude/.credentials.json 의 OAuth 토큰으로 usage API 라이브 조회
// ─────────────────────────────────────────────────────────────────────────────

const CLAUDE_USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_OAUTH_BETA: &str = "oauth-2025-04-20";

#[derive(Debug, Deserialize)]
struct ClaudeCredsFile {
    #[serde(rename = "claudeAiOauth")]
    claude_ai_oauth: Option<ClaudeOauth>,
}

#[derive(Debug, Deserialize)]
struct ClaudeOauth {
    #[serde(rename = "accessToken")]
    access_token: String,
    /// epoch **밀리초** (파일 규약).
    #[serde(rename = "expiresAt")]
    expires_at: Option<i64>,
    #[serde(rename = "subscriptionType")]
    subscription_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ClaudeUsageWindow {
    /// 0~100 퍼센트. (5시간 창 1.0 = 1% 사용. 0~1 비율이 아니다 — 실측 확인.)
    utilization: Option<f64>,
    resets_at: Option<String>,
}

/// usage 응답에서 우리가 그리는 창들. 나머지 필드(프로모션 슬롯 등)는 무시.
#[derive(Debug, Deserialize)]
struct ClaudeUsageDto {
    five_hour: Option<ClaudeUsageWindow>,
    seven_day: Option<ClaudeUsageWindow>,
    seven_day_opus: Option<ClaudeUsageWindow>,
    seven_day_sonnet: Option<ClaudeUsageWindow>,
}

fn read_claude_token() -> Result<ClaudeOauth, String> {
    let home = home_dir().ok_or_else(|| "no-home".to_string())?;
    let path = home.join(".claude").join(".credentials.json");
    let raw = std::fs::read_to_string(&path).map_err(|_| "no-credentials".to_string())?;
    let parsed: ClaudeCredsFile =
        serde_json::from_str(&raw).map_err(|_| "bad-credentials".to_string())?;
    parsed
        .claude_ai_oauth
        .ok_or_else(|| "no-oauth-block".to_string())
}

fn push_claude_window(out: &mut Vec<QuotaWindow>, key: &str, w: &Option<ClaudeUsageWindow>) {
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

#[tauri::command]
pub async fn ai_quota_claude() -> Result<VendorQuota, String> {
    let creds = tauri::async_runtime::spawn_blocking(read_claude_token)
        .await
        .map_err(|e| format!("join-error: {e}"))??;

    // 만료된 토큰으로 굳이 네트워크를 때리지 않는다 — 갱신은 claude CLI 의 몫.
    if let Some(exp_ms) = creds.expires_at {
        if now_secs() * 1000 >= exp_ms {
            return Err("token-expired".to_string());
        }
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("http-init: {e}"))?;

    let res = client
        .get(CLAUDE_USAGE_URL)
        .bearer_auth(&creds.access_token)
        .header("anthropic-beta", CLAUDE_OAUTH_BETA)
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

    let dto: ClaudeUsageDto = res.json().await.map_err(|e| format!("bad-response: {e}"))?;

    let mut out = VendorQuota::empty("claude", true);
    out.observed_at = Some(now_secs());
    out.plan = creds.subscription_type;
    push_claude_window(&mut out.windows, "five_hour", &dto.five_hour);
    push_claude_window(&mut out.windows, "seven_day", &dto.seven_day);
    push_claude_window(&mut out.windows, "seven_day_opus", &dto.seven_day_opus);
    push_claude_window(&mut out.windows, "seven_day_sonnet", &dto.seven_day_sonnet);
    Ok(out)
}

// ─────────────────────────────────────────────────────────────────────────────
// Codex — 세션 rollout JSONL 에 박힌 마지막 rate_limits 스냅샷
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct CodexRateLimits {
    primary: Option<CodexWindow>,
    secondary: Option<CodexWindow>,
    plan_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CodexWindow {
    used_percent: Option<f64>,
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

/// 창 길이(분)로 안정 키를 만든다 — 10080 = 7일, 300 = 5시간.
/// 벤더가 창 구성을 바꿔도 프론트가 라벨을 만들 수 있게 분 단위를 남긴다.
fn codex_window_key(minutes: Option<i64>, fallback: &str) -> String {
    match minutes {
        Some(10080) => "seven_day".to_string(),
        Some(1440) => "one_day".to_string(),
        Some(300) => "five_hour".to_string(),
        Some(m) => format!("minutes_{m}"),
        None => fallback.to_string(),
    }
}

fn push_codex_window(out: &mut Vec<QuotaWindow>, w: &Option<CodexWindow>, fallback: &str) {
    if let Some(w) = w {
        out.push(QuotaWindow {
            key: codex_window_key(w.window_minutes, fallback),
            used_percent: w.used_percent,
            resets_at: w.resets_at,
        });
    }
}

/// 한 파일에서 마지막 `rate_limits` 를 뽑는다. 없으면 None.
fn last_rate_limits(path: &Path) -> Option<CodexRateLimits> {
    let raw = std::fs::read_to_string(path).ok()?;
    for line in raw.lines().rev() {
        if !line.contains("\"rate_limits\"") {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        if let Some(found) = find_key(&value, "rate_limits") {
            if let Ok(parsed) = serde_json::from_value::<CodexRateLimits>(found.clone()) {
                return Some(parsed);
            }
        }
    }
    None
}

fn read_codex_quota() -> Result<VendorQuota, String> {
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
        let mut out = VendorQuota::empty("codex", false);
        out.observed_at = mtime_secs(path);
        out.plan = limits.plan_type.clone();
        push_codex_window(&mut out.windows, &limits.primary, "primary");
        push_codex_window(&mut out.windows, &limits.secondary, "secondary");
        return Ok(out);
    }
    Err("no-snapshot".to_string())
}

#[tauri::command]
pub async fn ai_quota_codex() -> Result<VendorQuota, String> {
    tauri::async_runtime::spawn_blocking(read_codex_quota)
        .await
        .map_err(|e| format!("join-error: {e}"))?
}

// ─────────────────────────────────────────────────────────────────────────────
// Grok — unified 로그의 images_remaining + 429 이벤트
// ─────────────────────────────────────────────────────────────────────────────

/// 로그가 계속 자라므로 끝에서 이만큼만 읽는다 (최근 사실만 필요).
const GROK_TAIL_BYTES: u64 = 4 * 1024 * 1024;

fn read_tail(path: &Path, max_bytes: u64) -> Result<String, String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut file = std::fs::File::open(path).map_err(|_| "no-log".to_string())?;
    let len = file.metadata().map_err(|_| "no-log".to_string())?.len();
    if len > max_bytes {
        file.seek(SeekFrom::Start(len - max_bytes))
            .map_err(|e| format!("seek: {e}"))?;
    }
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).map_err(|e| format!("read: {e}"))?;
    // 자른 지점이 UTF-8 문자 중간일 수 있다 — 깨진 앞머리는 버린다.
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

fn read_grok_quota() -> Result<VendorQuota, String> {
    let home = home_dir().ok_or_else(|| "no-home".to_string())?;
    let grok = home.join(".grok");
    if !grok.is_dir() {
        return Err("not-installed".to_string());
    }
    let log = grok.join("logs").join("unified.jsonl");
    let tail = read_tail(&log, GROK_TAIL_BYTES)?;

    let mut out = VendorQuota::empty("grok", false);
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
    if out.counts.is_empty() && out.last_rate_limited_at.is_none() {
        return Err("no-signal".to_string());
    }
    // x.ai 에 쿼터 조회 API 가 없다는 사실 자체를 프론트가 안내하도록 코드로 싣는다.
    out.notes.push("no-percent-api".to_string());
    Ok(out)
}

#[tauri::command]
pub async fn ai_quota_grok() -> Result<VendorQuota, String> {
    tauri::async_runtime::spawn_blocking(read_grok_quota)
        .await
        .map_err(|e| format!("join-error: {e}"))?
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트 — 이 컴퓨터의 진짜 파일을 읽는다. 파서가 벤더의 실제 기록 모양을
// 따라가는지는 합성 픽스처로는 확인이 안 된다 (스키마가 바뀌면 그때 빨개져야
// 하는데, 픽스처는 영원히 초록이다). 해당 CLI 가 안 깔린 기계에서는 조용히 건너뛴다.
// ─────────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    fn skip_unless(cond: bool, why: &str) -> bool {
        if !cond {
            eprintln!("[skip] {why}");
        }
        !cond
    }

    #[test]
    fn codex_snapshot_parses_from_real_sessions() {
        let installed = home_dir().map(|h| h.join(".codex").is_dir()).unwrap_or(false);
        if skip_unless(installed, "~/.codex 없음") {
            return;
        }
        match read_codex_quota() {
            Ok(q) => {
                assert_eq!(q.vendor, "codex");
                assert!(!q.live, "세션 기록은 라이브가 아니다");
                assert!(q.observed_at.is_some(), "관측 시각이 없으면 사용자가 신선도를 못 본다");
                assert!(!q.windows.is_empty(), "창이 하나도 없으면 카드가 빈다");
                for w in &q.windows {
                    if let Some(p) = w.used_percent {
                        assert!((0.0..=100.0).contains(&p), "퍼센트 범위 밖: {p}");
                    }
                }
            }
            // 오래 안 썼으면 스냅샷이 없을 수 있다 — 그것도 정상 경로다.
            Err(e) => assert!(
                e == "no-snapshot" || e == "no-sessions",
                "예상 밖 실패: {e}"
            ),
        }
    }

    #[test]
    fn grok_signal_parses_from_real_log() {
        let installed = home_dir().map(|h| h.join(".grok").is_dir()).unwrap_or(false);
        if skip_unless(installed, "~/.grok 없음") {
            return;
        }
        match read_grok_quota() {
            Ok(q) => {
                assert_eq!(q.vendor, "grok");
                assert!(!q.live);
                assert!(
                    !q.counts.is_empty() || q.last_rate_limited_at.is_some(),
                    "둘 다 비면 Err 였어야 한다"
                );
                assert!(
                    q.notes.iter().any(|n| n == "no-percent-api"),
                    "게이지가 없는 이유를 화면이 말해야 한다"
                );
            }
            Err(e) => assert!(e == "no-signal" || e == "no-log", "예상 밖 실패: {e}"),
        }
    }

    #[test]
    fn claude_token_is_readable_and_never_leaves_the_dto() {
        let has = home_dir()
            .map(|h| h.join(".claude").join(".credentials.json").is_file())
            .unwrap_or(false);
        if skip_unless(has, "~/.claude/.credentials.json 없음") {
            return;
        }
        let creds = read_claude_token().expect("자격증명 파싱");
        assert!(!creds.access_token.is_empty());

        // DTO 직렬화 결과에 토큰이 섞여 나가지 않는지 — 이 위젯의 보안 계약.
        let mut dto = VendorQuota::empty("claude", true);
        dto.plan = creds.subscription_type.clone();
        let json = serde_json::to_string(&dto).unwrap();
        assert!(!json.contains(&creds.access_token), "토큰이 DTO 로 새어 나갔다");
    }

    #[test]
    fn iso_and_window_keys_are_stable() {
        // 2026-08-26T00:59:59Z = 1787705999 (오프셋이 붙은 형식도 그대로 먹는지).
        assert_eq!(iso_to_epoch("2026-08-26T00:59:59.882619+00:00"), Some(1787705999));
        assert_eq!(iso_to_epoch("not-a-date"), None);
        assert_eq!(codex_window_key(Some(10080), "x"), "seven_day");
        assert_eq!(codex_window_key(Some(300), "x"), "five_hour");
        assert_eq!(codex_window_key(Some(77), "x"), "minutes_77");
        assert_eq!(codex_window_key(None, "primary"), "primary");
    }
}
