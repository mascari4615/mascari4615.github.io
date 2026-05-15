//! KL-052 sidecar IPC 프로토콜 — stdin/stdout JSON line.
//!
//! 메인(karmolab-desktop) → sidecar : 한 줄 = 한 [`SidecarCommand`] JSON.
//! sidecar → 메인 : 한 줄 = 한 [`SidecarEvent`] JSON.
//!
//! 정본 명세(다운로드 정책 / keep-alive / 모델 파일 위치 결정 포함) =
//! `src-tauri-ml/PROTOCOL.md`. 본 모듈 = 그 명세의 직렬화 타입만.

use serde::{Deserialize, Serialize};

/// 메인 → sidecar. `cmd` 태그로 분기 (`{"cmd":"voice_load"}`).
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum SidecarCommand
{
    /// Whisper 모델 메모리 로드.
    VoiceLoad,
    /// 16kHz mono PCM_16 .wav 파일 경로를 transcribe.
    VoiceTranscribe
    {
        wav: String,
    },
    /// Whisper 모델 언로드 (RAM 회수 — life::voice::disable 정합).
    VoiceUnload,
    /// 화면 캡처 → PNG 파일 경로 반환.
    Capture,
    /// 이미지 파일 OCR.
    Ocr
    {
        image: String,
    },
    /// graceful 종료 — 메인이 sidecar kill 전에 보냄.
    Shutdown,
}

/// sidecar → 메인. `event` 태그로 분기 (`{"event":"ready",...}`).
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum SidecarEvent
{
    /// sidecar 부팅 완료 + 프로토콜 버전 (메인이 호환성 확인).
    Ready
    {
        protocol_version: u32,
    },
    /// VoiceLoad 완료.
    Loaded,
    /// VoiceUnload 완료.
    Unloaded,
    /// transcribe / ocr 결과 텍스트.
    Result
    {
        text: String,
    },
    /// 캡처 결과 PNG 경로.
    Captured
    {
        path: String,
    },
    /// 명령 처리 실패 (치명 X — sidecar 살아있고 다음 명령 계속).
    Error
    {
        msg: String,
    },
}

/// 프로토콜 버전 — breaking change 시 bump. 메인이 `Ready.protocol_version`
/// 으로 호환성 확인 (불일치 = 사용자 update 안내).
pub const PROTOCOL_VERSION: u32 = 1;
