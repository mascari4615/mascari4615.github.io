//! sub-G — input → 어느 페르소나 + 침묵 여부 결정.
//!
//! 룰 (시드 단계, 임시 WM 4 캐릭터 차용):
//! - domain "infra" / "dev" / "code" / "admin" → Alisa (질서·관찰).
//! - domain "game" / "fun" / "play" → Ring (충동·짧음).
//! - domain "health" / "home" / "life" / "relationship" → Yon (관조·드물게).
//! - 그 외 / 빈 domain → Yon (default).
//! - silence=true 페르소나 (Fourth) 절대 선택 X.
//! - cooldown / mood: phase 2 backlog (state 추가 필요).

use super::persona::Persona;
use super::ReactInput;

pub fn select<'a>(input: &ReactInput, personas: &'a [Persona]) -> Option<&'a Persona> {
    let by_id = |id: &str| -> Option<&'a Persona> {
        personas.iter().find(|p| p.id == id && !p.silence)
    };

    let primary = input.domain.first().map(|s| s.as_str()).unwrap_or("");
    let pick = match primary {
        "infra" | "dev" | "code" | "admin" => by_id("alisa"),
        "game" | "fun" | "play" => by_id("ring"),
        "health" | "home" | "life" | "relationship" => by_id("yon"),
        _ => by_id("yon"),
    };

    pick.or_else(|| personas.iter().find(|p| !p.silence))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use std::path::Path;

    fn p(id: &str, silence: bool) -> Persona {
        Persona {
            id: id.to_string(),
            name: id.to_string(),
            silence,
            system_prompt: String::new(),
        }
    }

    fn input_with_domain(d: &[&str]) -> (ReactInput<'static>, Vec<String>) {
        let domain: Vec<String> = d.iter().map(|s| s.to_string()).collect();
        (
            ReactInput {
                channel: "screenshot",
                trigger: "test",
                timestamp: chrono::Local
                    .with_ymd_and_hms(2026, 5, 10, 0, 0, 0)
                    .unwrap(),
                binary_path: Path::new("x.png"),
                domain: &[],
                tags: &[],
                summary: "",
                app: None,
                vision_summary: None,
                vision_context: None,
                transcript: None,
            },
            domain,
        )
    }

    #[test]
    fn infra_picks_alisa() {
        let personas = vec![p("yon", false), p("ring", false), p("alisa", false)];
        let (mut input, domain) = input_with_domain(&["infra"]);
        input.domain = &domain;
        assert_eq!(select(&input, &personas).unwrap().id, "alisa");
    }

    #[test]
    fn game_picks_ring() {
        let personas = vec![p("yon", false), p("ring", false), p("alisa", false)];
        let (mut input, domain) = input_with_domain(&["game"]);
        input.domain = &domain;
        assert_eq!(select(&input, &personas).unwrap().id, "ring");
    }

    #[test]
    fn unknown_domain_picks_yon() {
        let personas = vec![p("yon", false), p("ring", false)];
        let (mut input, domain) = input_with_domain(&["mystery"]);
        input.domain = &domain;
        assert_eq!(select(&input, &personas).unwrap().id, "yon");
    }

    #[test]
    fn silence_persona_skipped() {
        let personas = vec![p("fourth", true), p("ring", false)];
        let (mut input, domain) = input_with_domain(&["game"]);
        input.domain = &domain;
        assert_eq!(select(&input, &personas).unwrap().id, "ring");
    }

    #[test]
    fn all_silent_returns_none() {
        let personas = vec![p("fourth", true)];
        let (input, _) = input_with_domain(&[]);
        assert!(select(&input, &personas).is_none());
    }
}
