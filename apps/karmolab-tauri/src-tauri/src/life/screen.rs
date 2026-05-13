//! sub-F-1 capture skeleton + sub-F-2 OCR / 분류 / .md frontmatter 통합.
//!
//! 흐름 (Tauri command `life_screen_capture`):
//! 1. memo 위치 발견 (`state::LifeScreenConfig::resolve`).
//! 2. xcap 으로 primary monitor 캡쳐 → `image::RgbaImage`.
//! 3. PNG 저장 (`<stamp>-pending.png` placeholder).
//! 4. OCR (Tesseract Korean+English) → text.
//! 5. claude CLI subprocess 분류 → `ClassifyResult` (domain / tags / slug / summary).
//! 6. PNG rename `<stamp>-pending.png` → `<stamp>-<slug>.png`.
//! 7. `.md` frontmatter + 본문 write.
//! 8. 결과 (path + 분류 요약) 반환.

use std::sync::atomic::{AtomicU64, Ordering};

use chrono::Local;
use serde::Serialize;

use super::active_window;
use super::classify;
use super::companion;
use super::ocr;
use super::schema;
use super::state::LifeScreenConfig;
use super::vision;

/// 같은 ms 안 동시 capture (빠른 PrintScreen 연타) 시 placeholder filename 충돌 방어.
static CAPTURE_SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize, Debug)]
pub struct CaptureResult {
    pub png_path: String,
    pub md_path: String,
    pub timestamp: String,
    pub domain: Vec<String>,
    pub summary: String,
    pub ocr_chars: usize,
    pub app: Option<String>,
    pub trigger: String,
    /// VLM provider 가 작동했고 결과 박힘 시 Some.
    pub vision_summary: Option<String>,
    /// sub-G companion: router 가 선택한 페르소나 id. None = 침묵.
    pub companion_persona: Option<String>,
    /// sub-G companion: 캐릭터 응답. None = 침묵 또는 LLM 빈 응답.
    pub companion_response: Option<String>,
}

/// Tauri command — webview 또는 외부 invoke 진입점. trigger="manual".
#[tauri::command]
pub async fn life_screen_capture() -> Result<CaptureResult, String> {
    tauri::async_runtime::spawn_blocking(|| capture_with_trigger("manual"))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

/// 핵심 capture 함수 — sub-F-3 hotkey handler 가 trigger="hotkey" 로 호출.
pub fn capture_with_trigger(trigger: &str) -> Result<CaptureResult, String> {
    let config = LifeScreenConfig::resolve()?;
    std::fs::create_dir_all(&config.raw_screenshot_dir).map_err(|e| e.to_string())?;

    // 1) capture primary monitor.
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Err("monitor 없음 (xcap 발견 0)".into());
    }
    let primary_idx = monitors.iter().position(|m| m.is_primary());
    let monitor_index = primary_idx.unwrap_or(0);
    let target = &monitors[monitor_index];
    let img = target.capture_image().map_err(|e| e.to_string())?;

    let now = Local::now();
    // ms 포함 stamp — 같은 second 안 동시 capture 시 final filename 충돌 방지.
    let stamp = now.format("%Y-%m-%dT%H-%M-%S-%3f").to_string();
    // atomic seq — 같은 ms 안 race 도 방어 (아주 드물지만 hotkey 빠른 연타 시).
    let seq = CAPTURE_SEQ.fetch_add(1, Ordering::Relaxed);

    // 2) PNG save (placeholder slug — 분류 후 rename).
    let placeholder_png = config
        .raw_screenshot_dir
        .join(format!("{stamp}-pending-{seq}.png"));
    img.save(&placeholder_png).map_err(|e| e.to_string())?;

    // 3) OCR — fail soft (text 빈 채로 분류 fallback).
    let ocr_text = ocr::ocr_korean(&placeholder_png).unwrap_or_else(|e| {
        eprintln!("[life-screen] OCR fail soft: {e}");
        String::new()
    });
    let ocr_chars = ocr_text.chars().count();

    // 4) classify (claude CLI subprocess) — fail soft.
    let classification = classify::classify(&ocr_text, classify::ClassifyKind::Screenshot);
    let raw_slug = if classification.slug.is_empty() {
        "untagged"
    } else {
        &classification.slug
    };
    let slug = schema::sanitize_slug(raw_slug);

    // 5) PNG rename.
    let final_png = config
        .raw_screenshot_dir
        .join(format!("{stamp}-{slug}.png"));
    std::fs::rename(&placeholder_png, &final_png)
        .map_err(|e| format!("png rename 실패: {e}"))?;

    // 6) active window 발견 (capture 시점 사용자 보고 있던 앱).
    let app = active_window::active_window_title();

    // 7) VLM (vision provider) — fail soft. final png 위에서 분석 (rename 후라 path stable).
    let vision_provider = vision::default_provider();
    let vision_result = match vision_provider.analyze(&final_png, Some(&ocr_text)) {
        Ok(r) => Some(r),
        Err(e) => {
            eprintln!("[life-screen] vision ({}) fail soft: {e}", vision_provider.name());
            None
        }
    };

    // 8) .md frontmatter + 본문 write.
    let binary_filename = final_png
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let vision_field = vision_result
        .as_ref()
        .map(|r| (vision_provider.name(), r));
    let frontmatter = schema::build_frontmatter(
        &now,
        &classification,
        &binary_filename,
        ocr_chars,
        monitor_index,
        app.clone(),
        trigger,
        vision_field,
    );
    let md_path = config
        .raw_screenshot_dir
        .join(format!("{stamp}-{slug}.md"));
    schema::write_md(&md_path, &frontmatter, &ocr_text)?;

    // 9) sub-G companion react — fail soft. claude CLI 또 호출 (~30s+).
    let vision_summary_owned = vision_result
        .as_ref()
        .map(|r| r.summary.clone())
        .filter(|s| !s.is_empty());
    let vision_context_owned = vision_result
        .as_ref()
        .map(|r| r.context.clone())
        .filter(|s| !s.is_empty());
    let companion_input = companion::ReactInput {
        channel: "screenshot",
        trigger,
        timestamp: now,
        binary_path: &final_png,
        domain: &classification.domain,
        tags: &classification.tags,
        summary: &classification.summary,
        app: app.as_deref(),
        vision_summary: vision_summary_owned.as_deref(),
        vision_context: vision_context_owned.as_deref(),
        transcript: None,
    };
    let companion_result = match companion::react(&companion_input, &config) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[life-companion] react fail soft: {e}");
            companion::ReactResult::default()
        }
    };

    Ok(CaptureResult {
        png_path: final_png.to_string_lossy().into_owned(),
        md_path: md_path.to_string_lossy().into_owned(),
        timestamp: now.to_rfc3339(),
        domain: classification.domain,
        summary: classification.summary,
        ocr_chars,
        app,
        trigger: trigger.into(),
        vision_summary: vision_result.and_then(|r| (!r.summary.is_empty()).then_some(r.summary)),
        companion_persona: companion_result.persona,
        companion_response: companion_result.response,
    })
}

#[cfg(test)]
mod live_tests {
    use super::*;

    /// 라이브 검증 — 본 세션 cargo test --ignored 로 수동 실행.
    /// 외부 의존: xcap (always), claude CLI (optional, fail soft → "untagged"), Tesseract (optional, fail soft → 빈 ocr_text).
    /// 결과: tempdir 안 png + md 한 쌍 박힘. assert + cleanup.
    #[test]
    #[ignore]
    fn live_capture_writes_png_and_md_in_tempdir() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let tmp_root = std::env::temp_dir().join(format!("life-screen-live-{stamp}"));
        std::fs::create_dir_all(&tmp_root).expect("tempdir 생성 실패");
        std::env::set_var("LIFE_MEMO_ROOT", &tmp_root);

        // 라이브 vision 호출 비용 회피 (claude vision 30s+) — env 로 disabled.
        std::env::set_var("LIFE_VISION_PROVIDER", "none");
        let result = capture_with_trigger("manual").expect("capture 실패");
        eprintln!(
            "[live] png={} md={} ocr_chars={} domain={:?} app={:?} trigger={} vision={:?} slug-summary='{}'",
            result.png_path,
            result.md_path,
            result.ocr_chars,
            result.domain,
            result.app,
            result.trigger,
            result.vision_summary,
            result.summary
        );

        assert!(
            std::path::Path::new(&result.png_path).exists(),
            "png 미박힘: {}",
            result.png_path
        );
        assert!(
            std::path::Path::new(&result.md_path).exists(),
            "md 미박힘: {}",
            result.md_path
        );

        let md = std::fs::read_to_string(&result.md_path).expect("md read 실패");
        assert!(md.starts_with("---\n"), "frontmatter 시작 누락");
        assert!(md.contains("channel: screenshot"), "channel 필드 누락");

        let _ = std::fs::remove_dir_all(&tmp_root);
    }

    /// sub-G-1 라이브 검증 — real memo path + vision on + companion on. **수동 ignore**.
    /// 본 테스트는 사용자 환경 hardcode (`LIFE_MEMO_ROOT` env 우선 — env 박혀있으면 그거 사용).
    /// claude CLI subprocess 두 번 (분류 + companion) + claude vision 한 번 → ~90s+ 1회.
    /// 결과: `<memo>/life/companion/log/<date>.md` 박힘 + companion_persona/response 검증.
    #[test]
    #[ignore]
    fn live_capture_with_companion_to_real_memo() {
        if std::env::var("LIFE_MEMO_ROOT").is_err() {
            std::env::set_var(
                "LIFE_MEMO_ROOT",
                r"C:\Users\masca\repos\karmoddrine\memo",
            );
        }
        std::env::remove_var("LIFE_VISION_PROVIDER");

        let result = capture_with_trigger("manual").expect("capture 실패");
        eprintln!("=== sub-G-1 라이브 검증 ===");
        eprintln!("png_path: {}", result.png_path);
        eprintln!("md_path: {}", result.md_path);
        eprintln!("domain: {:?}", result.domain);
        eprintln!("ocr_chars: {}", result.ocr_chars);
        eprintln!("app: {:?}", result.app);
        eprintln!("vision_summary: {:?}", result.vision_summary);
        eprintln!("companion_persona: {:?}", result.companion_persona);
        eprintln!("companion_response: {:?}", result.companion_response);

        assert!(
            std::path::Path::new(&result.png_path).exists(),
            "png 미박힘"
        );
        assert!(
            std::path::Path::new(&result.md_path).exists(),
            "md 미박힘"
        );
    }
}
