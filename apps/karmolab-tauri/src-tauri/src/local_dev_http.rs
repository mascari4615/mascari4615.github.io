//! TASK-KL-065 — 비-GUI localdev 제어 인터페이스.
//!
//! 서버모니터 `localdev_*` 운영 액션을 **localhost HTTP** 로도 노출해, AI
//! 에이전트(Claude)가 데스크톱 앱 GUI 클릭 없이 dev 서버/봇을 직접 구동한다.
//! 사람(카드 UI)·AI(HTTP) 가 *공용 인터페이스* — Grey Box: 경계=공용, 구현=은닉.
//!
//! 핵심 정합:
//! - **평행 정의 0**: 라우트가 `crate::local_dev::localdev_*` 의 *기존 fn*
//!   (카드 UI 와 동일 본체)을 `app.state::<LocalDevState>()` 로 직접 호출.
//!   `#[tauri::command]` 매크로는 원본 `pub fn` 을 그대로 남기므로 seam 신설
//!   불요 — 기존 함수 무수정(회귀 0).
//! - **ACL 무영향**: HTTP 라우트는 `#[tauri::command]` 아님 → `acl.toml`
//!   codegen/audit 무관 (master invariant 신규 command 0 유지).
//! - **보안**: `127.0.0.1` only bind + `Authorization: Bearer <token>` (토큰은
//!   app_local_data_dir `localdev-http.json` 자동 생성).

use crate::local_dev::{self, LocalDevState};
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::Manager;
use tiny_http::{Header, Method, Response, Server};

/// 기본 포트. `localdev-http.json` 의 `port` 로 덮어쓸 수 있다.
const DEFAULT_PORT: u16 = 8766;
/// 로그 스냅샷 기본 줄 수.
const DEFAULT_TAIL_LINES: usize = 200;

#[derive(Serialize, Deserialize)]
struct HttpConfig {
    port: u16,
    token: String,
}

/// 인증 토큰/포트를 디스크에서 로드하거나 최초 1회 생성.
/// 위치 = `<app_local_data_dir>/localdev-http.json`.
fn load_or_init_config(app: &tauri::AppHandle) -> Result<HttpConfig, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("app_local_data_dir 조회 실패: {}", e))?;
    fs::create_dir_all(&base).map_err(|e| format!("데이터 디렉토리 생성 실패: {}", e))?;
    let path = base.join("localdev-http.json");

    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(cfg) = serde_json::from_str::<HttpConfig>(&raw) {
            return Ok(cfg);
        }
    }
    let cfg = HttpConfig {
        port: DEFAULT_PORT,
        token: uuid::Uuid::new_v4().simple().to_string(),
    };
    let serialized =
        serde_json::to_string_pretty(&cfg).map_err(|e| format!("config 직렬화 실패: {}", e))?;
    fs::write(&path, serialized).map_err(|e| format!("config 쓰기 실패: {}", e))?;
    Ok(cfg)
}

/// `.setup` 훅에서 호출. 전용 background thread 에서 blocking HTTP 루프 구동.
/// 실패해도 앱 본체는 살아야 하므로 모든 에러는 eprintln 후 thread 종료.
pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let cfg = match load_or_init_config(&app) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[localdev-http] config 초기화 실패: {e}");
                return;
            }
        };
        let addr = format!("127.0.0.1:{}", cfg.port);
        let server = match Server::http(&addr) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[localdev-http] {addr} bind 실패: {e}");
                return;
            }
        };
        eprintln!(
            "[localdev-http] listening on http://{addr} (token in app_local_data_dir/localdev-http.json)"
        );

        for mut request in server.incoming_requests() {
            let method = request.method().clone();
            let url = request.url().to_string();
            let (path, query) = split_path_query(&url);

            // /localdev/health 만 무인증 (liveness probe).
            if !(path == "/localdev/health" && method == Method::Get)
                && !is_authorized(&request, &cfg.token)
            {
                respond(request, 401, &json_err("Unauthorized: Bearer token 필요"));
                continue;
            }

            let mut body = String::new();
            if matches!(method, Method::Post) {
                let _ = request.as_reader().read_to_string(&mut body);
            }

            let (code, payload) = route(&app, &method, path, &query, &body);
            respond(request, code, &payload);
        }
    });
}

fn route(
    app: &tauri::AppHandle,
    method: &Method,
    path: &str,
    query: &str,
    body: &str,
) -> (u16, String) {
    let state = app.state::<LocalDevState>();
    match (method, path) {
        (Method::Get, "/localdev/health") => (
            200,
            json_ok(&serde_json::json!({
                "service": "localdev-http",
                "task": "TASK-KL-065"
            })),
        ),

        (Method::Get, "/localdev/repo-root") => {
            (200, json_ok(&serde_json::json!(local_dev::localdev_get_repo_root(state))))
        }
        (Method::Post, "/localdev/repo-root") => {
            let path_arg = match json_field(body, "path") {
                Some(v) => v,
                None => return (400, json_err("body 에 \"path\" 필요")),
            };
            wrap_unit(local_dev::localdev_set_repo_root(path_arg, state))
        }

        (Method::Get, "/localdev/tracked") => {
            result_json(local_dev::localdev_list_tracked(state))
        }
        (Method::Get, "/localdev/external") => {
            result_json(local_dev::localdev_list_external_pids_sync(&state))
        }

        (Method::Post, "/localdev/start") => {
            let p = match json_field(body, "profile") {
                Some(v) => v,
                None => return (400, json_err("body 에 \"profile\" 필요")),
            };
            wrap_unit(local_dev::localdev_start_sync(p, app.clone(), &state))
        }
        (Method::Post, "/localdev/stop") => {
            let p = match json_field(body, "profile") {
                Some(v) => v,
                None => return (400, json_err("body 에 \"profile\" 필요")),
            };
            wrap_unit(local_dev::localdev_stop_sync(p, app.clone(), &state))
        }
        (Method::Post, "/localdev/external-stop") => {
            let p = match json_field(body, "profile") {
                Some(v) => v,
                None => return (400, json_err("body 에 \"profile\" 필요")),
            };
            result_json(local_dev::localdev_stop_external_sync(p, &state))
        }
        (Method::Post, "/localdev/stdin") => {
            let p = match json_field(body, "profile") {
                Some(v) => v,
                None => return (400, json_err("body 에 \"profile\" 필요")),
            };
            let text = match json_field(body, "text") {
                Some(v) => v,
                None => return (400, json_err("body 에 \"text\" 필요")),
            };
            wrap_unit(local_dev::localdev_send_stdin(p, text, state))
        }

        (Method::Post, "/localdev/deploy") => {
            let p = match json_field(body, "profile") {
                Some(v) => v,
                None => return (400, json_err("body 에 \"profile\" 필요")),
            };
            // async fn — 전용 thread 에서 block_on (State 借用은 동일 thread 유지).
            result_json(tauri::async_runtime::block_on(
                local_dev::localdev_deploy_stream(p, app.clone(), state),
            ))
        }
        (Method::Post, "/localdev/npm-install") => {
            let p = match json_field(body, "profile") {
                Some(v) => v,
                None => return (400, json_err("body 에 \"profile\" 필요")),
            };
            result_json(tauri::async_runtime::block_on(
                local_dev::localdev_npm_install_stream(p, app.clone(), state),
            ))
        }

        (Method::Get, "/localdev/log") => {
            let profile = match query_param(query, "profile") {
                Some(v) => v,
                None => return (400, json_err("?profile= 필요")),
            };
            let lines = query_param(query, "tail")
                .and_then(|v| v.parse::<usize>().ok())
                .unwrap_or(DEFAULT_TAIL_LINES);
            match local_dev::localdev_log_tail(app, &profile, lines) {
                Ok(text) => (
                    200,
                    json_ok(&serde_json::json!({ "profile": profile, "log": text })),
                ),
                Err(e) => (500, json_err(&e)),
            }
        }

        _ => (404, json_err("알 수 없는 경로")),
    }
}

// ── 응답 헬퍼 ──────────────────────────────────────────────────────────────

fn respond(request: tiny_http::Request, code: u16, payload: &str) {
    let header = Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..])
        .expect("static header");
    let response = Response::from_string(payload)
        .with_status_code(code)
        .with_header(header);
    let _ = request.respond(response);
}

fn json_ok(value: &serde_json::Value) -> String {
    serde_json::json!({ "ok": true, "data": value }).to_string()
}

fn json_err(msg: &str) -> String {
    serde_json::json!({ "ok": false, "error": msg }).to_string()
}

/// `Result<T, String>` 를 HTTP (200/500) + `{ok,data|error}` 로 사상.
fn result_json<T: Serialize>(r: Result<T, String>) -> (u16, String) {
    match r {
        Ok(v) => (200, json_ok(&serde_json::to_value(v).unwrap_or(serde_json::Value::Null))),
        Err(e) => (500, json_err(&e)),
    }
}

fn wrap_unit(r: Result<(), String>) -> (u16, String) {
    match r {
        Ok(()) => (200, json_ok(&serde_json::Value::Null)),
        Err(e) => (500, json_err(&e)),
    }
}

// ── 요청 파싱 헬퍼 ─────────────────────────────────────────────────────────

fn is_authorized(request: &tiny_http::Request, token: &str) -> bool {
    let expected = format!("Bearer {token}");
    request.headers().iter().any(|h| {
        h.field.equiv("Authorization") && h.value.as_str() == expected
    })
}

fn split_path_query(url: &str) -> (&str, &str) {
    match url.split_once('?') {
        Some((p, q)) => (p, q),
        None => (url, ""),
    }
}

/// 최소 application/x-www-form-urlencoded 디코드 (`+`→space, `%XX`).
fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(b) => {
                        out.push(b);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn query_param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        if k == key {
            Some(url_decode(v))
        } else {
            None
        }
    })
}

/// JSON 본문에서 *문자열* 필드 1개 추출 (작은 제어 메시지 전용).
fn json_field(body: &str, key: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    v.get(key)?.as_str().map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_path_query_handles_both() {
        assert_eq!(split_path_query("/localdev/log?profile=a&tail=5"),
                   ("/localdev/log", "profile=a&tail=5"));
        assert_eq!(split_path_query("/localdev/tracked"), ("/localdev/tracked", ""));
    }

    #[test]
    fn query_param_extracts_and_decodes() {
        assert_eq!(query_param("profile=yawnbot-tunnel&tail=20", "profile").as_deref(),
                   Some("yawnbot-tunnel"));
        assert_eq!(query_param("profile=a%2Db", "profile").as_deref(), Some("a-b"));
        assert_eq!(query_param("profile=a", "missing"), None);
    }

    #[test]
    fn json_field_pulls_string_only() {
        assert_eq!(json_field(r#"{"profile":"jekyll"}"#, "profile").as_deref(), Some("jekyll"));
        assert_eq!(json_field(r#"{"profile":"jekyll"}"#, "text"), None);
        assert_eq!(json_field("not json", "profile"), None);
    }

    #[test]
    fn url_decode_basic() {
        assert_eq!(url_decode("a%2Db"), "a-b");
        assert_eq!(url_decode("hello+world"), "hello world");
        assert_eq!(url_decode("plain"), "plain");
    }
}
