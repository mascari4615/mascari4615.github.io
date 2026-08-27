//! Files 전용 창 — 파일 화면은 카모랩 안이 아니라 자기 창에서 산다.
//!
//! 왜 별도 창인가: Files 는 카모랩 위젯이 아니라 독립 제품 표면(`files.mascari4615.com`)이다.
//! 카모랩 화면 안에 끼워 넣으면 「위젯 하나」로 보이고, 뒤로가기·주소·크기가 카모랩에 묶인다.
//!
//! 주소는 **main 창의 실제 URL 에서 파생**한다 — dev(127.0.0.1:8898) / prod(Pages) 를
//! 하드코딩하면 한쪽에서 죽는다. alarm 창이 같은 이유로 같은 방식을 쓴다.

use tauri::Manager;

/// 창 label. `capabilities/default.json` 의 `windows` 에 같은 이름이 있어야
/// 이 창에서 command 를 부를 수 있다 (없으면 화면은 뜨는데 버튼이 다 죽는다).
pub const FILES_WINDOW_LABEL: &str = "files";

/// 카모랩 주소 → Files 주소. 경로의 `karmolab` 조각만 `files` 로 바꾼다.
/// dev `/apps/karmolab/` → `/apps/files/`, prod `/karmolab/` → `/files/`.
fn files_url_from(main_url: &tauri::Url) -> tauri::Url {
    let mut u = main_url.clone();
    u.set_fragment(None);
    u.set_query(None);
    let path = u.path().to_string();
    let next = path.replace("/karmolab", "/files");
    u.set_path(&next);
    u
}

/// Files 창을 세운다. 이미 있으면 앞으로 가져오기만.
/// 창 생성은 **메인 스레드 필수** — 워커에서 부르면 Windows 에서 무반응/크래시(KL-064).
pub fn open_files_window(app: &tauri::AppHandle) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main 창이 없습니다.".to_string())?;
    let url = main.url().map_err(|e| format!("main 주소 조회 실패: {}", e))?;
    let target = files_url_from(&url);

    let app2 = app.clone();
    app.run_on_main_thread(move || {
        if let Some(w) = app2.get_webview_window(FILES_WINDOW_LABEL) {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
            return;
        }
        match tauri::WebviewWindowBuilder::new(
            &app2,
            FILES_WINDOW_LABEL,
            tauri::WebviewUrl::External(target),
        )
        .title("Files")
        .inner_size(1000.0, 760.0)
        .resizable(true)
        .focused(true)
        .build()
        {
            Ok(_) => {}
            Err(e) => eprintln!("[files] 창 생성 실패: {e}"),
        }
    })
    .map_err(|e| format!("메인 스레드 마샬 실패: {}", e))
}

/// 화면(카모랩 위젯·트레이 밖의 손잡이)에서 Files 창을 열 때.
#[tauri::command]
pub fn files_window_open(app: tauri::AppHandle) -> Result<(), String> {
    open_files_window(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prod_주소를_files_로_바꾼다() {
        let u = tauri::Url::parse("https://blog.mascari4615.com/karmolab/#home").unwrap();
        assert_eq!(
            files_url_from(&u).as_str(),
            "https://blog.mascari4615.com/files/"
        );
    }

    #[test]
    fn dev_주소도_같은_규칙() {
        let u = tauri::Url::parse("http://127.0.0.1:8898/apps/karmolab/index.html").unwrap();
        assert_eq!(
            files_url_from(&u).as_str(),
            "http://127.0.0.1:8898/apps/files/index.html"
        );
    }

    #[test]
    fn 조각과_질의는_떨군다() {
        let u = tauri::Url::parse("https://blog.mascari4615.com/karmolab/?dev=1#servermonitor").unwrap();
        let out = files_url_from(&u);
        assert_eq!(out.fragment(), None);
        assert_eq!(out.query(), None);
    }
}
