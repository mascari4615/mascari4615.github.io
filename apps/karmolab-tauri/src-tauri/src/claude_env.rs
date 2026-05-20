//! Claude 환경 컨트롤 위젯 — TASK-KL-056.
//!
//! v1 = Claude Code Stop/Notification hook 의 사운드 알림 설정을 GUI 로 노출.
//! 정본 = `karmoddrine/memo/dotfiles/claude-hooks/notify-{stop,notification}.ps1`.
//! 변경 흐름: GUI → 정본 .ps1 편집 → `sync-claude-hooks.ps1` 호출 → `~/.claude/hooks/` 배포.
//!
//! Step 1 = read 명령 (skeleton).
//! Step 2 = write + sync (정본 .ps1 한 줄 교체 + sync-claude-hooks.ps1 호출).
//! Step 3 = 미리듣기 (PowerShell shell-out, mode/sound 즉시 재생).
//! Step 4 (별 PR / sub TASK) = .wav drag-drop.
//!
//! 의존성 0 (regex 없이 std + serde 만). `.ps1` 한 줄 파싱은 `$mode = "..."` /
//! `$wavPath = "..."` / `[System.Media.SystemSounds]::<Name>.Play()` 세 종류만 잡는 단순 line scanner.
//!
//! 사용자 입력 sanitize:
//! - mode = "system" | "beep" | "wav" whitelist
//! - system_sound = Asterisk | Beep | Exclamation | Hand | Question whitelist
//! - wav_path = 절대 경로 + .wav/.mp3 확장자 + 따옴표/세미콜론/backtick/$ 거부 (PowerShell 인자 escape).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
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

#[derive(Debug, Deserialize)]
pub struct NotifyConfigInput {
    pub stop: NotifyHookConfig,
    pub notification: NotifyHookConfig,
}

#[derive(Debug, Serialize)]
pub struct WriteResultDto {
    pub canonical_root: String,
    pub sync_stdout: String,
    pub sync_stderr: String,
}

const MODE_WHITELIST: &[&str] = &["system", "beep", "wav"];
const SYSTEM_SOUND_WHITELIST: &[&str] =
    &["Asterisk", "Beep", "Exclamation", "Hand", "Question"];
const HOOK_WHITELIST: &[&str] = &["stop", "notification"];

/// `karmoddrine/memo/dotfiles/` 정본 디렉토리 (sync 스크립트 부모).
fn karmoddrine_dotfiles_dir() -> Result<PathBuf, String> {
    let userprofile = std::env::var("USERPROFILE")
        .map_err(|_| "USERPROFILE 환경 변수 없음 (Windows 전용)".to_string())?;
    let dir = PathBuf::from(userprofile)
        .join("repos")
        .join("karmoddrine")
        .join("memo")
        .join("dotfiles");
    if !dir.exists() {
        return Err(format!(
            "dotfiles 디렉토리 없음: {} — karmoddrine 레포 위치 확인.",
            dir.display()
        ));
    }
    Ok(dir)
}

/// `karmoddrine/memo/dotfiles/claude-hooks/` 정본 디렉토리.
fn karmoddrine_dotfiles_root() -> Result<PathBuf, String> {
    let root = karmoddrine_dotfiles_dir()?.join("claude-hooks");
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

/// `$key = "..."` 라인을 새 value 로 교체. leading whitespace 보존.
/// 매칭 실패 시 None.
fn replace_assignment_value(line: &str, key: &str, new_value: &str) -> Option<String> {
    let leading_len = line.len() - line.trim_start().len();
    let leading = &line[..leading_len];
    let rest = line[leading_len..].strip_prefix(key)?;
    let after_eq = rest.trim_start().strip_prefix('=')?;
    let _ = after_eq.trim_start().strip_prefix('"')?;
    Some(format!("{}{} = \"{}\"", leading, key, new_value))
}

/// `[System.Media.SystemSounds]::OLD.Play()` 라인의 OLD 를 새 sound 로 교체.
fn replace_system_sound(line: &str, new_sound: &str) -> Option<String> {
    let leading_len = line.len() - line.trim_start().len();
    let leading = &line[..leading_len];
    let trimmed = &line[leading_len..];
    let after = trimmed.strip_prefix("[System.Media.SystemSounds]::")?;
    let dot = after.find('.')?;
    let old_name = &after[..dot];
    if old_name.is_empty() || !old_name.chars().all(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    let tail = &after[dot..]; // ".Play()" 그대로
    Some(format!(
        "{}[System.Media.SystemSounds]::{}{}",
        leading, new_sound, tail
    ))
}

fn parse_notify_ps1(path: &Path) -> Result<NotifyHookConfig, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("{} read 실패: {}", path.display(), e))?;
    let content = raw.strip_prefix(PS1_BOM).unwrap_or(raw.as_str());
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

/// 사용자 입력 검증 — 옵션이면 whitelist 확인, wav_path 면 절대 경로 + .wav + 위험 문자 거부.
fn validate_hook_config(label: &str, hook: &NotifyHookConfig) -> Result<(), String> {
    if !MODE_WHITELIST.contains(&hook.mode.as_str()) {
        return Err(format!(
            "{}.mode 값 무효: {:?} (허용 = {:?})",
            label, hook.mode, MODE_WHITELIST
        ));
    }
    if let Some(s) = hook.system_sound.as_deref() {
        if !SYSTEM_SOUND_WHITELIST.contains(&s) {
            return Err(format!(
                "{}.system_sound 값 무효: {:?} (허용 = {:?})",
                label, s, SYSTEM_SOUND_WHITELIST
            ));
        }
    }
    if let Some(p) = hook.wav_path.as_deref() {
        validate_wav_path(label, p)?;
    }
    Ok(())
}

fn validate_wav_path(label: &str, raw: &str) -> Result<(), String> {
    let p = raw.trim();
    if p.is_empty() {
        return Ok(()); // 빈 문자열 = wav 모드 미사용. write 시 기존 라인 유지.
    }
    // 위험 문자 거부 — .ps1 string literal + PowerShell 인자 escape 두 채널 안전.
    for ch in p.chars() {
        if matches!(ch, '"' | '\'' | '`' | '$' | ';' | '\n' | '\r') {
            return Err(format!(
                "{}.wav_path 에 허용되지 않은 문자: {:?}",
                label, ch
            ));
        }
    }
    // 절대 경로 — Windows 는 X:\ 형식 또는 \\ UNC.
    let abs = (p.len() >= 3
        && p.as_bytes()[1] == b':'
        && (p.as_bytes()[2] == b'\\' || p.as_bytes()[2] == b'/'))
        || p.starts_with("\\\\");
    if !abs {
        return Err(format!(
            "{}.wav_path 는 Windows 절대 경로여야 함: {:?}",
            label, p
        ));
    }
    let lower = p.to_ascii_lowercase();
    if !lower.ends_with(".wav") && !lower.ends_with(".mp3") {
        return Err(format!(
            "{}.wav_path 는 .wav / .mp3 확장자만 허용: {:?}",
            label, p
        ));
    }
    Ok(())
}

/// 한 .ps1 파일을 받은 config 로 in-place 편집. 라인 단위 교체, 매칭 안된 라인은 그대로.
/// UTF-8 BOM. PowerShell 5.1 (한국어 Windows) 은 BOM 없는 .ps1 을 시스템
/// 코드페이지(cp949)로 읽어 파일 안 한글 `$wavPath` 가 깨진다 (Test-Path
/// False → hook 무음). BOM 이 있으면 PS5.1 이 UTF-8 로 읽는다 (TASK-KL-056).
const PS1_BOM: &str = "\u{FEFF}";

fn write_notify_ps1(path: &Path, hook: &NotifyHookConfig) -> Result<(), String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("{} read 실패: {}", path.display(), e))?;
    // 기존 BOM 은 일단 제거하고 처리 — write 시 무조건 다시 prepend (정본에
    // BOM 이 없던 경우에도 PS5.1 안전 보장. read_to_string 의 BOM 보존 동작에
    // 의존하지 않음).
    let content = raw.strip_prefix(PS1_BOM).unwrap_or(raw.as_str());
    let line_ending = if content.contains("\r\n") { "\r\n" } else { "\n" };
    let has_final_newline = content.ends_with('\n');

    let mut mode_done = false;
    let mut sound_done = false;
    let mut wav_done = false;

    let new_lines: Vec<String> = content
        .lines()
        .map(|line| {
            if !mode_done {
                if let Some(rep) = replace_assignment_value(line, "$mode", &hook.mode) {
                    mode_done = true;
                    return rep;
                }
            }
            if !sound_done {
                if let Some(new_sound) = hook.system_sound.as_deref() {
                    if let Some(rep) = replace_system_sound(line, new_sound) {
                        sound_done = true;
                        return rep;
                    }
                }
            }
            if !wav_done {
                if let Some(new_wav) = hook.wav_path.as_deref() {
                    if !new_wav.trim().is_empty() {
                        if let Some(rep) = replace_assignment_value(line, "$wavPath", new_wav) {
                            wav_done = true;
                            return rep;
                        }
                    }
                }
            }
            line.to_string()
        })
        .collect();

    if !mode_done {
        return Err(format!(
            "{} 에 $mode 줄이 없음 — 정본 형식 회귀 의심.",
            path.display()
        ));
    }

    let mut joined = String::from(PS1_BOM);
    joined.push_str(&new_lines.join(line_ending));
    if has_final_newline {
        joined.push_str(line_ending);
    }
    std::fs::write(path, joined).map_err(|e| format!("{} write 실패: {}", path.display(), e))?;
    Ok(())
}

/// `sync-claude-hooks.ps1` 호출 → (stdout, stderr).
fn run_sync_claude_hooks() -> Result<(String, String), String> {
    let script = karmoddrine_dotfiles_dir()?.join("sync-claude-hooks.ps1");
    if !script.exists() {
        return Err(format!("sync 스크립트 없음: {}", script.display()));
    }
    let script_str = script.to_string_lossy().into_owned();
    // PowerShell 5.1 (한국어 Windows) 의 default stdout encoding = 시스템 코드페이지(cp949).
    // Rust 는 UTF-8 로 디코드하므로 sync 스크립트의 한글 Write-Host 가 깨진다
    // (`복사 1, 동일 12` → `????`). -File 대신 -Command 로 OutputEncoding 을 UTF-8
    // 강제 후 script 호출 (정본 스크립트 본문은 안 건드림 — 다른 호출처와 분리).
    let ps_command = format!(
        "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; & '{}'",
        script_str.replace('\'', "''")
    );
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        &ps_command,
    ]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("sync-claude-hooks.ps1 spawn 실패: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    if !output.status.success() {
        return Err(format!(
            "sync-claude-hooks.ps1 exit {} — stderr: {}",
            output.status, stderr
        ));
    }
    Ok((stdout, stderr))
}

fn write_notify_config_blocking(input: NotifyConfigInput) -> Result<WriteResultDto, String> {
    validate_hook_config("stop", &input.stop)?;
    validate_hook_config("notification", &input.notification)?;
    let root = karmoddrine_dotfiles_root()?;
    write_notify_ps1(&root.join("notify-stop.ps1"), &input.stop)?;
    write_notify_ps1(&root.join("notify-notification.ps1"), &input.notification)?;
    let (sync_stdout, sync_stderr) = run_sync_claude_hooks()?;
    Ok(WriteResultDto {
        canonical_root: root.to_string_lossy().into_owned(),
        sync_stdout,
        sync_stderr,
    })
}

fn preview_sound_blocking(
    hook: &str,
    mode: &str,
    system_sound: Option<&str>,
    wav_path: Option<&str>,
) -> Result<(), String> {
    if !HOOK_WHITELIST.contains(&hook) {
        return Err(format!(
            "hook 값 무효: {:?} (허용 = {:?})",
            hook, HOOK_WHITELIST
        ));
    }
    if !MODE_WHITELIST.contains(&mode) {
        return Err(format!(
            "mode 값 무효: {:?} (허용 = {:?})",
            mode, MODE_WHITELIST
        ));
    }

    let ps_command: String = match mode {
        "system" => {
            let sound = system_sound.unwrap_or("Asterisk");
            if !SYSTEM_SOUND_WHITELIST.contains(&sound) {
                return Err(format!(
                    "system_sound 값 무효: {:?} (허용 = {:?})",
                    sound, SYSTEM_SOUND_WHITELIST
                ));
            }
            format!(
                "[System.Media.SystemSounds]::{}.Play(); Start-Sleep -Milliseconds 400",
                sound
            )
        }
        "beep" => {
            // hook 별 톤 차이는 정본 .ps1 의 의도를 그대로 재현.
            // notify-stop.ps1: [console]::Beep(880, 150)
            // notify-notification.ps1: [console]::Beep(1200, 100) × 2 (80ms 간격)
            match hook {
                "stop" => "[console]::Beep(880, 150)".to_string(),
                "notification" => {
                    "[console]::Beep(1200, 100); Start-Sleep -Milliseconds 80; [console]::Beep(1200, 100)"
                        .to_string()
                }
                _ => unreachable!("hook whitelist 체크 이후"),
            }
        }
        "wav" => {
            let path = wav_path.unwrap_or("").trim();
            if path.is_empty() {
                return Err("wav 모드 미리듣기에는 wav_path 가 필요합니다.".to_string());
            }
            validate_wav_path(hook, path)?;
            // PowerShell single-quoted string — 내부 ' 는 위에서 reject. 안전.
            // 확장자 분기: .wav = SoundPlayer.PlaySync (안정), .mp3 = WPF
            // MediaPlayer + NaturalDuration 폴링 (정본 notify-*.ps1 과 동일
            // 로직 — preview 가 실제 hook 사운드와 일치하도록).
            format!(
                "$p='{}'; if(Test-Path $p){{ if([System.IO.Path]::GetExtension($p).ToLower() -eq '.wav'){{(New-Object System.Media.SoundPlayer $p).PlaySync()}} else {{ Add-Type -AssemblyName PresentationCore; $m=New-Object System.Windows.Media.MediaPlayer; $m.Open([Uri]$p); $m.Play(); $d=(Get-Date).AddSeconds(10); while(-not $m.NaturalDuration.HasTimeSpan -and (Get-Date) -lt $d){{Start-Sleep -Milliseconds 30}}; if($m.NaturalDuration.HasTimeSpan){{Start-Sleep -Milliseconds ([int]$m.NaturalDuration.TimeSpan.TotalMilliseconds+150)}}; $m.Stop(); $m.Close() }} }} else {{ throw \"파일 없음: $p\" }}",
                path
            )
        }
        _ => unreachable!("mode whitelist 체크 이후"),
    };

    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        &ps_command,
    ]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("preview powershell spawn 실패: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        return Err(format!(
            "preview exit {} — stderr: {}",
            output.status, stderr
        ));
    }
    Ok(())
}

/// 정본 .ps1 두 개 R/O — async + spawn_blocking (KL-043 룰).
/// 같은 파일의 write 버전 (`claude_env_write_notify_config`) 도 동일 패턴.
#[tauri::command]
pub async fn claude_env_read_notify_config() -> Result<NotifyConfigDto, String> {
    tauri::async_runtime::spawn_blocking(read_notify_config_blocking)
        .await
        .map_err(|e| format!("read spawn_blocking join 실패: {}", e))?
}

fn read_notify_config_blocking() -> Result<NotifyConfigDto, String> {
    let root = karmoddrine_dotfiles_root()?;
    let stop = parse_notify_ps1(&root.join("notify-stop.ps1"))?;
    let notification = parse_notify_ps1(&root.join("notify-notification.ps1"))?;
    Ok(NotifyConfigDto {
        stop,
        notification,
        canonical_root: root.to_string_lossy().into_owned(),
    })
}

/// 정본 .ps1 두 개를 받은 config 로 편집 + `sync-claude-hooks.ps1` 호출.
/// IO 무거움 (.ps1 R/W + external PowerShell spawn) — async + spawn_blocking (KL-043 룰).
#[tauri::command]
pub async fn claude_env_write_notify_config(
    config: NotifyConfigInput,
) -> Result<WriteResultDto, String> {
    tauri::async_runtime::spawn_blocking(move || write_notify_config_blocking(config))
        .await
        .map_err(|e| format!("write spawn_blocking join 실패: {}", e))?
}

/// mode/sound 미리듣기 — 사용자가 저장 전에 「어떻게 들리는지」 확인용.
/// PowerShell shell-out — async + spawn_blocking.
#[tauri::command]
pub async fn claude_env_preview_sound(
    hook: String,
    mode: String,
    system_sound: Option<String>,
    wav_path: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        preview_sound_blocking(&hook, &mode, system_sound.as_deref(), wav_path.as_deref())
    })
    .await
    .map_err(|e| format!("preview spawn_blocking join 실패: {}", e))?
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

    #[test]
    fn replace_assignment_preserves_indent_and_changes_value() {
        assert_eq!(
            replace_assignment_value(r#"$mode = "system""#, "$mode", "beep"),
            Some(r#"$mode = "beep"#.to_string() + "\"")
        );
        assert_eq!(
            replace_assignment_value(
                r#"    $wavPath = "C:\old\path.wav""#,
                "$wavPath",
                r"C:\new\sound.wav"
            ),
            Some(r#"    $wavPath = "C:\new\sound.wav""#.to_string())
        );
        assert_eq!(
            replace_assignment_value("Start-Sleep", "$mode", "beep"),
            None
        );
    }

    #[test]
    fn replace_system_sound_swaps_name_preserves_indent_and_play() {
        assert_eq!(
            replace_system_sound(
                "        [System.Media.SystemSounds]::Asterisk.Play()",
                "Exclamation"
            ),
            Some("        [System.Media.SystemSounds]::Exclamation.Play()".to_string())
        );
        assert_eq!(
            replace_system_sound("[System.Media.SystemSounds]::Hand.Play()", "Question"),
            Some("[System.Media.SystemSounds]::Question.Play()".to_string())
        );
        assert_eq!(replace_system_sound("Start-Sleep -Milliseconds 400", "Beep"), None);
    }

    #[test]
    fn validate_wav_path_rejects_dangerous_chars() {
        assert!(validate_wav_path("stop", r"C:\ok\sound.wav").is_ok());
        assert!(validate_wav_path("stop", "").is_ok()); // empty = unused
        assert!(validate_wav_path("stop", r#"C:\bad"path.wav"#).is_err());
        assert!(validate_wav_path("stop", "C:\\bad`path.wav").is_err());
        assert!(validate_wav_path("stop", "C:\\bad;path.wav").is_err());
        assert!(validate_wav_path("stop", "C:\\bad$path.wav").is_err());
        assert!(validate_wav_path("stop", "relative\\bar.wav").is_err());
        // .mp3 허용 (KL-059 — WPF MediaPlayer 다포맷)
        assert!(validate_wav_path("stop", r"C:\sound\beep.mp3").is_ok());
        assert!(validate_wav_path("stop", r"C:\sound\UP.MP3").is_ok());
        // 그 외 확장자는 여전히 거부
        assert!(validate_wav_path("stop", r"C:\not-audio.ogg").is_err());
        assert!(validate_wav_path("stop", r"C:\not-audio.txt").is_err());
    }

    #[test]
    fn validate_hook_config_rejects_invalid_whitelist() {
        let bad_mode = NotifyHookConfig {
            mode: "yelling".into(),
            system_sound: None,
            wav_path: None,
        };
        assert!(validate_hook_config("stop", &bad_mode).is_err());

        let bad_sound = NotifyHookConfig {
            mode: "system".into(),
            system_sound: Some("CustomLoud".into()),
            wav_path: None,
        };
        assert!(validate_hook_config("stop", &bad_sound).is_err());

        let ok = NotifyHookConfig {
            mode: "wav".into(),
            system_sound: Some("Asterisk".into()),
            wav_path: Some(r"C:\Users\masca\.claude\hooks\sounds\stop.wav".into()),
        };
        assert!(validate_hook_config("stop", &ok).is_ok());
    }

    #[test]
    fn write_notify_ps1_replaces_three_lines_round_trip() {
        let dir = std::env::temp_dir().join(format!(
            "kl-056-write-test-{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("notify-stop.ps1");
        std::fs::write(
            &path,
            "# header\n$mode = \"system\"\n[System.Media.SystemSounds]::Asterisk.Play()\n$wavPath = \"C:\\old.wav\"\n",
        )
        .unwrap();

        let cfg = NotifyHookConfig {
            mode: "wav".into(),
            system_sound: Some("Exclamation".into()),
            wav_path: Some(r"C:\new.wav".into()),
        };
        write_notify_ps1(&path, &cfg).unwrap();
        let result = std::fs::read_to_string(&path).unwrap();
        assert!(result.contains("$mode = \"wav\""));
        assert!(result.contains("[System.Media.SystemSounds]::Exclamation.Play()"));
        assert!(result.contains(r#"$wavPath = "C:\new.wav""#));
        // round-trip parse
        let parsed = parse_notify_ps1(&path).unwrap();
        assert_eq!(parsed.mode, "wav");
        assert_eq!(parsed.system_sound.as_deref(), Some("Exclamation"));
        assert_eq!(parsed.wav_path.as_deref(), Some(r"C:\new.wav"));

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn write_notify_ps1_always_prepends_utf8_bom() {
        let dir = std::env::temp_dir().join(format!("kl-056-bom-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);

        // 케이스 1: BOM 없는 정본 → write 후 BOM 붙어야 함 (PS5.1 한글 깨짐 방지).
        let no_bom = dir.join("no-bom.ps1");
        std::fs::write(&no_bom, "$mode = \"wav\"\n$wavPath = \"C:\\a.wav\"\n").unwrap();
        let cfg = NotifyHookConfig {
            mode: "wav".into(),
            system_sound: None,
            wav_path: Some(r"C:\korean\피팟.wav".into()),
        };
        write_notify_ps1(&no_bom, &cfg).unwrap();
        let bytes = std::fs::read(&no_bom).unwrap();
        assert_eq!(&bytes[0..3], &[0xEF, 0xBB, 0xBF], "BOM 없던 파일에 BOM 추가돼야");

        // 케이스 2: 이미 BOM 있는 정본 → write 후에도 BOM 1개만 (중복 X).
        let with_bom = dir.join("with-bom.ps1");
        std::fs::write(
            &with_bom,
            "\u{FEFF}$mode = \"system\"\n[System.Media.SystemSounds]::Asterisk.Play()\n",
        )
        .unwrap();
        write_notify_ps1(&with_bom, &cfg).unwrap();
        let bytes2 = std::fs::read(&with_bom).unwrap();
        assert_eq!(&bytes2[0..3], &[0xEF, 0xBB, 0xBF]);
        assert_ne!(&bytes2[3..6], &[0xEF, 0xBB, 0xBF], "BOM 중복 안 됨");

        // 한글 wav_path 가 round-trip 으로 보존 (BOM strip 후 파싱).
        let parsed = parse_notify_ps1(&no_bom).unwrap();
        assert_eq!(parsed.wav_path.as_deref(), Some(r"C:\korean\피팟.wav"));
        assert_eq!(parsed.mode, "wav");

        let _ = std::fs::remove_file(&no_bom);
        let _ = std::fs::remove_file(&with_bom);
        let _ = std::fs::remove_dir(&dir);
    }
}
