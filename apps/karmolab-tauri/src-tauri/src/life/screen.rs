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
use super::ocr;
use super::schema;
use super::state::LifeScreenConfig;

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
}

/// Tauri command — webview 또는 외부 invoke 진입점. trigger="manual".
#[tauri::command]
pub fn life_screen_capture() -> Result<CaptureResult, String> {
    capture_with_trigger("manual")
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
    let classification = classify::classify(&ocr_text);
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

    // 7) .md frontmatter + 본문 write.
    let binary_filename = final_png
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let frontmatter = schema::build_frontmatter(
        &now,
        &classification,
        &binary_filename,
        ocr_chars,
        monitor_index,
        app.clone(),
        trigger,
    );
    let md_path = config
        .raw_screenshot_dir
        .join(format!("{stamp}-{slug}.md"));
    schema::write_md(&md_path, &frontmatter, &ocr_text)?;

    Ok(CaptureResult {
        png_path: final_png.to_string_lossy().into_owned(),
        md_path: md_path.to_string_lossy().into_owned(),
        timestamp: now.to_rfc3339(),
        domain: classification.domain,
        summary: classification.summary,
        ocr_chars,
        app,
        trigger: trigger.into(),
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

        let result = life_screen_capture().expect("capture 실패");
        eprintln!(
            "[live] png={} md={} ocr_chars={} domain={:?} app={:?} trigger={} slug-summary='{}'",
            result.png_path,
            result.md_path,
            result.ocr_chars,
            result.domain,
            result.app,
            result.trigger,
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
}
