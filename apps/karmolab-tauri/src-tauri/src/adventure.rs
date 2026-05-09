//! TASK-KL-032 ζ — 무한 텍스트 어드벤처 Tauri commands.
//!
//! 사용자 발화 (2026-05-10): "Max x20 활용 옵션" — Claude Code OAuth 자동 (Pro/Max 구독).
//! 패턴: `apps/karmolab-tauri/src-tauri/src/life/classify.rs` 의 claude CLI subprocess 흐름 흡수.
//!
//! API key 의존 X. memory `feedback_claude_oauth_first.md` 정합.
//!
//! ζ-1 (현재): adventure_claude_complete — narrative + 선택지 N개 응답.
//! ζ-2 (다음 commit): adventure_save_raw + adventure_commit_summary (memo raw → wiki entity commit).

use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Deserialize)]
pub struct AdventureMessage {
    pub role: String, // "user" | "assistant"
    pub content: String,
}

#[derive(Deserialize)]
pub struct AdventureCompletePayload {
    #[serde(rename = "systemInstruction")]
    pub system_instruction: String,
    pub history: Vec<AdventureMessage>,
    #[serde(rename = "userText")]
    pub user_text: String,
    #[serde(rename = "modelId")]
    pub model_id: String,
}

#[derive(Serialize)]
pub struct AdventureCompleteResult {
    pub text: String,
    #[serde(rename = "modelId")]
    pub model_id: String,
}

fn build_prompt(payload: &AdventureCompletePayload) -> String {
    let mut buf = String::new();
    buf.push_str(payload.system_instruction.trim());
    buf.push_str("\n\n---\n\n");

    if !payload.history.is_empty() {
        buf.push_str("## 이전 turn 들\n\n");
        for msg in &payload.history {
            let label = if msg.role == "assistant" { "GM" } else { "조수님" };
            buf.push_str(&format!("**{label}:**\n{}\n\n", msg.content.trim()));
        }
        buf.push_str("---\n\n");
    }

    buf.push_str("## 현재 turn\n\n");
    buf.push_str(&format!(
        "**조수님 입력:** {}\n\n**GM (당신):**",
        payload.user_text.trim(),
    ));
    buf
}

fn run_claude(prompt: &str, model_id: &str) -> Result<String, String> {
    // life::classify::run_claude 와 동일 패턴.
    // Pro/Max OAuth 자동 (memory feedback_claude_oauth_first.md).
    let mut cmd = Command::new("claude");
    cmd.arg("-p").arg(prompt);
    if !model_id.trim().is_empty() {
        cmd.arg("--model").arg(model_id);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("claude spawn 실패 (PATH 에 claude 없음 의심): {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "claude rc={:?} stderr={}",
            output.status.code(),
            &stderr.chars().take(400).collect::<String>(),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[tauri::command]
pub fn adventure_claude_complete(
    payload: AdventureCompletePayload,
) -> Result<AdventureCompleteResult, String> {
    let prompt = build_prompt(&payload);
    let model_id = payload.model_id.clone();
    let text = run_claude(&prompt, &model_id)?;
    Ok(AdventureCompleteResult { text, model_id })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_prompt_includes_system_history_user() {
        let payload = AdventureCompletePayload {
            system_instruction: "티메토 GM".to_string(),
            history: vec![
                AdventureMessage {
                    role: "user".to_string(),
                    content: "ping".to_string(),
                },
                AdventureMessage {
                    role: "assistant".to_string(),
                    content: "pong".to_string(),
                },
            ],
            user_text: "다음".to_string(),
            model_id: "claude-sonnet-4-6".to_string(),
        };
        let prompt = build_prompt(&payload);
        assert!(prompt.contains("티메토 GM"));
        assert!(prompt.contains("조수님:"));
        assert!(prompt.contains("ping"));
        assert!(prompt.contains("GM:"));
        assert!(prompt.contains("pong"));
        assert!(prompt.contains("**조수님 입력:** 다음"));
    }
}
