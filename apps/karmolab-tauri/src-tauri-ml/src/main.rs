//! KarmoLab ML sidecar (KL-052) — stdin/stdout JSON line 프로토콜 entrypoint.
//!
//! 메인 KarmoLab(Tauri) 가 이 바이너리를 spawn. stdin 한 줄 = 한
//! [`SidecarCommand`], stdout 한 줄 = 한 [`SidecarEvent`].
//!
//! 본 파일 = dispatch 골격(KL-052-A). 실제 ML 작업은 후속에서 각 모듈에:
//!   - voice (Whisper transcribe)  → KL-052-B (`src-tauri/src/life/voice/*` 이관)
//!   - capture (xcap+image)        → KL-052-C (`src-tauri/src/life/screen.rs` 이관)
//!   - ocr (rusty-tesseract)       → KL-052-C (`src-tauri/src/life/ocr.rs` 이관)

mod capture;
mod ocr;
mod protocol;
mod voice;

use std::io::{self, BufRead, Write};

use protocol::{SidecarCommand, SidecarEvent, PROTOCOL_VERSION};

fn main()
{
    let stdout = io::stdout();
    let mut out = stdout.lock();

    // 부팅 즉시 Ready — 메인이 protocol_version 으로 호환성 확인.
    emit(&mut out, &SidecarEvent::Ready { protocol_version: PROTOCOL_VERSION });

    let stdin = io::stdin();
    for line in stdin.lock().lines()
    {
        let line = match line
        {
            Ok(line) => line,
            Err(error) =>
            {
                emit(&mut out, &SidecarEvent::Error { msg: format!("stdin read 실패: {}", error) });
                break;
            }
        };

        let trimmed = line.trim();
        if trimmed.is_empty()
        {
            continue;
        }

        let command = match serde_json::from_str::<SidecarCommand>(trimmed)
        {
            Ok(command) => command,
            Err(error) =>
            {
                emit(&mut out, &SidecarEvent::Error { msg: format!("command 파싱 실패: {}", error) });
                continue;
            }
        };

        if matches!(command, SidecarCommand::Shutdown)
        {
            break;
        }

        let event = dispatch(command);
        emit(&mut out, &event);
    }
}

/// 한 명령 → 한 응답 이벤트. KL-052-A 단계 = 각 모듈 스텁(미구현 Error).
fn dispatch(command: SidecarCommand) -> SidecarEvent
{
    match command
    {
        SidecarCommand::VoiceLoad => voice::load(),
        SidecarCommand::VoiceTranscribe { wav } => voice::transcribe(&wav),
        SidecarCommand::VoiceUnload => voice::unload(),
        SidecarCommand::Capture => capture::capture(),
        SidecarCommand::Ocr { image } => ocr::run(&image),
        // Shutdown 은 main 루프에서 이미 break 처리 — 여기 도달 X.
        SidecarCommand::Shutdown => SidecarEvent::Error
        {
            msg: "Shutdown 은 dispatch 대상 아님 (main 루프에서 처리)".to_string(),
        },
    }
}

/// 이벤트 한 개를 JSON line 으로 flush. 직렬화 실패해도 sidecar 죽이지 X
/// (메인이 다음 명령 계속 보낼 수 있게 — 프로토콜 § 견고성).
fn emit<W: Write>(out: &mut W, event: &SidecarEvent)
{
    match serde_json::to_string(event)
    {
        Ok(json) =>
        {
            let _ = writeln!(out, "{}", json);
            let _ = out.flush();
        }
        Err(error) =>
        {
            let _ = writeln!(out, "{{\"event\":\"error\",\"msg\":\"이벤트 직렬화 실패: {}\"}}", error);
            let _ = out.flush();
        }
    }
}
