//! sub-F-3 + sub-B-2 — global hotkey hub.
//!
//! - **PrintScreen** (modifier 없음, Pressed) → `screen::capture_with_trigger("hotkey")`. sub-F-3.
//! - **Ctrl+Alt+Space** (Pressed/Released, hold-to-talk) → `voice::record_start` / `voice::record_stop_and_process`. sub-B-2.
//!
//! `tauri-plugin-global-shortcut` 사용 — Tauri 2 공식. PrintScreen 가로챔 → OS clipboard capture 폐기.
//! clipboard capture 필요 시 Win+Shift+S 대체.
//!
//! 핫키는 Life 위젯 활성화 시에만 등록. 비활성 시 unregister → OS 다른 앱과 충돌 없음.

use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use super::screen::capture_with_trigger;
use super::voice;

fn print_screen_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::empty()), Code::PrintScreen)
}

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
        .with_handler(move |app: &AppHandle, shortcut: &Shortcut, event| {
            if shortcut == &print_screen {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                let app = app.clone();
                std::thread::spawn(move || match capture_with_trigger(&app, "hotkey") {
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

pub fn register_screen(app: &AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .register(print_screen_shortcut())
        .map_err(|e| format!("PrintScreen hotkey 등록 실패: {e}"))
}

pub fn unregister_screen(app: &AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister(print_screen_shortcut())
        .map_err(|e| format!("PrintScreen hotkey 해제 실패: {e}"))
}

pub fn register_voice(app: &AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .register(voice_shortcut())
        .map_err(|e| format!("Ctrl+Alt+Space hotkey 등록 실패: {e}"))
}

pub fn unregister_voice(app: &AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister(voice_shortcut())
        .map_err(|e| format!("Ctrl+Alt+Space hotkey 해제 실패: {e}"))
}
