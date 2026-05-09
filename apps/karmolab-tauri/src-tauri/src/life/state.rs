//! sub-F config + memo repo 위치 추적.
//!
//! KarmoLab Tauri 가 어디서 실행되든 `<memo>/life/raw/screenshot/` 에 박을 수 있어야.
//! `LIFE_MEMO_ROOT` env 우선, 없으면 current_exe 에서 walk up (memo/ 디렉토리 발견 시 stop).

use std::path::{Path, PathBuf};

pub struct LifeScreenConfig {
    pub memo_repo_root: PathBuf,
    pub raw_screenshot_dir: PathBuf,
}

impl LifeScreenConfig {
    pub fn resolve() -> Result<Self, String> {
        // 1) env override
        if let Ok(v) = std::env::var("LIFE_MEMO_ROOT") {
            let p = PathBuf::from(v);
            if p.is_dir() {
                return Ok(Self::with_memo_root(p));
            }
        }

        // 2) walk up from current exe — memo/ 디렉토리 만나면 stop
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let mut cur: Option<&Path> = exe.parent();
        while let Some(c) = cur {
            let candidate = c.join("memo");
            if candidate.is_dir() && candidate.join("life").is_dir() {
                return Ok(Self::with_memo_root(candidate));
            }
            cur = c.parent();
        }

        Err("LIFE_MEMO_ROOT env 미설정 + memo 디렉토리 자동 발견 실패. \
             KarmoLab 시작 시 LIFE_MEMO_ROOT env 박아야."
            .into())
    }

    fn with_memo_root(memo: PathBuf) -> Self {
        let raw_screenshot_dir = memo.join("life").join("raw").join("screenshot");
        Self {
            memo_repo_root: memo,
            raw_screenshot_dir,
        }
    }
}
