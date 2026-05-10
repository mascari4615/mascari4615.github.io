//! TASK-LIFE-001-B-2 — Rust 음성 채널 (life-voice.py 폐기, KarmoLab Tauri 단일 process).
//!
//! 흐름:
//! 1. hotkey Pressed (Ctrl+Alt+Space) → `record_start` (cpal stream open)
//! 2. hotkey Released → `record_stop_and_process` (별 thread 진입)
//! 3. samples → wav write (placeholder) → transcribe (whisper-rs) → classify (claude CLI, Voice kind)
//! 4. wav rename + .md write (sub-B Python schema 정합)
//! 5. `companion::react` 직접 호출 (in-process — sub-G watcher 폐기 정합)
//!
//! 정본: TASK-LIFE-001-B-2-Rust-음성-마이그.md.

pub mod capture;
pub mod schema;
pub mod transcribe;

use std::sync::OnceLock;

use super::classify::{self, ClassifyKind};
use super::companion;
use super::schema as screen_schema;
use super::state::LifeScreenConfig;

const MIN_DURATION_SAMPLES: usize = (capture::TARGET_SAMPLE_RATE as usize) * 3 / 10; // 0.3s
const MODEL_NAME: &str = "ggml-large-v3";

static RECORDER: OnceLock<capture::Recorder> = OnceLock::new();

fn recorder() -> Result<&'static capture::Recorder, String> {
    if let Some(r) = RECORDER.get() {
        return Ok(r);
    }
    let r = capture::Recorder::new()?;
    let _ = RECORDER.set(r);
    RECORDER
        .get()
        .ok_or_else(|| "Recorder OnceLock race".to_string())
}

/// startup 시 백그라운드 thread 에서 호출 — whisper 모델 (~3.1GB) 사전 다운 + load.
/// 첫 음성 발화 시 사용자 부담 0 (모델 이미 cache + Decoder ready).
pub fn warm_up() {
    std::thread::Builder::new()
        .name("life-voice-warmup".into())
        .spawn(|| {
            eprintln!("[life-voice] decoder warmup 시작 (백그라운드, 모델 ~3.1GB 다운 가능)");
            // 1초 zero samples — model load + 1회 decode 동작 검증.
            let dummy = vec![0f32; capture::TARGET_SAMPLE_RATE as usize];
            match transcribe::transcribe(&dummy) {
                Ok(_) => eprintln!("[life-voice] decoder warmup 완료 — 첫 음성 발화 즉시 처리 가능"),
                Err(e) => eprintln!("[life-voice] decoder warmup 실패: {e}"),
            }
        })
        .ok();
}

/// hotkey Pressed 시 호출. 이미 record 중이면 no-op.
pub fn record_start() -> Result<(), String> {
    recorder()?.start()
}

/// hotkey Released 시 호출. 별 thread 에서 transcribe + classify + md write + companion::react.
/// 음성 짧음 (<0.3s) 또는 stream 미동작 시 noop.
pub fn record_stop_and_process(trigger: &str) -> Result<(), String> {
    let rec = recorder()?;
    let samples = match rec.stop() {
        Some(s) => s,
        None => {
            eprintln!("[life-voice] record stop — frame 0 (이미 종료 또는 stream 미시작)");
            return Ok(());
        }
    };
    if samples.len() < MIN_DURATION_SAMPLES {
        eprintln!(
            "[life-voice] {:.2}s < 0.3s — drop (noise)",
            samples.len() as f32 / capture::TARGET_SAMPLE_RATE as f32
        );
        return Ok(());
    }
    let trigger = trigger.to_string();
    std::thread::spawn(move || {
        if let Err(e) = process_recording(&samples, &trigger) {
            eprintln!("[life-voice] process_recording 실패: {e}");
        }
    });
    Ok(())
}

fn process_recording(samples: &[f32], trigger: &str) -> Result<(), String> {
    let config = LifeScreenConfig::resolve()?;
    let voice_dir = config.memo_repo_root.join("life").join("raw").join("voice");
    std::fs::create_dir_all(&voice_dir).map_err(|e| e.to_string())?;

    let now = chrono::Local::now();
    let stamp = now.format("%Y-%m-%dT%H-%M-%S").to_string();
    let placeholder_wav = voice_dir.join(format!("{stamp}-pending.wav"));
    capture::write_wav_pcm16(&placeholder_wav, samples)?;
    eprintln!(
        "[life-voice] wav 박힘 ({}, {:.1}s)",
        placeholder_wav.display(),
        samples.len() as f32 / capture::TARGET_SAMPLE_RATE as f32
    );

    eprintln!(
        "[life-voice] transcribe 시작 ({} samples)",
        samples.len()
    );
    let result = match transcribe::transcribe(samples) {
        Ok(r) => r,
        Err(e) => {
            // transcribe 실패 시 wav 는 보존 (placeholder 그대로) — 사용자 후속 fix 가능.
            eprintln!("[life-voice] transcribe 실패: {e} (wav 보존: {})", placeholder_wav.display());
            return Err(e);
        }
    };
    let transcript_snippet: String = result.text.chars().take(80).collect();
    eprintln!("[life-voice] transcript: {}", transcript_snippet);

    let classification = classify::classify(&result.text, ClassifyKind::Voice);
    let raw_slug = if classification.slug.is_empty() {
        "untagged"
    } else {
        &classification.slug
    };
    let slug = screen_schema::sanitize_slug(raw_slug);

    let final_wav = voice_dir.join(format!("{stamp}-{slug}.wav"));
    let md_path = voice_dir.join(format!("{stamp}-{slug}.md"));
    std::fs::rename(&placeholder_wav, &final_wav)
        .map_err(|e| format!("wav rename 실패: {e}"))?;

    let duration_s = samples.len() as f32 / capture::TARGET_SAMPLE_RATE as f32;
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
    schema::write_md(&md_path, &frontmatter, &result)?;
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
        transcript: Some(&result.text),
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
