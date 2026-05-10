//! sub-G — input + persona + recent → claude prompt. 채널 (screenshot/voice/...) 분기.

use super::memory::RecentEntry;
use super::persona::Persona;
use super::ReactInput;

pub fn build_prompt(input: &ReactInput, persona: &Persona, recent: &[RecentEntry]) -> String {
    let recent_block = if recent.is_empty() {
        "(없음)".to_string()
    } else {
        recent
            .iter()
            .map(|e| {
                let snippet: String = e.response.chars().take(100).collect();
                format!("- [{}] [{}] {}", e.timestamp, e.persona, snippet)
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    let domain_str = if input.domain.is_empty() {
        "[]".to_string()
    } else {
        format!("{:?}", input.domain)
    };
    let tags_str = if input.tags.is_empty() {
        "[]".to_string()
    } else {
        format!("{:?}", input.tags)
    };
    let summary_str = if input.summary.is_empty() {
        "(분류 미생성)"
    } else {
        input.summary
    };

    let (channel_label, channel_action) = match input.channel {
        "screenshot" => ("사용자 화면 캡쳐", "화면을 캡쳐"),
        "voice" => ("사용자 음성 메모", "음성을 메모"),
        _ => ("사용자 입력", "입력"),
    };

    let channel_specific = match input.channel {
        "voice" => {
            let transcript = input
                .transcript
                .map(|t| t.trim())
                .filter(|t| !t.is_empty())
                .unwrap_or("(transcript 없음)");
            format!("- transcript: {transcript}")
        }
        _ => format!(
            "- active app: {app}\n- 시각 요약 (VLM): {vsum}\n- 시각 컨텍스트 (VLM): {vctx}",
            app = input.app.unwrap_or("(unknown)"),
            vsum = input.vision_summary.unwrap_or("(없음)"),
            vctx = input.vision_context.unwrap_or("(없음)"),
        ),
    };

    format!(
        "당신은 「{name}」 입니다.\n\n\
## 캐릭터 시스템 프롬프트\n\
{sys}\n\n\
## 현재 입력 ({clabel})\n\
- timestamp: {ts}\n\
- trigger: {trig}\n\
- domain: {domain}\n\
- tags: {tags}\n\
- 한 줄 요약 (분류 LLM): {summary}\n\
{cspec}\n\n\
## 최근 반응 (5개)\n\
{recent}\n\n\
## 작업\n\
사용자가 방금 {caction} 했습니다. 당신 ({name}) 의 톤으로 *짧게* 한 마디 합니다.\n\
- 1~2 문장 이내. 절대 길게 X.\n\
- 캐릭터 톤 그대로. 일관성 유지.\n\
- 입력에 *덧붙일 게 없으면* 빈 응답 OK (silence).\n\
- 코멘트만. \"안녕\" 같은 의례적 인사 X.\n\n\
응답 (text only, markdown 금지):",
        name = persona.name,
        sys = persona.system_prompt,
        clabel = channel_label,
        ts = input.timestamp.format("%Y-%m-%d %H:%M:%S"),
        trig = input.trigger,
        domain = domain_str,
        tags = tags_str,
        summary = summary_str,
        cspec = channel_specific,
        caction = channel_action,
        recent = recent_block,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use std::path::Path;

    #[test]
    fn screenshot_prompt_contains_persona_app_vision() {
        let persona = Persona {
            id: "ring".into(),
            name: "링".into(),
            silence: false,
            system_prompt: "당신은 활발한 인형입니다.".into(),
        };
        let domain = vec!["game".to_string()];
        let tags = vec![];
        let input = ReactInput {
            channel: "screenshot",
            trigger: "hotkey",
            timestamp: chrono::Local
                .with_ymd_and_hms(2026, 5, 10, 12, 34, 56)
                .unwrap(),
            binary_path: Path::new("test.png"),
            domain: &domain,
            tags: &tags,
            summary: "스타듀밸리 플레이",
            app: Some("Steam"),
            vision_summary: Some("픽셀 농장 게임"),
            vision_context: None,
            transcript: None,
        };
        let prompt = build_prompt(&input, &persona, &[]);
        assert!(prompt.contains("링"));
        assert!(prompt.contains("활발한 인형"));
        assert!(prompt.contains("Steam"));
        assert!(prompt.contains("스타듀밸리"));
        assert!(prompt.contains("hotkey"));
        assert!(prompt.contains("화면을 캡쳐"));
        assert!(!prompt.contains("transcript:"));
    }

    #[test]
    fn voice_prompt_contains_transcript_not_app() {
        let persona = Persona {
            id: "yon".into(),
            name: "욘".into(),
            silence: false,
            system_prompt: "당신은 관조적입니다.".into(),
        };
        let domain = vec!["life".to_string()];
        let tags = vec![];
        let input = ReactInput {
            channel: "voice",
            trigger: "hotkey",
            timestamp: chrono::Local
                .with_ymd_and_hms(2026, 5, 10, 12, 34, 56)
                .unwrap(),
            binary_path: Path::new("2026-05-10T12-34-56-test.wav"),
            domain: &domain,
            tags: &tags,
            summary: "단순 인사말",
            app: None,
            vision_summary: None,
            vision_context: None,
            transcript: Some("안녕하세요"),
        };
        let prompt = build_prompt(&input, &persona, &[]);
        assert!(prompt.contains("욘"));
        assert!(prompt.contains("음성을 메모"));
        assert!(prompt.contains("transcript: 안녕하세요"));
        assert!(!prompt.contains("active app"));
        assert!(!prompt.contains("VLM"));
    }
}
