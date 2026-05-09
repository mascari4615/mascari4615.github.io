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
    /// sub-F-3: capture 시점 active window 제목 (사용자가 어느 앱 보고 있었나).
    /// None = 발견 실패 또는 비-Windows 플랫폼.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app: Option<String>,
    /// sub-F-3: trigger 종류 — "hotkey" (의식적 trigger) / "manual" (Tauri command 직접 호출).
    pub trigger: String,
    /// sub-F-2-vision: VLM provider 이름 ("claude-cli-vision" / "none" / 향후 "ollama-llava" 등).
    /// None = vision 실패 (fail soft) — frontmatter 에서 vision 필드 모두 제외.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vision_provider: Option<String>,
    /// VLM 시각 요약 (UI / 색상 / 레이아웃 포함). OCR summary 와 다름.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vision_summary: Option<String>,
    /// VLM 이 발견한 UI 요소 (3-5개). frontmatter array.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub vision_ui_elements: Vec<String>,
    /// VLM 추론 — 사용자 행동 한 줄.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vision_context: Option<String>,
}

pub fn build_frontmatter(
    timestamp: &DateTime<Local>,
    classification: &ClassifyResult,
    binary_filename: &str,
    ocr_chars: usize,
    monitor_index: usize,
    app: Option<String>,
    trigger: &str,
    vision: Option<(&str, &super::vision::VisionResult)>,
) -> ScreenFrontmatter {
    let (vision_provider, vision_summary, vision_ui_elements, vision_context) = match vision {
        Some((provider_name, r)) => (
            Some(provider_name.to_string()),
            (!r.summary.is_empty()).then(|| r.summary.clone()),
            r.ui_elements.clone(),
            (!r.context.is_empty()).then(|| r.context.clone()),
        ),
        None => (None, None, Vec::new(), None),
    };

    ScreenFrontmatter {
        channel: "screenshot".into(),
        date: timestamp.to_rfc3339(),
        domain: classification.domain.clone(),
        tags: classification.tags.clone(),
        binary: binary_filename.into(),
        summary: classification.summary.clone(),
        ocr_chars,
        monitor_index,
        app,
        trigger: trigger.into(),
        vision_provider,
        vision_summary,
        vision_ui_elements,
        vision_context,
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
        let fm = build_frontmatter(
            &ts,
            &cls,
            "샘플.png",
            42,
            0,
            Some("Chrome".into()),
            "hotkey",
            None,
        );
        let tmp = std::env::temp_dir().join("life-screen-schema-test.md");
        write_md(&tmp, &fm, "임시 ocr 텍스트").unwrap();
        let read = std::fs::read_to_string(&tmp).unwrap();
        assert!(read.starts_with("---\n"));
        assert!(read.contains("channel: screenshot"));
        assert!(read.contains("infra"));
        assert!(read.contains("trigger: hotkey"));
        assert!(read.contains("app: Chrome"));
        assert!(read.contains("임시 ocr 텍스트"));
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn write_md_omits_app_when_none() {
        use chrono::TimeZone;
        let ts = chrono::Local
            .with_ymd_and_hms(2026, 5, 10, 0, 0, 0)
            .unwrap();
        let cls = ClassifyResult::default();
        let fm = build_frontmatter(&ts, &cls, "x.png", 0, 0, None, "manual", None);
        let tmp = std::env::temp_dir().join("life-screen-schema-no-app.md");
        write_md(&tmp, &fm, "").unwrap();
        let read = std::fs::read_to_string(&tmp).unwrap();
        assert!(!read.contains("app:"), "app 필드 제외돼야 (None 시): {read}");
        assert!(read.contains("trigger: manual"));
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn write_md_includes_vision_when_provided() {
        use chrono::TimeZone;
        let ts = chrono::Local
            .with_ymd_and_hms(2026, 5, 10, 0, 0, 0)
            .unwrap();
        let cls = ClassifyResult::default();
        let v = super::super::vision::VisionResult {
            summary: "VLM 시각 요약".into(),
            ui_elements: vec!["창 A".into(), "창 B".into()],
            context: "사용자가 코드 작성 중".into(),
            raw_response: String::new(),
        };
        let fm = build_frontmatter(
            &ts,
            &cls,
            "x.png",
            0,
            0,
            None,
            "manual",
            Some(("claude-cli-vision", &v)),
        );
        let tmp = std::env::temp_dir().join("life-screen-schema-vision.md");
        write_md(&tmp, &fm, "").unwrap();
        let read = std::fs::read_to_string(&tmp).unwrap();
        assert!(read.contains("vision_provider: claude-cli-vision"));
        assert!(read.contains("vision_summary: VLM 시각 요약"));
        assert!(read.contains("창 A"));
        assert!(read.contains("vision_context: 사용자가 코드 작성 중"));
        let _ = std::fs::remove_file(&tmp);
    }
}
