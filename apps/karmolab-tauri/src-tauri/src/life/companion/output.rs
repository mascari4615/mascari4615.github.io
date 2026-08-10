//! sub-G — log append (`<memo>/life/companion/log/<date>.md`).
//!
//! 형식 (memory.rs 와 정합):
//! ```text
//! # <date> — companion log
//! 임시 페르소나 (WM 4 차용). 정식 결정 = TASK-LIFE-001-G follow-up.
//!
//! ## <timestamp> [<persona-id>]
//!
//! <response>
//!
//! <small><channel>: `<binary-name>` · domain: <a,b> · app: <app></small>
//! ```

use std::fs;
use std::io::Write;
use std::path::Path;

use super::persona::Persona;
use super::ReactInput;

pub fn append_log(
    companion_root: &Path,
    input: &ReactInput,
    persona: &Persona,
    response: &str,
) -> Result<(), String> {
    let log_dir = companion_root.join("log");
    fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;

    let date = input.timestamp.format("%Y-%m-%d").to_string();
    let log_path = log_dir.join(format!("{}.md", date));
    let exists = log_path.exists();

    if !exists {
        let header = format!(
            "# {date} — companion log\n\n임시 페르소나 (WM 4 차용). 정식 결정 = TASK-LIFE-001-G follow-up.\n",
            date = date
        );
        fs::write(&log_path, header).map_err(|e| e.to_string())?;
    }

    let binary_name = input
        .binary_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    let domain_str = if input.domain.is_empty() {
        "(none)".to_string()
    } else {
        input.domain.join(",")
    };
    // 채널 라벨 (screenshot / voice / 기타). 음성 entry 면 active app 대신 transcript 일부 노출.
    let channel_label = match input.channel {
        "screenshot" | "voice" => input.channel,
        _ => "binary",
    };
    let context_field = if input.channel == "voice" {
        let snippet: String = input
            .transcript
            .map(|t| t.trim())
            .unwrap_or("")
            .chars()
            .take(60)
            .collect();
        format!(
            "transcript: {}",
            if snippet.is_empty() { "(없음)" } else { &snippet }
        )
    } else {
        format!("app: {}", input.app.unwrap_or("(?)"))
    };

    let entry = format!(
        "\n## {ts} [{pid}]\n\n{response}\n\n<small>{clabel}: `{bin}` · domain: {domain} · {ctx}</small>\n",
        ts = input.timestamp.format("%Y-%m-%d %H:%M:%S"),
        pid = persona.id,
        response = response,
        clabel = channel_label,
        bin = binary_name,
        domain = domain_str,
        ctx = context_field,
    );

    let mut file = fs::OpenOptions::new()
        .append(true)
        .open(&log_path)
        .map_err(|e| e.to_string())?;
    file.write_all(entry.as_bytes()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn append_screenshot_creates_and_appends() {
        let tmp = std::env::temp_dir().join(format!(
            "life-companion-out-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&tmp).unwrap();

        let persona = Persona {
            id: "ring".into(),
            name: "링".into(),
            silence: false,
            system_prompt: String::new(),
        };
        let domain = vec!["game".to_string()];
        let tags = vec![];
        let png = std::path::PathBuf::from("test.png");
        let input = ReactInput {
            channel: "screenshot",
            trigger: "hotkey",
            timestamp: chrono::Local
                .with_ymd_and_hms(2026, 5, 10, 12, 34, 56)
                .unwrap(),
            binary_path: &png,
            domain: &domain,
            tags: &tags,
            summary: "",
            app: Some("Steam"),
            vision_summary: None,
            vision_context: None,
            transcript: None,
        };
        append_log(&tmp, &input, &persona, "오 이거 뭐야?").unwrap();
        append_log(&tmp, &input, &persona, "재밌네!").unwrap();

        let body = std::fs::read_to_string(tmp.join("log").join("2026-05-10.md")).unwrap();
        assert!(body.starts_with("# 2026-05-10 — companion log"));
        assert!(body.contains("오 이거 뭐야?"));
        assert!(body.contains("재밌네!"));
        assert!(body.contains("[ring]"));
        assert!(body.contains("Steam"));
        assert!(body.contains("screenshot: `test.png`"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn append_voice_uses_transcript_label() {
        let tmp = std::env::temp_dir().join(format!(
            "life-companion-out-voice-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&tmp).unwrap();

        let persona = Persona {
            id: "yon".into(),
            name: "욘".into(),
            silence: false,
            system_prompt: String::new(),
        };
        let domain = vec!["life".to_string()];
        let tags = vec![];
        let wav = std::path::PathBuf::from("2026-05-10T12-34-56-인사.wav");
        let input = ReactInput {
            channel: "voice",
            trigger: "hotkey",
            timestamp: chrono::Local
                .with_ymd_and_hms(2026, 5, 10, 12, 34, 56)
                .unwrap(),
            binary_path: &wav,
            domain: &domain,
            tags: &tags,
            summary: "단순 인사말",
            app: None,
            vision_summary: None,
            vision_context: None,
            transcript: Some("안녕하세요"),
        };
        append_log(&tmp, &input, &persona, "...오랜만이네요.").unwrap();

        let body = std::fs::read_to_string(tmp.join("log").join("2026-05-10.md")).unwrap();
        assert!(body.contains("[yon]"));
        assert!(body.contains("voice: `2026-05-10T12-34-56-인사.wav`"));
        assert!(body.contains("transcript: 안녕하세요"));
        assert!(!body.contains("app:"));

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
