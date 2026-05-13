# Adventure Widget — 무한 텍스트 어드벤처

KarmoLab 내 텍스트 RPG 위젯. 출처 TASK: `TASK-KL-032-infinite-text-adventure.md`.

---

## 사용자 흐름

1. **설정** (⚙ 아이콘): Vertex API key + Project ID 입력 (Vertex 사용 시)
2. **Cast 선택**: 동행할 NPC 슬러그 선택 (alisa / ling / yon / timeto / fourth / …)
3. **모험 시작**: `시작` 버튼 → 내레이터(Timeto) 오프닝 + 선택지
4. **턴 진행**: 선택지 클릭 or 자유 텍스트 입력 → LLM 응답 + 이미지 생성 (η — Imagen 4)
5. **종료**: `[END]` 토큰 또는 수동 종료 → 요약 다이얼로그
6. **저장**: ζ — Tauri `adventure_save_raw` → `memo/projects/karmolab/raw/adventures/{slug}.json`
   - 브라우저 fallback: `localStorage` (`kl_adventure_session_{slug}`)
7. **정수 추출** (θ, 미구현): 정수(精髓) → wiki public 커밋 흐름

---

## Provider 토글

| Provider | 모델 | Auth | 기본 |
|---|---|---|---|
| **Claude** | Sonnet 4.6 / Opus 4.7 / Haiku 4.5 | Max OAuth (Tauri 세션) | **★** |
| **Vertex** | Gemini 2.5 Pro / Flash / Flash-Lite | API key + Project ID (설정 패널) | |

선택 저장: `Toolbox.setPref('adv_provider_id')`. 코드: `src/widgets/adventure/provider/factory.ts`.

> **Vertex 우선 룰 예외 (KL-036)**: 이 위젯은 사용자 발화 「Max x20 활용」 시드 → Claude (Max OAuth) default.
> Vertex도 toggle 가능 (provider abstraction). `CLAUDE.md` §11 참고.

---

## NPC 토큰

LLM 출력 내 토큰을 파서가 추출·처리:

| 토큰 | 동작 |
|---|---|
| `[NPC:slug]` | 해당 캐릭터 이름·초상화 표시 |
| `[SCENE:title]` | 장면 제목 오버레이 |
| `[END]` | 모험 종료 → 요약 다이얼로그 |

NPC 목록 소스: `KarmoWorld.bindings.chatbot.characters[]` (전역).
코드: `src/widgets/adventure/npc-context.ts` + `src/widgets/adventure/prompt.ts`.

---

## 데이터 흐름

```
LLM 응답
  → parseTurnResponse() (prompt.ts)
  → AdventureTurnRecord {ts, userText, assistantText, parsed, imageRefs, providerId, modelId}
  → saveSession() (storage.ts)
      Tauri: adventure_save_raw → memo/projects/karmolab/raw/adventures/{slug}.json  (private)
      fallback: localStorage kl_adventure_session_{slug}
```

정수 추출 (θ, 미구현): raw JSON → `adv_commit_summary` Tauri command → wiki public commit.

---

## Tauri Commands (ζ 이후)

| Command | 역할 |
|---|---|
| `adventure_claude_complete` | Claude Max OAuth subprocess via Rust (async + spawn_blocking) |
| `adventure_save_raw` | raw JSON 저장 → `memo/.../raw/adventures/` |
| `adventure_commit_summary` | git fetch + commit + push (정수 추출 흐름) |

---

## 개발 페이즈 레이블

`α` provider 추상화 · `β` wiki 연동 · `γ` UI 개선 · `δ` 턴 루프 · `ε` NPC chatbot · `ζ` Tauri save · `η` imagegen · `θ` 정수 추출 · `κ` sampling

---

## 주요 파일

| 파일 | 역할 |
|---|---|
| `adventure.ts` | 진입점 — UI shell, cast picker, provider toggle |
| `turn-loop.ts` | 턴 state machine — history + runTurn() |
| `prompt.ts` | system instruction 빌더 + LLM 응답 파서 |
| `storage.ts` | 세션 저장/불러오기 (Tauri / localStorage) |
| `npc-context.ts` | NPC 캐릭터 컨텍스트 로더 |
| `imagegen.ts` | Vertex Imagen 4 이미지 생성 |
| `settings.ts` | 설정 패널 (API key, model) |
| `provider/factory.ts` | provider 팩토리 + 선호 저장 |
| `provider/ClaudeProvider.ts` | Claude via Tauri command |
| `provider/VertexProvider.ts` | Gemini via browser fetch |
