mod activity;
mod ai_quota;
mod app_launcher;
mod adventure;
mod agent_team;
mod alarm;
mod cockpit_graph;
mod claude_env;
mod desktop_login;
#[cfg(debug_assertions)]
mod dev_static;
mod questlog_hub;
mod life;
mod local_dev;
mod local_dev_http;
mod part_fetch;
mod quest_index;
mod quest_launcher;
mod quest_watcher;
mod quest_writeback;
mod repo_file;
mod terminal;
mod tray_menu;

use activity::{activity_list_days, activity_query_day, activity_status, ActivityState};
use alarm::{
    alarm_active, alarm_dismiss, alarm_get_autostart, alarm_list, alarm_remove,
    alarm_set_autostart, alarm_set_enabled, alarm_snooze, alarm_upsert, AlarmStore,
};
use adventure::{
    adventure_claude_complete, adventure_commit_summary, adventure_save_image, adventure_save_raw,
};
use agent_team::{
    agent_team_decide_proposal, agent_team_list_agents, agent_team_list_bus,
    agent_team_list_cards, agent_team_list_objectives, agent_team_list_proposals,
    agent_team_list_sessions, agent_team_list_tasks, agent_team_run_cadence_tick,
    agent_team_run_cadence_tick_prod,
};
use ai_quota::ai_quota_all;
use claude_env::{
    claude_env_preview_sound, claude_env_read_notify_config, claude_env_write_notify_config,
};
use desktop_login::desktop_login_start;
use cockpit_graph::{cockpit_get_graph_spec, cockpit_save_graph_coords, cockpit_get_activity};
use questlog_hub::get_questlog_hub;
use life::life_screen_capture;
use quest_index::get_quest_tree;
use app_launcher::{app_check, app_launch, app_list_installed};
use quest_launcher::{create_task, open_task_in_editor};
use quest_writeback::{
    add_quest_check, delete_quest_check, rename_quest_check, set_quest_priority, set_quest_status,
    toggle_quest_check,
};
use local_dev::{
    localdev_deploy_stream, localdev_follow_log, localdev_get_repo_root, localdev_guess_repo_root,
    localdev_list_external_pids, localdev_list_tracked,
    localdev_npm_install_stream, localdev_send_stdin, localdev_set_repo_root, localdev_start,
    localdev_stop, localdev_stop_external, localdev_stop_log_follow, restore_persisted_state,
    LocalDevState,
};
use part_fetch::{part_fetch, part_fetched_path};
use repo_file::{repofile_open_default, repofile_read, repofile_reveal, repofile_write};
use terminal::{
    terminal_send_stdin, terminal_start, terminal_status, terminal_stop, TerminalState,
};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;

// Life 기능 on/off 상태 (세션 간 영속).
#[derive(Default)]
struct LifeFeaturesState {
    screen_enabled: std::sync::atomic::AtomicBool,
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct LifeFeaturesPersisted {
    screen: bool,
    voice: bool,
}

fn life_features_config_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|p| p.join("life-features.json"))
}

fn load_life_features(app: &tauri::AppHandle) -> LifeFeaturesPersisted {
    let Some(path) = life_features_config_path(app) else {
        return LifeFeaturesPersisted::default();
    };
    let Ok(json) = std::fs::read_to_string(&path) else {
        return LifeFeaturesPersisted::default();
    };
    serde_json::from_str(&json).unwrap_or_default()
}

fn save_life_features(app: &tauri::AppHandle, state: &LifeFeaturesState) {
    let Some(path) = life_features_config_path(app) else { return; };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let data = LifeFeaturesPersisted {
        screen: state.screen_enabled.load(std::sync::atomic::Ordering::Relaxed),
        voice: life::voice::is_enabled(),
    };
    if let Ok(json) = serde_json::to_string(&data) {
        let _ = std::fs::write(path, json);
    }
}

#[derive(serde::Serialize)]
struct LifeFeatureStatesDto {
    screen_enabled: bool,
    voice_enabled: bool,
    voice_loading: bool,
}

#[tauri::command]
fn life_get_feature_states(state: tauri::State<LifeFeaturesState>) -> LifeFeatureStatesDto {
    LifeFeatureStatesDto {
        screen_enabled: state.screen_enabled.load(std::sync::atomic::Ordering::Relaxed),
        voice_enabled: life::voice::is_enabled(),
        voice_loading: life::voice::is_loading(),
    }
}

#[tauri::command]
fn life_set_feature(
    feature: String,
    enabled: bool,
    app: tauri::AppHandle,
    state: tauri::State<LifeFeaturesState>,
) -> Result<(), String> {
    match (feature.as_str(), enabled) {
        ("screen", true) => {
            life::hotkey::register_screen(&app)?;
            state.screen_enabled.store(true, std::sync::atomic::Ordering::Relaxed);
        }
        ("screen", false) => {
            let _ = life::hotkey::unregister_screen(&app);
            state.screen_enabled.store(false, std::sync::atomic::Ordering::Relaxed);
        }
        ("voice", true) => {
            life::voice::enable(&app)?;
            life::hotkey::register_voice(&app)?;
        }
        ("voice", false) => {
            let _ = life::hotkey::unregister_voice(&app);
            life::voice::disable();
        }
        _ => return Err(format!("알 수 없는 feature: {feature}")),
    }
    save_life_features(&app, &state);
    Ok(())
}
#[cfg(windows)]
use tauri::tray::{MouseButton, TrayIconEvent};
use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use std::collections::{HashMap, HashSet};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use tauri::Manager;
use tauri::Url;
use tauri::WindowEvent;
use tauri_plugin_updater::UpdaterExt;

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    /// MB_ICONASTERISK — 토스트 무음일 때 청각 피드백용.
    fn MessageBeep(u_type: u32) -> i32;
}

// KL-064: 사이트가 커스텀 도메인 이전 → github.io 는 301 로 여기로 튕김.
// frontendDist/allowlist 가 옛 URL 이라 prod 웹뷰가 301 stub 로딩 = 빈화면.
const KARMOLAB_WEB_URL: &str = "https://blog.mascari4615.com/karmolab/";
const KARMOLAB_DEV_URL: &str = "http://127.0.0.1:8899/apps/karmolab/index.html";
const KARMOLAB_DEV_PORT: u16 = 8899;

// dev devUrl(:8898) 서버 = `dev_static` 모듈 (TASK-KL-067, in-process).
// 옛 spawn_dev_static_if_needed (외부 node + mem::forget leak + 약한 connect
// 체크 + setup-1회) 의 4중 취약을 대체 — 2026-05-17 incident 재발 0.

/// 트레이 토글로 켜는 로컬 정적 서버. None = OFF (production URL 로딩 중), Some = ON.
#[derive(Default)]
struct DevModeState {
    server: std::sync::Mutex<Option<std::process::Child>>,
}

/// 트레이 메뉴 한 장을 **지금 상태로** 짓는다.
///
/// 뜰 때 한 번이 아니라 필요할 때마다 부른다 — 저장소 자리가 나중에 정해지면 그때
/// 손잡이가 생겨야 한다(그전엔 빈 채로 남아 「설정했는데 트레이엔 없다」가 된다).
/// 지은 항목은 `TrayState` 에 남긴다: 누르면 뭘 할지, 어느 줄 글자를 고칠지 여기서 찾는다.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn build_tray_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let show_label = if cfg!(debug_assertions) {
        "KarmoLab [DEV] 창 보이기"
    } else {
        "KarmoLab 창 보이기"
    };
    let show_i = MenuItem::with_id(app, "tray_show", show_label, true, None::<&str>)?;
    let browser_i =
        MenuItem::with_id(app, "tray_browser", "브라우저에서 열기", true, None::<&str>)?;
    let update_i = MenuItem::with_id(app, "tray_update", "업데이트 확인…", true, None::<&str>)?;
    // 개발 모드는 켜져 있는 채로 다시 그릴 수 있다 — 글자를 상태에서 되살린다.
    let dev_on = app
        .state::<DevModeState>()
        .server
        .lock()
        .map(|g| g.is_some())
        .unwrap_or(false);
    let dev_i = MenuItem::with_id(
        app,
        "tray_dev_mode",
        if dev_on {
            "개발 모드 ✓ (로컬 8899)"
        } else {
            "개발 모드 (로컬 8899)"
        },
        true,
        None::<&str>,
    )?;
    let quit_i = MenuItem::with_id(app, "tray_quit", "종료", true, None::<&str>)?;

    /* ── 빠른 손잡이 ────────────────────────────────────────────────
       여기 줄은 **코드가 아니라 `apps/karmolab/data/tray-menu.json` 이 정한다.**
       손잡이 하나 더 다는 값 = 그 파일에 네 줄(다시 굽지도 않는다).
       저장소 자리를 아직 모르면 빈 목록이라 이 묶음은 아예 안 뜬다 — 눌러도 아무
       일도 안 나는 줄을 보여 주는 것보다 낫다. */
    let repo_root_now = app
        .state::<LocalDevState>()
        .repo_root
        .lock()
        .ok()
        .and_then(|g| g.clone());
    let quick_items = tray_menu::load(repo_root_now.as_deref().map(std::path::Path::new));
    let running_now: HashSet<String> = app
        .state::<LocalDevState>()
        .pids
        .lock()
        .map(|g| g.keys().cloned().collect())
        .unwrap_or_default();

    let mut quick_menu_items: Vec<MenuItem<tauri::Wry>> = Vec::new();
    for item in &quick_items {
        quick_menu_items.push(MenuItem::with_id(
            app,
            item.menu_id(),
            item.label_with_state(running_now.contains(quick_profile(item))),
            true,
            None::<&str>,
        )?);
    }
    /* ★ **비었으면 숨기지 말고 왜 비었는지 말한다** (2026-08-19). 저장소 자리를 모를 때
       뭆음을 통째로 안 띄우게 둘다. 그랬더니 조수님이 「저장소 설정 안 되어 있으면
       트레이 옵션이 안 뜼는 거냐」고 물었다 — 안 보이는 기능은 없는 기능과 같다.
       뭆으면 「왜 비었고 어떻게 채우나」를 한 줄로 높는다(눌러도 아무 일 안 나게 꺼 둔다). */
    if quick_menu_items.is_empty() {
        quick_menu_items.push(MenuItem::with_id(
            app,
            "tray_quick_none",
            if repo_root_now.is_none() {
                "저장소 자리를 먼저 정해라 — 서버 모니터 아래쪽"
            } else {
                "적어 둔 손잡이가 없다 — data/tray-menu.json"
            },
            false,
            None::<&str>,
        )?);
    }
    let quick_submenu = if quick_menu_items.is_empty() {
        None
    } else {
        let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = quick_menu_items
            .iter()
            .map(|m| m as &dyn tauri::menu::IsMenuItem<tauri::Wry>)
            .collect();
        Some(Submenu::with_items(app, "빠른 실행", true, &refs)?)
    };

    // 누른 줄을 되찾는 표 — 다시 그릴 때마다 통째로 갈아 끼운다.
    let items_map: HashMap<String, tray_menu::QuickItem> =
        quick_items.iter().map(|i| (i.menu_id(), i.clone())).collect();
    let mut labels_map: HashMap<String, MenuItem<tauri::Wry>> = quick_items
        .iter()
        .zip(quick_menu_items.iter())
        .map(|(i, m)| (i.menu_id(), m.clone()))
        .collect();
    labels_map.insert("tray_dev_mode".to_string(), dev_i.clone());
    {
        let state = app.state::<tray_menu::TrayState>();
        let items_lock = state.items.lock();
        if let Ok(mut g) = items_lock {
            *g = items_map;
        }
        let labels_lock = state.labels.lock();
        if let Ok(mut g) = labels_lock {
            *g = labels_map;
        }
    }

    let separator = PredefinedMenuItem::separator(app)?;
    let mut top: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = vec![&show_i, &browser_i];
    if let Some(sub) = quick_submenu.as_ref() {
        top.push(&separator);
        top.push(sub);
        top.push(&separator);
    }
    top.push(&update_i);
    top.push(&dev_i);
    top.push(&quit_i);
    Menu::with_items(app, &top)
}

/// 트레이 메뉴를 다시 그린다 — 저장소 자리가 정해졌을 때 등.
///
/// 아이콘을 아직 안 만들었으면(모바일·트레이 없는 판) 조용히 지나간다.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn refresh_tray(app: &tauri::AppHandle) {
    let Ok(menu) = build_tray_menu(app) else { return };
    let state = app.state::<tray_menu::TrayState>();
    let Ok(g) = state.icon.lock() else { return };
    if let Some(icon) = g.as_ref() {
        let _ = icon.set_menu(Some(menu));
    }
}

/// 트레이가 없는 판에서도 부르는 쪽이 갈라지지 않게.
#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn refresh_tray(_app: &tauri::AppHandle) {}

/// 이 줄이 지켜보는 프로필 id. 프로필이 아닌 줄(도구·주소)은 "" — 절대 안 켜진 걸로 본다.
fn quick_profile(item: &tray_menu::QuickItem) -> &str {
    match &item.kind {
        tray_menu::QuickKind::Dev { profile } => profile,
        _ => "",
    }
}

/// 트레이 빠른 손잡이 한 줄을 누른 결과.
///
/// **켜고 끄는 손은 사람 카드와 같은 것**(`localdev_start_sync`/`localdev_stop_sync`)이다.
/// 트레이가 따로 자식을 띄우면 카드에는 안 보이는 프로세스가 생겨 「끈 줄 알았는데 살아
/// 있다」가 된다. 된 것도 안 된 것도 알림으로 말한다 — 눌렀는데 아무 말이 없으면
/// 고장과 구분이 안 된다.
fn run_quick_item(
    app: &tauri::AppHandle,
    item: &tray_menu::QuickItem,
    label: Option<&MenuItem<tauri::Wry>>,
) {
    match &item.kind {
        tray_menu::QuickKind::Dev { profile } => {
            let state = app.state::<LocalDevState>();
            let running = state
                .pids
                .lock()
                .map(|g| g.contains_key(profile))
                .unwrap_or(false);
            let result = if running {
                local_dev::localdev_stop_sync(profile.clone(), app.clone(), &state)
            } else {
                local_dev::localdev_start_sync(profile.clone(), app.clone(), &state)
            };
            let (body, now_running) = match result {
                Ok(()) => (
                    if running {
                        format!("{} — 껐다", item.label)
                    } else {
                        format!("{} — 켰다", item.label)
                    },
                    !running,
                ),
                Err(e) => (format!("{} — 안 됐다: {}", item.label, e), running),
            };
            if let Some(label) = label {
                let _ = label.set_text(item.label_with_state(now_running));
            }
            let _ = notify_rust::Notification::new()
                .summary("KarmoLab 빠른 실행")
                .body(&body)
                .appname("KarmoLab")
                .show();
        }
        tray_menu::QuickKind::Tool { tool } => {
            // 창을 세우고 그 도구로. 주소의 `#<id>` 가 카모랩의 화면 전환 손잡이다.
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
                if let Ok(current) = w.url() {
                    let mut next = current.clone();
                    next.set_fragment(Some(tool));
                    let _ = w.navigate(next);
                }
            }
        }
        tray_menu::QuickKind::Url { url } => {
            let _ = open::that(url);
        }
    }
}

/// 토글 본체. ON↔OFF 결과를 bool로 반환 (true = 이제 ON).
fn toggle_dev_mode(handle: &tauri::AppHandle) -> Result<bool, String> {
    let dev_state = handle.state::<DevModeState>();
    let mut server_g = dev_state.server.lock().map_err(|e| e.to_string())?;

    if let Some(mut child) = server_g.take() {
        let _ = child.kill();
        let _ = child.wait();
        if let Some(w) = handle.get_webview_window("main") {
            if let Ok(url) = Url::parse(KARMOLAB_WEB_URL) {
                let _ = w.navigate(url);
            }
        }
        return Ok(false);
    }

    let local_state = handle.state::<LocalDevState>();
    let repo_root = local_state
        .repo_root
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| {
            "저장소 루트가 비어 있음. 카모랩 → 서버 모니터 하단에서 먼저 저장하세요.".to_string()
        })?;

    let port = KARMOLAB_DEV_PORT.to_string();
    // Windows 의 `python.exe` 가 종종 Microsoft Store stub 이라 spawn 직후 그냥 종료해버림.
    // 그래서 py 런처(`py -3`) 와 Node `http-server` 를 fallback 으로 둠. spawn 직후 800ms 살아있는지 검증.
    let candidates: Vec<(&str, Vec<String>)> = vec![
        (
            "py",
            vec![
                "-3".into(),
                "-m".into(),
                "http.server".into(),
                port.clone(),
                "--bind".into(),
                "127.0.0.1".into(),
            ],
        ),
        (
            "python3",
            vec![
                "-m".into(),
                "http.server".into(),
                port.clone(),
                "--bind".into(),
                "127.0.0.1".into(),
            ],
        ),
        (
            "python",
            vec![
                "-m".into(),
                "http.server".into(),
                port.clone(),
                "--bind".into(),
                "127.0.0.1".into(),
            ],
        ),
        // Windows: npx 자체는 .ps1 wrapper 라 Rust spawn 이 못 찾음. .cmd 를 명시.
        (
            if cfg!(target_os = "windows") { "npx.cmd" } else { "npx" },
            vec![
                "--yes".into(),
                "http-server".into(),
                ".".into(),
                "-p".into(),
                port.clone(),
                "-a".into(),
                "127.0.0.1".into(),
                "-c-1".into(),
                "--silent".into(),
            ],
        ),
    ];
    // 디버그용: spawn된 후보들의 stdout/stderr를 OS 임시 폴더 로그 파일로 흘려둠. 실패하면 사용자/개발자가 열어보고 에러 확인 가능.
    let log_path = std::env::temp_dir().join("karmolab-devmode-server.log");

    fn open_log(path: &std::path::Path) -> std::process::Stdio {
        match std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            Ok(f) => std::process::Stdio::from(f),
            Err(_) => std::process::Stdio::null(),
        }
    }

    fn wait_for_listen(port: u16, timeout: std::time::Duration) -> bool {
        let start = std::time::Instant::now();
        let addr = format!("127.0.0.1:{}", port);
        while start.elapsed() < timeout {
            if std::net::TcpStream::connect_timeout(
                &addr.parse().unwrap(),
                std::time::Duration::from_millis(200),
            )
            .is_ok()
            {
                return true;
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        false
    }

    // canonicalize 결과의 `\\?\` UNC prefix 는 일부 child(특히 cmd-style launcher)가 거부하므로 제거.
    let cwd: &str = repo_root.strip_prefix(r"\\?\").unwrap_or(&repo_root);

    fn append_log(path: &std::path::Path, line: &str) {
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            use std::io::Write;
            let _ = writeln!(f, "{}", line);
        }
    }

    let epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    append_log(
        &log_path,
        &format!(
            "\n=== epoch:{} dev-mode toggle ON (cwd: {}) ===",
            epoch, cwd
        ),
    );

    let mut spawned: Option<std::process::Child> = None;
    let mut last_err = String::new();
    for (cmd, args) in &candidates {
        // npx는 첫 install이 길어 30s, 나머지는 빠르니 5s.
        let listen_timeout = if *cmd == "npx" {
            std::time::Duration::from_secs(30)
        } else {
            std::time::Duration::from_secs(5)
        };
        let mut command = std::process::Command::new(cmd);
        command
            .args(args)
            .current_dir(cwd)
            .stdout(open_log(&log_path))
            .stderr(open_log(&log_path));
        // Windows: cmd-style launcher(npx.cmd 등) 가 띄우는 검은 콘솔 창 숨김.
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        append_log(&log_path, &format!("[{}] try", cmd));
        match command.spawn() {
            Ok(mut child) => {
                if wait_for_listen(KARMOLAB_DEV_PORT, listen_timeout) {
                    append_log(
                        &log_path,
                        &format!("[{}] OK (listen on {})", cmd, KARMOLAB_DEV_PORT),
                    );
                    spawned = Some(child);
                    break;
                } else {
                    let msg = format!(
                        "{} 가 {}초 안에 {} 을 listen 못함",
                        cmd,
                        listen_timeout.as_secs(),
                        KARMOLAB_DEV_PORT
                    );
                    append_log(&log_path, &format!("[{}] listen timeout", cmd));
                    last_err = msg;
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
            Err(e) => {
                let msg = format!("{} spawn 실패: {}", cmd, e);
                append_log(&log_path, &format!("[{}] spawn err: {}", cmd, e));
                last_err = msg;
            }
        }
    }
    let child = spawned.ok_or_else(|| {
        format!(
            "정적 서버 후보 모두 실패 (py/python3/python/npx). 마지막: {}",
            last_err
        )
    })?;
    *server_g = Some(child);
    drop(server_g);

    // 정적 서버가 listen 시작할 시간을 잠깐 주고 navigate.
    let h = handle.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(700));
        if let Some(w) = h.get_webview_window("main") {
            if let Ok(url) = Url::parse(KARMOLAB_DEV_URL) {
                let _ = w.navigate(url);
            }
        }
    });
    Ok(true)
}

#[derive(Clone, Copy)]
enum UpdateCheckMode {
    /// 시작 시 / 주기적 — 결과는 새 버전이 있을 때만 webview 배너로 알림.
    Background,
    /// 트레이 "업데이트 확인…" — 결과 없을 때도 OS 알림으로 응답하고, 있으면 창을 띄워 배너 노출.
    Manual,
}

/// 업데이트 체크 통합 진입점. 새 버전이 있으면 항상 webview에 이벤트를 emit하고, manual 모드에선
/// 창을 띄워 배너가 보이게 한다. 결과 없음·에러는 manual 모드에서만 OS 알림으로 통지한다.
fn spawn_update_check(handle: tauri::AppHandle, mode: UpdateCheckMode) {
    tauri::async_runtime::spawn(async move {
        let current = env!("CARGO_PKG_VERSION");
        let result = match handle.updater() {
            Ok(updater) => updater.check().await.map_err(|e| e.to_string()),
            Err(e) => Err(format!("업데이터 초기화 실패: {}", e)),
        };
        match result {
            Ok(Some(update)) => {
                let payload = serde_json::json!({
                    "current": current,
                    "new": update.version,
                });
                let _ = handle.emit("karmolab://update-available", payload);
                if matches!(mode, UpdateCheckMode::Manual) {
                    if let Some(w) = handle.get_webview_window("main") {
                        let _ = w.unminimize();
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            }
            Ok(None) => {
                if matches!(mode, UpdateCheckMode::Manual) {
                    let _ = notify_rust::Notification::new()
                        .summary("KarmoLab 업데이트")
                        .body(&format!("이미 최신 버전({})입니다.", current))
                        .appname("KarmoLab")
                        .show();
                }
            }
            Err(e) => {
                if matches!(mode, UpdateCheckMode::Manual) {
                    let _ = notify_rust::Notification::new()
                        .summary("KarmoLab 업데이트")
                        .body(&format!("업데이트 확인 실패: {}", e))
                        .appname("KarmoLab")
                        .show();
                }
            }
        }
    });
}

/// 윈도우 focus 시 자동 update check 의 last-trigger 시각 (epoch ms). 0 = 미실행.
#[cfg(not(debug_assertions))]
static LAST_FOCUS_UPDATE_CHECK_EPOCH_MS: AtomicU64 = AtomicU64::new(0);

/// 포커스가 자주 잡혀도 GitHub API 를 도배하지 않도록 debounce. 시작 시 + 6시간 주기 폴링과
/// 별개로 동작 — 사용자가 다른 창 → KarmoLab 으로 돌아왔을 때 새 release 즉시 인지가 목적.
#[cfg(not(debug_assertions))]
const FOCUS_UPDATE_DEBOUNCE_MS: u64 = 5 * 60 * 1000;

#[cfg(not(debug_assertions))]
fn try_focus_update_check(handle: &tauri::AppHandle) {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST_FOCUS_UPDATE_CHECK_EPOCH_MS.load(Ordering::Relaxed);
    if now_ms.saturating_sub(last) < FOCUS_UPDATE_DEBOUNCE_MS {
        return;
    }
    LAST_FOCUS_UPDATE_CHECK_EPOCH_MS.store(now_ms, Ordering::Relaxed);
    spawn_update_check(handle.clone(), UpdateCheckMode::Background);
}

/// 배너 클릭 등 사용자가 명시적으로 동의한 후의 설치 흐름. 다이얼로그 없이 곧장 다운로드·설치.
/// 진행률은 `karmolab://update-progress`, 다운로드 완료는 `karmolab://update-download-finished` 이벤트로 통지.
#[tauri::command]
async fn desktop_install_pending_update(handle: tauri::AppHandle) -> Result<String, String> {
    let current = env!("CARGO_PKG_VERSION");
    let updater = handle
        .updater()
        .map_err(|e| format!("업데이터 초기화 실패: {}", e))?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("업데이트 확인 실패: {}", e))?
        .ok_or_else(|| format!("이미 최신 버전({})입니다.", current))?;
    let new_ver = update.version.clone();

    /// 청크 콜백이 너무 자주 (수백~수천 회) 호출될 수 있어, 256KB마다 또는 다운로드 완료 시점에만 emit.
    const PROGRESS_EMIT_THRESHOLD: u64 = 256 * 1024;

    let downloaded = Arc::new(AtomicU64::new(0));
    let last_emitted = Arc::new(AtomicU64::new(0));
    let downloaded_cb = downloaded.clone();
    let last_emitted_cb = last_emitted.clone();
    let handle_chunk = handle.clone();
    let handle_finish = handle.clone();

    update
        .download_and_install(
            move |chunk_size, total| {
                let cur = downloaded_cb.fetch_add(chunk_size as u64, Ordering::Relaxed)
                    + chunk_size as u64;
                let total_bytes = total.unwrap_or(0);
                let last = last_emitted_cb.load(Ordering::Relaxed);
                let is_complete = total_bytes > 0 && cur >= total_bytes;
                if cur.saturating_sub(last) >= PROGRESS_EMIT_THRESHOLD || is_complete {
                    last_emitted_cb.store(cur, Ordering::Relaxed);
                    let _ = handle_chunk.emit(
                        "karmolab://update-progress",
                        serde_json::json!({
                            "downloaded": cur,
                            "total": total_bytes,
                        }),
                    );
                }
            },
            move || {
                let _ = handle_finish.emit("karmolab://update-download-finished", ());
            },
        )
        .await
        .map_err(|e| format!("업데이트 설치 실패: {}", e))?;
    Ok(format!("{} 설치됨. 앱 재시작이 필요합니다.", new_ver))
}

/// 배너의 "재시작" 버튼이 호출. 설치 후 새 바이너리로 곧장 재기동한다.
#[tauri::command]
fn desktop_restart_app(handle: tauri::AppHandle) {
    handle.restart();
}

/// dev 빌드 (cfg(debug_assertions)) 시 아이콘 우상단에 빨간 원형 dot 오버레이 적용.
/// 트레이 / 작업 표시줄 / 윈도우 아이콘에서 prod 와 시각 구분 가능. image crate 의존성 추가 X
/// — Tauri 의 `Image::new_owned` 만 사용.
#[cfg(debug_assertions)]
fn apply_dev_overlay_rgba(rgba: &[u8], width: u32, height: u32) -> Vec<u8> {
    let mut out = rgba.to_vec();
    let cx = (width as i32) * 3 / 4;
    let cy = (height as i32) / 4;
    let r = (width.min(height) as i32) / 5;
    let r2 = r * r;
    for y in 0..(height as i32) {
        for x in 0..(width as i32) {
            let dx = x - cx;
            let dy = y - cy;
            if dx * dx + dy * dy <= r2 {
                let idx = (((y as u32) * width + (x as u32)) * 4) as usize;
                if idx + 3 < out.len() {
                    out[idx] = 220;
                    out[idx + 1] = 60;
                    out[idx + 2] = 60;
                    out[idx + 3] = 255;
                }
            }
        }
    }
    out
}

#[cfg(debug_assertions)]
fn with_dev_overlay<'a>(icon: &tauri::image::Image<'a>) -> tauri::image::Image<'static> {
    let modified = apply_dev_overlay_rgba(icon.rgba(), icon.width(), icon.height());
    tauri::image::Image::new_owned(modified, icon.width(), icon.height())
}

/// 데스크톱 앱 플래그·버전을 주입. `__karmolabSetNotifyInvokeDebug`는 예전 디버그 UI용 훅으로, 호출은 무해하게 무시.
///
/// 끝의 IIFE: 데스크톱 앱 업데이트 후 첫 실행에서 SW + Cache Storage를 비우고 한 번만 reload.
/// 빌드 사이에 캐시된 구버전 자산이 그대로 보이는 문제 예방. `karmolab_app_version_seen`을
/// reload 전에 기록하므로 같은 버전에서는 다시 들어가지 않음.
///
/// debug 빌드 (cfg(debug_assertions)) 시: `__KARMOLAB_DEV_INSTANCE__` 플래그만 노출 —
/// 시각 구분은 Header 로고 옆 버전 배지(`#headerVersionBadge`)가 `· dev` 라벨로 표시.
/// (옛 상단 빨간 띠 banner 폐기 — 시야 점유 + 결국 같은 의도 = 버전+빌드 라벨로 통합.)
fn karmolab_desktop_init_script() -> String {
    let base = concat!(
        r#"window.__KARMOLAB_DESKTOP__=!0;window.__karmolabSetNotifyInvokeDebug=function(){};window.__KARMOLAB_VERSION__=""#,
        env!("CARGO_PKG_VERSION"),
        r#"";(function(){try{var v=window.__KARMOLAB_VERSION__,seen=null;try{seen=localStorage.getItem('karmolab_app_version_seen');}catch(_){}if(seen===v)return;try{localStorage.setItem('karmolab_app_version_seen',v);}catch(_){}if(document.documentElement){document.documentElement.style.visibility='hidden';}var ps=[];if(typeof caches!=='undefined'&&caches.keys){ps.push(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));}));}if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){ps.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister();}));}));}Promise.all(ps).catch(function(){}).then(function(){location.reload();});}catch(_){}})();"#
    );
    let mut script = String::from(base);
    /* WebView2 기본 우클릭 메뉴를 막는다. 그 메뉴는 복사·붙여넣기·뒤로·「Inspect」가 **한 덩어리**라
     * 항목만 빼낼 수 없다 (항목 손질은 WebView2 네이티브 API 만 가능 — Tauri 가 안 열어 준다).
     * 그래서 메뉴 자체를 막고, 대신 앱이 **자기 맥락 메뉴를 그린다** (`karmolab/src/lib/context-menu.ts`).
     * Discord·VSCode 가 쓰는 길이고, 덕분에 devtools 를 release 에서도 켠 채로 Inspect 만 감출 수 있다.
     *
     * 이 자리(초기화 스크립트)에 두는 게 핵심 — **앱 JS 보다 먼저** 걸리므로 화면 코드가 깨져도
     * Inspect 는 안 열린다. `preventDefault` 는 전파를 막지 않아서 자체 메뉴 listener 는 그대로 받는다. */
    script.push_str(
        r#"document.addEventListener('contextmenu',function(e){e.preventDefault();},{capture:!0});"#,
    );
    if cfg!(debug_assertions) {
        script.push_str(r#"window.__KARMOLAB_DEV_INSTANCE__=!0;"#);
    }
    script
}

fn allow_in_webview(url: &Url) -> bool {
    match url.scheme() {
        "http" | "https" => {
            let Some(host) = url.host_str() else {
                return false;
            };
            // blog.mascari4615.com = 현재 정식 도메인. mascari4615.github.io =
            // 옛 도메인(301→blog) — 호환 위해 둘 다 허용 (KL-064: 새 도메인
            // 미허용 → prod 웹뷰 navigation 거부 → 빈화면 근본).
            if host == "blog.mascari4615.com" || host == "mascari4615.github.io" {
                return true;
            }
            // localhost/127.0.0.1 항상 허용. 트레이의 "개발 모드" 토글이 spawn 한 정적 서버를
            // production 빌드에서도 webview 가 로드해야 하므로. 외부 페이지가 localhost 로 유도해도
            // 8899 포트가 닫혀 있으면 응답 자체가 없어서 의미 없음.
            if host == "localhost" || host == "127.0.0.1" {
                return true;
            }
            /* 계정 서버·디스코드 로그인 화면은 **일부러 밖으로 보낸다** —
             * 앱 창 안에서 남의 비밀번호를 받지 않는다(RFC 8252). 대신 로그인이
             * 브라우저에서 끝난 뒤 앱이 세션을 받아 오는 길을 따로 뒀다:
             * `desktop_login.rs` (집 안 loopback 되돌아오기). */
            false
        }
        "mailto" | "tel" | "sms" => false,
        _ => true,
    }
}

#[cfg(target_os = "windows")]
fn winrt_notification_sound_token(raw: &str) -> &'static str {
    match raw.trim().to_ascii_lowercase().as_str() {
        "default" | "im" => "IM",
        "mail" => "Mail",
        "sms" => "SMS",
        "reminder" => "Reminder",
        "alarm" => "Alarm",
        "alarm2" => "Alarm2",
        "alarm3" => "Alarm3",
        "alarm4" => "Alarm4",
        "alarm5" => "Alarm5",
        "alarm6" => "Alarm6",
        "alarm7" => "Alarm7",
        "alarm8" => "Alarm8",
        "alarm9" => "Alarm9",
        "alarm10" => "Alarm10",
        "call" => "Call",
        "call2" => "Call2",
        "call3" => "Call3",
        "call4" => "Call4",
        "call5" => "Call5",
        "call6" => "Call6",
        "call7" => "Call7",
        "call8" => "Call8",
        "call9" => "Call9",
        "call10" => "Call10",
        _ => "Mail",
    }
}

#[tauri::command]
fn desktop_notify(
    title: String,
    body: String,
    sound: Option<String>,
    image_path: Option<String>,
) -> Result<(), String> {
    let summary = title.trim();
    if summary.is_empty() {
        return Ok(());
    }
    let text = body.trim();
    let body_line = if text.is_empty() { "KarmoLab" } else { text };

    #[cfg(windows)]
    let want_sound = match &sound {
        Some(s) => {
            let k = s.trim();
            !k.is_empty() && !k.eq_ignore_ascii_case("silent")
        }
        None => false,
    };

    let mut n = notify_rust::Notification::new();
    n.summary(summary).body(body_line).appname("KarmoLab");

    if let Some(ref path) = image_path {
        let t = path.trim();
        if !t.is_empty() {
            n.image_path(t);
        }
    }

    if let Some(ref s) = sound {
        let key = s.trim();
        if !key.is_empty() && !key.eq_ignore_ascii_case("silent") {
            #[cfg(target_os = "windows")]
            {
                // WinRT는 대소문자까지 맞아야 파싱됨; 실패 시 .ok() → 무음.
                // `Default`는 빈 <audio>라 무음이므로 IM으로 돌림.
                n.sound_name(winrt_notification_sound_token(key));
            }
            #[cfg(not(target_os = "windows"))]
            {
                n.sound_name(key);
            }
        }
    }

    n.show().map_err(|e| e.to_string())?;

    #[cfg(windows)]
    if want_sound {
        unsafe {
            let _ = MessageBeep(0x0000_0040);
        }
    }

    Ok(())
}

#[tauri::command]
async fn desktop_trigger_release_workflow(
    ref_name: Option<String>,
    bump_type: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        desktop_trigger_release_workflow_blocking(ref_name, bump_type)
    })
    .await
    .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

fn desktop_trigger_release_workflow_blocking(
    ref_name: Option<String>,
    bump_type: Option<String>,
) -> Result<String, String> {
    let repo = "mascari4615/mascari4615.github.io";
    let workflow = "KarmoLab Tauri Release";
    let selected_ref = ref_name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "master".to_string());
    let selected_bump = bump_type
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "none".to_string());
    if !matches!(selected_bump.as_str(), "none" | "patch" | "minor" | "major") {
        return Err(format!(
            "bumpType 값은 none|patch|minor|major 중 하나여야 합니다. 받은 값: {}",
            selected_bump
        ));
    }

    let probe = Command::new("gh")
        .args(["--version"])
        .output()
        .map_err(|_| "gh CLI를 찾을 수 없습니다. GitHub CLI 설치 후 다시 시도하세요.".to_string())?;
    if !probe.status.success() {
        return Err("gh CLI 실행에 실패했습니다. gh auth status로 로그인 상태를 확인하세요.".to_string());
    }

    let bump_field = format!("bumpType={}", selected_bump);
    let run_output = Command::new("gh")
        .args([
            "workflow",
            "run",
            workflow,
            "--repo",
            repo,
            "--ref",
            selected_ref.as_str(),
            "--field",
            bump_field.as_str(),
        ])
        .output()
        .map_err(|e| format!("workflow 실행 명령 호출 실패: {}", e))?;

    if !run_output.status.success() {
        let stderr = String::from_utf8_lossy(&run_output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&run_output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        return Err(format!("워크플로 실행 실패: {}", detail));
    }

    let url_output = Command::new("gh")
        .args([
            "run",
            "list",
            "--repo",
            repo,
            "--workflow",
            workflow,
            "--limit",
            "1",
            "--json",
            "url",
            "--jq",
            ".[0].url",
        ])
        .output()
        .map_err(|e| format!("실행 URL 조회 실패: {}", e))?;

    let maybe_url = if url_output.status.success() {
        String::from_utf8_lossy(&url_output.stdout).trim().to_string()
    } else {
        String::new()
    };

    if maybe_url.is_empty() {
        Ok(format!(
            "워크플로 실행 요청 완료 (repo: {}, ref: {}, bump: {}). GitHub Actions에서 상태를 확인하세요.",
            repo, selected_ref, selected_bump
        ))
    } else {
        Ok(format!(
            "워크플로 실행 요청 완료 (repo: {}, ref: {}, bump: {}).\n{}",
            repo, selected_ref, selected_bump, maybe_url
        ))
    }
}

/// Windows 작업 표시줄 그룹화는 AppUserModelID (AUMID) 기반 — 안 박으면 default = .exe filename
/// 기준 → dev .exe 와 prod .exe 가 둘 다 `karmolab-desktop.exe` 라 같은 그룹 → 작업 표시줄
/// 「KarmoLab」 click 시 dev focus (production spawn 안 됨). cfg!(debug_assertions) 분기로
/// 별 AUMID 박아 두 process 의 작업 표시줄 그룹 분리.
///
/// 참고: prod .lnk 의 explicit AUMID 도 같이 박혀야 (NSIS installer 가 새 release 부터
/// `bundle.windows.applicationId` 로 박음). 옛 .lnk 는 사용자가 PowerShell IPropertyStore 로
/// 갱신 또는 새 release 받으면 자동.
#[cfg(windows)]
fn set_app_user_model_id() {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    extern "system" {
        fn SetCurrentProcessExplicitAppUserModelID(app_id: *const u16) -> i32;
    }
    let aumid = if cfg!(debug_assertions) {
        "com.mascari4615.karmolab.dev"
    } else {
        "com.mascari4615.karmolab"
    };
    let wide: Vec<u16> = OsStr::new(aumid).encode_wide().chain(Some(0)).collect();
    let _ = unsafe { SetCurrentProcessExplicitAppUserModelID(wide.as_ptr()) };
}

#[cfg(not(windows))]
fn set_app_user_model_id() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    set_app_user_model_id();
    tauri::Builder::default()
        .manage(LocalDevState::default())
        .manage(tray_menu::TrayState::default())
        .manage(DevModeState::default())
        .manage(TerminalState::default())
        .manage(LifeFeaturesState::default())
        .manage(AlarmStore::default())
        // TASK-KL-063: 핸들러 목록은 acl.toml 단일 정본 → build.rs 가
        // $OUT_DIR/acl_handler.rs 로 파생 (tauri::generate_handler![..] expr).
        .invoke_handler(include!(concat!(env!("OUT_DIR"), "/acl_handler.rs")))
        .plugin(tauri_plugin_dialog::init())
        // KL-052-B: ML sidecar(karmolab-life-ml) spawn 용.
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        // sub-F-3: PrintScreen global hotkey → life_screen_capture(trigger="hotkey").
        // 의도 정정 (2026-05-10): interval 자동 ❌, 의식적 trigger 만.
        .plugin(life::hotkey::build_plugin())
        .setup(|app| {
            #[cfg(debug_assertions)]
            dev_static::start();

            let handle = app.handle().clone();

            // QuestLog 파일 watcher (KL-024) — memo TASK 디렉토리 6개 변경 시
            // 'quest-tree-changed' 이벤트 emit. 위젯이 listen 해서 자동 새로고침.
            quest_watcher::start(handle.clone());

            // 카모랩 재시작 시 detached 봇 PID 복원 (영속 파일 → 살아있는 것만 in-memory map).
            // OS 호출이 들어가니까 background thread로 — 메인 윈도우 표시를 막지 않음.
            {
                let h = handle.clone();
                std::thread::spawn(move || {
                    restore_persisted_state(&h);
                });
            }

            // KL-065: 비-GUI localdev 제어 인터페이스 (localhost HTTP).
            // AI 에이전트가 GUI 클릭 없이 dev 프로필 start/stop/log/deploy 자가구동.
            // 전용 thread + 같은 LocalDevState 공유 (사람 카드와 동일 트리).
            local_dev_http::start(handle.clone());

            // PC 활동 트래커 — app data dir 안에 일별 JSONL로 저장. 시작 시 자동 폴링 시작.
            {
                let activity_dir = handle
                    .path()
                    .app_data_dir()
                    .map(|p| p.join("activity"))
                    .unwrap_or_else(|_| std::path::PathBuf::from("./activity"));
                let activity_state = ActivityState::new(activity_dir);
                activity_state.start();
                app.manage(activity_state);
            }

            // Life 기능 상태 복원 (이전 세션 on/off 설정). 핫키/모델은 사용자가 켠 것만.
            {
                let life_state = app.state::<LifeFeaturesState>();
                let persisted = load_life_features(&handle);
                if persisted.screen {
                    life_state.screen_enabled.store(true, std::sync::atomic::Ordering::Relaxed);
                    if let Err(e) = life::hotkey::register_screen(&handle) {
                        eprintln!("[life-screen] hotkey 복원 실패: {e}");
                    }
                }
                if persisted.voice {
                    if let Err(e) = life::voice::enable(&handle) {
                        eprintln!("[life-voice] enable 복원 실패: {e}");
                    } else if let Err(e) = life::hotkey::register_voice(&handle) {
                        eprintln!("[life-voice] hotkey 복원 실패: {e}");
                    }
                }
            }

            // 알람 (KL-064): 디스크 복원 + 상주 스케줄러. 위젯 미오픈·트레이
            // 최소화 무관 정시 발화 (activity tracker 와 동일 background thread).
            {
                let store = app.state::<AlarmStore>();
                store.load_from_disk(&handle);
                alarm::start_scheduler(handle.clone());
                // 절전 resume 타이머 — 시스템이 자도 알람 시각에 깨움(OS 강제 기상).
                alarm::oswake::start_wake_timer(handle.clone());
                // 재부팅 후 알람 보장 — 저장된 pref(default ON)를 레지스트리 반영.
                alarm::ensure_autostart(&handle);
            }

            let window_conf = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .expect(r#"tauri.conf.json must include a window with label "main""#);
            let window_handle = handle.clone();

            let main_window = WebviewWindowBuilder::from_config(app, window_conf)?
                .initialization_script(&karmolab_desktop_init_script())
                .on_navigation(|url| {
                    if allow_in_webview(url) {
                        true
                    } else {
                        if matches!(url.scheme(), "mailto" | "tel" | "sms" | "http" | "https") {
                            let _ = open::that(url.as_str());
                        }
                        false
                    }
                })
                .on_new_window(|url, _features| {
                    let _ = open::that(url.as_str());
                    NewWindowResponse::Deny
                })
                .build()?;

            main_window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(w) = window_handle.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
                #[cfg(not(debug_assertions))]
                if let WindowEvent::Focused(true) = event {
                    try_focus_update_check(&window_handle);
                }
            });

            #[cfg(not(debug_assertions))]
            {
                // 백그라운드 업데이트 체크: 시작 ~10s 뒤 첫 체크, 이후 6시간마다 재확인.
                // 새 버전이 발견되면 webview로 이벤트만 보내고, 설치는 in-app 배너의 "지금 설치"
                // 또는 트레이의 "업데이트 확인…"을 사용자가 누를 때 진행한다.
                let h = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(10));
                    loop {
                        spawn_update_check(h.clone(), UpdateCheckMode::Background);
                        std::thread::sleep(std::time::Duration::from_secs(6 * 3600));
                    }
                });
            }

            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let menu = build_tray_menu(&app.app_handle().clone())?;

                if let Some(icon) = app.default_window_icon().cloned() {
                    let tray_tooltip = if cfg!(debug_assertions) {
                        "KarmoLab [DEV] — debug 빌드 (npm run dev)"
                    } else {
                        "KarmoLab — 트레이 메뉴에서 업데이트 확인 · 닫기(X)는 숨김"
                    };
                    #[cfg(debug_assertions)]
                    let tray_icon = with_dev_overlay(&icon);
                    #[cfg(not(debug_assertions))]
                    let tray_icon = icon.clone();
                    // main 윈도우 (작업 표시줄) 아이콘도 dev 시 오버레이.
                    #[cfg(debug_assertions)]
                    {
                        let dev_window_icon = with_dev_overlay(&icon);
                        let _ = main_window.set_icon(dev_window_icon);
                    }
                    let tray_built = TrayIconBuilder::new()
                        .icon(tray_icon)
                        .menu(&menu)
                        .tooltip(tray_tooltip)
                        .show_menu_on_left_click(true)
                        .on_menu_event(move |app, event| {
                            if event.id == "tray_show" {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.unminimize();
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            } else if event.id == "tray_browser" {
                                let _ = open::that(KARMOLAB_WEB_URL);
                            } else if event.id == "tray_update" {
                                spawn_update_check(app.clone(), UpdateCheckMode::Manual);
                            } else if event.id == "tray_dev_mode" {
                                match toggle_dev_mode(app) {
                                    Ok(on) => {
                                        if let Some(dev_item) = app
                                            .state::<tray_menu::TrayState>()
                                            .labels
                                            .lock()
                                            .ok()
                                            .and_then(|g| g.get("tray_dev_mode").cloned())
                                        {
                                            let _ = dev_item.set_text(if on {
                                                "개발 모드 ✓ (로컬 8899)"
                                            } else {
                                                "개발 모드 (로컬 8899)"
                                            });
                                        }
                                        let _ = notify_rust::Notification::new()
                                            .summary("KarmoLab 개발 모드")
                                            .body(if on {
                                                "로컬 8899 정적 서버 + webview 전환됨."
                                            } else {
                                                "원격(GitHub Pages)으로 복귀."
                                            })
                                            .appname("KarmoLab")
                                            .show();
                                    }
                                    Err(e) => {
                                        let _ = notify_rust::Notification::new()
                                            .summary("KarmoLab 개발 모드")
                                            .body(&format!("토글 실패: {}", e))
                                            .appname("KarmoLab")
                                            .show();
                                    }
                                }
                            } else if let Some(item) = app
                                .state::<tray_menu::TrayState>()
                                .items
                                .lock()
                                .ok()
                                .and_then(|g| g.get(event.id.as_ref()).cloned())
                            {
                                /* 표를 **지금** 다시 본다 — 클로저가 뜰 때의 표를 쥐고 있으면
                                   나중에 새로 그린 줄은 눌러도 아무 일이 안 난다. */
                                let label = app
                                    .state::<tray_menu::TrayState>()
                                    .labels
                                    .lock()
                                    .ok()
                                    .and_then(|g| g.get(event.id.as_ref()).cloned());
                                run_quick_item(app, &item, label.as_ref());
                            } else if event.id == "tray_quit" {
                                terminal::shutdown(&app.state::<TerminalState>());
                                app.exit(0);
                            }
                        })
                        .on_tray_icon_event(|tray, event| {
                            // Windows only: double-click tray to raise the window without opening the menu.
                            #[cfg(windows)]
                            if let TrayIconEvent::DoubleClick {
                                button: MouseButton::Left,
                                ..
                            } = event
                            {
                                let app = tray.app_handle();
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.unminimize();
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                            #[cfg(not(windows))]
                            let _ = (tray, event);
                        })
                        .build(app)?;
                    if let Ok(mut g) = app.state::<tray_menu::TrayState>().icon.lock() {
                        *g = Some(tray_built);
                    }
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, event| {
            // KL-052: 앱 종료 시 ML sidecar(karmolab-life-ml) 프로세스
            // 정리 — 좀비 프로세스 방지 (voice disable 은 종료 X, screen
            // 공용. 진짜 정리는 여기).
            if let tauri::RunEvent::Exit = event {
                life::sidecar::terminate();
            }
        });
}


#[cfg(test)]
mod tests {
    use super::allow_in_webview;
    use tauri::Url;

    fn allows(raw: &str) -> bool {
        allow_in_webview(&Url::parse(raw).expect("test url"))
    }

    #[test]
    fn the_app_itself_stays_inside() {
        assert!(allows("https://blog.mascari4615.com/karmolab/?kl_login=ok"));
        assert!(allows("http://127.0.0.1:8898/apps/karmolab/"));
    }

    #[test]
    fn login_pages_and_strangers_open_outside() {
        // 로그인은 시스템 브라우저에서 돈다 (desktop_login.rs 가 되돌려 받는다).
        assert!(!allows("https://yawnbot.mascari4615.com/kl/auth/discord?return=x"));
        assert!(!allows("https://discord.com/api/oauth2/authorize?client_id=1"));
        assert!(!allows("https://example.com/"));
        assert!(!allows("mailto:a@b.c"));
    }
}
