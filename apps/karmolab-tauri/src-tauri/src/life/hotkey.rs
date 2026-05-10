//! sub-F-3 + sub-B-2 — global hotkey hub.
//!
//! - **PrintScreen** (modifier 없음, Pressed) → `screen::capture_with_trigger("hotkey")`. sub-F-3.
//! - **Ctrl+Alt+Space** (Pressed/Released, hold-to-talk) → `voice::record_start` / `voice::record_stop_and_process`. sub-B-2.
//!
//! `tauri-plugin-global-shortcut` 사용 — Tauri 2 공식. PrintScreen 가로챔 → OS clipboard capture 폐기.
//! clipboard capture 필요 시 Win+Shift+S 대체.

use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use super::screen::capture_with_trigger;
use super::voice;

/// PrintScreen 키 (modifier 없음).
fn print_screen_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::empty()), Code::PrintScreen)
}

/// Ctrl+Alt+Space — sub-B-2 hold-to-talk.
fn voice_shortcut() -> Shortcut {
    Shortcut::new(
        Some(Modifiers::CONTROL | Modifiers::ALT),
        Code::Space,
    )
}

/// Tauri Builder 에 박을 plugin. setup 안에서 등록.
pub fn build_plugin() -> TauriPlugin<Wry> {
    let print_screen = print_screen_shortcut();
    let voice_kbd = voice_shortcut();
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |_app: &AppHandle, shortcut: &Shortcut, event| {
            if shortcut == &print_screen {
                // 1번 누름 = 1회 capture. Released 무시.
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                std::thread::spawn(|| match capture_with_trigger("hotkey") {
                    Ok(r) => eprintln!(
                        "[life-screen] hotkey capture: png={} domain={:?} app={:?}",
                        r.png_path, r.domain, r.app
                    ),
                    Err(e) => eprintln!("[life-screen] hotkey capture 실패: {e}"),
                });
            } else if shortcut == &voice_kbd {
                match event.state() {
                    ShortcutState::Pressed => {
                        if let Err(e) = voice::record_start() {
                            eprintln!("[life-voice] record start 실패: {e}");
                        } else {
                            eprintln!("[life-voice] record start (Ctrl+Alt+Space hold)");
                        }
                    }
                    ShortcutState::Released => {
                        if let Err(e) = voice::record_stop_and_process("hotkey") {
                            eprintln!("[life-voice] record stop 실패: {e}");
                        }
                    }
                }
            }
        })
        .build()
}

/// app.setup 안에서 호출 — PrintScreen + Ctrl+Alt+Space 등록.
pub fn register(app: &AppHandle) -> Result<(), String> {
    let manager = app.global_shortcut();
    manager
        .register(print_screen_shortcut())
        .map_err(|e| format!("PrintScreen hotkey 등록 실패: {e}"))?;
    manager
        .register(voice_shortcut())
        .map_err(|e| format!("Ctrl+Alt+Space hotkey 등록 실패: {e}"))?;
    eprintln!("[life-screen] PrintScreen + [life-voice] Ctrl+Alt+Space hotkey 등록 ✓");
    Ok(())
}
