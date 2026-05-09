//! TASK-LIFE-001-F sub-F — 화면 채널 (capture + OCR + LLM 분류)
//!
//! 데이터 저장: `<memo>/life/raw/screenshot/<date>-<slug>.{md,png}`.
//! 정본 schema: `memo/life/raw/README.md`.
//!
//! Phase 분할 (2026-05-10 의도 정정 후 갱신):
//! - sub-F-1 (✓ done): screen capture skeleton + PNG write.
//! - sub-F-2 (✓ done): OCR (rusty-tesseract) + claude CLI subprocess 분류 → .md frontmatter.
//! - sub-F-3 (현재): PrintScreen global hotkey (의식적 trigger) + active window. interval 폐기 (사용자 의도 정정).
//! - sub-F-4 (backlog): Web UI widget (`apps/karmolab/src/widgets/life-screen/`).
//! - sub-F-5 (backlog): autostart + privacy mask.

pub mod active_window;
pub mod classify;
pub mod hotkey;
pub mod ocr;
pub mod schema;
pub mod screen;
pub mod state;

pub use screen::life_screen_capture;
