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

/// 무거운 작업 — transcribe(수 초) / OCR. caller 가 send timeout 으로 사용.
// whisper-large-v3 = 1.5B param. candle CPU(SIMD/MKL 없이)면 2초 음성도
// 분 단위 — KL-052-B3 진단(120s timeout). 분리 구조 작동 검증엔 완료가
// 1회 필요해 넉넉히. 속도 자체(모델 경량화/GPU)는 KL-052 분리와 별개
// 후속 시드. 600s 초과 = hang 판정 (느림 아님).
pub const HEAVY_TIMEOUT: Duration = Duration::from_secs(600);
/// spawn 직후 Ready 핸드셰이크 / 짧은 명령(record_start/status/unload/capture).
pub const SHORT_TIMEOUT: Duration = Duration::from_secs(15);

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

/// sidecar 프로세스 spawn (1회) + `Ready` 핸드셰이크. voice/screen 공용
/// (결정 #1 ML 한 프로세스). 이미 spawn 됐으면 no-op. 도메인 명령
/// (VoiceLoad / Capture / Ocr 등)은 각 모듈이 [`send`] 직접 호출 —
/// sidecar.rs 는 transport-only (프로세스 생명 + 순차 요청-응답).
pub fn ensure_spawned(app: &AppHandle) -> Result<(), String> {
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
        .recv_timeout(SHORT_TIMEOUT)
        .map_err(|e| format!("sidecar Ready 대기 실패: {e}"))?
    {
        SidecarEvent::Ready { protocol_version } => {
            if protocol_version != PROTOCOL_VERSION {
                let _ = guard.take(); // 버전 불일치 — handle drop
                return Err(format!(
                    "sidecar 프로토콜 버전 불일치 (sidecar={protocol_version}, 메인={PROTOCOL_VERSION}) — 업데이트 필요"
                ));
            }
            Ok(())
        }
        other => {
            let _ = guard.take();
            Err(format!("sidecar 첫 이벤트가 Ready 아님: {other:?}"))
        }
    }
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

/// 명령 송신 + 응답 (Mutex 직렬화 = 순차 프로토콜). sidecar 미spawn 이면
/// 에러 — caller 가 먼저 [`ensure_spawned`]. 도메인 명령(Voice*/Capture/
/// Ocr)은 voice/mod.rs · screen.rs 가 본 함수 직접 호출.
pub fn send(cmd: &SidecarCommand, timeout: Duration) -> Result<SidecarEvent, String> {
    let mut guard = cell().lock().map_err(|e| format!("sidecar mutex: {e}"))?;
    let handle = guard
        .as_mut()
        .ok_or_else(|| "ML sidecar 미활성 — ensure_spawned 선행 필요".to_string())?;
    match send_locked(handle, cmd, timeout) {
        Ok(evt) => Ok(evt),
        Err(e) => {
            // "sidecar error:" = sidecar 가 명령 실패를 Error 이벤트로
            // 반환(프로세스 생존, 다음 명령 처리 가능 — 프로토콜 § 견고성).
            // 그 외(stdin write 실패 / 응답 Disconnected·timeout) = sidecar
            // 프로세스 crash 신호 → 죽은 handle 정리. 다음 ensure_spawned
            // 가 None 보고 자동 respawn (앱 재시작 없이 voice/screen 복구).
            if !e.starts_with("sidecar error:") {
                let _ = guard.take();
                eprintln!("[life-sidecar] 통신 실패 — handle 정리, 다음 호출 시 respawn: {e}");
                // 복구 범위: screen = capture_with_trigger 가 매번
                // ensure_spawned → 다음 PrintScreen 에서 완전 자동 복구.
                // voice = enable 시 1회 VoiceLoad(whisper 3.1GB) 라
                // crash 후 사용자 voice 재토글 시 복구. record 마다
                // 자동 재로드는 crash 실패턴(B3) 본 뒤 정밀화 (지금
                // 과설계 = 가설 박기 — 잘못된 3.1GB 재로드 UX 위험).
            }
            Err(e)
        }
    }
}

/// sidecar 임시 산출물(wav/png — OS temp) → 최종 memo 경로. 같은 볼륨
/// 이면 rename, cross-device(temp ↔ memo 다른 드라이브)면 copy + remove.
/// voice/screen 공용.
pub fn move_into(src: &str, dest: &Path) -> Result<(), String> {
    if std::fs::rename(src, dest).is_ok() {
        return Ok(());
    }
    std::fs::copy(src, dest).map_err(|e| format!("sidecar 산출물 copy 실패: {e}"))?;
    let _ = std::fs::remove_file(src);
    Ok(())
}

/// 앱 종료 시 sidecar 프로세스 정리 — Shutdown(graceful) + child kill.
/// voice disable 은 프로세스 종료 X (screen 공용 — `VoiceUnload` 만 send).
pub fn terminate() {
    let mut guard = match cell().lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if let Some(mut handle) = guard.take() {
        if let Ok(mut json) = serde_json::to_string(&SidecarCommand::Shutdown) {
            json.push('\n');
            let _ = handle.child.write(json.as_bytes());
        }
        let _ = handle.child.kill();
    }
}
