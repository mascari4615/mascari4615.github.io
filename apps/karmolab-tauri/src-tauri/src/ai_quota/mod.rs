//! 내 AI — 구독 할당량 수집. TASK-KL-248.
//!
//! 「지금 어느 통을 써도 되나」를 묻지 않고 보이게 하는 것이 이 모듈의 일이다.
//!
//! **새 구독을 붙이는 값 = 파일 하나(`<벤더>.rs`) + 아래 `SOURCES` 한 줄 +
//! `probe_one` 의 갈래 한 줄.** 화면은 돌려주는 것을 그대로 그리므로 프론트에
//! 벤더 목록이 두 벌로 갈라지지 않는다.
//!
//! 벤더마다 신선도가 다르다는 것을 숨기지 않는다 (`live` / `observed_at`) —
//! 스냅샷을 라이브처럼 그리면 「20% 남았네」 하고 들어갔다 벽 친다. 실제로
//! Codex 는 6일 묵은 스냅샷이 20% 라고 말하는 동안 라이브가 96% 였다.

mod claude;
mod codex;
mod grok;
mod shared;

pub use shared::{QuotaCount, QuotaWindow, VendorCard, VendorQuota, VendorSpec};

/// 카드 순서 = 실제로 기대는 순서 (주력 → 보조 → 곁가지).
static SOURCES: &[VendorSpec] = &[
    VendorSpec { id: "claude", label: "Claude", accent: "#d97757" },
    VendorSpec { id: "codex", label: "Codex", accent: "#10a37f" },
    VendorSpec { id: "grok", label: "Grok", accent: "#8b8b8b" },
];

async fn probe_one(spec: &'static VendorSpec) -> VendorCard {
    let result = match spec.id {
        "claude" => claude::probe().await,
        "codex" => codex::probe().await,
        "grok" => grok::probe().await,
        other => Err(format!("no-source: {other}")),
    };
    VendorCard::from(spec, result)
}

/// 카드 전부를 한 번에. 벤더 하나가 죽어도 나머지는 그대로 온다 — 실패는
/// 카드 안의 `error` 로 실려서, 화면이 왜 비었는지 말할 수 있다.
#[tauri::command]
pub async fn ai_quota_all() -> Result<Vec<VendorCard>, String> {
    let mut cards = Vec::with_capacity(SOURCES.len());
    // 벤더별 요청은 서로 독립이라 동시에 띄운다 — 느린 하나가 화면을 잡아두면 안 된다.
    let probes: Vec<_> = SOURCES.iter().map(probe_one).collect();
    for card in futures_util::future::join_all(probes).await {
        cards.push(card);
    }
    Ok(cards)
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트 — 이 컴퓨터의 진짜 파일을 읽는다. 파서가 벤더의 실제 기록 모양을
// 따라가는지는 합성 픽스처로 확인이 안 된다 (스키마가 바뀌면 그때 빨개져야
// 하는데 픽스처는 영원히 초록이다). 해당 CLI 가 없는 기계에서는 건너뛴다.
// ─────────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::shared::*;
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
        match super::codex::probe_snapshot() {
            Ok(q) => {
                assert!(!q.live, "세션 기록은 라이브가 아니다");
                assert!(q.observed_at.is_some(), "관측 시각이 없으면 신선도를 못 본다");
                assert!(!q.windows.is_empty(), "창이 하나도 없으면 카드가 빈다");
                for w in &q.windows {
                    if let Some(p) = w.used_percent {
                        assert!((0.0..=100.0).contains(&p), "퍼센트 범위 밖: {p}");
                    }
                }
                // 세션 기록은 분 단위인데 라이브는 초 단위다 — 단위를 헷갈리면
                // 7일 창이 「10080초 창」으로 둔갑한다.
                assert!(
                    q.windows.iter().any(|w| w.key == "seven_day"),
                    "7일 창이 안 잡혔다 (분→초 환산 실패 의심): {:?}",
                    q.windows.iter().map(|w| &w.key).collect::<Vec<_>>()
                );
            }
            Err(e) => assert!(e == "no-snapshot" || e == "no-sessions", "예상 밖 실패: {e}"),
        }
    }

    #[test]
    fn grok_log_signal_parses_from_real_log() {
        let installed = home_dir().map(|h| h.join(".grok").is_dir()).unwrap_or(false);
        if skip_unless(installed, "~/.grok 없음") {
            return;
        }
        match super::grok::probe_log() {
            Ok(q) => {
                assert!(!q.live);
                assert!(!q.is_empty(), "빈 결과면 Err 였어야 한다");
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
        let creds = super::claude::read_token().expect("자격증명 파싱");
        assert!(!creds.access_token.is_empty());

        // DTO 직렬화에 토큰이 섞여 나가지 않는지 — 이 위젯의 보안 계약.
        let mut q = VendorQuota::new(true);
        q.plan = creds.subscription_type.clone();
        let card = VendorCard::from(&SOURCES[0], Ok(q));
        let json = serde_json::to_string(&card).unwrap();
        assert!(!json.contains(&creds.access_token), "토큰이 DTO 로 새어 나갔다");
    }

    #[test]
    fn every_source_has_a_branch() {
        // 명부에 올려놓고 갈래를 안 만들면 카드가 조용히 "no-source" 로 뜬다.
        for spec in SOURCES {
            assert!(
                matches!(spec.id, "claude" | "codex" | "grok"),
                "명부에 있는 {} 의 갈래가 probe_one 에 없다",
                spec.id
            );
        }
    }

    #[test]
    fn window_keys_and_iso_are_stable() {
        // 2026-08-26T00:59:59Z = 1787705999 (오프셋이 붙은 형식도 그대로 먹는지).
        assert_eq!(iso_to_epoch("2026-08-26T00:59:59.882619+00:00"), Some(1787705999));
        assert_eq!(iso_to_epoch("not-a-date"), None);
        assert_eq!(window_key_from_secs(Some(604_800), "x"), "seven_day");
        assert_eq!(window_key_from_secs(Some(18_000), "x"), "five_hour");
        assert_eq!(window_key_from_secs(Some(77), "x"), "seconds_77");
        assert_eq!(window_key_from_secs(None, "primary"), "primary");
    }
}
