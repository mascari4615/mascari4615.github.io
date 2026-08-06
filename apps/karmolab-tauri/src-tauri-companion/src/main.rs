// 동반자 창 — 배경이 뚫려 있고, 창틀이 없고, 늘 위에 떠 있는 창 하나.
//
// 하는 일은 그것뿐이다. 인격·기억·목소리는 전부 `packages/companion` 이 갖고 있고,
// 이 창은 그 화면을 불러다 화면 위에 얹기만 한다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn main() {
    // 어디에 붙을지는 실행할 때 정한다 — 동반자가 다른 포트로 떠 있을 수 있다.
    let url = std::env::var("COMPANION_URL").unwrap_or_else(|_| "http://localhost:4615".to_string());
    let width: f64 = env_number("COMPANION_WIDTH", 380.0);
    let height: f64 = env_number("COMPANION_HEIGHT", 560.0);
    let margin: f64 = env_number("COMPANION_MARGIN", 24.0);

    // 어디서든 말 걸 수 있게 하는 단축키. 창을 찾아 앞으로 꺼내는 게 아니라,
    // 하던 일 위에서 그냥 말하면 되게 하는 게 목적이다.
    let talk_key = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut != &talk_key || event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if let Some(window) = app.get_webview_window("companion") {
                        // 받아쓰기는 창 안에서 도는 것이라, 창이 살아 있어야 듣는다.
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.emit("companion://talk", ());
                    }
                })
                .build(),
        )
        .setup(move |app| {
            if let Err(e) = app.global_shortcut().register(talk_key) {
                // 다른 프로그램이 이미 쓰고 있을 수 있다. 그래도 창은 떠야 한다.
                eprintln!("말하기 단축키를 못 잡았다 (Ctrl+Alt+Space): {e}");
            }

            let parsed = url
                .parse()
                .map_err(|e| format!("동반자 주소를 못 읽었다 ({url}): {e}"))?;

            let window = WebviewWindowBuilder::new(app, "companion", WebviewUrl::External(parsed))
                .title("동반자")
                .inner_size(width, height)
                .decorations(false) // 창틀·최소화·닫기 단추 없음
                .transparent(true) // 배경이 그대로 뚫린다
                .always_on_top(true)
                .skip_taskbar(true) // 작업표시줄에도 안 뜬다 — 창이 아니라 존재처럼
                .shadow(false)
                .resizable(true)
                .build()?;

            // 화면 오른쪽 아래에 앉힌다. 작업표시줄을 덮지 않게 작업 영역 기준으로.
            if let Some(monitor) = window.primary_monitor()? {
                let screen = monitor.size().to_logical::<f64>(monitor.scale_factor());
                // 작업표시줄 높이를 정확히 알 수 없으므로 여백을 넉넉히 둔다.
                let x = screen.width - width - margin;
                let y = screen.height - height - margin - 48.0;
                window.set_position(tauri::LogicalPosition::new(x.max(0.0), y.max(0.0)))?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("동반자 창을 띄우지 못했다");
}

fn env_number(key: &str, fallback: f64) -> f64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.trim().parse::<f64>().ok())
        .filter(|v| *v > 0.0)
        .unwrap_or(fallback)
}
