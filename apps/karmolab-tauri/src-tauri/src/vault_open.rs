//! 복호한 파일을 OS 기본 재생기로 넘기기.
//!
//! 왜 필요한가 (2026-08-29 실측):
//! - 저장된 mp4 표본 12개 중 10개가 HEVC. WebView 가 비디오 트랙을 못 품
//! - 소리만 나고 화면은 검음. 오류도 안 남
//! - OS 재생기는 시스템 코덱을 쓰므로 그냥 열림
//!
//! 오가는 것:
//! - 화면이 복호한 바이트와 파일 이름만. 열쇠도 원본 경로도 안 넘어옴
//! - 임시 폴더에 쓰고 그 경로를 재생기에 넘김. 그 뒤는 OS 몫
//!
//! 지우기:
//! - 앱이 뜰 때 우리 임시 폴더 비우기. 재생 중 지우면 재생기가 죽음

use std::io::Write;
use tauri_plugin_shell::ShellExt;

/// 우리가 쓰는 임시 자리. 앱 이름으로 한 칸 파서 남의 것과 안 섞음
fn scratch_dir() -> std::path::PathBuf {
    std::env::temp_dir().join("karmolab-files-view")
}

/// 이름에서 위험한 자리 제거. 경로 조작과 구분자
fn safe_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or("file");
    let cleaned: String = base
        .chars()
        .filter(|c| !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*' | '\0'))
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "file".to_string()
    } else {
        trimmed
    }
}

/// 앱 시작 때 한 번. 지난 판이 남긴 것 정리
pub fn clear_scratch() {
    let dir = scratch_dir();
    if dir.is_dir() {
        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// 바이트를 임시 파일로 쓰고 OS 기본 프로그램으로 열기. 반환은 파일 이름뿐
#[tauri::command]
pub async fn vault_open_external(
    app: tauri::AppHandle,
    name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("빈 파일입니다.".to_string());
    }
    /* 너무 큰 것은 차단. 임시 폴더가 디스크를 먹는 사고 방지 */
    const MAX: usize = 2 * 1024 * 1024 * 1024;
    if bytes.len() > MAX {
        return Err("2GB 를 넘는 파일은 여기서 못 엽니다.".to_string());
    }

    let file_name = safe_name(&name);
    let dir = scratch_dir();
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&dir).map_err(|e| format!("임시 폴더를 못 만듦: {}", e))?;
        let dest = dir.join(&file_name);
        let mut f = std::fs::File::create(&dest).map_err(|e| format!("임시 파일 쓰기 실패: {}", e))?;
        f.write_all(&bytes).map_err(|e| format!("임시 파일 쓰기 실패: {}", e))?;
        f.flush().map_err(|e| format!("임시 파일 쓰기 실패: {}", e))?;
        Ok::<(String, std::path::PathBuf), String>((file_name, dest))
    })
    .await
    .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
    .and_then(|(shown, dest)| {
        let path = dest.to_string_lossy().to_string();
        app.shell()
            .open(&path, None)
            .map_err(|e| format!("기본 프로그램으로 못 엶: {}", e))?;
        Ok(shown)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 이름에서_경로를_걷는다() {
        assert_eq!(safe_name("a/b/c.mp4"), "c.mp4");
        assert_eq!(safe_name("..\\..\\evil.exe"), "evil.exe");
    }

    #[test]
    fn 윈도우가_싫어하는_글자를_뺀다() {
        assert_eq!(safe_name("a:b?c*.mp4"), "abc.mp4");
        assert_eq!(safe_name("   "), "file");
        assert_eq!(safe_name("..."), "file");
    }

    #[test]
    fn 한글_이름은_그대로() {
        assert_eq!(safe_name("영상 하나.mp4"), "영상 하나.mp4");
    }
}
