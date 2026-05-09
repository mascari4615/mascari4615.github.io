//! sub-G — 페르소나 .md 로드.
//!
//! `<memo>/life/companion/personas/<id>.md` (frontmatter + 본문).
//! frontmatter: `name`, `tone`, `interests[]`, `silence` (bool).
//! 본문 = LLM system prompt 그대로.

use std::fs;
use std::path::Path;

/// frontmatter `tone` / `interests` 는 사용자 문서용 (페르소나 .md 정본). 코드는 `name` + `silence` + 본문(system_prompt) 만 사용 — Phase 2 에서 router 정교화 시 frontmatter 추가 사용 가능.
#[derive(Debug, Clone)]
pub struct Persona {
    pub id: String,
    pub name: String,
    /// true = router 가 절대 선택 X (e.g., Fourth = 침묵 관찰자).
    pub silence: bool,
    pub system_prompt: String,
}

pub fn load_all(companion_root: &Path) -> Result<Vec<Persona>, String> {
    let dir = companion_root.join("personas");
    if !dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let id = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };
        let body = fs::read_to_string(&path).map_err(|e| format!("{}: {}", id, e))?;
        out.push(parse(&id, &body));
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

fn parse(id: &str, body: &str) -> Persona {
    let (fm_str, content) = split_frontmatter(body);
    let fm: serde_yml::Value = serde_yml::from_str(fm_str).unwrap_or(serde_yml::Value::Null);

    let get_str = |k: &str| -> String {
        fm.get(k)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    let get_bool = |k: &str| -> bool { fm.get(k).and_then(|v| v.as_bool()).unwrap_or(false) };

    let name = {
        let n = get_str("name");
        if n.is_empty() { id.to_string() } else { n }
    };
    let silence = get_bool("silence");

    Persona {
        id: id.to_string(),
        name,
        silence,
        system_prompt: content.trim().to_string(),
    }
}

fn split_frontmatter(body: &str) -> (&str, &str) {
    if let Some(rest) = body.strip_prefix("---\n") {
        if let Some((yaml, after)) = rest.split_once("\n---\n") {
            return (yaml, after);
        }
        if let Some((yaml, after)) = rest.split_once("\n---") {
            return (yaml, after);
        }
    }
    ("", body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_minimal() {
        let p = parse(
            "ring",
            "---\nname: 링\ntone: 충동\nsilence: false\ninterests:\n  - 새 게임\n---\n\nbody here.",
        );
        assert_eq!(p.id, "ring");
        assert_eq!(p.name, "링");
        assert!(!p.silence);
        assert_eq!(p.system_prompt, "body here.");
    }

    #[test]
    fn parse_silence_true() {
        let p = parse("fourth", "---\nname: 포스\nsilence: true\n---\n\n");
        assert!(p.silence);
    }

    #[test]
    fn parse_no_frontmatter_falls_back() {
        let p = parse("yon", "no frontmatter just body");
        assert_eq!(p.id, "yon");
        assert_eq!(p.name, "yon");
        assert!(p.system_prompt.contains("just body"));
    }
}
