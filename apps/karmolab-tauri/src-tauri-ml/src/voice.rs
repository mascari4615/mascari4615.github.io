//! Whisper 음성 transcribe. KL-052-B 에서 `src-tauri/src/life/voice/*`
//! (candle/tokenizers/cpal/hound) 를 이리로 이관 — 현재 = 스텁.
//!
//! 이관 시 `life::voice::enable/disable` 의 RAM 토글(KL-051)은 sidecar
//! 의 VoiceLoad/VoiceUnload + sidecar process 수명으로 대체된다.

use crate::protocol::SidecarEvent;

pub fn load() -> SidecarEvent
{
    SidecarEvent::Error { msg: "voice::load 미구현 (KL-052-B 에서 candle Whisper 이관)".to_string() }
}

pub fn transcribe(_wav: &str) -> SidecarEvent
{
    SidecarEvent::Error { msg: "voice::transcribe 미구현 (KL-052-B)".to_string() }
}

pub fn unload() -> SidecarEvent
{
    SidecarEvent::Error { msg: "voice::unload 미구현 (KL-052-B)".to_string() }
}
