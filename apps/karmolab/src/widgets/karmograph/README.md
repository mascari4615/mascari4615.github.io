# KarmoGraph — 관계와 생각을 연결하는 그래프 캔버스

관계도·세계관·카드 전개·개념 설명을 한 도구로. **엔진 하나 + 갈아끼우는 어휘 팩**이 설계의 뼈대다.

작업 정본 = `memo/projects/karmolab/tasks/TASK-KL-202-캔버스-범용-관계도.md` (격차 A~AA + 레퍼런스 원장).
앞선 시드 = `TASK-KL-087`.

## 어디에 뭐가 있나

| 파일 | 무엇 |
| --- | --- |
| `karmograph.ts` | 위젯 본체 — 툴바·오른쪽 패널 8종(노드 / 선 / 묶음 / 용어 / 거르기 / 관계망 / 저장 / 도움말)·발표 모드 |
| `packs.ts` | **어휘 팩** 6종(세계관·인물관계도·카드전개·개념설명·구상·조직) + 전 팩 합본 색·아이콘 표 |
| `terms.ts` | 내 용어 — 사람이 직접 만든 노드/관계 종류. 맵이 아니라 **사람**에게 붙는다 |
| `library.ts` | 맵 여러 장 — 목록·현재 맵·복제·삭제. 옛 단일 키에서 자기소멸 이사 |
| `local-storage-adapter.ts` | 한 맵의 읽기·쓰기 (좌표 패치 / 구조 저장 분리) |
| `from-text.ts` | 들여쓴 글 → 노드·선 + 계층 트리 배치 |
| `samples.ts` | 팩별 견본 (빈 화면에서 「예시 넣어 보기」) — 글 문법 그대로 |
| `links.ts` | 설명 속 `[[이름]]` — 가리키는 것 / 나를 가리키는 것 / 이름만 나온 곳 |
| `sna.ts` | 관계망 지표 — degree · betweenness(Brandes) · closeness |
| `tidy.ts` | 가지런히 — 겹친 것만 밀기 + 격자 스냅 (통째 재배치는 일부러 안 한다) |
| `share.ts` | 주소에 그림 담기 (deflate + base64url, 8000자 상한) |
| `storage-health.ts` | 저장 공간 재기 · 위험선 |
| `help.ts` | 할 수 있는 일 + 단축키 목록. **새 기능은 여기 한 줄이 늘어야 한다** |

캔버스 엔진은 여기 없다 — `apps/karmolab/src/lib/graph/` (`canvas.ts` 그리기·조작, `spec.ts` 자료 모양,
`styles.ts` CSS, `adapter.ts` 저장 seam). cockpit 위젯도 같은 엔진을 쓴다.

## 저장되는 곳 (localStorage)

| 열쇠 | 무엇 |
| --- | --- |
| `karmograph.index` | 맵 목록 + 지금 열린 맵 |
| `karmograph.map.<id>` | 맵 한 장 (`GraphSpec`) |
| `karmograph.prev.<id>` | 그 맵의 **직전 판** — 사고 났을 때 되살리는 한 판 |
| `karmograph.terms` | 내 용어 (사람 단위, 모든 맵 공용) |

## 검사

```bash
cd apps/karmolab && npm run dev          # 먼저 띄우고
npm run smoke:karmograph                   # 34항목 화면 검사
```

화면 검사가 **초록이 아니면 새 기능을 얹지 않는다** (2026-08-09 사고 이후 규율 —
위젯이 목록에 등록 안 된 채 20 커밋이 쌓였는데 모든 게이트가 초록이었다).
