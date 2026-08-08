# `companion` — 곁에 있는 존재

TASK-KAR-201. **여기엔 캐릭터가 없다.** 욘도, 말투도, 이름도 없다. 인격은 나중에 꽂는 부품이다.

> 이 파일이 **종결 지도**다 — 여기 한 장으로 그림이 닫힌다. 회차별 사연·실패 기록은
> `memo/tasks/TASK-KAR-201-*.md`(일지), 코드 안 사연은 각 파일 맨 위 주석.

## 한 문장

「무언가를 느꼈다 → 지금 말할까 → 무슨 말 → 어디로 내보낸다」 이 한 바퀴만 코어가 알고, 나머지는 전부 갈아끼운다.

## 지금 할 수 있는 것

| | 되는 것 | 어디 |
| --- | --- | --- |
| 듣기 | 늘 듣기(부르면 돌아본다) · 눌러서 켜고 끄기 · 누르는 동안만 · 마이크 고르기 · 들어오는 소리 눈으로 | `sense/whisper` · 창 |
| 말하기 | 흉내 낸 목소리(내 목소리 복제) · 내 컴퓨터 목소리 · 인터넷 목소리. **고른 목소리로만 말한다** | `voice/*` |
| 보기 | 화면을 곁눈질하고 본 것에 대해 한 마디 | `sense/screen` |
| 손 | 밖에서 찾아보기 · 주소 열어 읽기 · 파일/폴더 보기 · 파일 하나로 손 늘리기 | `hands/*` |
| 기억 | 방금 오간 말 · 졸인 「아는 것」 · 사건 · **뜻으로 찾기**(낱말 안 겹쳐도) | `memory/*` |
| 몸 | 창(3D 몸·투명·항상 위) · 터미널 · 시계 · **디스코드**(토큰 오면) | `body/*` |
| 결 | 기분 · 사이 · 놀리기 · 뜸 · 맞장구 · 반사 · 끼어들기 · 조용히 있기 | `mood` `rapport` `tease` … |
| 지킴 | 인격 표류 · 회피 · 무대 뒤 말 · 안 한 걸 했다고 말하기 · 깨진 글 | `drift` `hollow` `meta-talk` `claims` `garbled` |

## 갈아끼우는 자리 (코어가 아는 것)

| 자리 | 책임 | 있는 것 |
| --- | --- | --- |
| `Sense` | 느낌 → 코어로 | 창 입력 · 화면 보기 · 받아쓰기 · 시계 · 닿음 · 디스코드 |
| `Attention` | 「지금 말 걸어도 되나」 (두뇌 부르기 **전**) | always · never · cooldown · 눈치(`attention/tact`) |
| `Brain` | 재료 → 할 말 (`null` = 침묵) | echo · claude-cli(격리) · assistant(`karmolab-ai` 위임) |
| `Memory` | 느낀 것·말한 것 + 오래 남는 앎 | 메모리 · 파일 · 졸이는 기억 · 뜻 색인 |
| `Voice` | 말 → 밖으로 | 흉내(GPT-SoVITS) · 내 컴퓨터(piper) · 인터넷(edge) |
| `Character` | 누구인가 | `characters/*.md` (기본 `무명` = 이름 없음, 말버릇만) |

**몸(Body) = Sense + Voice 한 쌍.** 몸을 늘려도 `src/core.ts` 는 안 바뀐다 — 디스코드 몸을 붙일 때 코어 변경 **0줄**로 증명됐다.

## 두 줄로 돈다 (계통 분리)

- **말 줄** — 사람 말·반사·대답. 일 줄이 무엇을 하든 **바로 시작한다.**
- **일 줄** — 화면 보기·되새김·뜻 색인·손 미리쓰기·대사 창고. 밀려도 되고, 결과는 다음 turn 재료가 된다.
- 두뇌는 하나뿐이라 일 줄은 **말 줄이 빌 때만** 새 turn 을 연다.

재는 자리: `node scripts/measure-lanes.mjs` — 무거운 일이 도는 중 말 걸면 얼마나 기다리나(2793ms → 1ms 로 고친 자리).

## 무거운 것은 쓸 때 켜고 안 쓰면 끈다

흉내 낸 목소리 서버는 뜨는 데 30초, 메모리도 크게 문다. 말할 때 켜고, 한동안 말이 없으면 끈다(우리가 띄운 것만 끈다). **고른 목소리가 뜰 때까지 기다린다** — 딴 목소리로 바꾸지 않는다(조수님 결정). 영영 안 뜨면 소리가 없다.

## 굴려보기

```bash
npm install && npm test          # 단위 1122개

npm run face                     # 창까지 (기본: 제 창 + 3D 몸 + 흉내 목소리)
COMPANION_BRAIN=echo COMPANION_DESKTOP=0 npm run face   # 가짜 두뇌, 창 없이 (검사용)
node demo/run.mjs                # 터미널만
```

서버 모니터 「동반자 (말하는 봇)」 카드로도 켠다.

환경변수: `COMPANION_BRAIN`(claude|echo|assistant) · `COMPANION_CHARACTER` · `COMPANION_PORT`(기본 **4620** — 4615 는 yawnbot dev 웹훅이 쓴다) · `COMPANION_SCREEN_MS` · `COMPANION_CLOCK_MS` · `COMPANION_MEMORY_FILE` · `COMPANION_DESKTOP`(0=창 없이) · `COMPANION_DISCORD_TOKEN` + `COMPANION_DISCORD_CHANNELS` · `COMPANION_MODEL_YON` · `COMPANION_PIPER_DIR` · `COMPANION_CLONE_REF`.

재시작 없이 바꾸는 것(창 우클릭 또는 `/settings`): 먼저 말 걸기·화면 보기 간격·조용한 시간·놀리기·애니 목소리 자동/쉬는 시간.

## 남는 것 (사람이 읽어도 되는 형태)

`~/.companion/` — `conversation.jsonl`(오간 말) · `아는-것.md` · `그때-그-일.json` · `뜻-색인.json` · `궁금한-것.md` · `곁의-사람들.json` · `지어-둔-대꾸.json` · `발동-기록.json` · `잘못된-것.json` · `설정.json` · `hands/*.json`(손 명세).

## 저장소 밖에서 오는 것

3D 몸은 게임 저장소, 로컬 목소리·받아쓰기 모델·흉내 참고 음성은 메모 저장소, 창 프로그램은 구운 자리에 있다. **경로를 여기 박지 않는다** — `src/workspace.ts` 가 이웃을 찾고, **못 찾으면 말한다**. (워크트리에서 띄웠을 때 셋이 한꺼번에 조용히 사라져 「코드가 회귀됐다」로 보인 적이 있다.)

## 검사

- `npm test` — 단위 1122개.
- `scripts/probe.mjs` — 진짜로 띄우고 말 걸어 대답이 나오는지(단위가 전부 초록인데 얘가 죽어 있던 적이 있다).
- `scripts/measure-lanes.mjs` — 줄 서기 때문에 생기는 지연.
- 저장소 게이트(`npm run verify`)가 이 패키지의 `npm test` 를 부른다. KarmoLab 쪽에서는 「동반자」 위젯이 실제로 붙는지도 본다(봇이 안 떠 있으면 건너뜀).
- **검사는 사람의 기억을 더럽히지 않는다** — 시험 표시(`x-companion-test: 1`)를 달면 처리는 하되 기억에 안 담긴다. 사용자 경로를 밟는 검사는 끝나고 제 자국을 지운다.

## 막힌 것

- **디스코드 접속** = 토큰 대기. 몸·코어는 시험 끝 — `COMPANION_DISCORD_TOKEN`(+ 들을 방)만 오면 붙는다. 봇을 서버에 초대하고 **Message Content Intent** 를 켜야 글 내용이 온다.
- **노래** = 보류. 흉내 목소리는 말 전용이고, 노래는 별도 모델 + 노래 데이터 학습이 필요하다.

## 레퍼런스

- [AIRI](https://github.com/moeru-ai/airi) — 코어 하나에 몸이 플러그인으로 붙는 구조
- [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) — 설정만 고쳐 부품 교체
- 뉴로사마 — 말 끊기 · 먼저 말하기 · 오래 가는 기억 · 손을 상시로 씀
