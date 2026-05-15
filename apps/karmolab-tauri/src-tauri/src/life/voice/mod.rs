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
mod sidecar;

use std::path::Path;

use tauri::AppHandle;

use super::classify::{self, ClassifyKind};
use super::companion;
use super::schema as screen_schema;
use super::state::LifeScreenConfig;

const MODEL_NAME: &str = "ggml-large-v3";

fn model_dir() -> Result<std::path::PathBuf, String> {
    let config = LifeScreenConfig::resolve()?;
    Ok(config
        .memo_repo_root
        .join("life")
        .join(".models")
        .join("whisper-large-v3"))
}

/// Life 위젯 활성화 — sidecar spawn(1회) + Whisper 백그라운드 로드(~3.1GB).
/// 이미 활성이면 no-op. 원본과 달리 `app` 필요 (plugin-shell sidecar).
pub fn enable(app: &AppHandle) -> Result<(), String> {
    let dir = model_dir()?;
    sidecar::ensure_spawned(app, &dir)
}

/// Life 위젯 비활성화 — sidecar VoiceUnload(~3.1GB 반환) + 프로세스 종료.
pub fn disable() {
    sidecar::shutdown();
}

pub fn is_enabled() -> bool {
    let (loaded, loading) = sidecar::status();
    loaded || loading
}

pub fn is_loading() -> bool {
    sidecar::status().1
}

/// hotkey Pressed 시 호출. sidecar 가 cpal stream open.
/// voice 비활성(sidecar 미spawn)이면 에러.
pub fn record_start() -> Result<(), String> {
    sidecar::record_start()
}

/// hotkey Released 시 호출. sidecar 가 cpal stop + Whisper transcribe.
/// 짧은 음성(<0.3s, sidecar noise drop) / 빈 transcript = noop.
/// 후반(classify/schema/companion)은 별 thread (원본 정합).
pub fn record_stop_and_process(trigger: &str) -> Result<(), String> {
    let (text, wav_path, duration_s) = match sidecar::record_stop() {
        Ok(v) => v,
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

/// sidecar 임시 wav → 최종 경로. 같은 볼륨이면 rename, cross-device
/// (OS temp ↔ memo 다른 드라이브) 면 copy + remove.
fn move_into(src: &str, dest: &Path) -> Result<(), String> {
    if std::fs::rename(src, dest).is_ok() {
        return Ok(());
    }
    std::fs::copy(src, dest).map_err(|e| format!("wav copy 실패: {e}"))?;
    let _ = std::fs::remove_file(src);
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
    move_into(sidecar_wav, &final_wav)?;
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
