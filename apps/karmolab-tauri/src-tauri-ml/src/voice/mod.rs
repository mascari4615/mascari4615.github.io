//! KL-052-B — sidecar voice 채널 (메인 `src-tauri/src/life/voice/` 에서 이관).
//!
//! 결정 #1 (cpal 캡처 sidecar 내부): 메인은 `VoiceRecordStart/Stop` 명령만
//! IPC — 오디오 PCM 스트림 IPC 불필요. sidecar 가 capture → transcribe →
//! 임시 wav write 까지 내부 완결, 메인엔 `{ text, wav_path }` 만 반환.
//!
//! 원본 mod.rs 의 후반 파이프라인(classify=claude CLI / schema md write /
//! companion::react)은 ML dep 아니므로 **메인에 유지** — 본 모듈은 capture
//! + transcribe + wav write 만.
//!
//! 정본: TASK-KL-052 § 작업 단계 KL-052-B / src-tauri-ml/PROTOCOL.md.

mod capture;
mod transcribe;

use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

/// 0.3s 미만 = noise drop (원본 mod.rs MIN_DURATION_SAMPLES 정합).
const MIN_DURATION_SAMPLES: usize = (capture::TARGET_SAMPLE_RATE as usize) * 3 / 10;

static RECORDER_CELL: OnceLock<Arc<Mutex<Option<capture::Recorder>>>> = OnceLock::new();

fn recorder_arc() -> &'static Arc<Mutex<Option<capture::Recorder>>> {
    RECORDER_CELL.get_or_init(|| Arc::new(Mutex::new(None)))
}

/// `VoiceLoad { model_dir }` — recorder 초기화 + Whisper 모델 백그라운드
/// 로드. model_dir = 메인이 resolve 해 주입 (결정 #3). 이미 활성이면
/// recorder 는 no-op, 모델 로드는 transcribe::load 가 중복 가드.
pub fn load(model_dir: PathBuf) -> Result<(), String> {
    {
        let arc = recorder_arc();
        let mut g = arc.lock().map_err(|e| format!("recorder mutex: {e}"))?;
        if g.is_none() {
            *g = Some(capture::Recorder::new()?);
        }
    }
    transcribe::load(model_dir)
}

/// `VoiceRecordStart` — cpal stream open. 이미 record 중이면 no-op,
/// voice 미로드면 에러.
pub fn record_start() -> Result<(), String> {
    let arc = recorder_arc();
    let g = arc.lock().map_err(|e| format!("recorder mutex: {e}"))?;
    match g.as_ref() {
        Some(r) => r.start(),
        None => Err("voice 비활성 — VoiceLoad 먼저".to_string()),
    }
}

/// `VoiceRecordStop` — cpal stop → samples → 임시 wav write → transcribe.
/// 반환 `(text, wav_path)` — wav_path = sidecar OS temp 의 임시 .wav.
/// 메인이 classify 후 `{memo_root}/life/raw/voice/{stamp}-{slug}.wav` 로 이동.
pub fn record_stop() -> Result<(String, String, f32), String> {
    let samples = {
        let arc = recorder_arc();
        let g = arc.lock().map_err(|e| format!("recorder mutex: {e}"))?;
        match g.as_ref() {
            Some(r) => r.stop(),
            None => return Err("voice 비활성 — stop 무시".to_string()),
        }
    };
    let samples = samples.ok_or_else(|| "record stop — frame 0 (stream 미시작/이미 종료)".to_string())?;
    if samples.len() < MIN_DURATION_SAMPLES {
        return Err(format!(
            "{:.2}s < 0.3s — drop (noise)",
            samples.len() as f32 / capture::TARGET_SAMPLE_RATE as f32
        ));
    }

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("clock 실패: {e}"))?
        .as_nanos();
    let tmp_wav = std::env::temp_dir().join(format!("karmolab-voice-{nanos}.wav"));
    capture::write_wav_pcm16(&tmp_wav, &samples)?;
    eprintln!(
        "[life-voice] tmp wav ({}, {:.1}s) — transcribe 시작",
        tmp_wav.display(),
        samples.len() as f32 / capture::TARGET_SAMPLE_RATE as f32
    );

    let duration_s = samples.len() as f32 / capture::TARGET_SAMPLE_RATE as f32;
    let text = transcribe::transcribe(&samples)?;
    Ok((text, tmp_wav.to_string_lossy().into_owned(), duration_s))
}

/// `VoiceStatus` — Whisper 모델 로드 상태 (loaded, loading).
/// 원본 life_get_feature_states 의 voice_enabled/voice_loading 정합.
pub fn status() -> (bool, bool) {
    (transcribe::is_loaded(), transcribe::is_loading())
}

/// `VoiceUnload` — Whisper 모델 해제 (RAM 반환) + recorder 종료.
pub fn unload() {
    transcribe::unload();
    if let Ok(mut g) = recorder_arc().lock() {
        *g = None;
    }
}
