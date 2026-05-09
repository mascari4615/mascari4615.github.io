//! sub-F-3 — global hotkey (PrintScreen) → life_screen_capture trigger.
//!
//! 의도 정정 (2026-05-10): interval 자동 capture ❌. 사용자가 의식적으로 hotkey 눌러야.
//! sub-G (캐릭터 동반자) 의 입력 채널 — 사용자가 보여주고 싶은 순간만.
//!
//! `tauri-plugin-global-shortcut` 사용 — Tauri 2 공식 plugin (ecosystem 정합).
//! PrintScreen (`PrintScreen`) 가로챔 — OS clipboard capture 동작 폐기.
//! clipboard capture 필요 시 Win+Shift+S 대체.

use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use super::screen::capture_with_trigger;

/// PrintScreen 키 (modifier 없음).
fn print_screen_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::empty()), Code::PrintScreen)
}

/// Tauri Builder 에 박을 plugin. setup 안에서 등록.
pub fn build_plugin() -> TauriPlugin<Wry> {
    let target = print_screen_shortcut();
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |_app: &AppHandle, shortcut: &Shortcut, event| {
            // KeyDown 만 (KeyUp 무시 — 1번 누름에 1회 capture).
            if event.state() != ShortcutState::Pressed {
                return;
            }
            if shortcut == &target {
                std::thread::spawn(|| match capture_with_trigger("hotkey") {
                    Ok(r) => {
                        eprintln!(
                            "[life-screen] hotkey capture: png={} domain={:?} app={:?}",
                            r.png_path, r.domain, r.app
                        );
                    }
                    Err(e) => eprintln!("[life-screen] hotkey capture 실패: {e}"),
                });
            }
        })
        .build()
}

/// app.setup 안에서 호출 — PrintScreen 등록.
pub fn register(app: &AppHandle) -> Result<(), String> {
    let manager = app.global_shortcut();
    manager
        .register(print_screen_shortcut())
        .map_err(|e| format!("PrintScreen hotkey 등록 실패: {e}"))?;
    eprintln!("[life-screen] PrintScreen global hotkey 등록 ✓");
    Ok(())
}
