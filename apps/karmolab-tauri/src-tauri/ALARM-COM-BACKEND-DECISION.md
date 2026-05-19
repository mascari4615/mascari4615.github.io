# TASK-KL-055-B — alarm.rs COM/winapi 백엔드 결정 (분석 + 권고)

> 상태: **NEEDS-USER-DECISION** (그릴/사용자 게이트). 본 문서 = 진단·증거·권고.
> 결정 확정 전 alarm.rs 마이그 금지 (스펙 완료조건이 결정 선행을 요구하고,
> KL-064 = 무검증 FFI 재작성 incident → 런타임-크리티컬 경로 blind 재작성 = 고위험).

## 1. 진단 (확인된 사실)

- `alarm.rs` = **src 트리에서 유일하게 남은 `winapi` 소비자** (`grep -rln winapi src-tauri/src` → alarm.rs 단 1개). KL-055 Phase 1a 가 `activity.rs`/`active_window.rs` 를 `windows-sys` 로 이미 이관함. → alarm.rs 만 처리하면 `Cargo.toml` 의 `winapi` dep 완전 제거 + Cargo.lock dedup (KL-055 최종 목표) 가 풀린다.
- `Cargo.lock` 상 `winapi` = **단일 버전 0.3** (이미 dedup 상태). 즉 winapi 제거의 이득은 "중복 제거"가 아니라 **레거시 crate 1개 트리 완전 제거 + windows-sys 단일 표준화**.
- **`windows` crate 는 이미 트랜지티브로 4개 버전(0.54 / 0.57 / 0.58 / 0.61.3) 컴파일되고 있다** (tauri 생태계 경유 — `windows-core`/`windows-implement`/`windows-interface` 동반). → `Cargo.toml` 의 *"windows crate 미도입 — 사이즈"* 주석의 전제(= windows crate 트리를 피해 바이너리를 줄인다)는 **사실상 무효/구식**. 그 트리는 *이미 비용을 치르고 있다*. 스펙이 이 주석을 "재검토 트리거"로 지목한 근거가 증거로 확증됨.
- `windows-sys` 는 이미 직접 dep (0.59, KL-055 Phase 1a). 보유 feature: `Win32_Foundation`, `Win32_System_Threading`, `Win32_System_ProcessStatus`, `Win32_System_SystemInformation`, `Win32_UI_WindowsAndMessaging`, `Win32_UI_Input_KeyboardAndMouse`.
- 본 worktree 환경엔 **Rust 툴체인 부재** (`cargo`/`rustc` PATH·표준 위치 모두 없음). → 여기서 `cargo check` / `#[ignore]` 런타임 harness 실행 불가. 마이그 검증은 사용자 실머신 필요 (결정 2 의 핵심 제약).

## 2. alarm.rs 3개 하위모듈 — 위험·백엔드 적합성 분리

| 모듈 | API | COM? | 위험 | windows-sys 적합 | 비고 |
|---|---|---|---|---|---|
| `sound` | `PlaySoundW` (SND_LOOP/ASYNC/ALIAS/FILENAME) | X | **저** (순수 1:1) | ◎ (`Win32_Media_Audio`) | 기계적 치환. 검증 = 알람음 1회 청취 |
| `oswake` | `CreateWaitableTimerW`/`SetWaitableTimer`/`WaitForSingleObject`/`SetThreadExecutionState`/`SendMessageTimeoutW`/`mouse_event`/`LARGE_INTEGER` | X | **중** (절전-resume = 런타임 크리티컬, 단 비-COM) | ◎ (`Win32_System_Threading` 보유 + `Win32_UI_WindowsAndMessaging`/`...KeyboardAndMouse` 보유) | windows-sys `LARGE_INTEGER` = plain `i64` → 기존 `.QuadPart_mut()` union 핸들링 *제거*(오히려 단순·안전). 단 절전서 물리적 wake 는 헤드리스 검증 불가 |
| `audio` | `CoCreateInstance`/`IMMDeviceEnumerator`/`IAudioEndpointVolume` vtable/`Interface::uuidof()` | **O (Core Audio COM)** | **중** (볼륨 정확도 = 위젯 슬라이더 실효) | △ (raw vtable struct 노출되나 IUnknown/RAII 없음 — 수동 `Release`/GUID = footgun) | **진짜 결정 지점**. `windows` crate = 안전 RAII + `Result` |

## 3. 권고 (split-backend)

**비-COM(`sound`+`oswake`) → `windows-sys`**, **COM(`audio`) → `windows` crate (이미 트리에 있는 버전으로 pin)**.

근거:
1. `sound`/`oswake` 는 비-COM·기계적 → windows-sys 가 정석(이미 dep, 신규 surface 0, `LARGE_INTEGER` union 위험 *감소*). winapi 잔존 가치 없음.
2. `audio` = Core Audio COM. windows-sys raw vtable 수동 호출 = KL-064 가 경고한 바로 그 "런타임-크리티컬 무검증 FFI" 부류의 footgun(수동 `Release` 누락 = leak, GUID 손기재 = silent 실패). `windows` crate 의 RAII/`Result` COM 래퍼가 정석·안전.
3. **사이즈 반론 무효화**: `windows` crate 트리는 이미 4버전 컴파일 중. `audio` 만 `windows = { version = "0.58", features = ["Win32_Media_Audio","Win32_System_Com"] }` 처럼 **이미 트리에 존재하는 버전(0.58 또는 0.61)으로 pin** → 5번째 버전 추가 없이 한계 비용 = 그 feature *모듈*들 뿐(새 crate 트리 X). KL-051/052 사이즈 규율과 충돌하지 않음.
4. winapi dep 는 3개 모듈 모두 떠난 뒤 `Cargo.toml` 에서 완전 삭제 → winapi 0.3 트리 소멸 = KL-055 최종 목표.

대안 (택일 시 trade-off):
- **(B) 전부 windows-sys**: 바이너리 최소·신규 dep 0. 단 `audio` COM raw vtable 수동 = 작성 난·KL-064류 위험. 비권장(권고 1·2 와 충돌).
- **(C) winapi 잔존 유지**: dedup 포기. winapi 레거시 1트리 영구 잔존 + `activity/active_window` 와 백엔드 이원화 영구화. 비권장(KL-055 목표 자체 포기).

## 4. 결정 2 — 런타임 검증 수단

| 대상 | 검증 수단 | 자동? |
|---|---|---|
| 볼륨 정확도/언뮤트 | **기존 비파괴 harness 재사용** — `volume_force_sets_exact_level_and_unmutes` + `scheduler_to_volume_end_to_end` (`#[ignore]`, read→baseline→force→assert→restore). 마이그 후 `cargo test --lib volume_force -- --ignored` / `... scheduler_to_volume_end_to_end -- --ignored` 사용자 실머신 1회 = 관측 완료 | 반자동(머신 필요) |
| `sound` 루프 | 알람 1회 발화 → 무한 루프 청취 → dismiss 정지 확인 | 수동 |
| **절전-resume** (가장 어려움) | 단위/헤드리스 검증 **불가**. 권고 절차: ① 1회성 알람을 now+~3분 으로 시드 ② 머신을 수동 절전(sleep) ③ 물리적 wake + ring 관측. + 제안: `oswake` 가 무장한 *절대 wake 시각* 을 로그로 emit, 그리고 짧은 resume 타이머만 무장하는 디버그 커맨드(예 `alarm_debug_arm_wake(secs)`)를 두면 실알람 대기 없이 단발 sleep/resume 관측 가능. (이 디버그 커맨드는 백엔드 결정 확정 후 마이그와 함께 구현 — 지금 구현 X) | 수동(사용자 관측) |

## 5. 완료 조건 추적 (스펙 § 완료 조건)

- [ ] 결정 1 (COM 백엔드) 확정 — **권고 = split: sound/oswake→windows-sys, audio→windows crate(0.58/0.61 pin)**. 사용자/그릴 게이트.
- [ ] 결정 2 (런타임 검증 수단) 확정 — **권고 = §4 표** (기존 harness 재사용 + 절전 수동 절차 + 디버그 arm 커맨드).
- [ ] (결정 후) alarm.rs winapi → 결정 백엔드 마이그, `cargo check` GREEN — *실머신/Rust 툴체인 환경에서*.
- [ ] (결정 후) 런타임 검증 1회 관측 (§4).
- [ ] (결정 후) `Cargo.toml` `winapi` dep 완전 제거 + `cargo tree --duplicates`(또는 winapi 트리 부재) 실증 → KL-055 전체 done 승격.

> 본 PR 범위 = **분석·권고·escalation + 구식 주석 정정만**. 마이그·dep 변경은 결정 게이트 통과 후 별 작업(스펙 완료조건 = 결정 선행).
