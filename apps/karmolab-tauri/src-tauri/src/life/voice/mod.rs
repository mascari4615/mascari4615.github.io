//! TASK-LIFE-001-B-2 — Rust 음성 채널 (life-voice.py 폐기, KarmoLab Tauri 단일 process).
//!
//! 흐름:
//! 1. Life 위젯에서 voice enable → recorder 초기화 + whisper model 백그라운드 load
//! 2. hotkey Pressed (Ctrl+Alt+Space) → `record_start` (cpal stream open)
//! 3. hotkey Released → `record_stop_and_process` (별 thread 진입)
//! 4. samples → wav write (placeholder) → transcribe (candle whisper) → classify (claude CLI, Voice kind)
//! 5. wav rename + .md write (sub-B Python schema 정합)
//! 6. `companion::react` 직접 호출 (in-process — sub-G watcher 폐기 정합)
//!
//! 정본: TASK-LIFE-001-B-2-Rust-음성-마이그.md.

pub mod capture;
pub mod schema;
pub mod transcribe;

use std::sync::{Arc, Mutex, OnceLock};

use super::classify::{self, ClassifyKind};
use super::companion;
use super::schema as screen_schema;
use super::state::LifeScreenConfig;

const MIN_DURATION_SAMPLES: usize = (capture::TARGET_SAMPLE_RATE as usize) * 3 / 10; // 0.3s
const MODEL_NAME: &str = "ggml-large-v3";

static RECORDER_CELL: OnceLock<Arc<Mutex<Option<capture::Recorder>>>> = OnceLock::new();

fn recorder_arc() -> &'static Arc<Mutex<Option<capture::Recorder>>> {
    RECORDER_CELL.get_or_init(|| Arc::new(Mutex::new(None)))
}

/// Life 위젯 활성화 — recorder 초기화 + Whisper model 백그라운드 load (~3.1GB).
/// 이미 활성이면 no-op.
pub fn enable() -> Result<(), String> {
    {
        let arc = recorder_arc();
        let mut g = arc.lock().map_err(|e| format!("recorder mutex: {e}"))?;
        if g.is_none() {
            *g = Some(capture::Recorder::new()?);
        }
    }
    transcribe::load()
}

/// Life 위젯 비활성화 — Whisper model 해제 (~3.1GB 반환) + recorder 종료.
pub fn disable() {
    transcribe::unload();
    if let Ok(mut g) = recorder_arc().lock() {
        *g = None;
    }
}

pub fn is_enabled() -> bool {
    transcribe::is_loaded() || transcribe::is_loading()
}

pub fn is_loading() -> bool {
    transcribe::is_loading()
}

/// hotkey Pressed 시 호출. 이미 record 중이면 no-op. voice 비활성이면 에러.
pub fn record_start() -> Result<(), String> {
    let arc = recorder_arc();
    let g = arc.lock().map_err(|e| format!("recorder mutex: {e}"))?;
    match g.as_ref() {
        Some(r) => r.start(),
        None => Err("voice 기능 비활성 — Life 위젯에서 먼저 활성화".to_string()),
    }
}

/// hotkey Released 시 호출. 별 thread 에서 transcribe + classify + md write + companion::react.
/// 음성 짧음 (<0.3s) 또는 stream 미동작 시 noop.
pub fn record_stop_and_process(trigger: &str) -> Result<(), String> {
    let samples = {
        let arc = recorder_arc();
        let g = arc.lock().map_err(|e| format!("recorder mutex: {e}"))?;
        match g.as_ref() {
            Some(r) => r.stop(),
            None => {
                eprintln!("[life-voice] voice 비활성 — stop 무시");
                return Ok(());
            }
        }
    };
    let samples = match samples {
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
