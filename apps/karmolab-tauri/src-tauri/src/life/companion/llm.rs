//! sub-G — claude CLI subprocess. sub-F-2-vision 패턴 정합 (memory `feedback_claude_oauth_first.md`).

use std::process::Command;

pub fn call_claude(prompt: &str) -> Result<String, String> {
    let output = Command::new("claude")
        .arg("-p")
        .arg(prompt)
        .output()
        .map_err(|e| format!("claude spawn 실패 (PATH 의심): {e}"))?;

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
