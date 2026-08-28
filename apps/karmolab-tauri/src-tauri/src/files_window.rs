//! Files 전용 창 — 파일 화면은 카모랩 안이 아니라 자기 창에서 산다.
//!
//! 왜 별도 창인가: Files 는 카모랩 위젯이 아니라 독립 제품 표면(`files.mascari4615.com`)이다.
//! 카모랩 화면 안에 끼워 넣으면 「위젯 하나」로 보이고, 뒤로가기·주소·크기가 카모랩에 묶인다.
//!
//! 주소는 **main 창의 실제 URL 에서 파생**한다 — dev(127.0.0.1:8898) / prod 를
//! 하드코딩하면 한쪽에서 죽는다. alarm 창이 같은 이유로 같은 방식을 쓴다.
//!
//! ★ prod 는 **`files.mascari4615.com` 제 도메인**으로 간다 (2026-08-29). Pages 쪽
//!   `blog.mascari4615.com/files/` 로도 화면은 뜨지만, 클라우드 암호문을 내주는
//!   `/blob/` 은 Worker 가 사는 그 도메인에만 있다. 그래서 Pages 로 열면 화면이
//!   `/blob/hdr` 을 못 찾아 **픽스처(시험용 금고)로 되떨어지고**, 맞는 비밀번호를 쳐도
//!   안 열린다(2026-08-28 실측). 웹에서 오는 길로 Pages `/files/` 는 그대로 둔다.

use tauri::Manager;

/// 창 label. `capabilities/default.json` 의 `windows` 에 같은 이름이 있어야
/// 이 창에서 command 를 부를 수 있다 (없으면 화면은 뜨는데 버튼이 다 죽는다).
pub const FILES_WINDOW_LABEL: &str = "files";

/// 카모랩 주소 → Files 주소.
///
/// 두 구조를 다 견딘다. 지금은 카모랩이 `/karmolab/`(prod)·`/apps/karmolab/`(dev)에 살지만,
/// 뿌리 이전(change.karmolab-at-root)이 끝나면 카모랩이 `/` 를 차지하고 `/karmolab/*` 는
/// 404 가 된다. 그때 이 치환만 믿으면 Files 로 못 간다.
fn files_url_from(main_url: &tauri::Url) -> tauri::Url {
    let mut u = main_url.clone();
    u.set_fragment(None);
    u.set_query(None);

    /* 배포판은 제 도메인으로 간다 — 거기에만 `/blob/`(클라우드 암호문)이 있다.
       `capabilities/default.json` 의 remote 목록에도 같은 주소가 있어야 단추가 산다. */
    if u.scheme() == "https" {
        if let Ok(files) = tauri::Url::parse("https://files.mascari4615.com/") {
            return files;
        }
    }

    // dev(로컬 정적 서버)는 한 저장소를 통째로 서빙하므로 경로만 옮긴다.
    let path = u.path().to_string();
    let next = if path.contains("/karmolab") {
        path.replace("/karmolab", "/files")
    } else {
        // 카모랩이 뿌리에 산다 = Files 도 뿌리 옆 한 칸이다.
        "/files/".to_string()
    };
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
        // 카모랩 창과 같은 결 — 틀은 화면이 그린다. 이걸 켜 두면 OS 타이틀바와
        // 화면이 그린 창 단추가 **둘 다** 보인다 (2026-08-27 조수님이 봤다).
        .decorations(false)
        .focused(true)
        .build()
        {
            Ok(_) => {}
            Err(e) => eprintln!("[files] 창 생성 실패: {e}"),
        }
    })
    .map_err(|e| format!("메인 스레드 마샬 실패: {}", e))
}

/// 지금 창을 그대로 Files 로 바꾼다 — 기본 길.
///
/// 창을 새로 띄우면 창 관리가 늘어난다. 파일을 볼 때 카모랩을 동시에 볼 일은 드물고,
/// navigate 는 히스토리를 남기므로 뒤로가기로 카모랩에 돌아온다.
pub fn navigate_main_to_files(app: &tauri::AppHandle) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main 창이 없습니다.".to_string())?;
    let url = main.url().map_err(|e| format!("main 주소 조회 실패: {}", e))?;
    let target = files_url_from(&url);
    let _ = main.unminimize();
    let _ = main.show();
    let _ = main.set_focus();
    main.navigate(target)
        .map_err(|e| format!("Files 로 이동 실패: {}", e))
}

/// 지금 창을 Files 로 바꾼다 (화면 손잡이용).
#[tauri::command]
pub fn files_navigate(app: tauri::AppHandle) -> Result<(), String> {
    navigate_main_to_files(&app)
}

/// 파일을 **따로 띄우고 싶을 때**. 카모랩과 나란히 봐야 하는 경우다.
#[tauri::command]
pub fn files_window_open(app: tauri::AppHandle) -> Result<(), String> {
    open_files_window(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prod_는_제_도메인으로_간다() {
        // Pages 로 열면 `/blob/` 이 없어 픽스처로 되떨어진다 (2026-08-28 사고).
        let u = tauri::Url::parse("https://blog.mascari4615.com/karmolab/#home").unwrap();
        assert_eq!(files_url_from(&u).as_str(), "https://files.mascari4615.com/");
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
    fn 뿌리로_옮긴_뒤에도_찾아간다() {
        // change.karmolab-at-root 이후: 카모랩이 `/` 를 차지한다. 어느 장에서 눌러도 한 곳이다.
        let u = tauri::Url::parse("https://blog.mascari4615.com/").unwrap();
        assert_eq!(files_url_from(&u).as_str(), "https://files.mascari4615.com/");
        let u = tauri::Url::parse("https://blog.mascari4615.com/t/somethig/").unwrap();
        assert_eq!(files_url_from(&u).as_str(), "https://files.mascari4615.com/");
    }

    #[test]
    fn 조각과_질의는_떨군다() {
        // dev 에서 잰다 — prod 는 제 도메인 한 곳으로 가므로 원래 조각·질의가 남지 않는다.
        let u = tauri::Url::parse("http://127.0.0.1:8898/apps/karmolab/index.html?dev=1#servermonitor").unwrap();
        let out = files_url_from(&u);
        assert_eq!(out.fragment(), None);
        assert_eq!(out.query(), None);
    }
}
