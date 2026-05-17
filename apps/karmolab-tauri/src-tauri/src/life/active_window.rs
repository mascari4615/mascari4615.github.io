//! sub-F-3 — Windows active window title (capture 시점 메타).
//!
//! capture 순간 사용자가 어느 앱·창을 보고 있었는지 frontmatter `app` 필드에 박음.
//! sub-G (캐릭터 동반자) 가 「본인이 어떤 앱 보고 반응할지」 판단 입력.
//!
//! windows-sys `GetForegroundWindow` + `GetWindowTextW` (KL-055 Phase 1a). PowerShell / Tauri webview 자체가
//! foreground 면 그 창 제목 박힘 — 정직.

#[cfg(windows)]
pub fn active_window_title() -> Option<String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return None;
        }
        // GetWindowTextW 는 null-terminator 제외 길이 반환 → buffer 는 len + 1.
        let mut buf: Vec<u16> = vec![0; (len as usize) + 1];
        let written = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if written <= 0 {
            return None;
        }
        let title = String::from_utf16_lossy(&buf[..written as usize]);
        if title.is_empty() {
            None
        } else {
            Some(title)
        }
    }
}

#[cfg(not(windows))]
pub fn active_window_title() -> Option<String> {
    None
}
