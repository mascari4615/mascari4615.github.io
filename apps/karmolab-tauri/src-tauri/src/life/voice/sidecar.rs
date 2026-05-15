//! KL-052-B2 — ML sidecar(karmolab-life-ml) IPC client.
//!
//! 결정 #1·#2·#3 정합: cpal 캡처 + candle Whisper 는 sidecar 내부 (메인
//! ML dep 0). 메인은 `tauri-plugin-shell` sidecar 로 spawn 1회(장수
//! 프로세스) + stdin/stdout JSON line 으로 명령/응답.
//!
//! 프로토콜 = 순차 요청-응답 (`PROTOCOL.md` § 견고성: 명령 1 → 응답 1,
//! `Ready` 만 부팅 시 unsolicited). [`send`] 가 `Mutex` 로 명령-응답 한
//! 쌍을 직렬화 — sidecar 단일 consumer 가정 정합.
//!
//! async↔sync 경계: `Command::spawn()` 의 `Receiver<CommandEvent>` 는
//! tokio mpsc(async). tauri async runtime 백그라운드 task 가 그걸 계속
//! 읽어 line 단위 `SidecarEvent` 로 파싱 → std mpsc 로 넘김. 메인 voice
//! API(sync)는 std mpsc `recv_timeout` 으로 응답 수신.

use std::path::Path;
use std::sync::mpsc::{self, Receiver};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use karmolab_shared::{SidecarCommand, SidecarEvent, PROTOCOL_VERSION};

/// transcribe 는 수 초 — 넉넉히. record_stop 응답(=transcribe 완료) 대기.
const RESP_TIMEOUT: Duration = Duration::from_secs(120);
/// spawn 직후 Ready 핸드셰이크 / 일반 짧은 명령(record_start/status/unload).
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);

struct SidecarHandle {
    child: CommandChild,
    resp_rx: Receiver<SidecarEvent>,
}

static SIDECAR: OnceLock<Mutex<Option<SidecarHandle>>> = OnceLock::new();

fn cell() -> &'static Mutex<Option<SidecarHandle>> {
    SIDECAR.get_or_init(|| Mutex::new(None))
}

pub fn is_spawned() -> bool {
    cell().lock().map(|g| g.is_some()).unwrap_or(false)
}

/// sidecar 프로세스 spawn (1회) + `Ready` 핸드셰이크 + `VoiceLoad`.
/// 이미 spawn 됐으면 no-op. `model_dir` = 메인이 resolve 한 Whisper 경로
/// (결정 #3 — sidecar 는 LifeScreenConfig 모름).
pub fn ensure_spawned(app: &AppHandle, model_dir: &Path) -> Result<(), String> {
    let mut guard = cell().lock().map_err(|e| format!("sidecar mutex: {e}"))?;
    if guard.is_some() {
        return Ok(());
    }

    let cmd = app
        .shell()
        .sidecar("karmolab-life-ml")
        .map_err(|e| format!("sidecar 생성 실패: {e}"))?;
    let (mut rx, child) = cmd
        .spawn()
        .map_err(|e| format!("sidecar spawn 실패: {e}"))?;

    let (resp_tx, resp_rx) = mpsc::channel::<SidecarEvent>();
    // async rx(tokio mpsc) → std mpsc 브리지. line-buffered Stdout
    // (CommandEvent::Stdout = \n 단위 Vec<u8>) = 한 줄 = 한 SidecarEvent JSON.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = match String::from_utf8(bytes) {
                        Ok(s) => s,
                        Err(_) => continue,
                    };
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<SidecarEvent>(trimmed) {
                        Ok(evt) => {
                            if resp_tx.send(evt).is_err() {
                                break; // 수신측 drop = sidecar 정리됨
                            }
                        }
                        Err(e) => eprintln!("[life-voice-sidecar] event 파싱 실패: {e} ({trimmed})"),
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    eprint!("[life-voice-sidecar] {}", String::from_utf8_lossy(&bytes));
                }
                CommandEvent::Error(e) => {
                    eprintln!("[life-voice-sidecar] command error: {e}");
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[life-voice-sidecar] terminated: {payload:?}");
                    break;
                }
                _ => {}
            }
        }
    });

    *guard = Some(SidecarHandle { child, resp_rx });

    // 부팅 핸드셰이크 — 첫 이벤트 = Ready (unsolicited).
    let handle = guard.as_mut().expect("방금 set");
    match handle
        .resp_rx
        .recv_timeout(HANDSHAKE_TIMEOUT)
        .map_err(|e| format!("sidecar Ready 대기 실패: {e}"))?
    {
        SidecarEvent::Ready { protocol_version } => {
            if protocol_version != PROTOCOL_VERSION {
                let _ = guard.take(); // 버전 불일치 — handle drop
                return Err(format!(
                    "sidecar 프로토콜 버전 불일치 (sidecar={protocol_version}, 메인={PROTOCOL_VERSION}) — 업데이트 필요"
                ));
            }
        }
        other => {
            let _ = guard.take();
            return Err(format!("sidecar 첫 이벤트가 Ready 아님: {other:?}"));
        }
    }

    // VoiceLoad — Whisper 백그라운드 로드 시작 (sidecar 가 thread spawn,
    // Loaded = 로드 *시작* ack. 실제 준비 여부는 VoiceStatus 폴링).
    let model_dir = model_dir.to_string_lossy().into_owned();
    send_locked(
        guard.as_mut().expect("handle"),
        &SidecarCommand::VoiceLoad { model_dir },
        HANDSHAKE_TIMEOUT,
    )
    .map(|_| ())
}

/// lock 잡은 상태에서 명령 1개 송신 + 응답 1개 수신 (순차 프로토콜).
fn send_locked(
    handle: &mut SidecarHandle,
    cmd: &SidecarCommand,
    timeout: Duration,
) -> Result<SidecarEvent, String> {
    let mut json = serde_json::to_string(cmd).map_err(|e| format!("command 직렬화 실패: {e}"))?;
    json.push('\n');
    handle
        .child
        .write(json.as_bytes())
        .map_err(|e| format!("sidecar stdin write 실패: {e}"))?;
    let evt = handle
        .resp_rx
        .recv_timeout(timeout)
        .map_err(|e| format!("sidecar 응답 대기 실패({cmd:?}): {e}"))?;
    if let SidecarEvent::Error { msg } = &evt {
        return Err(format!("sidecar error: {msg}"));
    }
    Ok(evt)
}

/// 명령 송신 + 응답 (Mutex 직렬화). sidecar 미spawn 이면 에러.
pub fn send(cmd: &SidecarCommand, timeout: Duration) -> Result<SidecarEvent, String> {
    let mut guard = cell().lock().map_err(|e| format!("sidecar mutex: {e}"))?;
    let handle = guard
        .as_mut()
        .ok_or_else(|| "voice sidecar 미활성 — Life 위젯에서 먼저 활성화".to_string())?;
    send_locked(handle, cmd, timeout)
}

/// record_start — 짧은 ack.
pub fn record_start() -> Result<(), String> {
    match send(&SidecarCommand::VoiceRecordStart, HANDSHAKE_TIMEOUT)? {
        SidecarEvent::RecordStarted => Ok(()),
        other => Err(format!("RecordStart 예상 외 응답: {other:?}")),
    }
}

/// record_stop — cpal stop + transcribe (수 초).
/// `(text, sidecar 임시 wav 경로, 녹음 길이 초)`.
pub fn record_stop() -> Result<(String, String, f32), String> {
    match send(&SidecarCommand::VoiceRecordStop, RESP_TIMEOUT)? {
        SidecarEvent::Transcribed {
            text,
            wav_path,
            duration_s,
        } => Ok((text, wav_path, duration_s)),
        other => Err(format!("RecordStop 예상 외 응답: {other:?}")),
    }
}

/// Whisper 로드 상태 (loaded, loading) — 위젯 voice_enabled/loading 표시.
pub fn status() -> (bool, bool) {
    if !is_spawned() {
        return (false, false);
    }
    match send(&SidecarCommand::VoiceStatus, HANDSHAKE_TIMEOUT) {
        Ok(SidecarEvent::Status { loaded, loading }) => (loaded, loading),
        _ => (false, false),
    }
}

/// disable — VoiceUnload(모델 RAM 회수) + Shutdown + child kill.
pub fn shutdown() {
    let mut guard = match cell().lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if let Some(mut handle) = guard.take() {
        let _ = send_locked(&mut handle, &SidecarCommand::VoiceUnload, HANDSHAKE_TIMEOUT);
        // Shutdown 은 sidecar 가 stdin EOF 처리 전 graceful 종료.
        if let Ok(mut json) = serde_json::to_string(&SidecarCommand::Shutdown) {
            json.push('\n');
            let _ = handle.child.write(json.as_bytes());
        }
        let _ = handle.child.kill();
    }
}
