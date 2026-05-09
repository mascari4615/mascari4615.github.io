//! sub-F-2 — Tesseract OCR (Korean) wrapper.
//!
//! `rusty-tesseract` = system Tesseract binary subprocess wrapper.
//! 사전 설치: `winget install --id UB-Mannheim.TesseractOCR` (✓ 2026-05-10 박힘).
//! Korean trained data (`kor.traineddata`) 가 `<Tesseract install>/tessdata/` 에 있어야.
//! tessdata path resolution: rusty-tesseract default = TESSDATA_PREFIX env / 시스템 default.

use std::path::Path;

pub fn ocr_korean(png_path: &Path) -> Result<String, String> {
    let img = rusty_tesseract::Image::from_path(png_path)
        .map_err(|e| format!("rusty-tesseract from_path 실패: {e}"))?;

    let args = rusty_tesseract::Args {
        lang: "kor+eng".to_string(),
        ..rusty_tesseract::Args::default()
    };

    rusty_tesseract::image_to_string(&img, &args)
        .map_err(|e| format!("rusty-tesseract OCR 실패 (Tesseract binary 또는 kor.traineddata 누락 의심): {e}"))
}
