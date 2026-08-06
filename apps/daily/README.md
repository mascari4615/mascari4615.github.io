# 오늘의 하나 맞히기 (`/daily/`)

매일 자정(KST)에 문제 하나. 속성 힌트로 좁혀 맞히고, 결과는 **정답이 안 새는 이모지 격자**로 공유한다.
TASK-KAR-202 · 목적 = 방문자 유입(도구가 아니라 *올 이유*).

## 이 앱의 단 하나의 규칙

> **주제를 늘릴 때 코드는 안 고친다.** `data/<주제>.json` 을 넣으면 페이지가 생긴다.

지금 주제: 포켓몬(1025) · 롤 챔피언(173). 판은 **주제 × 모드** = 4개.

## 모드

| 모드 | 주소 | 규칙 | 붙는 조건 |
| --- | --- | --- | --- |
| 속성 | `/daily/<주제>/` | 속성별로 초록·노랑·▲▼ 힌트, 8번 | 언제나 |
| 실루엣 | `/daily/<주제>/silhouette/` | 까만 그림이 틀릴수록 밝아짐, 6번 | 모든 항목에 그림이 있을 때 자동 |

모드마다 **정답이 다르다** — 같은 주제로 하루 두 판이 되는 이유다.
모드는 데이터가 아니라 행동이라 `scripts/build.mjs` 에 산다. 주제 표에는 모드 이야기가 없다.

참고한 것: LoLdle 은 한 주제에 모드를 여럿 굴려 하루 방문 수를 배로 만들었고,
Pokedle 트래픽의 3분의 1이 LoLdle 교차 링크에서 왔다. 그래서 **판이 끝나면 아직 안 푼 판을 건넨다.**

## 구조

| 파일 | 하는 일 |
| --- | --- |
| `engine.mjs` | 규칙 전부 — 비교 / 오늘의 정답 / 공유 격자. DOM·fetch 모름. 브라우저와 node 양쪽에서 그대로 돈다 |
| `engine.test.mjs` | `node --test` (의존성 0) |
| `app.mjs` | 화면과 저장만. 규칙 판단 안 함 |
| `scripts/build.mjs` | `data/*.json` → `dist/` (허브 + 주제별 페이지). 번들러 없음 |
| `scripts/fetch-*.mjs` | 공개 API → 표. 한 번 돌리고 결과를 커밋한다 |
| `scripts/smoke.mjs` | **진짜 브라우저에서 한 판 끝까지 둔다** (playwright 는 이웃 앱 것을 빌려 씀) |

의존성 0 · 빌드 도구 0 은 의도다. 첫 화면이 빨라야 낯선 사람이 안 닫는다.

## 명령

```bash
npm test            # 규칙 시험
npm run build       # 시험 + dist/ 생성
npm run serve       # dist/ 를 배포와 같은 주소(/daily/)로 띄운다
node scripts/smoke.mjs   # 브라우저 한 판 (스샷 = .cache/shots/)
npm run fetch:lol        # 표 갱신 (Data Dragon — 새 챔피언 나올 때)
npm run fetch:pokemon    # 표 갱신 (PokéAPI — 오래 걸림, .cache/ 에 캐시)
```

## 주제 하나 더 넣기

1. `data/<id>.json` 을 만든다 — `kind` 는 `number` / `set` / `category` 3종뿐.
   ```json
   { "id": "x", "title": "…", "emoji": "…", "maxGuesses": 8,
     "fields": [{ "key": "gen", "label": "세대", "kind": "number", "near": 1 }],
     "items": [{ "name": "…", "img": "…", "gen": 1 }] }
   ```
   `near`(절대 오차) 나 `nearRatio`(비율)를 주면 가까울 때 노랑이 뜬다.
2. `npm run build` — 끝. 허브에도 자동으로 걸린다.

## 표를 갱신할 때 아는 채로 해야 하는 것

**항목 수가 바뀌면 그날 이후의 정답 순서가 통째로 다시 섞인다.** 순열이 항목 수를 씨앗으로 쓰기 때문이다.
같은 날 안에 표를 갈아끼우면 이미 두던 사람의 정답이 바뀐다 — 갱신은 한국 시각 자정 직후에.
(새 챔피언은 몇 달에 한 번이라 이 값을 고정하는 것보다 이 규칙을 지키는 쪽이 싸다.)

## 배포에서 걸리는 곳

- `pages-deploy.yml` 이 `npm run build` 후 `dist/` 를 `apps/blog/daily/` 로 복사한다. 시험이 깨지면 배포도 안 나간다.
- 루트 Chirpy 서비스워커가 cache-first 라, `_config.yml` 의 `pwa.cache.deny_paths` 에 `/daily` 를 넣어 뒀다.
  **빼면 방문자에게 어제 문제가 계속 나온다.**
- 자산 주소에 빌드 도장(`?v=…`)이 붙는다 — 캐시가 옛 파일을 붙들지 못하게.

## 안 한 것 (일부러)

로그인 · 서버 저장 · 전체 랭킹 · 과거 문제 아카이브. 사람이 온 뒤에 붙인다.
