//! 되묻기 (KarmoLab recall 위젯) 의 로컬 전용 두 갈래.
//!
//! 웹에서는 못 하는 것만 여기 둔다. career 폴더가 개인 PC 에만 있기 때문.
//!  - `recall_followup`  답 원문 + career 현황을 claude CLI 에 넘겨 꼬리질문을 받음
//!  - `recall_save_baseline`  한 번 끝낸 것을 `memo/career/log/baseline/` 에 측정 원본으로 붙임
//!
//! claude 호출은 `adventure::run_claude` 와 같은 패턴. Pro/Max OAuth 라 API key 없음.
//! AI 는 묻기만 한다. 등급은 사람이 매긴다 (career/CLAUDE.md 의 스코어보드 규칙).

use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn home_dir() -> Result<PathBuf, String> {
    env::var("USERPROFILE")
        .or_else(|_| env::var("HOME"))
        .map(PathBuf::from)
        .map_err(|e| format!("home dir 결정 실패: {e}"))
}

fn memo_path() -> Result<PathBuf, String> {
    if let Ok(p) = env::var("KARMODDRINE_MEMO_PATH") {
        return Ok(PathBuf::from(p));
    }
    Ok(home_dir()?.join("repos").join("karmoddrine").join("memo"))
}

fn career_path() -> Result<PathBuf, String> {
    let p = memo_path()?.join("career");
    if !p.is_dir() {
        return Err(format!("career 폴더가 없다: {}", p.display()));
    }
    Ok(p)
}

/// 파일 앞부분만. 프롬프트가 커지면 느려짐, 뒷장은 대개 이력, 현황은 앞
fn head_of(path: &PathBuf, lines: usize) -> String {
    fs::read_to_string(path)
        .map(|s| s.lines().take(lines).collect::<Vec<_>>().join("\n"))
        .unwrap_or_default()
}

/// 가장 최근 측정 원본 하나. 이름에 날짜가 박혀 있어 이름 정렬이 곧 시간 정렬
fn latest_baseline(career: &PathBuf) -> String {
    let dir = career.join("log").join("baseline");
    let mut names: Vec<PathBuf> = match fs::read_dir(&dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().map(|x| x == "md").unwrap_or(false))
            .collect(),
        Err(_) => return String::new(),
    };
    names.sort();
    match names.last() {
        Some(p) => head_of(p, 60),
        None => String::new(),
    }
}

#[derive(Deserialize)]
pub struct RecallFollowupPayload {
    pub question: String,
    pub mine: String,
    #[serde(default)]
    pub source: String,
}

fn build_prompt(p: &RecallFollowupPayload, career: &PathBuf) -> String {
    let scoreboard = head_of(&career.join("goal").join("scoreboard.md"), 80);
    let diagnosis = head_of(&career.join("diagnosis").join("current.md"), 80);
    let recent = latest_baseline(career);

    format!(
        "너는 면접관이다. 아래 답변을 읽고 **꼬리질문 두 개**와 **근거 한 줄**만 낸다.\n\
\n\
지킬 것\n\
- 등급, 점수, 잘했다는 말 금지. 채점은 사람이 한다\n\
- 꼬리질문은 답변이 실제로 비어 있는 자리를 찌른다. 일반론 금지\n\
- 답변에 나온 사례와 용어를 그대로 인용해서 묻는다\n\
- 한국어 개조식. 전부 여섯 줄 이내\n\
\n\
낼 모양\n\
1. <꼬리질문>\n\
2. <꼬리질문>\n\
근거: <왜 이 둘인지 한 줄>\n\
\n\
---\n\
## 물었던 것\n{}\n\
\n## 본인 답변 (원문, 오타 포함)\n{}\n\
\n## 교재의 근거 문단\n{}\n\
\n## 이 사람의 목표와 갭 (career/goal/scoreboard.md 앞부분)\n{}\n\
\n## 현재 진단 (career/diagnosis/current.md 앞부분)\n{}\n\
\n## 가장 최근 측정 원본\n{}\n",
        p.question.trim(),
        if p.mine.trim().is_empty() { "(답을 못 했다)" } else { p.mine.trim() },
        p.source.trim(),
        scoreboard,
        diagnosis,
        recent,
    )
}

fn run_claude(prompt: &str) -> Result<String, String> {
    let mut cmd = Command::new("claude");
    cmd.arg("-p").arg(prompt);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

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
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub async fn recall_followup(payload: RecallFollowupPayload) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let career = career_path()?;
        run_claude(&build_prompt(&payload, &career))
    })
    .await
    .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

#[derive(Deserialize)]
pub struct RecallBaselinePayload {
    pub markdown: String,
}

#[derive(Serialize)]
pub struct RecallBaselineResult {
    pub path: String,
}

/// 하루치를 한 파일에 모음. 여섯 문항마다 파일을 만들면 폴더가 금방 무너짐
#[tauri::command]
pub async fn recall_save_baseline(
    payload: RecallBaselinePayload,
) -> Result<RecallBaselineResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if payload.markdown.trim().is_empty() {
            return Err("남길 내용이 비었다.".to_string());
        }
        let career = career_path()?;
        let dir = career.join("log").join("baseline");
        fs::create_dir_all(&dir).map_err(|e| format!("폴더 생성 실패: {e}"))?;
        let day = chrono::Local::now().format("%Y%m%d").to_string();
        let file = dir.join(format!("recall-{day}.md"));

        let existed = file.exists();
        let mut f = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file)
            .map_err(|e| format!("파일 열기 실패: {e}"))?;
        if existed {
            f.write_all(b"\n---\n\n")
                .map_err(|e| format!("쓰기 실패: {e}"))?;
        }
        f.write_all(payload.markdown.as_bytes())
            .map_err(|e| format!("쓰기 실패: {e}"))?;

        Ok(RecallBaselineResult {
            path: format!("career/log/baseline/recall-{day}.md"),
        })
    })
    .await
    .map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_carries_answer_and_bans_grading() {
        let p = RecallFollowupPayload {
            question: "순수 함수란".to_string(),
            mine: "부수효과가 없는 함수".to_string(),
            source: "같은 입력에 같은 출력".to_string(),
        };
        let out = build_prompt(&p, &PathBuf::from("no-such-dir"));
        assert!(out.contains("부수효과가 없는 함수"));
        assert!(out.contains("순수 함수란"));
        assert!(out.contains("등급, 점수"));
    }

    #[test]
    fn empty_answer_is_marked_not_blank() {
        let p = RecallFollowupPayload {
            question: "q".to_string(),
            mine: "   ".to_string(),
            source: String::new(),
        };
        let out = build_prompt(&p, &PathBuf::from("no-such-dir"));
        assert!(out.contains("답을 못 했다"));
    }
}
