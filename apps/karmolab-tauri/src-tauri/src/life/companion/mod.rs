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

/// `react()` 호출 시 supply 되는 입력 (sub-F-2 capture 결과 정합).
///
/// raw OCR text 는 prompt 폭주 방지로 *제외* — `summary` (분류 LLM 한 줄) + `vision_summary`/`vision_context` (VLM) 로 충분. Phase 2 에서 raw OCR snippet 추가 검토.
pub struct ReactInput<'a> {
    pub trigger: &'a str,
    pub timestamp: chrono::DateTime<chrono::Local>,
    pub png_path: &'a Path,
    pub domain: &'a [String],
    pub tags: &'a [String],
    pub summary: &'a str,
    pub app: Option<&'a str>,
    pub vision_summary: Option<&'a str>,
    pub vision_context: Option<&'a str>,
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
