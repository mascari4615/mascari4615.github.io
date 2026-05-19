# TASK-KAR-039-A 상태 추적 (2026-05-18)

## 개요

KAR-039 의 sub-TASK. "사용자 발화(KAR-039): 시스템으로 구현 가능한 룰은 시스템으로 구현합시다" → 자동화 가능한 12개 미집행 룰을 추적 백로그로 관리.

**정본**: `memo/rules/quality.md § 자동화 빚 원장` (cwd 밖)

---

## 완료 상태 (12/12 분류 완료)

### ✅ 집행 중 (① hook 구현됨) — 2개

1. **git.md § gh pr --repo 명시**
   - Hook: `block-dangerous-git.ps1` (PreToolUse gate)
   - 스펙: `\bgh\s+pr\b` AND NOT(`--repo`/`-R`) → exit2
   - 검증: 6 test cases, quoted-mask 오탐 0
   - Commit: `4b9b1e9e` feat(kar): TASK-KAR-039-A 백로그 추적
   - Status: ✅ master 머지됨

2. **task.md § TASK ID dedup 보드선언**
   - Hook: `pretool-task-doc-gate.sh` dedup 블록 (PreToolUse gate)
   - 스펙: Write TASK-*.md 의 정확 id 가 다른 보드 행 Task 컬럼 점유 → exit2
   - 검증: 7 test cases, self-exclude, sub dedup 구분, override support
   - Commit: `4b9b1e9e` 동일
   - Status: ✅ master 머지됨

---

## 미집행 (② 어려움 / ③ 본질판단 — 설계분기) — 10개

### ① 설계 분기로 인한 보류 (명확 해결안 미정)

- **task.md § TASK status drift sync** 
  - 설계분기: (a) post-commit 자동 apply (KAR-025 병렬 commit-sweep 충돌) (b) Stop-hook 자가교정 (KAR-027/036 계보, 파일 자동수정 X) (c) pre-commit (오탐 高)
  - 현황: (b) 유력하나 별 설계 TASK 권장
  - Status: ⏸️ 개별 TASK 설계 필요

- **commit.md § 한 주제**
  - 개요: PreToolUse `git diff --cached --stat` 분산 임계 경고
  - 문제: 오탐 위험 높음 (정당 다파일 단일주제 많음)
  - 필요: 보수 임계값 + 휴리스틱 정제
  - Status: ⏸️ 개별 TASK

- **code-style.md § 데드 인터페이스(첫 사용처)**
  - 개요: 신규 인터페이스/채널/추상 타입에서 caller grep 0 감지
  - 문제: 언어별 의미분석 필요, 정당 케이스 多 (같은 commit 첫 사용처 / 리플렉션 / SDK)
  - 현황: 결정적·오탐0 X → 별 설계 TASK 필요
  - Status: ⏸️ 개별 TASK

- **code-style.md § 마이그 자기소멸**
  - 개요: pre-commit: 일회용/마이그 스크립트 + 같은 commit 삭제 없음 → 경고
  - 문제: pattern matching 오탐 위험
  - Status: ⏸️ 개별 TASK

- **code-style.md § 레거시 호환 금지 흔적**
  - 개요: git diff deprecated/폴백 패턴 grep 경고
  - 문제: 의미 판정 필요 (정당 호환성 있음)
  - Status: ⏸️ 개별 TASK

### ② 컨텍스트 의존 / 복잡도 높음

- **commit.md § git mv old+new(.meta 포함)**
  - 개요: `git commit -o <new>` 만 박아 oldpath delete 누락 감지
  - 복잡도: rename 컨텍스트 + `.meta` 짝 의존 (단순 정규식 아님)
  - 빈도: 低
  - Status: ⏸️ 별 설계

- **git.md § branch·worktree 정리**
  - 개요: SessionStart 알림 (`check-stale-cleanup.sh`), 자동 실행 게이트화 검토
  - 현황: 이미 알림 수단 있음, 자동화 필요성 재평가
  - Status: ⏸️ 별 설계

### ③ WM 도메인 / 외부 시스템 (자동화 근본적 한계)

- **unity.md § 외부 .cs+.meta 삭제 CS2001 자동복원**
  - 개요: 무한 stale GUID 감지 후 git restore+refresh 자동 remediation
  - 복잡도: Unity Editor 계측 + 자동 복원
  - Status: ⏸️ 별 설계 + WM 인프라

- **unity.md § missing-script 고아 회귀**
  - 개요: WM EditMode 테스트 자동 회귀 트리거
  - 복잡도: Unity 테스트 자동화
  - Status: ⏸️ 별 설계 + WM 인프라

- **unity.md § test asmdef references 명시**
  - 개요: asmdef JSON 스키마 검증(references 배열)
  - 복잡도: Unity 빌드 자동화
  - Status: ⏸️ 별 설계 + WM 인프라

---

## 발견사항

### hook2 self-reference 오탐 (KAR-039 dogfood, 2026-05-17)

**문제**: `stop-memory-confirm-gate.sh` 가 hook 자체를 설명/검증하는 응답에서 테스트 문구("메모리에 박을까요?")를 인용하면 그것을 위반으로 차단.

**신호**: KAR-035 「오탐=노이즈=무력화」 교훈 — 게이트 신뢰 붕괴.

**refine 후보** (단 과광 suppress = 게이트 약화 trade-off):
- suppress: *보고 맥락* 시그널 추가 (예: `exit2|차단기대|테스트|케이스|검증|tracer|hook`+위반구가 코드/인용 블록 안)
- 보수적으로: escape (`# MEMORY-OK`) 유지 + 빈도 관측

**Decision**: 보수적 유지. 빈도 관측 후 격상/refine 검토.

---

## 다음 단계

**본 TASK 의 소임**: 12개 미집행 룰의 분류 및 추적 완료 ✅

**향후**: 각 10개 미집행 항목에 대해 개별 설계 TASK (`TASK-KAR-039-X`) 그릴 것 (별도 세션/루프).

---

## 메모

- 종결 상태: 2026-05-17 loop 에서 분석 완료
- 현 상태 문서: cwd 추적용 (PR description ↔ memo 정본 동기 대기)
- Quality.md 원장 이동: PR merge 후 봇이 반영 (cwd 밖 편집 제약)
