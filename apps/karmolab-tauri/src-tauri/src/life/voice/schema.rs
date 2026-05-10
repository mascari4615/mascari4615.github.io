//! sub-B-2 — voice `.md` frontmatter writer. sub-B Python schema 정합 (`memo/life/raw/voice/`).
//!
//! frontmatter:
//! ```yaml
//! channel: voice
//! date: ISO 8601
//! domain: [...]
//! tags: [...]
//! binary: <slug>.wav
//! summary: ...
//! duration_s: 2.0
//! model: ggml-large-v3
//! ---
//!
//! ## 요약
//! ...
//!
//! ## Transcript
//! ...
//! ```

use chrono::{DateTime, Local};
use serde::Serialize;
use std::path::Path;

use super::super::classify::ClassifyResult;
use super::transcribe::TranscribeResult;

#[derive(Serialize, Debug)]
pub struct VoiceFrontmatter {
    pub channel: String,
    pub date: String,
    pub domain: Vec<String>,
    pub tags: Vec<String>,
    pub binary: String,
    pub summary: String,
    pub duration_s: f32,
    pub model: String,
    /// sub-B-2 trigger 종류 — "hotkey" (Ctrl+Alt+Space hold-to-talk).
    pub trigger: String,
}

pub fn build_frontmatter(
    timestamp: &DateTime<Local>,
    classification: &ClassifyResult,
    binary_filename: &str,
    duration_s: f32,
    model: &str,
    trigger: &str,
) -> VoiceFrontmatter {
    VoiceFrontmatter {
        channel: "voice".into(),
        date: timestamp.to_rfc3339(),
        domain: classification.domain.clone(),
        tags: classification.tags.clone(),
        binary: binary_filename.into(),
        summary: classification.summary.clone(),
        duration_s,
        model: model.into(),
        trigger: trigger.into(),
    }
}

pub fn write_md(
    md_path: &Path,
    frontmatter: &VoiceFrontmatter,
    transcript: &TranscribeResult,
) -> Result<(), String> {
    let yaml = serde_yml::to_string(frontmatter)
        .map_err(|e| format!("frontmatter yaml 직렬화 실패: {e}"))?;

    let summary_block = if frontmatter.summary.is_empty() {
        "(분류 미생성)"
    } else {
        &frontmatter.summary
    };
    let transcript_block = if transcript.text.is_empty() {
        "(빈 transcript)".to_string()
    } else {
        transcript.text.clone()
    };

    // segment-level (json) — sub-B 의 word-level 대신 segment 단위 (whisper-rs 0.14 word timestamp 후속).
    let segments_json = serde_json::to_string_pretty(
        &transcript
            .segments
            .iter()
            .map(|s| {
                serde_json::json!({
                    "text": s.text,
                    "start": s.start_s,
                    "end": s.end_s,
                })
            })
            .collect::<Vec<_>>(),
    )
    .unwrap_or_else(|_| "[]".to_string());

    let body = format!(
        "---\n{yaml}---\n\n## 요약\n\n{summary}\n\n## Transcript\n\n{transcript}\n\n## segment-level (json)\n\n```json\n{segments}\n```\n",
        yaml = yaml,
        summary = summary_block,
        transcript = transcript_block,
        segments = segments_json,
    );

    std::fs::write(md_path, body).map_err(|e| format!("voice md write 실패: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn build_voice_frontmatter_basic_fields() {
        let ts = chrono::Local
            .with_ymd_and_hms(2026, 5, 10, 12, 34, 56)
            .unwrap();
        let cls = ClassifyResult {
            domain: vec!["life".into()],
            tags: vec!["greeting".into()],
            slug: "인사".into(),
            summary: "단순 인사".into(),
        };
        let fm = build_frontmatter(&ts, &cls, "2026-05-10T12-34-56-인사.wav", 2.5, "ggml-large-v3", "hotkey");
        assert_eq!(fm.channel, "voice");
        assert_eq!(fm.domain, vec!["life".to_string()]);
        assert_eq!(fm.binary, "2026-05-10T12-34-56-인사.wav");
        assert!((fm.duration_s - 2.5).abs() < 0.01);
        assert_eq!(fm.trigger, "hotkey");
        assert_eq!(fm.model, "ggml-large-v3");
    }

    #[test]
    fn write_md_includes_transcript_and_segments() {
        let ts = chrono::Local
            .with_ymd_and_hms(2026, 5, 10, 12, 34, 56)
            .unwrap();
        let cls = ClassifyResult {
            domain: vec!["life".into()],
            tags: vec![],
            slug: "인사".into(),
            summary: "단순 인사".into(),
        };
        let fm = build_frontmatter(&ts, &cls, "test.wav", 2.0, "ggml-large-v3", "hotkey");
        let tr = TranscribeResult {
            text: "안녕하세요".into(),
            segments: vec![super::super::transcribe::Segment {
                text: "안녕하세요".into(),
                start_s: 0.0,
                end_s: 1.5,
            }],
        };
        let tmp = std::env::temp_dir().join(format!(
            "voice-md-{}.md",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        write_md(&tmp, &fm, &tr).unwrap();
        let read = std::fs::read_to_string(&tmp).unwrap();
        assert!(read.starts_with("---\n"));
        assert!(read.contains("channel: voice"));
        assert!(read.contains("trigger: hotkey"));
        assert!(read.contains("## Transcript"));
        assert!(read.contains("안녕하세요"));
        assert!(read.contains("## segment-level (json)"));
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn write_md_handles_empty_transcript() {
        let ts = chrono::Local
            .with_ymd_and_hms(2026, 5, 10, 0, 0, 0)
            .unwrap();
        let cls = ClassifyResult::default();
        let fm = build_frontmatter(&ts, &cls, "empty.wav", 0.0, "ggml-large-v3", "hotkey");
        let tr = TranscribeResult::default();
        let tmp = std::env::temp_dir().join(format!(
            "voice-md-empty-{}.md",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        write_md(&tmp, &fm, &tr).unwrap();
        let read = std::fs::read_to_string(&tmp).unwrap();
        assert!(read.contains("(빈 transcript)"));
        assert!(read.contains("(분류 미생성)"));
        let _ = std::fs::remove_file(&tmp);
    }
}
