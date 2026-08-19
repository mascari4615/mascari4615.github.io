//! 벤더 공용 뼈대 — DTO 와 잔 도구들. TASK-KL-248.
//!
//! 벤더마다 잡히는 것이 다르고 **신선도가 다르다**. 그 차이를 숨기지 않는 게
//! 이 층의 계약이라, `live` 와 `observed_at` 은 선택 항목이 아니다.

use serde::Serialize;
use std::path::{Path, PathBuf};

/// 사용량 창 하나 (예: 5시간 창, 7일 창).
#[derive(Debug, Clone, Serialize)]
pub struct QuotaWindow {
    /// 안정 키 — 프론트 i18n 이 이걸로 라벨을 고른다.
    pub key: String,
    /// 0.0 ~ 100.0. 벤더가 퍼센트를 안 주면 None.
    pub used_percent: Option<f64>,
    /// 창이 리셋되는 시각 (epoch 초). 모르면 None.
    pub resets_at: Option<i64>,
}

/// 퍼센트가 아닌 낱개 잔량 (예: 이미지 N장).
#[derive(Debug, Clone, Serialize)]
pub struct QuotaCount {
    pub key: String,
    pub remaining: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct VendorQuota {
    /// true = 방금 벤더에 물어본 값 / false = 로컬에 남은 마지막 관측 스냅샷.
    pub live: bool,
    /// 스냅샷이면 그 값이 관측된 시각, 라이브면 조회 시각 (epoch 초).
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
    pub fn new(live: bool) -> Self {
        Self {
            live,
            observed_at: None,
            plan: None,
            windows: Vec::new(),
            counts: Vec::new(),
            last_rate_limited_at: None,
            notes: Vec::new(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.windows.is_empty() && self.counts.is_empty() && self.last_rate_limited_at.is_none()
    }
}

/// 카드 한 장 = 벤더 하나. 실패해도 카드는 나온다 — 왜 비었는지가 화면에 남아야
/// 사용자가 「내가 뭘 해야 하나」를 안다 (조용히 사라지면 고장으로 읽는다).
#[derive(Debug, Clone, Serialize)]
pub struct VendorCard {
    pub id: &'static str,
    pub label: &'static str,
    /// 카드 왼쪽 띠 색 — 벤더 정체성을 백엔드가 들고 있어야 프론트에 벤더 목록이
    /// 두 벌로 갈라지지 않는다.
    pub accent: &'static str,
    pub quota: Option<VendorQuota>,
    /// 프론트가 i18n 으로 푸는 안정 코드 (예: "token-expired").
    pub error: Option<String>,
}

impl VendorCard {
    pub fn from(
        spec: &'static VendorSpec,
        result: Result<VendorQuota, String>,
    ) -> Self {
        match result {
            Ok(q) => Self {
                id: spec.id,
                label: spec.label,
                accent: spec.accent,
                quota: Some(q),
                error: None,
            },
            Err(e) => Self {
                id: spec.id,
                label: spec.label,
                accent: spec.accent,
                quota: None,
                error: Some(e),
            },
        }
    }
}

/// 벤더 하나의 고정 정보. **새 구독을 붙이는 값은 여기 한 줄 + 모듈 하나뿐이다.**
pub struct VendorSpec {
    pub id: &'static str,
    pub label: &'static str,
    pub accent: &'static str,
}

pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn mtime_secs(path: &Path) -> Option<i64> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    modified
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs() as i64)
}

/// ISO-8601 → epoch 초. 벤더가 주는 형식이 제각각이라 chrono 에 맡긴다.
pub fn iso_to_epoch(s: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.timestamp())
}

/// 키 이름으로 재귀 탐색 — 벤더가 이벤트 스키마의 깊이를 바꿔도 덜 부러지게.
pub fn find_key<'a>(value: &'a serde_json::Value, key: &str) -> Option<&'a serde_json::Value> {
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

/// 창 길이(초)로 안정 키를 만든다 — 벤더가 창 구성을 바꿔도 프론트가 라벨을
/// 만들 수 있게 초 단위를 남긴다.
pub fn window_key_from_secs(secs: Option<i64>, fallback: &str) -> String {
    match secs {
        Some(604_800) => "seven_day".to_string(),
        Some(86_400) => "one_day".to_string(),
        Some(18_000) => "five_hour".to_string(),
        Some(s) => format!("seconds_{s}"),
        None => fallback.to_string(),
    }
}

/// 벤더 공용 HTTP 클라이언트. 짧은 타임아웃 — 카드 하나가 화면 전체를 잡아두면 안 된다.
pub fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("http-init: {e}"))
}

/// 로그가 계속 자라는 파일은 끝에서 필요한 만큼만 읽는다.
pub fn read_tail(path: &Path, max_bytes: u64) -> Result<String, String> {
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
