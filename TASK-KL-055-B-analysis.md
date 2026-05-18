# TASK-KL-055-B 분석 및 결정

**Status**: seed (진단 완료, 결정안 제시)  
**Date**: 2026-05-18

---

## 진단: alarm.rs winapi 의존 현황

### winapi 사용처 (22 references)

**3개 Windows FFI 모듈:**

1. **`oswake` (lines 399-497)** — 절전 기상 + 디스플레이 제어
   - `CreateWaitableTimerW`, `SetWaitableTimer`, `WaitForSingleObject` → 절전 상태에서 웨이크업
   - `SetThreadExecutionState` (ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED) → 시스템/디스플레이 OFF 차단
   - `SendMessageTimeoutW` (모니터 ON broadcast, best-effort)
   - `LARGE_INTEGER.QuadPart_mut()` union 수동 조작
   - **런타임 크리티컬**: KL-064 알람 신뢰성 incident 근본 (옛 SendMessageW 동기 블록)

2. **`audio` (lines 512-601)** — COM Core Audio (IAudioEndpointVolume)
   - `CoCreateInstance`, `CoInitializeEx`, `CoUninitialize`
   - `IMMDeviceEnumerator` → 기본 오디오 엔드포인트 조회
   - `IAudioEndpointVolume` → GetMasterVolumeLevelScalar / SetMasterVolumeLevelScalar
   - `winapi::Interface::uuidof()` COM trait
   - **비파괴 검증 harness 완성**: `volume_force_sets_exact_level_and_unmutes()` (line 839), `scheduler_to_volume_end_to_end()` (line 874) — ±5% 정확도 + unmute 검증

3. **`sound` (lines 615-660)** — 사운드 무한 루프
   - `PlaySoundW` (SND_FILENAME | SND_LOOP | SND_ASYNC)
   - winapi 만 사용 (windows-sys 없음)

---

## 결정 항목 및 권장안

### ① COM 백엔드 선택 (audio 모듈)

**상황**: `audio::get_master()` / `audio::set_master()` / `audio::force_to()` 는 COM IID/vtable 직접 조작 필요

**옵션 비교:**

| 항목 | windows crate (권장) | windows-sys raw | winapi 잔존 |
|------|---------|---------|---------|
| 정식성 | ✅ Microsoft 공식 | ✅ Microsoft 공식 | ❌ 커뮤니티 |
| COM ergonomics | ✅ ComPtr / Interface trait 자동 | ⚠️ 수동 vtable cast | ❌ 수동 + 구식 |
| 타입 안전성 | ✅ 높음 (generated bindings) | ✅ 높음 (raw ptrs 근데 안전) | ❌ 낮음 (void* cast) |
| 바이너리 사이즈 | ≈ +10-20KB (합리적) | 최소 | 현상유지 |
| 유지보수성 | ✅ 최고 (공식 지원) | ⚠️ 중간 (boilerplate) | ❌ 낮음 (2 crate) |
| 결정 비용 | 낮음 (표준 정책) | 중간 (edge case) | 높음 (목표 포기) |

**권장**: **`windows` crate 도입**
- 이유: COM 은 정식 방법 = windows crate 정석. 사이즈 비용 합리적. 유지보수성 최고.
- 구현: `windows = "0.X"` 추가, `audio` 모듈 marig (ComPtr, windows::Win32::Media::Audio::* 사용)

**결론**: KL-055-B 마이그 후 winapi 완전 제거 → Cargo.lock dedup 실증

---

### ② 런타임 검증 전략 (oswake 모듈)

**현재 검증 상태:**
- ✅ Core Audio: `volume_force_sets_exact_level_and_unmutes()` — 실행: `cargo test --lib volume_force -- --ignored`
- ✅ 스케줄러→볼륨 E2E: `scheduler_to_volume_end_to_end()` — 실행: `cargo test --lib scheduler_to_volume_end_to_end -- --ignored`
- ✅ 레지스트리 autostart: `autostart_registry_roundtrip_nondestructive()` — 실행: `cargo test --lib autostart_registry -- --ignored`
- ❌ Waitable Timer 절전-resume: **부재** (KL-064 근본 원인)

**절전-resume 검증 불가능한 이유:**
- 하드웨어 의존 (절전 상태 강제 시뮬레이션 불가)
- CI 환경 전력 상태 제어 불가
- 실제 절전 깨우기는 수동 테스트만 가능

**권장 전략:**
1. **코드 검증** (자동화 가능):
   - `CreateWaitableTimerW()` 실패 로깅 ✓ (기존)
   - `SetWaitableTimer()` HRESULT 검증 **추가** (현재 return 무시 ← fix)
   - timer/cleanup HANDLE 누수 검증 (이미 CloseHandle loop 안에 있음)

2. **로컬 수동 테스트** (KL-055-B 마이그 후):
   - 알람 1개 설정 (6시간 뒤)
   - 시스템 절전 진입 (`powercfg /h /type hybrid` → 절전)
   - 기울인 시간 대기 → 시스템 웨이크업 관찰
   - 알람이 정각에 울리는지 확인
   - *결과를 PR 코멘트에 기재*

3. **CI 제외** (현실적):
   - Waitable Timer HRESULT 검증은 CI O (SetWaitableTimer fail 감지)
   - 절전-resume 은 CI skip (명시적으로 문서화)

**결론**: 마이그 후 `SetWaitableTimer()` HRESULT 검증 추가 + 로컬 절전 1회 테스트 + 결과 기재

---

## 완료 조건 (TASK-KL-055-B)

1. ✅ 위 결정 ① ② 확정 (본 문서)
2. ⚠️ alarm.rs 마이그 (windows crate 사용)
   - audio 모듈: winapi → windows ComPtr
   - oswake, sound: winapi → windows-sys (기존과 일관)
3. ⚠️ `cargo check` GREEN (Rust 환경 필요)
4. ⚠️ 절전-resume 로컬 검증 1회 + PR 코멘트 기재
5. ⚠️ Cargo.toml `winapi` 의존 제거
6. ⚠️ `cargo tree --duplicates` 로 dedup 실증

---

## 아키텍처 의사결정 기록

**이 문서는 KL-055-B 시드 상태에서:**
- 에이전트가 코드 분석 → 결정안 제시
- 사용자/그릴이 ① ② 확정 (또는 재검토 요청)
- 확정 후 마이그 구현 → 런타임 검증 → PR create

**미션 정렬**: 검증 우선 + 황금의 정신 (근본 분석 + 런타임 크리티컬 영역 격리)
