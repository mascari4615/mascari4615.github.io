//! 데스크톱 로그인 — **시스템 브라우저 + 집 안(loopback) 되돌아오기** (RFC 8252).
//!
//! 왜 이 모양인가:
//! - 앱 창(웹뷰) 안에서 디스코드 로그인을 돌리면 ① 사람이 **앱 창 안에서** 비밀번호를 치게
//!   되고(가짜 로그인 창이 노리는 바로 그 그림) ② 브라우저에 이미 있는 로그인을 못 쓰고
//!   ③ 앱마다 쿠키 통이 따로라 매번 다시 친다.
//! - 반대로 그냥 브라우저로 내보내기만 하면 **로그인이 브라우저에서 끝난다** — 세션 쿠키가
//!   거기 앉고 앱은 남남으로 남는다. 이게 실제로 나던 증상이다.
//!
//! 그래서: 브라우저로 내보내되, **되돌아올 자리**를 앱이 그 순간만 연다. 127.0.0.1 의
//! 임시 포트 하나 → 서버가 「다른 기기 로그인 코드」를 실어 되돌려 보냄 → 앱이 그 코드를
//! 자기 웹뷰에 건네고, 웹뷰가 `/kl/auth/link` 로 세션을 받아 온다(쿠키가 웹뷰 통에 앉는다).
//!
//! 새 계정 장치는 만들지 않았다 — 이미 있는 링크 코드(한 번 쓰면 사라짐·수 분)를 그대로 쓴다.
//! 포트는 매번 다르고(고정 포트 선점 다툼 0), `nonce` 로 우리가 낸 요청만 받는다.

use std::time::{Duration, Instant};
use tauri::{Manager, Url};
use tiny_http::{Header, Response, Server};

/// 되돌아올 경로. 서버(`karmolab-api.ts`)의 `DESKTOP_CALLBACK_PATH` 와 **같은 값**이어야 한다.
const CALLBACK_PATH: &str = "/kl/desktop-callback";
/// 사람이 브라우저에서 로그인을 끝낼 때까지 기다리는 시간. 지나면 문을 닫는다(포트 반납).
const WAIT: Duration = Duration::from_secs(180);

/// 브라우저로 내보내도 되는 계정 서버인가 — 아무 주소나 열어 주는 손잡이가 되면 안 된다.
fn allowed_api_base(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    match url.scheme() {
        "https" => host == "yawnbot.mascari4615.com",
        // 로컬에서 봇을 띄워 놓고 붙이는 개발 경로 (`window.KARMOLAB_API_BASE`).
        "http" => host == "localhost" || host == "127.0.0.1",
        _ => false,
    }
}

/// 코드에 쓸 수 있는 글자인가. 웹뷰에 문자열로 건네므로 따옴표·괄호가 섞이면 안 된다.
fn safe_code(code: &str) -> bool {
    !code.is_empty()
        && code.len() <= 64
        && code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// 되돌아온 요청에서 코드를 꺼낸다. 경로·nonce·글자 셋 중 하나라도 어긋나면 안 받는다.
///
/// `raw` = tiny_http 의 `request.url()` (경로+질의만 옴).
fn parse_callback(raw: &str, expect_nonce: &str) -> Option<String> {
    let url = Url::parse("http://127.0.0.1").ok()?.join(raw).ok()?;
    if url.path() != CALLBACK_PATH {
        return None;
    }
    let mut nonce = None;
    let mut code = None;
    for (k, v) in url.query_pairs() {
        match k.as_ref() {
            "nonce" => nonce = Some(v.into_owned()),
            "code" => code = Some(v.into_owned()),
            _ => {}
        }
    }
    if nonce.as_deref() != Some(expect_nonce) {
        return None;
    }
    let code = code?;
    if !safe_code(&code) {
        return None;
    }
    Some(code)
}

/// 브라우저에 남는 마지막 화면. 사람이 「끝났구나」를 알고 앱으로 돌아가게만 하면 된다.
fn done_page() -> Response<std::io::Cursor<Vec<u8>>> {
    let body = "<!doctype html><meta charset=\"utf-8\"><title>KarmoLab</title>\
<body style=\"font-family:system-ui;background:#15161a;color:#e6e6e6;display:grid;place-items:center;height:100vh;margin:0\">\
<div style=\"text-align:center\"><h1 style=\"font-size:20px\">로그인 끝났어요</h1>\
<p style=\"opacity:.7\">이 창을 닫고 KarmoLab 앱으로 돌아가세요.</p></div>";
    let mut res = Response::from_string(body);
    if let Ok(header) = Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]) {
        res.add_header(header);
    }
    res
}

/**
 * 로그인 시작 — 브라우저를 열고, 되돌아올 문을 그 순간만 연다.
 *
 * 곧바로 돌아온다(기다리는 일은 전용 thread). 사람이 브라우저를 닫아 버려도 `WAIT` 뒤에
 * 문이 저절로 닫히고, 앱은 아무 일 없었던 것처럼 남는다 — fail-open.
 */
#[tauri::command]
pub fn desktop_login_start(app: tauri::AppHandle, api_base: String) -> Result<(), String> {
    let base = Url::parse(api_base.trim_end_matches('/'))
        .map_err(|e| format!("계정 서버 주소를 못 읽었어요: {e}"))?;
    if !allowed_api_base(&base) {
        return Err(format!("여기로는 로그인을 안 보냅니다: {base}"));
    }

    // 포트 0 = 그때 비어 있는 자리를 운영체제가 준다. 고정 포트 선점 다툼이 없다.
    let server = Server::http("127.0.0.1:0")
        .map_err(|e| format!("되돌아올 문을 못 열었어요: {e}"))?;
    let port = server
        .server_addr()
        .to_ip()
        .ok_or_else(|| "되돌아올 문의 포트를 못 읽었어요".to_string())?
        .port();

    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let return_url = format!("http://127.0.0.1:{port}{CALLBACK_PATH}?nonce={nonce}");

    let mut auth = base.clone();
    auth.set_path("/kl/auth/discord");
    auth.query_pairs_mut().clear().append_pair("return", &return_url);
    open::that(auth.as_str()).map_err(|e| format!("브라우저를 못 열었어요: {e}"))?;

    std::thread::spawn(move || {
        let deadline = Instant::now() + WAIT;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                eprintln!("[desktop-login] 기다리다 문을 닫았습니다 (사람이 안 돌아옴)");
                return;
            }
            let request = match server.recv_timeout(left) {
                Ok(Some(r)) => r,
                Ok(None) => continue,
                Err(e) => {
                    eprintln!("[desktop-login] 되돌아오는 길이 끊겼습니다: {e}");
                    return;
                }
            };
            let Some(code) = parse_callback(&request.url().to_string(), &nonce) else {
                // 우리가 낸 요청이 아니다 — 답만 주고 문은 계속 열어 둔다.
                let _ = request.respond(Response::from_string("no").with_status_code(400));
                continue;
            };
            let _ = request.respond(done_page());
            match app.get_webview_window("main") {
                Some(window) => {
                    // 코드는 위에서 글자를 걸렀다(영숫자·`-`·`_`) — 문자열 밖으로 못 샌다.
                    let script = format!(
                        "window.__karmolabDesktopLogin&&window.__karmolabDesktopLogin(\"{code}\")"
                    );
                    if let Err(e) = window.eval(&script) {
                        eprintln!("[desktop-login] 웹뷰에 코드 전달 실패: {e}");
                    }
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                None => eprintln!("[desktop-login] main 창이 없어 코드를 못 건넸습니다"),
            }
            return;
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{allowed_api_base, parse_callback, safe_code};
    use tauri::Url;

    fn u(raw: &str) -> Url {
        Url::parse(raw).expect("test url")
    }

    #[test]
    fn only_our_account_server_goes_out_to_the_browser() {
        assert!(allowed_api_base(&u("https://yawnbot.mascari4615.com")));
        assert!(allowed_api_base(&u("http://127.0.0.1:8813")));
        assert!(!allowed_api_base(&u("https://evil.example.com")));
        assert!(!allowed_api_base(&u("https://yawnbot.mascari4615.com.evil.example.com")));
    }

    #[test]
    fn callback_takes_the_code_only_when_everything_matches() {
        assert_eq!(
            parse_callback("/kl/desktop-callback?nonce=n1&kl_login=ok&code=ABC-123", "n1"),
            Some("ABC-123".to_string())
        );
        // nonce 가 다르면 남이 찔러 본 것이다.
        assert_eq!(parse_callback("/kl/desktop-callback?nonce=other&code=ABC-123", "n1"), None);
        // 경로가 다르면 우리 문이 아니다.
        assert_eq!(parse_callback("/무엇?nonce=n1&code=ABC-123", "n1"), None);
        // 코드가 없으면 받을 것이 없다.
        assert_eq!(parse_callback("/kl/desktop-callback?nonce=n1", "n1"), None);
    }

    #[test]
    fn code_with_quotes_never_reaches_the_webview() {
        assert!(safe_code("ABC-123"));
        assert!(!safe_code("\");alert(1);(\""));
        assert!(!safe_code(""));
        assert_eq!(parse_callback("/kl/desktop-callback?nonce=n1&code=%22)%3B", "n1"), None);
    }
}
