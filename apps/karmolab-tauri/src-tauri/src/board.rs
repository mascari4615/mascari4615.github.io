//! board — 비공개 저장소(memo)의 「보드」 마크다운을 데스크톱 앱에서만 읽어 준다.
//!
//! 이 레포는 공개다. 그래서 보드의 **내용은 여기 담지 않는다** — 파일 하나도.
//! 대신 위젯이 열릴 때마다 이 명령이 `karmoddrine/memo` 아래 문서를 읽어 **원문 그대로** 넘긴다.
//! 파싱은 화면 쪽(공개 코드)이 하고, 글자는 이 기계 밖으로 안 나간다.
//! 선례 = `quest_index` (memo 정본을 런타임에 읽는 데스크톱 전용 위젯).
//!
//! 왜 생성 JSON 이 아니라 원문인가: 구운 파일을 두면 **정본과 갈라진다**. 보드는 사람과
//! AI 가 매일 고치는 문서라, 하루만 안 구워도 화면이 거짓말을 한다. 읽는 값을 하나로 둔다.

use serde::Serialize;
use std::env;
use std::path::PathBuf;

/// 읽어도 되는 문서 — **여기 적힌 것만.** 화면이 아무 경로나 부르지 못하게 한다.
/// (`..` 차단 같은 검사보다 목록이 확실하다 — 새 경로는 코드를 고쳐야 열린다.)
const ALLOWED: &[(&str, &str)] = &[
    ("career-scoreboard", "career/goal/scoreboard.md"),
    ("career-todo", "career/TODO.md"),
];

const MAX_BYTES: u64 = 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardDoc {
    /// 부른 이름 (ALLOWED 의 열쇠)
    pub key: String,
    /// memo 기준 상대 경로 — 화면에 「어디서 읽었나」를 보여 주려고 같이 준다
    pub rel_path: String,
    /// 문서 원문. 없으면 `None` (아직 안 만든 보드일 수 있다)
    pub text: Option<String>,
    /// 마지막 수정 시각 (epoch ms). 「언제 것인가」 표시용
    pub modified_ms: Option<u64>,
    /// 못 읽은 이유 (없으면 성공)
    pub error: Option<String>,
}

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

fn read_one(memo: &PathBuf, key: &str, rel: &str) -> BoardDoc {
    let mut doc = BoardDoc {
        key: key.to_string(),
        rel_path: rel.to_string(),
        text: None,
        modified_ms: None,
        error: None,
    };
    let abs = memo.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
    match std::fs::metadata(&abs) {
        Ok(meta) => {
            if meta.len() > MAX_BYTES {
                doc.error = Some(format!("문서가 너무 크다 ({} bytes)", meta.len()));
                return doc;
            }
            doc.modified_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64);
        }
        Err(e) => {
            doc.error = Some(format!("{e}"));
            return doc;
        }
    }
    match std::fs::read_to_string(&abs) {
        Ok(text) => doc.text = Some(text),
        Err(e) => doc.error = Some(format!("{e}")),
    }
    doc
}

/// 비공개 보드 문서를 읽는다. `keys` 를 안 주면 아는 것 전부.
#[tauri::command]
pub async fn board_read(keys: Option<Vec<String>>) -> Result<Vec<BoardDoc>, String> {
    let memo = memo_path()?;
    if !memo.is_dir() {
        return Err(format!(
            "memo 저장소를 못 찾았다: {} (KARMODDRINE_MEMO_PATH 로 지정할 수 있다)",
            memo.display()
        ));
    }
    let wanted: Vec<(&str, &str)> = match &keys {
        Some(list) => ALLOWED
            .iter()
            .filter(|(k, _)| list.iter().any(|w| w == k))
            .copied()
            .collect(),
        None => ALLOWED.to_vec(),
    };
    if wanted.is_empty() {
        return Err("아는 보드가 아니다".into());
    }
    Ok(wanted
        .into_iter()
        .map(|(k, rel)| read_one(&memo, k, rel))
        .collect())
}
