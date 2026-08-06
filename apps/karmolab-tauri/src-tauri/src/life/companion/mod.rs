//! **폐기 예정 — 정본은 `packages/companion` 으로 옮겼다 (TASK-KAR-201, 2026-08-06).**
//!
//! 여기 있던 것(화면·음성 입력 → 페르소나 → claude → 기록)은 전부 그쪽에 있고,
//! 인격·기억·목소리·창까지 그쪽이 갖는다. 이 모듈이 남긴 기록은
//! `packages/companion/scripts/import-old-log.mjs` 로 이미 옮겼다.
//!
//! 아직 지우지 않은 이유는 `CaptureResult` 의 companion 칸을 KarmoLab 화면이
//! 읽고 있어서다 — 그 화면까지 함께 손봐야 안전하게 뜯어낼 수 있다.
//! 새 기능을 여기에 붙이지 말 것.
//!
//! sub-G companion — sub-F (화면) / sub-B (음성) 입력 → 페르소나 → claude → log append.
//!
//! 7 layer (TASK-LIFE-001-G):
//! 1. Input adapter — `react()` API. caller (sub-F-2 capture done 직후 hook).
//! 2. Context builder — `context::build_prompt`.
//! 3. LLM caller — `llm::call_claude` (claude CLI subprocess, sub-F-2-vision 패턴 정합).
//! 4. Persona — `persona::load_all` (`<memo>/life/companion/personas/*.md`).
//! 5. Memory — `memory::recent_entries` (`<memo>/life/companion/log/*.md`).
//! 6. Output — `output::append_log` (log + 응답 stdout).
//! 7. Trigger router — `router::select` (입력 → 페르소나 또는 침묵).
//!
//! 페르소나 = 임시 WM 4 캐릭터 차용 (Yon / Ring / Alisa / Fourth). 정식 결정 = follow-up sub.

pub mod context;
pub mod llm;
pub mod memory;
pub mod output;
pub mod persona;
pub mod router;

use std::path::{Path, PathBuf};

use super::state::LifeScreenConfig;

/// `react()` 호출 시 supply 되는 입력 — 채널 generic.
///
/// 채널별 unique 정보는 Optional 로 — 화면이면 `app`/`vision_*` Some, 음성이면 `transcript` Some.
/// raw 본문 (OCR 전체 / word-level json) 은 prompt 폭주 방지로 *제외* — `summary` (분류 LLM 한 줄) +
/// `vision_summary`/`vision_context` (VLM) + `transcript` (음성 본문) 만으로 충분.
pub struct ReactInput<'a> {
    /// "screenshot" | "voice" | (미래: "email" / "clipboard" / ...).
    pub channel: &'a str,
    pub trigger: &'a str,
    pub timestamp: chrono::DateTime<chrono::Local>,
    /// 같이 박힌 binary 파일 경로 (.png / .wav / ...). frontmatter `binary` 필드와 정합.
    pub binary_path: &'a Path,
    pub domain: &'a [String],
    pub tags: &'a [String],
    pub summary: &'a str,
    /// 화면 전용 — 캡쳐 시점 사용자 보고 있던 active window. 음성이면 None.
    pub app: Option<&'a str>,
    /// 화면 전용 — VLM 요약. 음성이면 None.
    pub vision_summary: Option<&'a str>,
    /// 화면 전용 — VLM 컨텍스트. 음성이면 None.
    pub vision_context: Option<&'a str>,
    /// 음성 전용 — Whisper transcript. 화면이면 None.
    pub transcript: Option<&'a str>,
}

#[derive(Debug, Default)]
pub struct ReactResult {
    /// router 가 선택한 페르소나 id. None = 모두 침묵.
    pub persona: Option<String>,
    /// LLM 응답. None = 침묵 (router 침묵 또는 LLM 빈 응답).
    pub response: Option<String>,
}

pub fn react(input: &ReactInput, config: &LifeScreenConfig) -> Result<ReactResult, String> {
    let companion_root = companion_root(&config.memo_repo_root);
    std::fs::create_dir_all(&companion_root).map_err(|e| e.to_string())?;

    let personas = persona::load_all(&companion_root)?;
    if personas.is_empty() {
        eprintln!("[life-companion] 페르소나 0 — `<memo>/life/companion/personas/*.md` 시드 미박힘. 침묵.");
        return Ok(ReactResult::default());
    }

    let Some(persona) = router::select(input, &personas) else {
        return Ok(ReactResult::default());
    };

    let recent = memory::recent_entries(&companion_root, 5);
    let prompt = context::build_prompt(input, persona, &recent);

    let raw = llm::call_claude(&prompt)?;
    let response = raw.trim().to_string();
    if response.is_empty() {
        return Ok(ReactResult {
            persona: Some(persona.id.clone()),
            response: None,
        });
    }

    output::append_log(&companion_root, input, persona, &response)?;

    Ok(ReactResult {
        persona: Some(persona.id.clone()),
        response: Some(response),
    })
}

pub fn companion_root(memo_root: &Path) -> PathBuf {
    memo_root.join("life").join("companion")
}
