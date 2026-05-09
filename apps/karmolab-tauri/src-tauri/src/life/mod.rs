//! TASK-LIFE-001-F sub-F — 화면 채널 (capture + OCR + LLM 분류)
//!
//! 데이터 저장: `<memo>/life/raw/screenshot/<date>-<slug>.{md,png}`.
//! 정본 schema: `memo/life/raw/README.md`.
//!
//! Phase 분할:
//! - sub-F-1 (현재): screen capture skeleton + PNG write.
//! - sub-F-2 (backlog): OCR (rusty-tesseract) + claude CLI subprocess 분류 → .md frontmatter.
//! - sub-F-3 (backlog): global-hotkey (PrintScreen) + 5분 interval timer + active window.
//! - sub-F-4 (backlog): Web UI widget (`apps/karmolab/src/widgets/life-screen/`).
//! - sub-F-5 (backlog): autostart + privacy mask.

pub mod screen;
pub mod state;

pub use screen::life_screen_capture;
