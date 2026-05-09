//! sub-F-2-vision claude 구현 — claude CLI subprocess + prompt-embedded image path.
//!
//! 검증 (2026-05-10): `claude -p "...image: <path>..."` 가 자동으로 image 를 multimodal 로 read.
//! Pro/Max OAuth 자동 (memory `feedback_claude_oauth_first.md`). API key 의존 X.

use serde::Deserialize;
use std::path::Path;
use std::process::Command;

use super::{VisionProvider, VisionResult};

pub struct ClaudeVisionProvider;

#[derive(Deserialize, Debug, Default)]
struct ClaudeVisionJson {
    #[serde(default)]
    summary: String,
    #[serde(default)]
    ui_elements: Vec<String>,
    #[serde(default)]
    context: String,
}

const PROMPT_TEMPLATE: &str = r#"아래 화면 캡처 이미지를 시각적으로 분석해. JSON only (다른 설명 X):
{
  "summary": "화면 한 줄 요약 (UI / 시각 요소 / 색상 / 레이아웃 포함)",
  "ui_elements": ["보이는 UI 요소 / 창 / 영역 3-5개"],
  "context": "사용자가 무엇을 하는 중인지 한 줄"
}{ocr_hint}

이미지: {image_path}
"#;

impl VisionProvider for ClaudeVisionProvider {
    fn name(&self) -> &str {
        "claude-cli-vision"
    }

    fn analyze(&self, image_path: &Path, ocr_hint: Option<&str>) -> Result<VisionResult, String> {
        let path_str = image_path.display().to_string();
        let ocr_section = match ocr_hint {
            Some(text) if !text.trim().is_empty() => {
                let truncated: String = text.chars().take(500).collect();
                format!("\n\n참고 OCR 텍스트 (글자 추출, 노이즈 多 — 시각 분석을 우선):\n{}\n", truncated)
            }
            _ => String::new(),
        };

        let prompt = PROMPT_TEMPLATE
            .replace("{ocr_hint}", &ocr_section)
            .replace("{image_path}", &path_str);

        let output = Command::new("claude")
            .arg("-p")
            .arg(&prompt)
            .output()
            .map_err(|e| format!("claude vision spawn 실패: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "claude vision rc={:?} stderr={}",
                output.status.code(),
                stderr.chars().take(200).collect::<String>()
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
        let parsed = extract_and_parse(&stdout)
            .ok_or_else(|| format!("claude vision JSON 파싱 실패: {}", stdout.chars().take(200).collect::<String>()))?;

        Ok(VisionResult {
            summary: parsed.summary,
            ui_elements: parsed.ui_elements,
            context: parsed.context,
            raw_response: stdout,
        })
    }
}

fn extract_and_parse(stdout: &str) -> Option<ClaudeVisionJson> {
    let start = stdout.find('{')?;
    let end = stdout.rfind('}')?;
    if end < start {
        return None;
    }
    let json_str = &stdout[start..=end];
    serde_json::from_str(json_str).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_pure_json() {
        let s = r#"{"summary":"한 줄","ui_elements":["a","b"],"context":"개발"}"#;
        let r = extract_and_parse(s).unwrap();
        assert_eq!(r.summary, "한 줄");
        assert_eq!(r.ui_elements, vec!["a", "b"]);
        assert_eq!(r.context, "개발");
    }

    #[test]
    fn extract_with_preamble() {
        let s = "분석 결과:\n{\"summary\":\"x\",\"ui_elements\":[],\"context\":\"\"}\n끝.";
        let r = extract_and_parse(s).unwrap();
        assert_eq!(r.summary, "x");
    }

    #[test]
    fn extract_no_braces_returns_none() {
        assert!(extract_and_parse("plain text").is_none());
    }
}
