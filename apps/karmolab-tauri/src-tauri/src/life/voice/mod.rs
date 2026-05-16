//! 음성 채널 — KL-052-B2: candle Whisper + cpal 캡처를 ML sidecar
//! (karmolab-life-ml) 로 분리. 본 모듈 = sidecar IPC client + 후반
//! 파이프라인(classify/schema/companion — ML dep 아님, 메인 유지).
//!
//! 흐름:
//! 1. Life 위젯 voice enable → `sidecar::ensure_spawned` (프로세스 1회 +
//!    Whisper 백그라운드 로드, model_dir = 메인 resolve 주입 — 결정 #3)
//! 2. hotkey Pressed (Ctrl+Alt+Space) → `record_start` → sidecar cpal open
//! 3. hotkey Released → `record_stop_and_process` → sidecar stop+transcribe
//!    → `(text, 임시 wav, duration)` → 별 thread 에서 후반 처리
//! 4. classify (claude CLI) → wav memo 이동 → .md write → companion::react
//!
//! 정본: TASK-KL-052 § 작업 단계 KL-052-B / src-tauri-ml/PROTOCOL.md.
//! cpal/candle in-process(capture.rs/transcribe.rs)는 sidecar 이관으로
//! 제거됨 (마이그 자기소멸).

pub mod schema;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::AppHandle;

use super::classify::{self, ClassifyKind};
use super::companion;
use super::schema as screen_schema;
use super::sidecar;
use super::state::LifeScreenConfig;

use karmolab_shared::{SidecarCommand, SidecarEvent};

const MODEL_NAME: &str = "ggml-large-v3";

/// 메인 로컬 상태 미러 — Whisper 로드 완료 1회 확정 후 캐시 (KL-052-B3 fix).
/// sidecar 는 단일 stdin/stdout 순차 dispatch — transcribe(VoiceRecordStop,
/// 수초+) 중엔 sidecar 가 다음 명령을 안 읽으므로 VoiceStatus 폴링이
/// send() Mutex 에 막혀 UI 가 멈춘다. loaded 확정 전(=record 전, transcribe
/// 없음 → lock 경합 0)까지만 sidecar VoiceStatus 폴링하고, 한번 loaded
/// 받으면 캐시 → 이후 record/transcribe 중 UI 폴링은 sidecar 안 거치고
/// 즉답. disable 시 리셋.
static VOICE_LOADED: AtomicBool = AtomicBool::new(false);

fn model_dir() -> Result<std::path::PathBuf, String> {
    let config = LifeScreenConfig::resolve()?;
    Ok(config
        .memo_repo_root
        .join("life")
        .join(".models")
        .join("whisper-large-v3"))
}

/// Life 위젯 활성화 — sidecar spawn(공용, 1회) + Whisper 백그라운드
/// 로드(~3.1GB). 이미 활성이면 no-op. `app` = plugin-shell sidecar spawn.
pub fn enable(app: &AppHandle) -> Result<(), String> {
    sidecar::ensure_spawned(app)?;
    let model_dir = model_dir()?.to_string_lossy().into_owned();
    VOICE_LOADED.store(false, Ordering::SeqCst); // 로드 시작 — 아직 loading
    match sidecar::send(&SidecarCommand::VoiceLoad { model_dir }, sidecar::SHORT_TIMEOUT)? {
        SidecarEvent::Loaded => Ok(()),
        other => Err(format!("VoiceLoad 예상 외 응답: {other:?}")),
    }
}

/// Life 위젯 비활성화 — VoiceUnload(~3.1GB 반환). sidecar 프로세스는
/// screen 공용이라 유지 (종료는 앱 종료 hook = sidecar::terminate).
pub fn disable() {
    VOICE_LOADED.store(false, Ordering::SeqCst);
    if sidecar::is_spawned() {
        let _ = sidecar::send(&SidecarCommand::VoiceUnload, sidecar::SHORT_TIMEOUT);
    }
}

/// (loaded, loading). loaded 1회 확정 후 캐시 — 이후 sidecar 안 거침
/// (transcribe 중 UI 폴링 블록 회피, KL-052-B3 fix).
fn voice_status() -> (bool, bool) {
    if VOICE_LOADED.load(Ordering::SeqCst) {
        return (true, false); // 캐시 hit — sidecar 폴링 X (lock 무관)
    }
    if !sidecar::is_spawned() {
        return (false, false);
    }
    // 아직 loaded 미확정 = enable 직후 decoder load 중 (record 전 →
    // transcribe 없음 → send() lock 경합 0). loaded 받으면 캐시.
    match sidecar::send(&SidecarCommand::VoiceStatus, sidecar::SHORT_TIMEOUT) {
        Ok(SidecarEvent::Status { loaded, loading }) => {
            if loaded {
                VOICE_LOADED.store(true, Ordering::SeqCst);
            }
            (loaded, loading)
        }
        _ => (false, false),
    }
}

pub fn is_enabled() -> bool {
    let (loaded, loading) = voice_status();
    loaded || loading
}

pub fn is_loading() -> bool {
    voice_status().1
}

/// hotkey Pressed 시 호출. sidecar 가 cpal stream open.
/// voice 비활성(sidecar 미spawn)이면 에러.
pub fn record_start() -> Result<(), String> {
    match sidecar::send(&SidecarCommand::VoiceRecordStart, sidecar::SHORT_TIMEOUT)? {
        SidecarEvent::RecordStarted => Ok(()),
        other => Err(format!("RecordStart 예상 외 응답: {other:?}")),
    }
}

/// hotkey Released 시 호출. sidecar 가 cpal stop + Whisper transcribe.
/// 짧은 음성(<0.3s, sidecar noise drop) / 빈 transcript = noop.
/// 후반(classify/schema/companion)은 별 thread (원본 정합).
pub fn record_stop_and_process(trigger: &str) -> Result<(), String> {
    let (text, wav_path, duration_s) = match sidecar::send(
        &SidecarCommand::VoiceRecordStop,
        sidecar::HEAVY_TIMEOUT,
    ) {
        Ok(SidecarEvent::Transcribed {
            text,
            wav_path,
            duration_s,
        }) => (text, wav_path, duration_s),
        Ok(other) => {
            eprintln!("[life-voice] RecordStop 예상 외 응답: {other:?}");
            return Ok(());
        }
        Err(e) => {
            // noise drop / frame 0 등 = 정상 흐름 (원본도 무시).
            eprintln!("[life-voice] record_stop skip: {e}");
            return Ok(());
        }
    };
    if text.trim().is_empty() {
        eprintln!("[life-voice] 빈 transcript — skip (wav 정리)");
        let _ = std::fs::remove_file(&wav_path);
        return Ok(());
    }
    let trigger = trigger.to_string();
    std::thread::spawn(move || {
        if let Err(e) = process_recording(&text, &wav_path, duration_s, &trigger) {
            eprintln!("[life-voice] process_recording 실패: {e}");
        }
    });
    Ok(())
}


fn process_recording(
    text: &str,
    sidecar_wav: &str,
    duration_s: f32,
    trigger: &str,
) -> Result<(), String> {
    let config = LifeScreenConfig::resolve()?;
    let voice_dir = config
        .memo_repo_root
        .join("life")
        .join("raw")
        .join("voice");
    std::fs::create_dir_all(&voice_dir).map_err(|e| e.to_string())?;

    let now = chrono::Local::now();
    let stamp = now.format("%Y-%m-%dT%H-%M-%S").to_string();
    let transcript_snippet: String = text.chars().take(80).collect();
    eprintln!("[life-voice] transcript: {}", transcript_snippet);

    let classification = classify::classify(text, ClassifyKind::Voice);
    let raw_slug = if classification.slug.is_empty() {
        "untagged"
    } else {
        &classification.slug
    };
    let slug = screen_schema::sanitize_slug(raw_slug);

    let final_wav = voice_dir.join(format!("{stamp}-{slug}.wav"));
    let md_path = voice_dir.join(format!("{stamp}-{slug}.md"));
    sidecar::move_into(sidecar_wav, &final_wav)?;
    eprintln!(
        "[life-voice] wav 박힘 ({}, {:.1}s)",
        final_wav.display(),
        duration_s
    );

    let binary_filename = final_wav
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let frontmatter = schema::build_frontmatter(
        &now,
        &classification,
        &binary_filename,
        duration_s,
        MODEL_NAME,
        trigger,
    );
    schema::write_md(&md_path, &frontmatter, text)?;
    eprintln!("[life-voice] md 박힘 ({})", md_path.display());

    let companion_input = companion::ReactInput {
        channel: "voice",
        trigger,
        timestamp: now,
        binary_path: &final_wav,
        domain: &classification.domain,
        tags: &classification.tags,
        summary: &classification.summary,
        app: None,
        vision_summary: None,
        vision_context: None,
        transcript: Some(text),
    };
    match companion::react(&companion_input, &config) {
        Ok(r) => {
            let snippet: String = r
                .response
                .as_deref()
                .unwrap_or("(silence)")
                .chars()
                .take(80)
                .collect();
            eprintln!(
                "[life-companion] voice react done — persona={:?} response='{}'",
                r.persona, snippet
            );
        }
        Err(e) => eprintln!("[life-companion] voice react fail: {e}"),
    }
    Ok(())
}
