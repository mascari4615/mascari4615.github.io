//! sub-F-1 — screen capture skeleton (PNG write only).
//!
//! Tauri command `life_screen_capture` 호출 시:
//! 1. memo 위치 발견 (`state::LifeScreenConfig::resolve`).
//! 2. xcap 으로 primary monitor 캡쳐 → image::RgbaImage.
//! 3. `<memo>/life/raw/screenshot/<stamp>-test.png` 저장.
//! 4. 결과 (path + timestamp) 반환.
//!
//! sub-F-2 에서 OCR + claude CLI 분류 + .md frontmatter write 추가.

use chrono::Local;
use serde::Serialize;

use super::state::LifeScreenConfig;

#[derive(Serialize, Debug)]
pub struct CaptureResult {
    pub png_path: String,
    pub timestamp: String,
}

/// Primary monitor 캡쳐 → PNG 저장 → 경로 반환.
/// sub-F-1 minimal: capture only (OCR / 분류 없음).
#[tauri::command]
pub async fn life_screen_capture() -> Result<CaptureResult, String> {
    let config = LifeScreenConfig::resolve()?;
    std::fs::create_dir_all(&config.raw_screenshot_dir).map_err(|e| e.to_string())?;

    // 모든 monitor 중 primary 우선, 없으면 첫 번째.
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Err("monitor 없음 (xcap 발견 0)".into());
    }
    let target = monitors
        .iter()
        .find(|m| m.is_primary())
        .or_else(|| monitors.first())
        .ok_or_else(|| "monitor select 실패".to_string())?;
    let img = target.capture_image().map_err(|e| e.to_string())?;

    let now = Local::now();
    let stamp = now.format("%Y-%m-%dT%H-%M-%S").to_string();
    let filename = format!("{}-test.png", stamp);
    let png_path = config.raw_screenshot_dir.join(&filename);
    img.save(&png_path).map_err(|e| e.to_string())?;

    Ok(CaptureResult {
        png_path: png_path.to_string_lossy().into_owned(),
        timestamp: now.to_rfc3339(),
    })
}
