// 동반자 창 — 배경이 뚫려 있고, 창틀이 없고, 늘 위에 떠 있는 창 하나.
//
// 하는 일은 그것뿐이다. 인격·기억·목소리는 전부 `packages/companion` 이 갖고 있고,
// 이 창은 그 화면을 불러다 화면 위에 얹기만 한다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// 창에서 「눌러야 하는 자리」. 화면이 알려준 값을 여기 담아 둔다.
struct HitArea(std::sync::Mutex<Vec<(f64, f64, f64, f64)>>);

/**
 * 화면이 「여기는 눌러야 한다」고 알려주는 자리.
 *
 * 배경이 뚫린 창은 보이지 않아도 창이라, 그 위를 지나는 클릭을 전부 삼킨다 — 뒤에 있는
 * 프로그램을 못 누른다. 그렇다고 통째로 통과시키면 얘한테도 말을 못 건다.
 * 그래서 눌러야 하는 자리만 화면이 알려주고, 커서가 거기 있을 때만 창이 클릭을 받는다.
 */
#[tauri::command]
fn set_hit_areas(areas: Vec<(f64, f64, f64, f64)>, state: tauri::State<HitArea>) {
    if let Ok(mut guard) = state.0.lock() {
        // 개수가 바뀔 때만 알린다 — 「알려주고 있나」를 밖에서 확인할 수 있어야 한다.
        if guard.len() != areas.len() {
            eprintln!("[창] 누를 자리 {}개: {:?}", areas.len(), areas);
        }
        *guard = areas;
    }
}

/**
 * 그냥 끈다.
 *
 * 창을 닫는 정식 길이 막히면(권한·시점 문제) 닫기 단추가 아무 일도 안 한 것처럼 보인다.
 * 실제로 그랬다. 눌렀는데 안 꺼지는 것보다 나쁜 건 없으므로 확실한 길을 하나 더 둔다.
 */
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

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
        .manage(HitArea(std::sync::Mutex::new(Vec::new())))
        .invoke_handler(tauri::generate_handler![set_hit_areas, quit])
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

            // 커서가 「눌러야 하는 자리」에 있을 때만 창이 클릭을 받는다.
            //
            // 화면 쪽에서 커서를 좇을 수는 없다 — 클릭을 통과시키는 동안에는 창이 마우스
            // 움직임 자체를 못 받기 때문이다. 그래서 여기서 커서 위치를 직접 들여다본다.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut passing_through = false;
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(70));
                    let Some(window) = handle.get_webview_window("companion") else { continue };
                    let Ok(cursor) = window.cursor_position() else { continue };
                    let Ok(origin) = window.outer_position() else { continue };
                    let scale = window.scale_factor().unwrap_or(1.0);

                    let local_x = (cursor.x - origin.x as f64) / scale;
                    let local_y = (cursor.y - origin.y as f64) / scale;

                    let inside = handle
                        .state::<HitArea>()
                        .0
                        .lock()
                        .map(|areas| {
                            areas.iter().any(|(x, y, w, h)| {
                                local_x >= *x && local_x <= x + w && local_y >= *y && local_y <= y + h
                            })
                        })
                        .unwrap_or(false);

                    if std::env::var("COMPANION_DEBUG_HIT").is_ok() {
                        eprintln!("[창] 커서 {:.0},{:.0} · 창 {:?} · 배율 {} · 안쪽 {}", cursor.x, cursor.y, origin, scale, inside);
                    }

                    // 바뀔 때만 알린다 — 매 번 부르면 창이 깜빡인다.
                    if inside == passing_through {
                        passing_through = !inside;
                        let _ = window.set_ignore_cursor_events(!inside);
                    }
                }
            });

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
