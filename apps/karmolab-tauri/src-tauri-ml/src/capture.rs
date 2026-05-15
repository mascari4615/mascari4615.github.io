//! 화면 캡처(xcap + image PNG encode). KL-052-C 에서
//! `src-tauri/src/life/screen.rs` 를 이리로 이관 — 현재 = 스텁.

use crate::protocol::SidecarEvent;

pub fn capture() -> SidecarEvent
{
    SidecarEvent::Error { msg: "capture::capture 미구현 (KL-052-C 에서 xcap 이관)".to_string() }
}
