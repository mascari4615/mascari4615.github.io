//! 부품을 **릴리스에서 받아 푼다** (TASK-KAR-227).
//!
//! 왜: 「설치」 화면은 여태 *소스에서 굽기*만 했다. 그래서 소스를 받아 둔 사람만 쓸 수
//! 있었다 — 프로그램만 깐 사람에게는 깔 대상도 방법도 없었다. 굽는 것과 받는 것은 다른
//! 길이라, 굽기를 아무리 다듬어도 그 사람에게는 닿지 않는다.
//!
//! 세 가지를 못 박는다:
//!
//! - **주소를 밖에서 안 받는다.** 부품 이름만 받고 주소는 여기서 만든다. 창이 부르는 대로
//!   아무 데서나 내려받으면 그건 다운로더지 설치가 아니다.
//! - **받은 자리는 앱 데이터 폴더다.** 저장소가 없어도 되는 길을 만드는 것이 목적인데
//!   저장소 안에 풀면 처음 문제로 돌아간다.
//! - **푸는 경로를 검사한다.** 압축 안에 `..` 이 들어 있으면 바깥에 파일을 쓸 수 있다
//!   (zip slip). 우리 손으로 만든 압축이라도 검사한다 — 「우리 것이니 괜찮다」는 검사가 아니다.

use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use tauri::Manager;

/// 어디서 받나. 릴리스는 이 저장소 것만 본다.
const REPO: &str = "mascari4615/mascari4615.github.io";

#[derive(Serialize)]
pub struct FetchedPart {
    /// 푼 자리 (앱 데이터 폴더 아래)
    pub path: String,
    /// 받은 파일 이름
    pub asset: String,
    /// 받은 바이트
    pub bytes: u64,
}

/// 부품 이름 → 릴리스 에셋 이름의 앞머리. 아는 것만 받는다.
fn asset_prefix(part: &str) -> Option<&'static str> {
    match part {
        "companion" => Some("companion-"),
        _ => None,
    }
}

/// 압축 안의 한 자리가 풀어도 되는 곳인가 (zip slip 막기).
fn safe_join(base: &Path, name: &str) -> Option<PathBuf> {
    let rel = Path::new(name);
    for part in rel.components() {
        match part {
            Component::Normal(_) => {}
            // `..` · 절대경로 · 드라이브 문자는 전부 바깥을 가리킬 수 있다.
            _ => return None,
        }
    }
    Some(base.join(rel))
}

/// 릴리스에서 부품을 받아 푼다. 이미 있으면 지우고 새로 푼다.
#[tauri::command]
pub async fn part_fetch(part: String, app: tauri::AppHandle) -> Result<FetchedPart, String> {
    let prefix = asset_prefix(&part).ok_or_else(|| format!("모르는 부품이다: {part}"))?;

    let client = reqwest::Client::builder()
        .user_agent("karmolab-desktop")
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let release: serde_json::Value = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("릴리스를 못 물어봤다: {e}"))?
        .json()
        .await
        .map_err(|e| format!("릴리스 답을 못 읽었다: {e}"))?;

    let assets = release
        .get("assets")
        .and_then(|a| a.as_array())
        .ok_or_else(|| "릴리스에 에셋 목록이 없다".to_string())?;

    let asset = assets
        .iter()
        .find(|a| {
            a.get("name")
                .and_then(|n| n.as_str())
                .map(|n| n.starts_with(prefix) && n.ends_with(".zip"))
                .unwrap_or(false)
        })
        .ok_or_else(|| {
            format!("최신 릴리스에 「{prefix}…zip」 이 아직 없다 — 다음 판부터 올라간다")
        })?;

    let name = asset
        .get("name")
        .and_then(|n| n.as_str())
        .unwrap_or("part.zip")
        .to_string();
    let dl = asset
        .get("browser_download_url")
        .and_then(|u| u.as_str())
        .ok_or_else(|| "받을 주소가 없다".to_string())?
        .to_string();

    let body = client
        .get(dl)
        .send()
        .await
        .map_err(|e| format!("못 받았다: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("받다 끊겼다: {e}"))?;
    let bytes = body.len() as u64;

    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("앱 데이터 폴더를 못 찾았다: {e}"))?
        .join("parts")
        .join(&part);

    // 반쯤 푼 자리가 남아 있으면 「깔렸다」로 보인다 — 통째로 새로 푼다.
    if base.exists() {
        fs::remove_dir_all(&base).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;

    let reader = io::Cursor::new(body);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("압축을 못 열었다: {e}"))?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let raw = entry.name().replace('\\', "/");
        let Some(target) = safe_join(&base, &raw) else {
            return Err(format!("압축 안에 바깥을 가리키는 자리가 있다: {raw}"));
        };
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = fs::File::create(&target).map_err(|e| e.to_string())?;
        io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }

    Ok(FetchedPart {
        path: base.to_string_lossy().to_string(),
        asset: name,
        bytes,
    })
}

/// 받아 둔 부품이 어디 있나. 없으면 `None` — 「안 깔림」과 「못 봤다」를 가르는 자리다.
#[tauri::command]
pub fn part_fetched_path(part: String, app: tauri::AppHandle) -> Option<String> {
    let base = app.path().app_data_dir().ok()?.join("parts").join(&part);
    if base.join("package.json").is_file() {
        Some(base.to_string_lossy().to_string())
    } else {
        None
    }
}
