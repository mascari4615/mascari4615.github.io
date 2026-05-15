//! KL-052-C — 화면 캡처 (xcap primary monitor + image PNG). 메인
//! `src-tauri/src/life/screen.rs` 의 1·2단계(xcap capture + PNG save)
//! 이관. 결정 #1 (ML crate sidecar 내부). 후반(classify/vision/schema/
//! companion)은 메인, OCR 은 별 명령(`Ocr`)으로 sidecar.
//!
//! `Capture` → 임시 PNG write (메인이 classify 후 memo 로 이동, voice
//! wav 패턴 동일) + primary monitor index (schema frontmatter 정합).

use std::time::{SystemTime, UNIX_EPOCH};

use karmolab_shared::SidecarEvent;

pub fn capture() -> SidecarEvent {
    match capture_inner() {
        Ok((path, monitor_index)) => SidecarEvent::Captured { path, monitor_index },
        Err(msg) => SidecarEvent::Error { msg },
    }
}

fn capture_inner() -> Result<(String, usize), String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Err("monitor 없음 (xcap 발견 0)".into());
    }
    let monitor_index = monitors
        .iter()
        .position(|m| m.is_primary())
        .unwrap_or(0);
    let target = &monitors[monitor_index];
    let img = target.capture_image().map_err(|e| e.to_string())?;

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("clock 실패: {e}"))?
        .as_nanos();
    let tmp_png = std::env::temp_dir().join(format!("karmolab-screen-{nanos}.png"));
    img.save(&tmp_png)
        .map_err(|e| format!("PNG save 실패: {e}"))?;

    Ok((tmp_png.to_string_lossy().into_owned(), monitor_index))
}
