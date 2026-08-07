# `companion` — 인격을 모르는 동반자 코어

TASK-KAR-201. **여기엔 캐릭터가 없다.** 욘도, 말투도, 이름도 없다. 인격은 나중에 꽂는 부품이다.

## 한 문장

「무언가를 느꼈다 → 지금 말할까 → 무슨 말 → 어디로 내보낸다」 이 한 바퀴만 코어가 알고, 나머지는 전부 갈아끼운다.

## 갈아끼우는 자리 6개

| 자리 | 책임 | 지금 있는 것 |
| --- | --- | --- |
| `Sense` | 느낌 → 코어로 | 터미널 입력 · 웹 창 입력 · **화면 보기** · 시계 tick |
| `Attention` | 「지금 말 걸어도 되나」 (두뇌 부르기 **전** = 비용도 수다도 같이 줄어든다) | always · never · cooldown |
| `Brain` | 재료 → 할 말 (`null` = 침묵) | echo(키 불요) · **claude-cli(격리, 그림도 읽음)** · assistant(`karmolab-ai` 위임) |
| `Memory` | 느낀 것·말한 것을 한 타임라인에 + **오래 남는 앎** | 메모리 · JSONL 파일 · **졸이는 기억** |
| `Voice` | 말 → 밖으로 | 터미널 출력 · 웹 창 말풍선 + 소리내어 말하기 |
| `Character` | 누구인가 | `characters/*.md` 파일 하나 (기본 `무명` = 이름 없음, 말버릇만) |

인격은 **코어를 통과만 한다** — 코어는 그 안을 들여다보지 않는다. 인격을 바꾸려고 코드를 고쳐야 하는 구조를 만들지 않으려는 것이다.

### 기억은 두 층이다

`recent` = 방금 오간 말. `longTerm` = 밀려난 말에서 건져 올린 「이 사람에 대해 아는 것」.

최근 대화만 넘기면 어제 한 말을 오늘 모르고, 전부 넘기면 대화가 길어질수록 감당이 안 된다. 그래서 일정량 쌓이면 뒤에서 조용히 접어 한 장으로 남긴다 (`~/.companion/아는-것.md`). 접기가 실패해도 대화는 멀쩡하다 — 갱신이 늦어질 뿐이다.

실측: 이름·직업·못 먹는 음식을 한 번 말한 뒤 **대화 기록을 통째로 지우고 새 프로세스로** 「저녁 뭐 먹을까」 물었더니 「매운 거 빼고 골라야 하니까 반은 이미 정해진 셈이네」. 창 오른쪽 위 🧠 로 뭘 안다고 생각하는지 직접 볼 수 있다.

### 두뇌 격리가 필요했던 이유

공용 provider 라우터의 claude 경로는 두 가지를 몰래 끌고 온다: ① 실행한 폴더 상위의 지침 파일 ② 다른 봇과 공유하는 고정 대화 세션. 실측으로 우리 대화에 없던 낱말이 답에 나왔다. `claudeCliBrain` 은 빈 임시 폴더에서 세션 없이 부른다. 그림을 읽어야 할 때만 그 폴더 안에 한해 파일 접근을 연다.

**몸(Body) = Sense + Voice 한 쌍.** 디스코드도 화면도 「몸 하나」일 뿐이다 — 본체가 아니다.

두뇌를 고르는 것도 여기가 아니다. `ASSISTANT_AI_PROVIDER` 로 gemini / claude-cli / codex-cli / openai / ollama / openrouter 중 고르고, `ASSISTANT_AI_FALLBACK_CHAIN` 으로 실패 시 다음 것을 시도한다 (`karmolab-ai` 가 이미 하던 일).

## 굴려보기

```bash
npm install && npm test          # 단위 7개

# 눈에 보이는 몸 — 브라우저가 열리고 큐브가 나타난다
COMPANION_BRAIN=assistant ASSISTANT_AI_PROVIDER=claude-cli node demo/face.mjs

# 터미널만 (글자만)
node demo/run.mjs                                        # 가짜 두뇌 — 키 없이 루프만 확인
COMPANION_BRAIN=assistant ASSISTANT_AI_PROVIDER=claude-cli node demo/run.mjs   # 진짜 두뇌
COMPANION_CLOCK_MS=2000 COMPANION_MEMORY_FILE=./memory.jsonl node demo/run.mjs # 몸 2개 + 남는 기억
```

환경변수: `COMPANION_BRAIN`(claude|echo|assistant) · `COMPANION_CHARACTER`(파일명 또는 `none`) · `COMPANION_SCREEN_MS` · `COMPANION_CLOCK_MS` · `COMPANION_COOLDOWN_MS` · `COMPANION_MEMORY_FILE` · `COMPANION_PORT`.

**목소리**는 창 오른쪽 위 버튼으로 켠다. 브라우저 내장 음성이라 키도 서버도 필요 없고, 기본은 꺼져 있다 — 소리가 갑자기 나오는 건 무례하니까.

## 이 프로토타입이 증명하려는 단 하나

**몸을 늘려도 `src/core.ts` 는 안 바뀐다.** 터미널(사람이 말을 건다)과 시계(스스로 깨어난다)는 성격이 정반대인데 코어 수정 0으로 함께 붙는다. 디스코드·화면도 같은 자리에 들어온다.

## 레퍼런스

- [AIRI](https://github.com/moeru-ai/airi) — 코어 하나에 몸(디스코드·텔레그램·마인크래프트)이 플러그인으로 붙는 구조를 그대로 참고
- [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) — 설정만 고쳐 부품 교체(코드 무수정) 방식

## 아직 없는 것 (사용자 피드백 후 결정)

인격을 꽂는 6번째 자리 · 디스코드/화면 몸 · 목소리(TTS) · 요약되는 장기 기억 · Rust 선행 구현(`karmolab-tauri` 의 `life/companion/`)과 기억 합치기.
