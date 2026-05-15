# KarmoLab ML Sidecar — IPC 프로토콜 명세 (KL-052)

> 정본. `src/protocol.rs` 의 `SidecarCommand` / `SidecarEvent` 가 본 명세의 직렬화 구현.
> 본 문서는 TASK-KL-052 의 「IPC 프로토콜 명세」 산출물 (KL-052-A).

## 1. 목적

메인 KarmoLab (`src-tauri` = `karmolab-desktop`, Tauri+UI+IPC) 에서 ML stack
(Whisper 음성 / xcap 캡처 / tesseract OCR) 을 **별도 sidecar `.exe`** 로 분리.
메인 바이너리 = UI/IPC 만 (15.8MB → ~7–9MB 목표). ML 작업 = sidecar spawn/통신/kill.

## 2. 전송 (transport)

**stdin/stdout JSON line.** 메인이 sidecar(`karmolab-life-ml`) 를 자식 프로세스로
spawn 하고 stdin/stdout 파이프로 통신.

- 메인 → sidecar : sidecar stdin 에 **한 줄 = 한 명령 JSON** + `\n`.
- sidecar → 메인 : sidecar stdout 에 **한 줄 = 한 이벤트 JSON** + `\n`.
- stderr : 사람이 읽는 로그 전용 (프로토콜 X). 메인은 stderr 를 로그로 수집만.
- 인코딩 : UTF-8. 빈 줄 = 무시.

### 왜 stdin/stdout JSON line (결정 #2)

- 가장 단순 — 소켓 lifecycle(bind/accept/cleanup) / named pipe OS 분기 불필요.
- 자식 프로세스 죽으면 파이프 EOF 로 자연 감지.
- 테스트 용이 — `echo '{"cmd":"..."}' | karmolab-life-ml` 로 단독 검증.
- TASK-KL-052 본문 sketch 와 일치 (line 65 "가장 단순").
- `tauri-plugin-shell` 의 Sidecar API 도 내부적으로 stdin/stdout — 동일 모델 위에
  Tauri 통합(KL-052-D)에서 그 API 를 채택할지 결정 (프로토콜 자체는 불변).

## 3. 메시지

### 3.1 메인 → sidecar : `SidecarCommand` (`cmd` 태그)

| `cmd` | 추가 필드 | 의미 |
|---|---|---|
| `voice_load` | — | Whisper 모델 메모리 로드 |
| `voice_transcribe` | `wav`: string (16kHz mono PCM_16 .wav 경로) | 음성 → 텍스트 |
| `voice_unload` | — | Whisper 모델 언로드 (RAM 회수) |
| `capture` | — | 화면 캡처 → PNG 파일 경로 |
| `ocr` | `image`: string (이미지 경로) | 이미지 → 텍스트 |
| `shutdown` | — | graceful 종료 (메인이 kill 전에 송신) |

예: `{"cmd":"voice_transcribe","wav":"C:\\...\\rec.wav"}`

### 3.2 sidecar → 메인 : `SidecarEvent` (`event` 태그)

| `event` | 추가 필드 | 의미 |
|---|---|---|
| `ready` | `protocol_version`: u32 | 부팅 완료. 메인이 버전 호환성 확인 |
| `loaded` | — | `voice_load` 완료 |
| `unloaded` | — | `voice_unload` 완료 |
| `result` | `text`: string | transcribe / ocr 결과 |
| `captured` | `path`: string | 캡처 PNG 경로 |
| `error` | `msg`: string | 명령 실패 (sidecar 는 계속 살아있음) |

예: `{"event":"result","text":"안녕하세요"}`

### 3.3 견고성

- 명령 1개 → 응답 이벤트 1개 (요청-응답). `ready` 만 부팅 시 unsolicited.
- 파싱 실패 / 처리 실패 = `error` 이벤트 후 **sidecar 계속 생존** (다음 명령 처리).
  메인은 `error` 를 받아도 파이프 유지 — sidecar respawn 불필요.
- 치명 상황(stdin EOF, write 실패) = sidecar 정상 종료. 메인은 프로세스 exit 감지.

### 3.4 버전 협상

`PROTOCOL_VERSION` (현재 `1`). breaking change 시 bump. 메인은 첫 `ready` 의
`protocol_version` 이 자신이 아는 범위 밖이면 사용자에게 업데이트 안내.

## 4. KL-052 결정 사항 (TASK-KL-052 § "결정 필요 항목" 자율 결정 — 코드/패턴 한정)

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| 1 | 워크스페이스 구조 | `apps/karmolab-tauri/Cargo.toml` 단일 `[workspace]`, members = `src-tauri` + `src-tauri-ml` | 단일 lockfile + 공유 dep 해석. verify `cargo check`(cwd=src-tauri) 는 멤버 scope → 게이트 그린/속도 유지. `[profile.release]` 는 워크스페이스 루트로 이관(멤버 profile cargo 무시 회귀 방지) |
| 2 | IPC 모델 | stdin/stdout JSON line | § 2 근거 |
| 3 | 모델 파일(~3.1GB Whisper safetensors) 위치 | **KL-052-B 에서 확정** (voice 이관 시 현 다운로드 경로 파악 후). 스켈레톤 단계 영향 X | 현재 코드(`life/voice`)의 실제 경로 확인 전 결정 = 추측. -B 에서 자연 결정 |
| 4 | 다운로드-on-demand vs 항상 패키징 | **default = 항상 패키징** (NSIS externalBin). KL-052-E 에서 사이즈 측정 후 재평가 | 첫 사용 latency 0 + 서명/보안 단순. 사이즈 부담이 실측에서 크면 -E 에서 on-demand 전환 검토 |

## 5. 단계 (TASK-KL-052 § 작업 단계)

- **KL-052-A** ✅ 워크스페이스 분리 + sidecar skeleton + 본 프로토콜 명세
- KL-052-B : voice (capture+transcribe) sidecar 이관 + 메인 IPC client
- KL-052-C : OCR(tesseract) + capture(xcap) sidecar 이관
- KL-052-D : Tauri `externalBin` 통합 + ACL audit (`shell:allow-execute` sidecar 항목)
- KL-052-E : NSIS installer 통합 + 메인 바이너리 사이즈 before/after 측정 + 회귀 검증

## 6. 미해결 (후속에서 결정)

- keep-alive 정책 : OCR/캡처마다 spawn/kill vs 1 process 상주 (KL-052-C 에서 사용 패턴 보고 결정)
- 모델 파일 위치 (#3, KL-052-B)
- 다운로드 정책 최종 (#4, KL-052-E 사이즈 실측 후)
