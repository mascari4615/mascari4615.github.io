//! KL-052 메인 ↔ ML sidecar IPC 프로토콜 계약 — stdin/stdout JSON line.
//!
//! 메인(karmolab-desktop) → sidecar : 한 줄 = 한 [`SidecarCommand`] JSON.
//! sidecar → 메인 : 한 줄 = 한 [`SidecarEvent`] JSON.
//!
//! **본 crate 가 프로토콜 단일 정의.** 메인 + sidecar 양쪽이 path dep 으로
//! 참조 → enum 변경 시 양쪽 동시 컴파일 에러로 스키마 drift 0 강제
//! (2멤버 구조의 복제-drift / ml-dep-재링크 / include-hack 회피, KL-052 redirect).
//!
//! 정본 명세(다운로드 정책 / keep-alive / 모델 파일 위치 결정 포함) =
//! `src-tauri-ml/PROTOCOL.md`. 본 crate = 그 명세의 직렬화 타입만.

use serde::{Deserialize, Serialize};

/// 메인 → sidecar. `cmd` 태그로 분기 (`{"cmd":"voice_load"}`).
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum SidecarCommand
{
    /// Whisper 모델 메모리 로드. `model_dir` = 메인이 resolve 한
    /// `{memo_root}/life/.models/whisper-large-v3/` (결정 #3 — config 진실원=메인).
    VoiceLoad
    {
        model_dir: String,
    },
    /// cpal 캡처 시작 (sidecar 내부 — 결정 #1, 오디오 PCM 스트림 IPC 불필요).
    VoiceRecordStart,
    /// cpal 캡처 종료 + Whisper transcribe + 16kHz mono PCM_16 .wav write.
    /// 결과 = `Transcribed { text, wav_path }` (sidecar 임시 wav, 메인이
    /// memo 로 이동 + md write).
    VoiceRecordStop,
    /// Whisper 모델 로드 상태 조회 (메인 위젯 voice_loading/enabled 표시
    /// — 원본 life_get_feature_states 정합, 마이그 자기소멸).
    VoiceStatus,
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
    /// VoiceRecordStart 완료 (cpal stream open).
    RecordStarted,
    /// VoiceRecordStop 결과 — transcribe 텍스트 + sidecar 임시 wav 경로
    /// + 녹음 길이(초, schema frontmatter 용 — 메인 hound 의존 0).
    /// 메인이 wav 를 `{memo_root}/life/raw/voice/` 로 이동 + md write.
    Transcribed
    {
        text: String,
        wav_path: String,
        duration_s: f32,
    },
    /// VoiceStatus 응답 — Whisper 모델 로드 상태.
    Status
    {
        loaded: bool,
        loading: bool,
    },
    /// OCR 결과 텍스트 (KL-052-C).
    Result
    {
        text: String,
    },
    /// 캡처 결과 — sidecar 임시 PNG 경로 + primary monitor index
    /// (메인 schema frontmatter 정합). 메인이 PNG 를 memo 로 이동.
    Captured
    {
        path: String,
        monitor_index: usize,
    },
    /// 명령 처리 실패 (치명 X — sidecar 살아있고 다음 명령 계속).
    Error
    {
        msg: String,
    },
}

/// 프로토콜 버전 — breaking change 시 bump. 메인이 `Ready.protocol_version`
/// 으로 호환성 확인 (불일치 = 사용자 update 안내).
///
/// v2 (KL-052-B): `VoiceTranscribe { wav }` 제거 → `VoiceRecordStart` /
/// `VoiceRecordStop` (cpal 캡처 sidecar 내부, 결정 #1). `VoiceLoad` 에
/// `model_dir` 추가 (결정 #3). `Transcribed { text, wav_path }` /
/// `RecordStarted` 추가.
pub const PROTOCOL_VERSION: u32 = 2;
