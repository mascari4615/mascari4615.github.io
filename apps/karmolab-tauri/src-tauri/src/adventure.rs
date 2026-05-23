//! TASK-KL-032 ζ — 무한 텍스트 어드벤처 Tauri commands.
//!
//! 사용자 발화 (2026-05-10): "Max x20 활용 옵션" — Claude Code OAuth 자동 (Pro/Max 구독).
//! 패턴: `apps/karmolab-tauri/src-tauri/src/life/classify.rs` 의 claude CLI subprocess 흐름 흡수.
//!
//! API key 의존 X. memory `feedback_claude_oauth_first.md` 정합.
//!
//! ζ-1 (done): adventure_claude_complete — narrative + 선택지 N개 응답.
//! ζ-2 (현재): adventure_save_raw (memo raw JSON write) + adventure_commit_summary (wiki entity 박기 + git commit + push).

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
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
pub async fn adventure_claude_complete(
    payload: AdventureCompletePayload,
) -> Result<AdventureCompleteResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let prompt = build_prompt(&payload);
        let model_id = payload.model_id.clone();
        let text = run_claude(&prompt, &model_id)?;
        Ok(AdventureCompleteResult { text, model_id })
    })
    .await
    .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

/* ===== ζ-2: raw save + wiki commit ===== */

fn home_dir() -> Result<PathBuf, String> {
    env::var("USERPROFILE")
        .or_else(|_| env::var("HOME"))
        .map(PathBuf::from)
        .map_err(|e| format!("home dir 결정 실패: {e}"))
}

fn memo_path() -> Result<PathBuf, String> {
    if let Ok(env_path) = env::var("KARMODDRINE_MEMO_PATH") {
        return Ok(PathBuf::from(env_path));
    }
    Ok(home_dir()?.join("repos").join("karmoddrine").join("memo"))
}

fn karmolab_repo_path() -> Result<PathBuf, String> {
    if let Ok(env_path) = env::var("KARMODDRINE_KARMOLAB_PATH") {
        return Ok(PathBuf::from(env_path));
    }
    Ok(home_dir()?
        .join("repos")
        .join("karmoddrine")
        .join("Mascari4615.github.io"))
}

#[derive(Deserialize)]
pub struct AdventureSessionPayload {
    pub session: serde_json::Value,
}

/* ===== TASK-KL-037: dataUrl → 별 PNG 파일 분리 ===== */

#[derive(Deserialize)]
pub struct AdventureSaveImagePayload {
    #[serde(rename = "sessionSlug")]
    pub session_slug: String,
    #[serde(rename = "turnIndex")]
    pub turn_index: u32,
    #[serde(rename = "dataUrl")]
    pub data_url: String,
}

#[derive(Serialize)]
pub struct AdventureSaveImageResult {
    /// session 폴더 기준 상대 경로 (예: "images/turn-03-20260510T0235.png").
    pub path: String,
}

/// "data:image/<ext>;base64,<encoded>" → (extension, bytes) 디코드.
fn parse_data_url(data_url: &str) -> Result<(String, Vec<u8>), String> {
    let prefix = "data:";
    if !data_url.starts_with(prefix) {
        return Err("dataUrl 가 'data:' prefix 아님".to_string());
    }
    let after = &data_url[prefix.len()..];
    let comma = after
        .find(',')
        .ok_or_else(|| "dataUrl 에 ',' 구분자 없음".to_string())?;
    let header = &after[..comma];
    let encoded = &after[comma + 1..];

    let mut mime = header;
    let mut is_base64 = false;
    if let Some((m, params)) = header.split_once(';') {
        mime = m;
        for p in params.split(';') {
            if p.trim().eq_ignore_ascii_case("base64") {
                is_base64 = true;
            }
        }
    }
    if !is_base64 {
        return Err("dataUrl base64 인코딩 아님 (raw URL-encoded 미지원)".to_string());
    }

    let ext = match mime.to_ascii_lowercase().as_str() {
        "image/png" => "png",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        other => return Err(format!("지원 안 하는 이미지 mime: {other}")),
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .map_err(|e| format!("base64 디코드 실패: {e}"))?;

    Ok((ext.to_string(), bytes))
}

fn safe_session_slug(slug: &str) -> Result<&str, String> {
    if slug.is_empty() {
        return Err("sessionSlug 빈 문자열".to_string());
    }
    // path traversal 방지 — slug 는 파일명 segment 만 허용.
    for ch in slug.chars() {
        if !(ch.is_ascii_alphanumeric() || ch == '-' || ch == '_') {
            return Err(format!("sessionSlug 허용 외 문자: {ch:?}"));
        }
    }
    Ok(slug)
}

#[tauri::command]
pub async fn adventure_save_image(
    payload: AdventureSaveImagePayload,
) -> Result<AdventureSaveImageResult, String> {
    tauri::async_runtime::spawn_blocking(move || adventure_save_image_blocking(payload))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

fn adventure_save_image_blocking(
    payload: AdventureSaveImagePayload,
) -> Result<AdventureSaveImageResult, String> {
    let slug = safe_session_slug(&payload.session_slug)?;
    let (ext, bytes) = parse_data_url(&payload.data_url)?;

    let memo = memo_path()?;
    let session_dir = memo
        .join("projects")
        .join("karmolab")
        .join("raw")
        .join("adventures")
        .join(slug);
    let images_dir = session_dir.join("images");
    fs::create_dir_all(&images_dir)
        .map_err(|e| format!("images dir 생성 실패 {images_dir:?}: {e}"))?;

    // ts: YYYYMMDDTHHMMSS (압축 ISO 8601 — 파일명 친화). chrono 의존 (이미 있음).
    let ts = chrono::Utc::now().format("%Y%m%dT%H%M%S").to_string();
    let filename = format!("turn-{:02}-{ts}.{ext}", payload.turn_index);
    let abs = images_dir.join(&filename);
    fs::write(&abs, &bytes).map_err(|e| format!("이미지 쓰기 실패 {abs:?}: {e}"))?;

    let rel = format!("images/{filename}");
    Ok(AdventureSaveImageResult { path: rel })
}

#[tauri::command]
pub async fn adventure_save_raw(payload: AdventureSessionPayload) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || adventure_save_raw_blocking(payload))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

fn adventure_save_raw_blocking(payload: AdventureSessionPayload) -> Result<(), String> {
    let session = &payload.session;
    let slug = session
        .get("slug")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "session.slug 없음".to_string())?;
    if slug.is_empty() {
        return Err("session.slug 빈 문자열".to_string());
    }
    let memo = memo_path()?;
    let dir = memo
        .join("projects")
        .join("karmolab")
        .join("raw")
        .join("adventures");
    fs::create_dir_all(&dir).map_err(|e| format!("폴더 생성 실패 {dir:?}: {e}"))?;
    let path = dir.join(format!("{slug}.json"));
    let pretty = serde_json::to_string_pretty(session)
        .map_err(|e| format!("JSON 직렬화 실패: {e}"))?;
    fs::write(&path, pretty + "\n")
        .map_err(|e| format!("파일 쓰기 실패 {path:?}: {e}"))?;
    Ok(())
}

#[derive(Deserialize)]
pub struct AdventureSummaryPayload {
    pub slug: String,
    pub title: String,
    #[serde(rename = "oneLine")]
    pub one_line: String,
    pub yaml: String,
    pub md: String,
}

#[derive(Serialize)]
pub struct AdventureCommitResult {
    pub karmolab_pushed: bool,
    pub memo_pushed: bool,
    pub wiki_yaml_path: String,
    pub wiki_md_path: String,
}

fn run_git(cwd: &PathBuf, args: &[&str]) -> Result<(), String> {
    let status = Command::new("git")
        .current_dir(cwd)
        .args(args)
        .status()
        .map_err(|e| format!("git {} 실패: {e}", args.join(" ")))?;
    if !status.success() {
        return Err(format!("git {} rc={:?}", args.join(" "), status.code()));
    }
    Ok(())
}

#[tauri::command]
pub async fn adventure_commit_summary(
    payload: AdventureSummaryPayload,
) -> Result<AdventureCommitResult, String> {
    tauri::async_runtime::spawn_blocking(move || adventure_commit_summary_blocking(payload))
        .await
        .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

fn adventure_commit_summary_blocking(
    payload: AdventureSummaryPayload,
) -> Result<AdventureCommitResult, String> {
    if payload.slug.is_empty() {
        return Err("slug 빈 문자열".to_string());
    }

    let karmolab = karmolab_repo_path()?;
    let wiki_dir = karmolab
        .join("apps")
        .join("karmolab")
        .join("world")
        .join("wiki")
        .join("entities")
        .join("adventures");
    fs::create_dir_all(&wiki_dir)
        .map_err(|e| format!("wiki dir 생성 실패 {wiki_dir:?}: {e}"))?;

    let yaml_path = wiki_dir.join(format!("{}.yaml", payload.slug));
    let md_path = wiki_dir.join(format!("{}.md", payload.slug));
    let index_path = wiki_dir.join("_index.json");

    fs::write(&yaml_path, &payload.yaml)
        .map_err(|e| format!("yaml 쓰기 실패 {yaml_path:?}: {e}"))?;
    fs::write(&md_path, &payload.md)
        .map_err(|e| format!("md 쓰기 실패 {md_path:?}: {e}"))?;

    // _index.json 갱신 — 중복 slug 제거 후 push
    let mut index: serde_json::Value = if index_path.exists() {
        let raw = fs::read_to_string(&index_path)
            .map_err(|e| format!("_index 읽기 실패: {e}"))?;
        serde_json::from_str(&raw).map_err(|e| format!("_index 파싱 실패: {e}"))?
    } else {
        serde_json::json!({ "adventures": [] })
    };
    let entry = serde_json::json!({
        "slug": payload.slug,
        "title": payload.title,
        "oneLine": payload.one_line,
    });
    let arr = index["adventures"]
        .as_array_mut()
        .ok_or_else(|| "_index.adventures 배열 아님".to_string())?;
    arr.retain(|v| v.get("slug").and_then(|s| s.as_str()) != Some(payload.slug.as_str()));
    arr.push(entry);
    fs::write(
        &index_path,
        serde_json::to_string_pretty(&index)
            .map_err(|e| format!("_index 직렬화 실패: {e}"))?
            + "\n",
    )
    .map_err(|e| format!("_index 쓰기 실패: {e}"))?;

    // git: karmolab 레포 commit + push (wiki entity)
    let commit_message = format!(
        "feat(adventure): KL-032 모험 정수 박음 — {} ({})",
        payload.title, payload.slug
    );
    let yaml_rel = format!("apps/karmolab/world/wiki/entities/adventures/{}.yaml", payload.slug);
    let md_rel = format!("apps/karmolab/world/wiki/entities/adventures/{}.md", payload.slug);
    let index_rel = "apps/karmolab/world/wiki/entities/adventures/_index.json".to_string();

    run_git(&karmolab, &["fetch", "origin", "master"])?;
    run_git(
        &karmolab,
        &["add", &yaml_rel, &md_rel, &index_rel],
    )?;
    run_git(&karmolab, &["commit", "-m", &commit_message])?;
    run_git(&karmolab, &["push", "origin", "master"])?;

    let mut karmolab_pushed = true;
    let _ = &mut karmolab_pushed; // silence dead_assignment if future short-circuit

    // memo 레포 raw JSON + images/ 폴더 commit + push (모험 종료 시 한 번)
    // KL-037: dataUrl 폐기 후 raw JSON 사이즈 ↓ + images/ 폴더 별 add.
    let memo = memo_path()?;
    let raw_rel = format!("projects/karmolab/raw/adventures/{}.json", payload.slug);
    let images_rel = format!("projects/karmolab/raw/adventures/{}/images", payload.slug);
    let session_dir_rel = format!("projects/karmolab/raw/adventures/{}", payload.slug);
    let mut memo_pushed = false;
    let raw_exists = memo.join(&raw_rel).exists();
    let images_exists = memo.join(&images_rel).exists();
    if raw_exists || images_exists {
        run_git(&memo, &["fetch", "origin", "main"])?;
        // raw json + images/ 폴더 add. 폴더 path 는 git 가 sub 전부 add.
        let mut add_args: Vec<&str> = vec!["add"];
        if raw_exists {
            add_args.push(&raw_rel);
        }
        if images_exists {
            add_args.push(&session_dir_rel);
        }
        run_git(&memo, &add_args)?;

        // diff --cached 가 빈지 검사 — pathspec 은 session_dir_rel 안 모두 포함.
        let staged = Command::new("git")
            .current_dir(&memo)
            .args([
                "diff",
                "--cached",
                "--quiet",
                "--",
                &raw_rel,
                &session_dir_rel,
            ])
            .status()
            .map_err(|e| format!("git diff 실패: {e}"))?;
        if !staged.success() {
            // diff 있음 (rc=1) — commit (path-only 로 다른 세션 staged race 방어).
            let mut commit_args: Vec<&str> = vec!["commit"];
            if raw_exists {
                commit_args.push("-o");
                commit_args.push(&raw_rel);
            }
            if images_exists {
                commit_args.push("-o");
                commit_args.push(&session_dir_rel);
            }
            let msg = format!(
                "data(kl): KL-032 모험 raw + 이미지 박음 — {} ({})",
                payload.title, payload.slug,
            );
            commit_args.push("-m");
            commit_args.push(&msg);
            run_git(&memo, &commit_args)?;
            run_git(&memo, &["push", "origin", "main"])?;
            memo_pushed = true;
        }
    }

    Ok(AdventureCommitResult {
        karmolab_pushed,
        memo_pushed,
        wiki_yaml_path: yaml_path.to_string_lossy().into_owned(),
        wiki_md_path: md_path.to_string_lossy().into_owned(),
    })
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
