//! KL-052-C — Tesseract OCR (Korean+English). 메인
//! `src-tauri/src/life/ocr.rs` 이관. `rusty-tesseract` = system
//! Tesseract binary subprocess wrapper (이미 외부 .exe — crate 만 메인
//! 링크였음, sidecar 로 옮겨 메인 ML dep 0 완성).
//!
//! 사전 설치: `winget install --id UB-Mannheim.TesseractOCR`.
//! Korean trained data(`kor.traineddata`)가 `<install>/tessdata/` 에.
//! winget install 후 PATH 미갱신 회피 — default 경로 발견 + process
//! PATH prepend (Once).

use std::path::Path;
use std::sync::Once;

use karmolab_shared::SidecarEvent;

static TESS_PATH_INIT: Once = Once::new();

fn ensure_tesseract_in_path() {
    TESS_PATH_INIT.call_once(|| {
        let current = std::env::var("PATH").unwrap_or_default();
        let candidates = [
            r"C:\Program Files\Tesseract-OCR",
            r"C:\Program Files (x86)\Tesseract-OCR",
        ];
        for dir in candidates {
            let exe = format!(r"{}\tesseract.exe", dir);
            if Path::new(&exe).exists() {
                if !current.split(';').any(|p| p.eq_ignore_ascii_case(dir)) {
                    let new_path = format!("{};{}", dir, current);
                    std::env::set_var("PATH", new_path);
                    eprintln!("[life-ml][ocr] Tesseract dir '{}' process PATH prepend", dir);
                }
                return;
            }
        }
    });
}

pub fn run(image: &str) -> SidecarEvent {
    match ocr_korean(Path::new(image)) {
        Ok(text) => SidecarEvent::Result { text },
        Err(msg) => SidecarEvent::Error { msg },
    }
}

fn ocr_korean(png_path: &Path) -> Result<String, String> {
    ensure_tesseract_in_path();

    let img = rusty_tesseract::Image::from_path(png_path)
        .map_err(|e| format!("rusty-tesseract from_path 실패: {e}"))?;

    let args = rusty_tesseract::Args {
        lang: "kor+eng".to_string(),
        ..rusty_tesseract::Args::default()
    };

    rusty_tesseract::image_to_string(&img, &args).map_err(|e| {
        format!("rusty-tesseract OCR 실패 (Tesseract binary 또는 kor.traineddata 누락 의심): {e}")
    })
}
