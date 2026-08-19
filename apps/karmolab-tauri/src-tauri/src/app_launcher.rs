//! 설치된 프로그램 실행 · 설치 여부 확인 (TASK-KL-330 — 즐겨찾기 「앱」).
//!
//! **왜 데스크톱에만 있나.** 브라우저는 설치 여부를 알려 주지 않는다 — 스킴 열거는
//! 지문채취 벡터라 2021 scheme-flood 패치 때 전부 닫혔고, `registerProtocolHandler`
//! 에는 조회 API 가 없다. 웹에서 할 수 있는 것은 「눌러 보고 안 열리면 짐작」뿐이라
//! 즐겨찾기에는 못 쓴다(미등록 스킴 클릭 = 조용히 아무 일도 안 남). 그래서 웹은
//! *선언형*(사용자가 담은 것만 뜬다), 앱은 여기서 **실제로** 확인한다.
//!
//! 확인 경로 두 갈래:
//!   ① URI 스킴 — 레지스트리 `HKCR\<스킴>\shell\open\command` 존재 + 그 exe 존재
//!   ② 실행 파일 — 절대경로면 존재 검사, 맨 이름이면 PATH 훑기
//!
//! 레지스트리는 `reg query` 가 아니라 windows-sys 를 직접 쓴다. `reg.exe` 출력은
//! 콘솔 코드페이지(한국어 = CP949)라 `C:\Users\마스카\…` 같은 경로가 깨진다 —
//! W(UTF-16) API 는 그 문제가 없다. (KL-055 windows-sys 이관 방향과도 정합.)

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// 즐겨찾기 「앱」 항목 하나가 무엇으로 열리는가. 스킴·실행파일 중 하나면 된다.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct LaunchSpec {
    /// `discord` 또는 `discord://` — 둘 다 받는다.
    pub scheme: Option<String>,
    /// 실행 파일 경로 또는 PATH 에 있는 이름(`code`).
    pub exec: Option<String>,
    /// exec 인자. 스킴으로 열 때는 안 쓴다 (스킴 자체가 인자다).
    pub args: Option<Vec<String>>,
}

/// 이 PC 에 실제로 등록돼 있는 앱 한 칸 (담기 목록에 뿌린다).
#[derive(Debug, Clone, Serialize)]
pub struct InstalledApp {
    /// URI 스킴 (`discord`) — 열 때 쓰는 것.
    pub scheme: String,
    /// 사람이 읽는 이름. exe 파일 이름에서 뽑는다 (`Discord.exe` → `Discord`).
    pub label: String,
    /// 실행 파일 절대경로 (뱃지·중복 제거용).
    pub exec: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// 레지스트리 (Windows)
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(windows)]
mod reg {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CLASSES_ROOT,
        KEY_READ, REG_SZ,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    struct Key(HKEY);
    impl Drop for Key {
        fn drop(&mut self) {
            unsafe { RegCloseKey(self.0) };
        }
    }

    fn open(root: HKEY, sub: &str) -> Option<Key> {
        let mut h: HKEY = std::ptr::null_mut();
        let rc = unsafe { RegOpenKeyExW(root, wide(sub).as_ptr(), 0, KEY_READ, &mut h) };
        if rc == ERROR_SUCCESS { Some(Key(h)) } else { None }
    }

    /// 값 하나를 문자열로. 없으면 None. (REG_SZ / REG_EXPAND_SZ 둘 다 문자열로 본다.)
    fn value(key: &Key, name: Option<&str>) -> Option<String> {
        let name_w = name.map(wide);
        let name_ptr = name_w.as_ref().map_or(std::ptr::null(), |v| v.as_ptr());
        let mut ty: u32 = 0;
        let mut len: u32 = 0;
        let rc = unsafe {
            RegQueryValueExW(key.0, name_ptr, std::ptr::null_mut(), &mut ty, std::ptr::null_mut(), &mut len)
        };
        if rc != ERROR_SUCCESS {
            return None;
        }
        // REG_SZ(1) / REG_EXPAND_SZ(2) 만. 이진 값이 문자열인 척하면 쓰레기가 나온다.
        if ty != REG_SZ && ty != 2 {
            return None;
        }
        // len = 바이트. UTF-16 이라 2 로 나눈다(홀수 바이트는 올림).
        let mut buf: Vec<u16> = vec![0; ((len as usize) + 1) / 2 + 1];
        let mut len2 = len;
        let rc = unsafe {
            RegQueryValueExW(
                key.0,
                name_ptr,
                std::ptr::null_mut(),
                &mut ty,
                buf.as_mut_ptr().cast(),
                &mut len2,
            )
        };
        if rc != ERROR_SUCCESS {
            return None;
        }
        let n = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..n]))
    }

    /// `HKCR\<스킴>` 이 URL 프로토콜이고 여는 명령이 있으면 그 명령줄을 준다.
    pub fn protocol_command(scheme: &str) -> Option<String> {
        let key = open(HKEY_CLASSES_ROOT, scheme)?;
        // "URL Protocol" 값이 있어야 진짜 프로토콜이다 (빈 문자열이 정상 — 존재가 표시다).
        value(&key, Some("URL Protocol"))?;
        drop(key);
        let cmd = open(HKEY_CLASSES_ROOT, &format!("{scheme}\\shell\\open\\command"))?;
        let line = value(&cmd, None)?;
        if line.trim().is_empty() { None } else { Some(line) }
    }

    /// HKCR 1단계 자식 이름 전부. (스킴 후보 — 대부분은 확장자·ProgID 라 뒤에서 거른다.)
    pub fn class_roots() -> Vec<String> {
        let Some(root) = open(HKEY_CLASSES_ROOT, "") else {
            return Vec::new();
        };
        let mut out = Vec::new();
        let mut idx: u32 = 0;
        let mut buf: Vec<u16> = vec![0; 256];
        loop {
            let mut len = buf.len() as u32;
            let rc = unsafe {
                RegEnumKeyExW(
                    root.0,
                    idx,
                    buf.as_mut_ptr(),
                    &mut len,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                )
            };
            if rc != ERROR_SUCCESS {
                break;
            }
            out.push(String::from_utf16_lossy(&buf[..len as usize]));
            idx += 1;
        }
        out
    }
}

#[cfg(not(windows))]
mod reg {
    pub fn protocol_command(_scheme: &str) -> Option<String> {
        None
    }
    pub fn class_roots() -> Vec<String> {
        Vec::new()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 명령줄 → 실행 파일
// ─────────────────────────────────────────────────────────────────────────────

/// `"C:\…\Discord.exe" --url -- "%1"` → `C:\…\Discord.exe`.
/// 따옴표가 없으면 첫 공백까지 — 그런 명령줄은 경로에 공백이 없다는 뜻이다.
fn exe_of(command_line: &str) -> Option<String> {
    let s = command_line.trim();
    if let Some(rest) = s.strip_prefix('"') {
        let end = rest.find('"')?;
        return Some(rest[..end].to_string());
    }
    let first = s.split_whitespace().next()?;
    Some(first.to_string())
}

/// exe 파일 이름에서 사람이 읽을 이름. `Discord.exe` → `Discord`.
fn label_of(exe: &str) -> String {
    Path::new(exe)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| exe.to_string())
}

/// 담기 목록에 **안** 띄울 스킴. OS 가 자기용으로 박아 둔 것들 — 수백 개라
/// 안 거르면 목록이 `ms-…` 로 뒤덮여 쓸 수 없다.
fn is_noise_scheme(s: &str) -> bool {
    let l = s.to_ascii_lowercase();
    if l.starts_with('.') || l.contains(' ') {
        return true; // 확장자·ProgID
    }
    // `discord-1433324872871706695` 같은 게임 초대용 스킴 — 앱이 자기 id 로 하나씩
    // 더 박아 둔 것이라 목록에 뜨면 같은 앱이 두 번 나온다.
    if l.rsplit('-').next().is_some_and(|tail| tail.len() >= 8 && tail.bytes().all(|b| b.is_ascii_digit())) {
        return true;
    }
    const PREFIX: &[&str] = &[
        "ms-", "microsoft-", "windows", "shell", "app", "bingnews", "assistantcontenthandler",
    ];
    const EXACT: &[&str] = &[
        "http", "https", "ftp", "file", "mailto", "tel", "callto", "sms", "news", "nntp", "ldap",
        "search", "search-ms", "insightsprotocolhandler", "wcx", "res", "mso", "onenote",
    ];
    PREFIX.iter().any(|p| l.starts_with(p)) || EXACT.iter().any(|e| l == *e)
}

/// 시스템 폴더 안의 exe 인가. (`rundll32`·`explorer` 같은 OS 손잡이 = 앱이 아니다.)
fn is_system_exe(exe: &str) -> bool {
    let l = exe.to_ascii_lowercase().replace('/', "\\");
    l.contains("\\windows\\system32\\")
        || l.contains("\\windows\\syswow64\\")
        || l.contains("\\windows\\explorer.exe")
        || l.contains("\\windowsapps\\") && l.contains("microsoft.")
}

/// PATH 에서 맨 이름 찾기. (`code` → `…\bin\code.cmd`)
fn which(name: &str) -> Option<PathBuf> {
    let exts: Vec<String> = if cfg!(windows) {
        std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".EXE;.CMD;.BAT;.COM".into())
            .split(';')
            .filter(|e| !e.is_empty())
            .map(|e| e.to_ascii_lowercase())
            .collect()
    } else {
        vec![String::new()]
    };
    let has_ext = Path::new(name).extension().is_some();
    for dir in std::env::split_paths(&std::env::var_os("PATH")?) {
        let base = dir.join(name);
        if has_ext && base.is_file() {
            return Some(base);
        }
        for ext in &exts {
            let cand = dir.join(format!("{name}{ext}"));
            if cand.is_file() {
                return Some(cand);
            }
        }
    }
    None
}

/// exec 가 실제로 있는가. 절대·상대 경로면 파일 존재, 맨 이름이면 PATH.
fn exec_exists(exec: &str) -> bool {
    let p = Path::new(exec);
    if p.is_absolute() || exec.contains('/') || exec.contains('\\') {
        return p.is_file();
    }
    which(exec).is_some()
}

/// `discord` / `discord://` / `discord:` → `discord`
fn normalize_scheme(raw: &str) -> String {
    raw.trim()
        .trim_end_matches('/')
        .trim_end_matches(':')
        .split(':')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri commands
// ─────────────────────────────────────────────────────────────────────────────

/// 이 PC 에 등록된 앱 목록. 즐겨찾기 「앱 담기」 칸이 이걸 뿌린다.
///
/// 레지스트리 1단계가 수천 칸이라 UI 스레드에서 돌리면 안 된다 (KL-084 규율).
#[tauri::command]
pub async fn app_list_installed() -> Result<Vec<InstalledApp>, String> {
    tauri::async_runtime::spawn_blocking(list_installed_blocking)
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {e}"))
}

fn list_installed_blocking() -> Vec<InstalledApp> {
    let mut found: Vec<InstalledApp> = Vec::new();
    for scheme in reg::class_roots() {
        if is_noise_scheme(&scheme) {
            continue;
        }
        let Some(cmd) = reg::protocol_command(&scheme) else {
            continue;
        };
        let Some(exe) = exe_of(&cmd) else { continue };
        if is_system_exe(&exe) || !Path::new(&exe).is_file() {
            continue;
        }
        found.push(InstalledApp {
            label: label_of(&exe),
            scheme: scheme.to_ascii_lowercase(),
            exec: exe,
        });
    }
    // 같은 exe 를 여러 스킴이 가리키면 한 칸만 (짧은 스킴 = 대개 대표 이름).
    found.sort_by(|a, b| {
        a.exec
            .to_ascii_lowercase()
            .cmp(&b.exec.to_ascii_lowercase())
            .then(a.scheme.len().cmp(&b.scheme.len()))
            .then(a.scheme.cmp(&b.scheme))
    });
    found.dedup_by(|a, b| a.exec.eq_ignore_ascii_case(&b.exec));
    found.sort_by(|a, b| a.label.to_lowercase().cmp(&b.label.to_lowercase()));
    found
}

/// 즐겨찾기 앱 한 칸이 이 PC 에 있는가 (뱃지용).
#[tauri::command]
pub async fn app_check(spec: LaunchSpec) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || check_blocking(&spec))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {e}"))
}

fn check_blocking(spec: &LaunchSpec) -> bool {
    if let Some(exec) = spec.exec.as_deref().filter(|s| !s.trim().is_empty()) {
        return exec_exists(exec);
    }
    let Some(scheme) = spec.scheme.as_deref() else {
        return false;
    };
    let scheme = normalize_scheme(scheme);
    if scheme.is_empty() {
        return false;
    }
    // 스킴 키만 있고 여는 명령이 없는 경우가 실제로 있다 (이 PC 의 `claude://`).
    // 「등록됨」으로 세면 눌러도 아무 일이 안 일어나는 초록 뱃지가 된다.
    match reg::protocol_command(&scheme).and_then(|cmd| exe_of(&cmd)) {
        Some(exe) => Path::new(&exe).is_file(),
        None => false,
    }
}

/// 앱 실행. exec 이 있으면 그걸 직접, 없으면 스킴을 OS 에 넘긴다.
#[tauri::command]
pub async fn app_launch(spec: LaunchSpec) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || launch_blocking(&spec))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {e}"))?
}

fn launch_blocking(spec: &LaunchSpec) -> Result<(), String> {
    if let Some(exec) = spec.exec.as_deref().filter(|s| !s.trim().is_empty()) {
        if !exec_exists(exec) {
            return Err(format!("실행 파일을 못 찾았어요: {exec}"));
        }
        let mut cmd = std::process::Command::new(exec);
        if let Some(args) = &spec.args {
            cmd.args(args);
        }
        // 실행만 하고 손을 뗀다 — 앱이 KarmoLab 을 따라 죽거나 stdout 이
        // 파이프에 차서 멎으면 안 된다.
        cmd.stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        cmd.spawn().map(|_| ()).map_err(|e| format!("실행 실패: {e}"))
    } else if let Some(raw) = spec.scheme.as_deref().filter(|s| !s.trim().is_empty()) {
        let scheme = normalize_scheme(raw);
        if scheme.is_empty() {
            return Err("스킴이 비었어요".into());
        }
        if reg::protocol_command(&scheme).is_none() && cfg!(windows) {
            return Err(format!("{scheme}:// 를 여는 앱이 이 PC 에 없어요"));
        }
        // 원문에 경로가 붙어 있으면(`steam://open/main`) 그대로 살린다.
        let target = if raw.contains(':') { raw.trim().to_string() } else { format!("{scheme}://") };
        open::that(&target).map_err(|e| format!("못 열었어요: {e}"))
    } else {
        Err("무엇을 열지가 안 적혀 있어요 (scheme·exec 둘 다 없음)".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exe_of_handles_quoted_path_with_spaces() {
        let line = r#""C:\Program Files\App\App.exe" --open-url -- "%1""#;
        assert_eq!(exe_of(line).unwrap(), r"C:\Program Files\App\App.exe");
    }

    #[test]
    fn exe_of_handles_bare_path() {
        assert_eq!(exe_of(r"C:\bin\a.exe %1").unwrap(), r"C:\bin\a.exe");
    }

    #[test]
    fn label_of_strips_dir_and_ext() {
        assert_eq!(label_of(r"C:\Users\x\Discord.exe"), "Discord");
    }

    #[test]
    fn normalize_scheme_accepts_three_shapes() {
        for raw in ["discord", "discord:", "discord://"] {
            assert_eq!(normalize_scheme(raw), "discord");
        }
        assert_eq!(normalize_scheme("Steam://open/main"), "steam");
    }

    #[test]
    fn noise_schemes_are_dropped() {
        for s in ["ms-settings", "http", "https", ".txt", "windows.protocol", "discord-1433324872871706695"] {
            assert!(is_noise_scheme(s), "{s} 는 걸러야 한다");
        }
        for s in ["discord", "steam", "vscode", "claude-cli"] {
            assert!(!is_noise_scheme(s), "{s} 는 남아야 한다");
        }
    }

    #[test]
    fn system_exe_is_not_an_app() {
        assert!(is_system_exe(r"C:\Windows\System32\rundll32.exe"));
        assert!(!is_system_exe(r"C:\Users\x\AppData\Local\Discord\Discord.exe"));
    }

    #[test]
    fn empty_spec_is_an_error_not_a_silent_noop() {
        let err = launch_blocking(&LaunchSpec::default()).unwrap_err();
        assert!(err.contains("scheme"), "무엇이 빠졌는지 말해야 한다: {err}");
    }

    #[test]
    fn missing_exec_is_reported() {
        let spec = LaunchSpec {
            exec: Some(r"C:\nope\definitely-not-here-9f3a.exe".into()),
            ..Default::default()
        };
        assert!(launch_blocking(&spec).is_err());
    }

    /// 이 PC 에 뭐가 잡히는지 눈으로 본다. 결과가 머신마다 다르므로 CI 에서는 안 돈다:
    /// `cargo test --lib -- --ignored --nocapture app_launcher`
    #[test]
    #[ignore]
    fn list_installed_smoke() {
        let apps = list_installed_blocking();
        for a in &apps {
            println!("{:<24} {:<12} {}", a.label, a.scheme, a.exec);
        }
        println!("총 {}", apps.len());
    }

    #[test]
    fn check_is_false_when_nothing_is_specified() {
        assert!(!check_blocking(&LaunchSpec::default()));
    }
}
