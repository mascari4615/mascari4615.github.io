//! Claude 환경 컨트롤 위젯 — TASK-KL-056.
//!
//! v1 = Claude Code Stop/Notification hook 의 사운드 알림 설정을 GUI 로 노출.
//! 정본 = `karmoddrine/memo/dotfiles/claude-hooks/notify-{stop,notification}.ps1`.
//! 변경 흐름: GUI → 정본 .ps1 편집 → `sync-claude-hooks.ps1` 호출 → `~/.claude/hooks/` 배포.
//!
//! Step 1 = read 명령만. write / preview / wav drag-drop 은 후속 Step (KL-056 sub).
//!
//! 의존성 0 (regex 없이 std 만). `.ps1` 한 줄 파싱은 `$mode = "..."` / `$wavPath = "..."` /
//! `[System.Media.SystemSounds]::<Name>.Play()` 세 종류만 잡는 단순 line scanner.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct NotifyHookConfig {
    /// "system" | "beep" | "wav"
    pub mode: String,
    /// `$mode = "system"` 일 때 의미. Asterisk / Beep / Exclamation / Hand / Question.
    pub system_sound: Option<String>,
    /// `$mode = "wav"` 일 때 의미.
    pub wav_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct NotifyConfigDto {
    pub stop: NotifyHookConfig,
    pub notification: NotifyHookConfig,
    /// 정본 디렉토리 (UI 표시용 — 사용자가 「어디서 편집되는지」 보기 위함).
    pub canonical_root: String,
}

/// `karmoddrine/memo/dotfiles/claude-hooks/` 정본 디렉토리.
/// USERPROFILE 기준 `repos/karmoddrine/memo/dotfiles/claude-hooks` 시도.
fn karmoddrine_dotfiles_root() -> Result<PathBuf, String> {
    let userprofile = std::env::var("USERPROFILE")
        .map_err(|_| "USERPROFILE 환경 변수 없음 (Windows 전용)".to_string())?;
    let root = PathBuf::from(userprofile)
        .join("repos")
        .join("karmoddrine")
        .join("memo")
        .join("dotfiles")
        .join("claude-hooks");
    if !root.exists() {
        return Err(format!(
            "정본 디렉토리 없음: {} — karmoddrine 레포 위치 확인.",
            root.display()
        ));
    }
    Ok(root)
}

/// `$key = "value"` 형식에서 value 추출. value 안에 escaped quote 없다고 가정.
fn extract_assignment_value(line: &str, key: &str) -> Option<String> {
    let trimmed = line.trim_start();
    let rest = trimmed.strip_prefix(key)?;
    let after_eq = rest.trim_start().strip_prefix('=')?;
    let after_quote = after_eq.trim_start().strip_prefix('"')?;
    let end = after_quote.find('"')?;
    Some(after_quote[..end].to_string())
}

/// `[System.Media.SystemSounds]::<Name>.Play()` 의 Name 추출.
fn extract_system_sound(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let after = trimmed.strip_prefix("[System.Media.SystemSounds]::")?;
    let dot = after.find('.')?;
    let name = &after[..dot];
    if !name.is_empty() && name.chars().all(|c| c.is_ascii_alphabetic()) {
        Some(name.to_string())
    } else {
        None
    }
}

fn parse_notify_ps1(path: &PathBuf) -> Result<NotifyHookConfig, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("{} read 실패: {}", path.display(), e))?;
    let mut mode: Option<String> = None;
    let mut system_sound: Option<String> = None;
    let mut wav_path: Option<String> = None;

    for line in content.lines() {
        if mode.is_none() {
            mode = extract_assignment_value(line, "$mode");
        }
        if wav_path.is_none() {
            wav_path = extract_assignment_value(line, "$wavPath");
        }
        if system_sound.is_none() {
            system_sound = extract_system_sound(line);
        }
    }

    let mode = mode.ok_or_else(|| format!("$mode 줄을 찾지 못함: {}", path.display()))?;
    Ok(NotifyHookConfig {
        mode,
        system_sound,
        wav_path,
    })
}

#[tauri::command]
pub fn claude_env_read_notify_config() -> Result<NotifyConfigDto, String> {
    let root = karmoddrine_dotfiles_root()?;
    let stop = parse_notify_ps1(&root.join("notify-stop.ps1"))?;
    let notification = parse_notify_ps1(&root.join("notify-notification.ps1"))?;
    Ok(NotifyConfigDto {
        stop,
        notification,
        canonical_root: root.to_string_lossy().into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_assignment_picks_first_quoted_value() {
        assert_eq!(
            extract_assignment_value(r#"$mode = "system""#, "$mode"),
            Some("system".to_string())
        );
        assert_eq!(
            extract_assignment_value(r#"    $wavPath = "C:\Users\foo\bar.wav""#, "$wavPath"),
            Some(r"C:\Users\foo\bar.wav".to_string())
        );
        assert_eq!(extract_assignment_value(r#"$other = "x""#, "$mode"), None);
    }

    #[test]
    fn extract_system_sound_picks_play_name() {
        assert_eq!(
            extract_system_sound("        [System.Media.SystemSounds]::Asterisk.Play()"),
            Some("Asterisk".to_string())
        );
        assert_eq!(
            extract_system_sound("[System.Media.SystemSounds]::Exclamation.Play()"),
            Some("Exclamation".to_string())
        );
        assert_eq!(extract_system_sound("Start-Sleep -Milliseconds 400"), None);
    }
}
