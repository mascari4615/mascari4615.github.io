//! 내 AI 개발환경 감사 — TASK-KL-348 / TASK-KAR-251.
//!
//! 비밀값은 읽지 않는다. 파일·디렉터리와 안전한 설정 표식의 존재만 판정한다.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
pub struct VendorState {
    vendor: &'static str,
    status: &'static str,
    reason: String,
    evidence: Vec<String>,
}

#[derive(Serialize)]
pub struct EnvironmentFeature {
    id: &'static str,
    label: &'static str,
    description: &'static str,
    vendors: Vec<VendorState>,
}

#[derive(Serialize)]
pub struct EnvironmentAudit {
    checked_at: u64,
    features: Vec<EnvironmentFeature>,
}

fn exists(path: &Path) -> bool {
    path.exists()
}

fn has_entries(path: &Path) -> bool {
    std::fs::read_dir(path)
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false)
}

fn contains(path: &Path, needle: &str) -> bool {
    std::fs::read_to_string(path)
        .map(|text| text.contains(needle))
        .unwrap_or(false)
}

fn state(
    vendor: &'static str,
    applied: bool,
    partial: bool,
    reason: impl Into<String>,
    evidence: Vec<PathBuf>,
) -> VendorState {
    VendorState {
        vendor,
        status: if partial { "partial" } else if applied { "applied" } else { "missing" },
        reason: reason.into(),
        evidence: evidence
            .into_iter()
            .map(|path| path.display().to_string())
            .collect(),
    }
}

fn unknown(vendor: &'static str, reason: impl Into<String>, evidence: Vec<PathBuf>) -> VendorState {
    VendorState {
        vendor,
        status: "unknown",
        reason: reason.into(),
        evidence: evidence.into_iter().map(|path| path.display().to_string()).collect(),
    }
}

#[tauri::command]
pub fn ai_environment_audit() -> Result<EnvironmentAudit, String> {
    let home = PathBuf::from(
        std::env::var("USERPROFILE").map_err(|_| "USERPROFILE 환경 변수가 없다".to_string())?,
    );
    let umbrella = home.join("repos").join("karmoddrine");
    let root_agents = umbrella.join("AGENTS.md");
    let root_claude = umbrella.join("CLAUDE.md");
    let claude = home.join(".claude");
    let codex = home.join(".codex");
    let agents = home.join(".agents");
    let grok = home.join(".grok");
    let agent_hooks = home.join(".karmoddrine").join("agent-hooks");
    let claude_settings = claude.join("settings.json");
    let codex_config = codex.join("config.toml");
    let grok_hooks = grok.join("hooks").join("karmoddrine.json");

    let instructions = EnvironmentFeature {
        id: "instructions",
        label: "지침",
        description: "저장소와 사용자 범위의 지속 규칙",
        vendors: vec![
            state("claude", exists(&root_claude), false, "CLAUDE.md 진입 문서", vec![root_claude.clone()]),
            state("codex", exists(&root_agents), false, "AGENTS.md 진입 문서", vec![root_agents.clone()]),
            state("grok", exists(&root_agents) && exists(&root_claude), false, "AGENTS.md와 CLAUDE.md를 함께 로드", vec![root_agents.clone(), root_claude.clone()]),
        ],
    };

    let claude_skills = claude.join("skills");
    let codex_skills = agents.join("skills");
    let codex_bundled_skills = codex.join("skills");
    let skills = EnvironmentFeature {
        id: "skills",
        label: "스킬",
        description: "반복 작업을 위한 SKILL.md 워크플로",
        vendors: vec![
            state("claude", has_entries(&claude_skills), false, "Claude 사용자 스킬", vec![claude_skills.clone()]),
            state("codex", has_entries(&codex_skills) && has_entries(&codex_bundled_skills), has_entries(&codex_skills) || has_entries(&codex_bundled_skills), "Codex 사용자, 시스템 스킬 검색 경로", vec![codex_skills.clone(), codex_bundled_skills.clone()]),
            state("grok", has_entries(&claude_skills), true, "Claude 호환 스킬 스캔에 의존", vec![claude_skills.clone()]),
        ],
    };

    let codex_hooks = codex.join("hooks.json");
    let hooks = EnvironmentFeature {
        id: "hooks",
        label: "훅",
        description: "세션·프롬프트·도구 호출 전후의 기계적 집행",
        vendors: vec![
            state("claude", has_entries(&agent_hooks) && contains(&claude_settings, "\"hooks\""), false, "공통 hook runtime과 Claude 배선", vec![agent_hooks.clone(), claude_settings.clone()]),
            state("codex", has_entries(&agent_hooks) && (exists(&codex_hooks) || contains(&codex_config, "[hooks]")) && !contains(&codex_config, "hooks = false"), false, "공통 hook runtime과 Codex 배선", vec![agent_hooks.clone(), codex_hooks.clone(), codex_config.clone()]),
            state("grok", has_entries(&agent_hooks) && exists(&grok_hooks), false, "공통 hook runtime과 Grok adapter", vec![agent_hooks.clone(), grok_hooks.clone()]),
        ],
    };

    let claude_commands = claude.join("commands");
    let commands = EnvironmentFeature {
        id: "commands",
        label: "커맨드",
        description: "사용자가 직접 부르는 반복 명령과 프롬프트",
        vendors: vec![
            state("claude", has_entries(&claude_commands), false, "Claude slash commands", vec![claude_commands.clone()]),
            state("codex", has_entries(&codex_skills), has_entries(&codex_bundled_skills), "Codex skill 명시 호출: $session-start, $session-end", vec![codex_skills.clone(), codex_bundled_skills.clone()]),
            state("grok", has_entries(&claude_commands), true, "Claude 호환 command 스캔에 의존", vec![claude_commands.clone()]),
        ],
    };

    let memory = EnvironmentFeature {
        id: "memory",
        label: "메모리",
        description: "세션을 넘어 유지되는 개인화와 작업 기억",
        vendors: vec![
            state("claude", exists(&claude.join("projects")), false, "Claude project memory", vec![claude.join("projects")]),
            state("codex", has_entries(&codex.join("memories")) && contains(&codex_config, "memories = true"), exists(&codex.join("memories")), "Codex local memory 설정과 생성 상태", vec![codex.join("memories"), codex_config.clone()]),
            state("grok", exists(&grok.join("last-session-start.md")), true, "SessionStart 파일 기반 기억만 확인", vec![grok.join("last-session-start.md")]),
        ],
    };

    let mcp = EnvironmentFeature {
        id: "mcp",
        label: "MCP · 도구",
        description: "외부 앱과 로컬 도구 연결",
        vendors: vec![
            state("claude", contains(&claude_settings, "mcp"), true, "Claude settings의 MCP 표식", vec![claude_settings.clone()]),
            state("codex", contains(&codex_config, "[mcp_servers."), false, "Codex MCP 서버 설정", vec![codex_config.clone()]),
            state("grok", contains(&grok.join("settings.json"), "mcp"), true, "Grok MCP 설정 표식", vec![grok.join("settings.json")]),
        ],
    };

    let permissions = EnvironmentFeature {
        id: "permissions",
        label: "권한 · 샌드박스",
        description: "파일·명령·네트워크 허용 범위",
        vendors: vec![
            state("claude", contains(&claude_settings, "permissions"), false, "Claude permissions 설정", vec![claude_settings.clone()]),
            state("codex", exists(&codex_config), false, "Codex config와 프로젝트 trust", vec![codex_config.clone()]),
            state("grok", exists(&grok.join("settings.json")), true, "Grok 설정 존재만 확인", vec![grok.join("settings.json")]),
        ],
    };

    let plugins = EnvironmentFeature {
        id: "plugins",
        label: "플러그인",
        description: "스킬, MCP, 표현 자산을 함께 배포하는 확장 묶음",
        vendors: vec![
            state("claude", has_entries(&claude.join("plugins")), false, "Claude plugin 저장소", vec![claude.join("plugins")]),
            state("codex", has_entries(&codex.join("plugins")), false, "Codex plugin 저장소", vec![codex.join("plugins")]),
            state("grok", has_entries(&grok.join("plugins")), false, "Grok plugin 저장소", vec![grok.join("plugins")]),
        ],
    };

    let subagents = EnvironmentFeature {
        id: "subagents",
        label: "서브에이전트",
        description: "독립 하위 세션으로 나눠 병렬 처리하는 위임",
        vendors: vec![
            unknown("claude", "제품 지원 여부는 로컬 파일만으로 판정하지 않음", vec![claude_settings.clone()]),
            unknown("codex", "제품 지원 여부는 로컬 파일만으로 판정하지 않음", vec![codex_config.clone()]),
            unknown("grok", "제품 지원 여부는 로컬 파일만으로 판정하지 않음", vec![grok.join("config.toml")]),
        ],
    };

    let checked_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    Ok(EnvironmentAudit {
        checked_at,
        features: vec![instructions, skills, hooks, commands, memory, mcp, plugins, permissions, EnvironmentFeature {
            id: "automation",
            label: "예약, 무인 실행",
            description: "사용자 호출 없이 예약·반복 실행되는 AI 작업",
            vendors: vec![
                unknown("claude", "예약 실행의 계정, 앱 상태는 로컬 파일만으로 판정하지 않음", vec![claude.join("automations")]),
                unknown("codex", "Codex 예약 작업은 데스크톱, 웹 Scheduled에서 관리됨", vec![codex.join("automations")]),
                unknown("grok", "예약 실행의 계정, 앱 상태는 로컬 파일만으로 판정하지 않음", vec![grok.join("automations")]),
            ],
        }, subagents],
    })
}
