//! sub-F-2-vision — VLM (Vision Language Model) 추상화.
//!
//! 사용자 지적 (2026-05-10): 「보통 오픈소스는 화면 인식. 글자만 읽는 건 빠르긴 한데...」
//! → OCR (life/ocr.rs) 만으로는 부족. VLM 으로 시각 자체 이해.
//!
//! Trait 기반 추상화 — 첫 구현 = `claude` (claude CLI vision via subprocess + image path).
//! 나중에 `ollama` (LLaVA / Qwen-VL / MiniCPM-V) / `none` 추가 가능.
//!
//! provider 결정: env `LIFE_VISION_PROVIDER` (`claude` / `none`, default `claude`).

pub mod claude;

use std::path::Path;

#[derive(Debug, Default, Clone)]
pub struct VisionResult {
    /// 화면 한 줄 요약 (UI + 시각 요소 포함).
    pub summary: String,
    /// 보이는 UI 요소 / 창 / 영역 (3-5개).
    pub ui_elements: Vec<String>,
    /// 사용자가 무엇을 하는 중인지 (행동 추론).
    pub context: String,
    /// 디버그·log 용 raw response. frontmatter 에는 박지 X.
    pub raw_response: String,
}

pub trait VisionProvider: Send + Sync {
    /// debug / log 용 이름.
    fn name(&self) -> &str;
    /// image 파일 + (선택) OCR 힌트 → VisionResult.
    /// fail 시 Err — caller 가 fail soft 처리 (sub-F-2 OCR fail soft 패턴 정합).
    fn analyze(&self, image_path: &Path, ocr_hint: Option<&str>) -> Result<VisionResult, String>;
}

/// env `LIFE_VISION_PROVIDER` 기준 default provider 결정.
/// 미지정 또는 알 수 없는 값 → claude.
pub fn default_provider() -> Box<dyn VisionProvider> {
    let provider = std::env::var("LIFE_VISION_PROVIDER")
        .unwrap_or_else(|_| "claude".to_string())
        .to_lowercase();
    match provider.as_str() {
        "none" | "off" | "disabled" => Box::new(NoOpProvider),
        // 향후: "ollama" => Box::new(ollama::OllamaVisionProvider::new()),
        _ => Box::new(claude::ClaudeVisionProvider),
    }
}

/// disabled 모드 — 빈 결과 반환 (frontmatter 에서 vision 필드 0).
struct NoOpProvider;

impl VisionProvider for NoOpProvider {
    fn name(&self) -> &str {
        "none"
    }
    fn analyze(&self, _image_path: &Path, _ocr_hint: Option<&str>) -> Result<VisionResult, String> {
        Ok(VisionResult::default())
    }
}
