//! sub-F-2 — Tesseract OCR (Korean) wrapper.
//!
//! `rusty-tesseract` = system Tesseract binary subprocess wrapper.
//! 사전 설치: `winget install --id UB-Mannheim.TesseractOCR` (✓ 2026-05-10 박힘).
//! Korean trained data (`kor.traineddata`) 가 `<Tesseract install>/tessdata/` 에 있어야.
//!
//! PATH refresh 문제 (winget install 후 부모 세션 PATH 갱신 X) 회피:
//! - `ensure_tesseract_in_path` 가 default 설치 경로 발견 + process PATH prepend.
//! - sub-F-2-setup .ps1 가 user PATH 에 영구 추가 (다음 시작 시 자동) — 이중 안전망.

use std::path::Path;
use std::sync::Once;

static TESS_PATH_INIT: Once = Once::new();

/// Default 설치 경로 후보에서 Tesseract 발견 → 본 process 의 PATH 에 prepend.
/// 한 번만 실행 (Once). 이미 PATH 에 있으면 no-op.
fn ensure_tesseract_in_path() {
    TESS_PATH_INIT.call_once(|| {
        let current = std::env::var("PATH").unwrap_or_default();
        let candidates = [
            r"C:\Program Files\Tesseract-OCR",
            r"C:\Program Files (x86)\Tesseract-OCR",
        ];
        for dir in candidates {
            let exe = format!(r"{}\tesseract.exe", dir);
            if std::path::Path::new(&exe).exists() {
                if !current
                    .split(';')
                    .any(|p| p.eq_ignore_ascii_case(dir))
                {
                    let new_path = format!("{};{}", dir, current);
                    std::env::set_var("PATH", new_path);
                    eprintln!("[life-screen][ocr] Tesseract dir '{}' process PATH prepend", dir);
                }
                return;
            }
        }
    });
}

pub fn ocr_korean(png_path: &Path) -> Result<String, String> {
    ensure_tesseract_in_path();

    let img = rusty_tesseract::Image::from_path(png_path)
        .map_err(|e| format!("rusty-tesseract from_path 실패: {e}"))?;

    let args = rusty_tesseract::Args {
        lang: "kor+eng".to_string(),
        ..rusty_tesseract::Args::default()
    };

    rusty_tesseract::image_to_string(&img, &args)
        .map_err(|e| format!("rusty-tesseract OCR 실패 (Tesseract binary 또는 kor.traineddata 누락 의심): {e}"))
}
