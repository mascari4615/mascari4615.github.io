//! sub-F-2 — claude CLI subprocess 분류.
//!
//! sub-B (`memo/dotfiles/scripts/life-voice.py::classify`) 패턴 그대로:
//! - `claude -p "<prompt>"` subprocess
//! - stdout 에서 첫 `{` ~ 마지막 `}` 사이 JSON 추출 → serde_json 파싱
//!
//! Pro/Max OAuth 자동 (memory `feedback_claude_oauth_first.md`). API key 의존 X.

use serde::Deserialize;
use std::process::Command;
use std::time::Duration;

#[derive(Deserialize, Debug, Default, Clone)]
pub struct ClassifyResult {
    #[serde(default)]
    pub domain: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub summary: String,
}

const DOMAIN_PROMPT_TEMPLATE: &str = r#"이 화면 캡쳐 OCR 텍스트를 LIFE 도메인 트리에 분류해.

도메인:
- health: 운동 / 식단 / 수면 / 정기검진
- finance: 예산 / 적금·투자 / 보험 / 세금
- home: 청소 / 정리 / 인테리어 / 살림
- relationship: 가족 / 친구 / 연애
- admin: 행정 / 서류 / 갱신 / 인증서
- infra: LIFE 데이터 레이크 / 인풋 라우터 / 회고 / 대시 (LIFE 시스템 자체)

multi-label OK. 해당 없으면 빈 배열.

OCR Text:
{ocr_text}

JSON only (다른 설명 X):
{"domain": ["..."], "tags": ["..."], "slug": "짧은-한국어-슬러그-3단어이내", "summary": "한 줄 요약"}
"#;

const CLASSIFY_TIMEOUT: Duration = Duration::from_secs(60);

pub fn classify(ocr_text: &str) -> ClassifyResult {
    let trimmed = ocr_text.trim();
    if trimmed.is_empty() {
        return ClassifyResult {
            slug: "empty".to_string(),
            ..Default::default()
        };
    }

    // 앞 2000 char 만 LLM 으로 (sub-B 와 동일 방어).
    let truncated: String = trimmed.chars().take(2000).collect();
    let prompt = DOMAIN_PROMPT_TEMPLATE.replace("{ocr_text}", &truncated);

    match run_claude(&prompt) {
        Ok(stdout) => extract_and_parse(&stdout).unwrap_or_else(|| ClassifyResult {
            slug: "untagged".to_string(),
            ..Default::default()
        }),
        Err(e) => {
            eprintln!("[life-screen] claude classify 실패: {e}");
            ClassifyResult {
                slug: "untagged".to_string(),
                ..Default::default()
            }
        }
    }
}

fn run_claude(prompt: &str) -> Result<String, String> {
    // std::process::Command 자체에 timeout 없음 — sub-B (Python subprocess.run timeout) 와 다름.
    // 일단 동기 spawn + wait. 향후 60s 강제 종료 필요 시 thread + Child::kill 패턴.
    let _ = CLASSIFY_TIMEOUT; // 후속 sub-F-3 / 비동기화 시 사용.

    let output = Command::new("claude")
        .arg("-p")
        .arg(prompt)
        .output()
        .map_err(|e| format!("claude spawn 실패 (PATH 에 claude 없음 의심): {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "claude rc={:?} stderr={}",
            output.status.code(),
            &stderr.chars().take(200).collect::<String>()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn extract_and_parse(stdout: &str) -> Option<ClassifyResult> {
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
        let s = r#"{"domain":["infra"],"tags":["test"],"slug":"abc","summary":"한 줄"}"#;
        let r = extract_and_parse(s).unwrap();
        assert_eq!(r.domain, vec!["infra"]);
        assert_eq!(r.slug, "abc");
        assert_eq!(r.summary, "한 줄");
    }

    #[test]
    fn extract_with_preamble_and_trailing() {
        let s = "분류 결과:\n{\"domain\":[],\"slug\":\"empty\",\"summary\":\"\",\"tags\":[]}\n끝.";
        let r = extract_and_parse(s).unwrap();
        assert_eq!(r.slug, "empty");
        assert!(r.domain.is_empty());
    }

    #[test]
    fn extract_no_braces_returns_none() {
        assert!(extract_and_parse("plain text no json").is_none());
    }

    #[test]
    fn classify_empty_returns_empty_slug() {
        let r = classify("");
        assert_eq!(r.slug, "empty");
        assert!(r.domain.is_empty());
    }
}
