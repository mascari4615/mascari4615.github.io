//! sub-F-2 — `raw/screenshot/<stamp>-<slug>.md` frontmatter + write.
//!
//! sub-B (`raw/voice/<stamp>-<slug>.md`) frontmatter 와 통일.
//! 정본 schema = `memo/life/raw/README.md`.

use chrono::{DateTime, Local};
use serde::Serialize;
use std::path::Path;

use super::classify::ClassifyResult;

#[derive(Serialize, Debug)]
pub struct ScreenFrontmatter {
    pub channel: String, // "screenshot"
    pub date: String,    // ISO with KST offset
    pub domain: Vec<String>,
    pub tags: Vec<String>,
    pub binary: String, // <slug>.png filename
    pub summary: String,
    pub ocr_chars: usize,
    pub monitor_index: usize,
}

pub fn build_frontmatter(
    timestamp: &DateTime<Local>,
    classification: &ClassifyResult,
    binary_filename: &str,
    ocr_chars: usize,
    monitor_index: usize,
) -> ScreenFrontmatter {
    ScreenFrontmatter {
        channel: "screenshot".into(),
        date: timestamp.to_rfc3339(),
        domain: classification.domain.clone(),
        tags: classification.tags.clone(),
        binary: binary_filename.into(),
        summary: classification.summary.clone(),
        ocr_chars,
        monitor_index,
    }
}

pub fn write_md(
    md_path: &Path,
    frontmatter: &ScreenFrontmatter,
    ocr_text: &str,
) -> Result<(), String> {
    let yaml = serde_yml::to_string(frontmatter)
        .map_err(|e| format!("frontmatter yaml 직렬화 실패: {e}"))?;

    let body = format!(
        "---\n{yaml}---\n\n## 요약\n\n{summary}\n\n## OCR Text\n\n```\n{ocr}\n```\n",
        yaml = yaml,
        summary = if frontmatter.summary.is_empty() {
            "(분류 미생성)"
        } else {
            &frontmatter.summary
        },
        ocr = ocr_text.trim(),
    );

    std::fs::write(md_path, body).map_err(|e| format!("md write 실패: {e}"))
}

/// 한국어 char 보존 + ASCII non-alphanumeric 만 `-` 로 collapse.
/// `char::is_alphanumeric` 는 unicode 기준 (한·일·중 모두 alphanumeric 으로 판정).
pub fn sanitize_slug(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();

    let collapsed: String = cleaned
        .split('-')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if collapsed.is_empty() {
        "untagged".to_string()
    } else {
        collapsed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_korean_preserved() {
        assert_eq!(sanitize_slug("회의-노트"), "회의-노트");
        assert_eq!(sanitize_slug("코드 리뷰"), "코드-리뷰");
    }

    #[test]
    fn sanitize_collapses_punctuation() {
        assert_eq!(sanitize_slug("hello!! world??"), "hello-world");
        assert_eq!(sanitize_slug("a/b\\c:d"), "a-b-c-d");
    }

    #[test]
    fn sanitize_empty_falls_back() {
        assert_eq!(sanitize_slug(""), "untagged");
        assert_eq!(sanitize_slug("---"), "untagged");
        assert_eq!(sanitize_slug("!!!"), "untagged");
    }

    #[test]
    fn write_md_yaml_roundtrip() {
        use chrono::TimeZone;
        let ts = chrono::Local
            .with_ymd_and_hms(2026, 5, 10, 12, 34, 56)
            .unwrap();
        let cls = ClassifyResult {
            domain: vec!["infra".into()],
            tags: vec!["test".into()],
            slug: "샘플".into(),
            summary: "yaml 직렬화 검증 — 콜론: 따옴표\" 줄바꿈\n포함".into(),
        };
        let fm = build_frontmatter(&ts, &cls, "샘플.png", 42, 0);
        let tmp = std::env::temp_dir().join("life-screen-schema-test.md");
        write_md(&tmp, &fm, "임시 ocr 텍스트").unwrap();
        let read = std::fs::read_to_string(&tmp).unwrap();
        assert!(read.starts_with("---\n"));
        assert!(read.contains("channel: screenshot"));
        assert!(read.contains("infra"));
        assert!(read.contains("임시 ocr 텍스트"));
        let _ = std::fs::remove_file(&tmp);
    }
}
