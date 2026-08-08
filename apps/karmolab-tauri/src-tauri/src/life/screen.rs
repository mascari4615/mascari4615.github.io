//! sub-F-1 capture + sub-F-2 OCR / 분류 / .md frontmatter.
//!
//! KL-052-C: xcap 캡처 + tesseract OCR 를 ML sidecar(karmolab-life-ml)
//! 로 분리 (결정 #1 — 메인 ML crate 0). 메인은 sidecar IPC client +
//! 후반(classify=claude CLI / vision=claude / schema).
//!
//! 흐름 (Tauri command `life_screen_capture`):
//! 1. memo 위치 발견 (`state::LifeScreenConfig::resolve`).
//! 2. sidecar `Capture` → 임시 PNG + primary monitor index.
//! 3. sidecar `Ocr` → text (fail soft — 빈 채로 분류 fallback).
//! 4. claude CLI subprocess 분류 → `ClassifyResult`.
//! 5. sidecar 임시 PNG → `<stamp>-<slug>.png` (memo) 이동.
//! 6. active window + VLM(claude) + `.md` frontmatter.

use chrono::Local;
use serde::Serialize;
use tauri::AppHandle;

use karmolab_shared::{SidecarCommand, SidecarEvent};

use super::active_window;
use super::classify;
use super::schema;
use super::sidecar;
use super::state::LifeScreenConfig;
use super::vision;

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
}

/// Tauri command — webview/외부 invoke 진입점. trigger="manual".
/// `app` = plugin-shell sidecar spawn (tauri 자동 inject).
#[tauri::command]
pub async fn life_screen_capture(app: AppHandle) -> Result<CaptureResult, String> {
    tauri::async_runtime::spawn_blocking(move || capture_with_trigger(&app, "manual"))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

/// 핵심 capture — sub-F-3 hotkey handler 가 trigger="hotkey" 로 호출.
pub fn capture_with_trigger(app: &AppHandle, trigger: &str) -> Result<CaptureResult, String> {
    let config = LifeScreenConfig::resolve()?;
    std::fs::create_dir_all(&config.raw_screenshot_dir).map_err(|e| e.to_string())?;

    // ML sidecar 공용 프로세스 (voice 와 단일 — 결정 #1).
    sidecar::ensure_spawned(app)?;

    // 1) sidecar capture (xcap primary monitor → 임시 PNG).
    let (sidecar_png, monitor_index) =
        match sidecar::send(&SidecarCommand::Capture, sidecar::SHORT_TIMEOUT)? {
            SidecarEvent::Captured { path, monitor_index } => (path, monitor_index),
            other => return Err(format!("Capture 예상 외 응답: {other:?}")),
        };

    let now = Local::now();
    // ms 포함 stamp — 같은 second 안 동시 capture 시 final filename 충돌 방지.
    let stamp = now.format("%Y-%m-%dT%H-%M-%S-%3f").to_string();

    // 2) sidecar OCR (Tesseract) — fail soft (text 빈 채로 분류 fallback).
    let ocr_text = match sidecar::send(
        &SidecarCommand::Ocr { image: sidecar_png.clone() },
        sidecar::HEAVY_TIMEOUT,
    ) {
        Ok(SidecarEvent::Result { text }) => text,
        Ok(other) => {
            eprintln!("[life-screen] OCR 예상 외 응답: {other:?} (fail soft)");
            String::new()
        }
        Err(e) => {
            eprintln!("[life-screen] OCR fail soft: {e}");
            String::new()
        }
    };
    let ocr_chars = ocr_text.chars().count();

    // 3) classify (claude CLI subprocess) — fail soft.
    let classification = classify::classify(&ocr_text, classify::ClassifyKind::Screenshot);
    let raw_slug = if classification.slug.is_empty() {
        "untagged"
    } else {
        &classification.slug
    };
    let slug = schema::sanitize_slug(raw_slug);

    // 4) sidecar 임시 PNG → memo (rename, cross-device copy fallback).
    let final_png = config
        .raw_screenshot_dir
        .join(format!("{stamp}-{slug}.png"));
    sidecar::move_into(&sidecar_png, &final_png)?;

    // 5) active window (capture 시점 사용자 보던 앱).
    let app_title = active_window::active_window_title();

    // 6) VLM (vision provider = claude CLI, ML crate 아님 — 메인 유지).
    //    final png 위 분석 (rename 후 path stable).
    let vision_provider = vision::default_provider();
    let vision_result = match vision_provider.analyze(&final_png, Some(&ocr_text)) {
        Ok(r) => Some(r),
        Err(e) => {
            eprintln!("[life-screen] vision ({}) fail soft: {e}", vision_provider.name());
            None
        }
    };

    // 7) .md frontmatter + 본문 write.
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
        app_title.clone(),
        trigger,
        vision_field,
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
        app: app_title,
        trigger: trigger.into(),
        vision_summary: vision_result.and_then(|r| (!r.summary.is_empty()).then_some(r.summary)),
    })
}
