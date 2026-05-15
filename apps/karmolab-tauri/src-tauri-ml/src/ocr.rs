//! OCR(rusty-tesseract — 외부 tesseract.exe wrapper). KL-052-C 에서
//! `src-tauri/src/life/ocr.rs` 를 이리로 이관 — 현재 = 스텁.

use karmolab_shared::SidecarEvent;

pub fn run(_image: &str) -> SidecarEvent
{
    SidecarEvent::Error { msg: "ocr::run 미구현 (KL-052-C 에서 rusty-tesseract 이관)".to_string() }
}
