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
//! <small>screenshot: `<png-name>` · domain: <a,b> · app: <app></small>
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

    let png_name = input
        .png_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    let domain_str = if input.domain.is_empty() {
        "(none)".to_string()
    } else {
        input.domain.join(",")
    };

    let entry = format!(
        "\n## {ts} [{pid}]\n\n{response}\n\n<small>screenshot: `{png}` · domain: {domain} · app: {app}</small>\n",
        ts = input.timestamp.format("%Y-%m-%d %H:%M:%S"),
        pid = persona.id,
        response = response,
        png = png_name,
        domain = domain_str,
        app = input.app.unwrap_or("(?)"),
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
    fn append_creates_and_appends() {
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
            trigger: "hotkey",
            timestamp: chrono::Local
                .with_ymd_and_hms(2026, 5, 10, 12, 34, 56)
                .unwrap(),
            png_path: &png,
            domain: &domain,
            tags: &tags,
            summary: "",
            app: Some("Steam"),
            vision_summary: None,
            vision_context: None,
        };
        append_log(&tmp, &input, &persona, "오 이거 뭐야?").unwrap();
        append_log(&tmp, &input, &persona, "재밌네!").unwrap();

        let body = std::fs::read_to_string(tmp.join("log").join("2026-05-10.md")).unwrap();
        assert!(body.starts_with("# 2026-05-10 — companion log"));
        assert!(body.contains("오 이거 뭐야?"));
        assert!(body.contains("재밌네!"));
        assert!(body.contains("[ring]"));
        assert!(body.contains("Steam"));

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
