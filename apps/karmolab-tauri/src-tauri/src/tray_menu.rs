//! 트레이 「빠른 손잡이」 — 시계 옆 아이콘에서 바로 켜고 끈다.
//!
//! 조수님(2026-08-19): 「동반자 켜려면 터미널 열고 cd 하고 node… 접근성이 많이 낮다.
//! KarmoLab 안에 있으면 좋겠고, KarmoLab 트레이에도 넣자. 다른 위젯·기능도 넣고 싶을 수
//! 있으니 확장성 있고 유연하게.」
//!
//! 그래서 **메뉴를 코드에 안 박는다.** 줄은 `apps/karmolab/data/tray-menu.json` 이
//! 정하고, 여기는 그 줄을 그리고 누르면 시키는 일만 한다. 손잡이 하나 더 다는 값 =
//! 그 파일에 네 줄. Rust 는 안 건드리고, 다시 굽지도 않는다.
//!
//! 갈래 셋 (kind):
//!   - `dev`  — 서버·봇을 켜고 끈다. `profile` = `servermonitor-config.json` 의 devProfiles id.
//!              **사람 카드와 같은 손**(`localdev_start/stop`)이라 상태가 갈라지지 않는다.
//!   - `tool` — 창을 열고 그 도구로 간다. `tool` = 위젯 id (주소의 `#<id>`).
//!   - `url`  — 브라우저로 연다.
//!   - `files` — Files 전용 창을 연다 (파일 화면은 독립 제품 표면이라 위젯이 아니다).
//!
//! 적어 둔 것이 실제로 있는지(없는 프로필·없는 위젯을 가리키는지)는 굽기 전에
//! `scripts/servermonitor-config-audit.mjs` 가 막는다 — 눌러 보고 알게 되면 늦다.

use std::path::{Path, PathBuf};

use serde::Deserialize;

/// 트레이에 뜨는 줄 하나.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuickItem {
    /// 메뉴 항목 id. `tray_quick_<id>` 로 나간다.
    pub id: String,
    pub label: String,
    pub kind: QuickKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QuickKind {
    /// 서버·봇 켜고 끄기 (devProfiles id).
    Dev { profile: String },
    /// 창을 열고 그 도구로 (위젯 id).
    Tool { tool: String },
    /// 브라우저로 열기.
    Url { url: String },
    /// Files 전용 창을 연다. 카모랩 화면 안이 아니라 자기 창이다.
    Files,
}

impl QuickItem {
    /// 트레이 메뉴 항목 id — 다른 항목(`tray_show` 등)과 절대 안 겹치게 접두어를 단다.
    pub fn menu_id(&self) -> String {
        format!("tray_quick_{}", self.id)
    }

    /// 지금 켜져 있는지 **글자로** 적는다. 「눌렀는데 뭐가 됐는지 모르겠다」를 없애는 자리다.
    ///
    /// 기호(✓)를 쓰면 안 된다 — 윈도우 트레이 메뉴 글꼴에 없어서 **두부(□)로 뜼다**
    /// (조수님이 실제로 그렇게 봤다). 트레이는 글꼴을 우리가 못 고르는 자리다.
    pub fn label_with_state(&self, running: bool) -> String {
        match self.kind {
            QuickKind::Dev { .. } if running => format!("{} · 켜짐 (끄기)", self.label),
            QuickKind::Dev { .. } => format!("{} · 켜기", self.label),
            _ => self.label.clone(),
        }
    }
}

#[derive(Deserialize)]
struct RawFile {
    #[serde(default)]
    items: Vec<RawItem>,
}

#[derive(Deserialize)]
struct RawItem {
    id: String,
    kind: String,
    label: String,
    #[serde(default)]
    profile: Option<String>,
    #[serde(default)]
    tool: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    order: Option<i64>,
}

/// 저장소 루트 기준 설정 파일 자리.
pub fn config_path(repo_root: &Path) -> PathBuf {
    repo_root
        .join("apps")
        .join("karmolab")
        .join("data")
        .join("tray-menu.json")
}

/// 글을 읽어 줄 목록으로. **못 읽으면 빈 목록** — 트레이 전체가 안 뜨는 것보다 낫다
/// (설정 한 줄이 깨졌다고 「종료」까지 사라지면 앱을 끌 길이 없어진다).
pub fn parse(raw: &str) -> Vec<QuickItem> {
    let Ok(file) = serde_json::from_str::<RawFile>(raw) else {
        return Vec::new();
    };
    let mut with_order: Vec<(i64, QuickItem)> = Vec::new();
    for (i, item) in file.items.into_iter().enumerate() {
        let kind = match item.kind.as_str() {
            "dev" => item.profile.map(|profile| QuickKind::Dev { profile }),
            "tool" => item.tool.map(|tool| QuickKind::Tool { tool }),
            "url" => item.url.map(|url| QuickKind::Url { url }),
            "files" => Some(QuickKind::Files),
            // 모르는 갈래는 조용히 버린다 — 옛 앱이 새 갈래를 만나도 나머지는 뜬다.
            _ => None,
        };
        let Some(kind) = kind else { continue };
        with_order.push((
            item.order.unwrap_or((i as i64) * 100),
            QuickItem {
                id: item.id,
                label: item.label,
                kind,
            },
        ));
    }
    with_order.sort_by_key(|(order, _)| *order);
    with_order.into_iter().map(|(_, item)| item).collect()
}

/// 저장소에서 읽는다. 저장소 자리를 아직 모르면 빈 목록.
pub fn load(repo_root: Option<&Path>) -> Vec<QuickItem> {
    let Some(root) = repo_root else {
        return Vec::new();
    };
    let Ok(raw) = std::fs::read_to_string(config_path(root)) else {
        return Vec::new();
    };
    parse(&raw)
}

/* ── 손잡이를 언제 다시 그리나 ────────────────────────────────────────────────
   줄은 **저장소 안의 파일**이 정하는데, 저장소 자리는 앱이 뜬 뒤에 정해질 수 있다
   (처음 켠 판 · 자리를 옮긴 판). 뜰 때 한 번만 그리면 그때는 빈 채로 남고, 사람은
   「설정했는데 트레이엔 없다 → 껐다 켜야 하나」를 겪는다. 실제로 겪었다(DEV 앱 첫 판:
   `localdev-state.json` 이 `{"pids":{}}` 뿐이라 묶음이 통째로 안 떴다).

   그래서 트레이 손잡이를 **들고 있다가 다시 그린다.** 누르면 뭘 할지도 이 안에서
   찾는다 — 클로저가 옛 표를 쥐고 있으면 새로 그린 줄은 눌러도 아무 일이 안 난다. */
#[derive(Default)]
pub struct TrayState {
    /// 트레이 아이콘 손잡이. 메뉴를 갈아 끼우려면 이게 있어야 한다.
    pub icon: std::sync::Mutex<Option<tauri::tray::TrayIcon>>,
    /// 메뉴 항목 id → 무엇을 하는 줄인가.
    pub items: std::sync::Mutex<std::collections::HashMap<String, QuickItem>>,
    /// 메뉴 항목 id → 그 줄의 글자(켜짐 ✓ 를 갈아 끼운다).
    pub labels: std::sync::Mutex<std::collections::HashMap<String, tauri::menu::MenuItem<tauri::Wry>>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 갈래_셋을_읽는다() {
        let items = parse(
            r#"{"items":[
                {"id":"a","kind":"dev","profile":"companion","label":"동반자","order":10},
                {"id":"b","kind":"tool","tool":"servermonitor","label":"모니터","order":20},
                {"id":"c","kind":"url","url":"https://example.com","label":"밖","order":30}
            ]}"#,
        );
        assert_eq!(items.len(), 3);
        assert_eq!(
            items[0].kind,
            QuickKind::Dev {
                profile: "companion".into()
            }
        );
        assert_eq!(items[1].kind, QuickKind::Tool { tool: "servermonitor".into() });
        assert_eq!(items[2].kind, QuickKind::Url { url: "https://example.com".into() });
    }

    #[test]
    fn order_대로_줄을_세운다() {
        let items = parse(
            r#"{"items":[
                {"id":"late","kind":"url","url":"https://b","label":"뒤","order":99},
                {"id":"early","kind":"url","url":"https://a","label":"앞","order":1}
            ]}"#,
        );
        assert_eq!(items[0].id, "early");
        assert_eq!(items[1].id, "late");
    }

    #[test]
    fn 갈래에_맞는_값이_빠지면_그_줄만_버린다() {
        // profile 없는 dev 줄. 이것 때문에 나머지가 통째로 사라지면 안 된다.
        let items = parse(
            r#"{"items":[
                {"id":"broken","kind":"dev","label":"짝 없는 줄"},
                {"id":"ok","kind":"url","url":"https://a","label":"멀쩡한 줄"}
            ]}"#,
        );
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "ok");
    }

    #[test]
    fn 글이_깨져도_트레이는_뜬다() {
        // 빈 목록으로 물러선다 — 「종료」까지 사라지면 앱을 끌 길이 없어진다.
        assert!(parse("{ 이건 JSON 이 아니다").is_empty());
    }

    #[test]
    fn 모르는_갈래는_버리고_나머지는_뜬다() {
        let items = parse(
            r#"{"items":[
                {"id":"future","kind":"아직-없는-갈래","label":"새 것"},
                {"id":"ok","kind":"url","url":"https://a","label":"지금 것"}
            ]}"#,
        );
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "ok");
    }

    #[test]
    fn 켜짐_꺼짐이_글자로_갈린다() {
        let dev = QuickItem {
            id: "companion".into(),
            label: "동반자".into(),
            kind: QuickKind::Dev {
                profile: "companion".into(),
            },
        };
        assert_eq!(dev.label_with_state(true), "동반자 · 켜짐 (끄기)");
        assert_eq!(dev.label_with_state(false), "동반자 · 켜기");
        // 기호는 트레이 글꼴에 없어 두부로 뜼다 — 글자만 쓴다.
        assert!(!dev.label_with_state(true).contains('✓'));
        assert_eq!(dev.menu_id(), "tray_quick_companion");

        // 켜고 끄는 게 아닌 줄에는 상태를 안 붙인다 — 없는 상태를 있는 척하면 안 된다.
        let url = QuickItem {
            id: "밖".into(),
            label: "밖".into(),
            kind: QuickKind::Url {
                url: "https://a".into(),
            },
        };
        assert_eq!(url.label_with_state(true), "밖");
    }
}
