//! TASK-KL-067 — dev 프론트엔드 in-process 정적 서버.
//!
//! 대체 대상 = 옛 `lib.rs::spawn_dev_static_if_needed` 의 4중 취약:
//!   ① 외부 `node dev-static.mjs` 자식 의존(node PATH/스크립트 경로)
//!   ② `std::mem::forget(child)` leak (앱 죽어도 좀비 생존 → 약한 체크 오판)
//!   ③ 살았는지 판정이 TCP connect 성공만 (좀비/남의 리스너도 "떴다")
//!   ④ setup 1회만 → 한 번 어긋나면 영구 빈 화면 (2026-05-17 incident 실증)
//!
//! 근본 = Rust 프로세스 *안*에서 직접 서빙. 의존성 0 (std `TcpListener`),
//! 경로는 `env!("CARGO_MANIFEST_DIR")` 컴파일타임(설치형/exe 위치 무관),
//! 수명 = 프로세스(daemon thread, leak 없음 — 앱 죽으면 OS 가 회수),
//! 8898 점유 시 *무음 skip 금지* — 실제 HTTP 200 확인 후 정상이면 외부 사용,
//! 아니면 가시 경고. 의미는 `scripts/dev-static.mjs` 와 동일
//! (레포 루트 서빙 / `/` → index.html / no-store / path-under-root 가드).
//!
//! `npm run dev`(concurrently) 와 공존: dev:tauri 가 `wait-on 8898 && tauri dev`
//! 라 node dev:static 이 먼저 8898 바인드 → 여기선 AddrInUse → health 200 →
//! "외부 정상, skip" 로그. 단독/트레이/설치형 실행은 8898 비어 자체 바인드.

#![cfg(debug_assertions)]

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::time::Duration;

const ADDR: &str = "127.0.0.1:8898";

/// setup 에서 호출. 블로킹 X — acceptor 는 detached thread.
pub fn start() {
    let repo_root = match repo_root() {
        Some(p) => p,
        None => {
            eprintln!(
                "[dev-static] ⚠ 레포 루트 해석 실패 (CARGO_MANIFEST_DIR 조상 부족) — dev 서버 미기동"
            );
            return;
        }
    };

    match TcpListener::bind(ADDR) {
        Ok(listener) => {
            eprintln!(
                "[dev-static] in-process 정적 서버 http://{ADDR}/ (root: {})",
                repo_root.display()
            );
            std::thread::Builder::new()
                .name("dev-static".into())
                .spawn(move || serve_loop(listener, repo_root))
                .ok();
        }
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
            // 무음 skip 금지 — 8898 을 잡은 게 *정상 KarmoLab 서버* 인지 실제 HTTP 로 확인.
            if external_is_healthy() {
                eprintln!(
                    "[dev-static] 8898 외부 서버 정상 응답 (npm run dev 병행으로 추정) — in-process skip"
                );
            } else {
                eprintln!(
                    "[dev-static] ⚠ 8898 이 점유됐으나 KarmoLab 을 서빙하지 않음 \
                     (좀비/타 프로세스). dev 창이 빈 화면일 수 있음 — 해당 포트를 비우거나 \
                     앱을 재기동하세요. (옛 incident: 외부 진단서버 점유→kill 잔재)"
                );
            }
        }
        Err(e) => {
            eprintln!("[dev-static] ⚠ 8898 bind 실패: {e} — dev 서버 미기동");
        }
    }
}

/// `CARGO_MANIFEST_DIR` = `<repo>/apps/karmolab-tauri/src-tauri`.
/// 조상: 0=src-tauri 1=karmolab-tauri 2=apps 3=<repo>.
fn repo_root() -> Option<PathBuf> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .map(Path::to_path_buf)
}

/// 8898 에 GET 던져 status 200 인지 (약한 connect-만 판정 폐기).
fn external_is_healthy() -> bool {
    let Ok(mut s) = TcpStream::connect_timeout(
        &ADDR.parse().expect("const addr"),
        Duration::from_millis(400),
    ) else {
        return false;
    };
    let _ = s.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = s.set_write_timeout(Some(Duration::from_millis(400)));
    if s.write_all(
        b"GET /apps/karmolab/index.html HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
    )
    .is_err()
    {
        return false;
    }
    let mut buf = [0u8; 64];
    let Ok(n) = s.read(&mut buf) else {
        return false;
    };
    let head = String::from_utf8_lossy(&buf[..n]);
    head.starts_with("HTTP/1.") && head.contains(" 200")
}

fn serve_loop(listener: TcpListener, repo_root: PathBuf) {
    let root = match std::fs::canonicalize(&repo_root) {
        Ok(p) => p,
        Err(_) => repo_root,
    };
    for stream in listener.incoming() {
        let Ok(stream) = stream else { continue };
        let root = root.clone();
        // connection 당 thread — debug 단일 webview 라 트래픽 미미. 미join = 프로세스와 함께 소멸.
        std::thread::spawn(move || {
            let _ = handle(stream, &root);
        });
    }
}

fn handle(mut stream: TcpStream, root: &Path) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(10))).ok();
    let mut reader = BufReader::new(stream.try_clone()?);

    let mut request_line = String::new();
    if reader.read_line(&mut request_line)? == 0 {
        return Ok(());
    }
    // 나머지 헤더 소진 (body 없음 — GET/HEAD). 빈 줄까지.
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h)? == 0 {
            break;
        }
        if h == "\r\n" || h == "\n" {
            break;
        }
    }

    let mut it = request_line.split_whitespace();
    let method = it.next().unwrap_or("");
    let raw_target = it.next().unwrap_or("/");

    if method != "GET" && method != "HEAD" {
        return write_status(&mut stream, 405, "Method Not Allowed", Some("GET, HEAD"));
    }

    // query / fragment 절단 후 percent-decode.
    let path_part = raw_target
        .split(['?', '#'])
        .next()
        .unwrap_or("/");
    let decoded = match percent_decode(path_part) {
        Some(d) => d,
        None => return write_status(&mut stream, 400, "Bad Request", None),
    };

    let rel = decoded.trim_start_matches('/');
    let rel = if rel.is_empty() { "." } else { rel };
    let candidate = root.join(rel);

    // path-under-root 가드 — 존재하면 canonicalize 비교, 없으면 404.
    let resolved = match std::fs::canonicalize(&candidate) {
        Ok(p) => p,
        Err(_) => return write_status(&mut stream, 404, "Not Found", None),
    };
    if !resolved.starts_with(root) {
        return write_status(&mut stream, 403, "Forbidden", None);
    }

    let meta = std::fs::metadata(&resolved)?;
    let file_path = if meta.is_dir() {
        let idx = resolved.join("index.html");
        match std::fs::canonicalize(&idx) {
            Ok(p) if p.starts_with(root) && p.is_file() => p,
            _ => return write_status(&mut stream, 404, "Not Found", None),
        }
    } else if meta.is_file() {
        resolved
    } else {
        return write_status(&mut stream, 404, "Not Found", None);
    };

    let bytes = match std::fs::read(&file_path) {
        Ok(b) => b,
        Err(_) => return write_status(&mut stream, 500, "Internal Server Error", None),
    };
    let ct = mime_for(&file_path);
    let head = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: {ct}\r\n\
         Content-Length: {}\r\n\
         Cache-Control: no-store, no-cache, must-revalidate\r\n\
         Connection: close\r\n\r\n",
        bytes.len()
    );
    stream.write_all(head.as_bytes())?;
    if method == "GET" {
        stream.write_all(&bytes)?;
    }
    stream.flush()
}

fn write_status(
    stream: &mut TcpStream,
    code: u16,
    text: &str,
    allow: Option<&str>,
) -> std::io::Result<()> {
    let allow_h = allow.map(|a| format!("Allow: {a}\r\n")).unwrap_or_default();
    let body = format!("{code} {text}");
    let resp = format!(
        "HTTP/1.1 {code} {text}\r\n\
         Content-Type: text/plain; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         {allow_h}\
         Cache-Control: no-store\r\n\
         Connection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(resp.as_bytes())?;
    stream.flush()
}

/// `scripts/dev-static.mjs` MIME 표와 동일 부분집합.
fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("html") | Some("htm") => "text/html; charset=utf-8",
        Some("js") | Some("mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("txt") => "text/plain; charset=utf-8",
        Some("md") => "text/markdown; charset=utf-8",
        Some("map") => "application/json",
        Some("webmanifest") => "application/manifest+json",
        Some("xml") => "application/xml; charset=utf-8",
        Some("wasm") => "application/wasm",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    }
}

/// 최소 percent-decode (UTF-8 바이트 단위). 잘못된 시퀀스 = None → 400.
fn percent_decode(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' => {
                if i + 2 >= b.len() {
                    return None;
                }
                let hi = (b[i + 1] as char).to_digit(16)?;
                let lo = (b[i + 2] as char).to_digit(16)?;
                out.push((hi * 16 + lo) as u8);
                i += 3;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}
