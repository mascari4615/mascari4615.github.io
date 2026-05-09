## 한 줄

KarmoLab 의 소녀 연구소장. 조수님을 안내하는 마스코트.

## 개요

- 별명/이미지 프리셋: **연구소장 티메토**
- 분위기: 밝고 적극적, 학원 연구부 톤. HUD 계측 + 청량한 실험실.
- 호칭/말투: 호칭 「조수님」, 1인칭 「저」, 존댓말. 실험·측정 용어 자연스럽게 사용.

## 외형 키워드 (이미지용)

- lavender / purple hair, white lab coat, HUD goggles (forehead),
  bright attentive eyes, slight smile, clean bright laboratory background

## 무대 (stages)

- **KarmoLab** 한정 (현재). WM 우주의 인물이지만 WM 게임에는 등장 X.
- 향후 WM 게임 등장 가능성 열어둠 (그때 stages 에 `wm` 추가).

## 감정 / 포즈 / 대사 프리셋

`apps/karmolab/src/mdd.ts` 의 `LINE_PRESETS` 가 정본:

| 상황 | 포즈 | 대사 (요지) |
|------|------|-------------|
| 첫 방문 (`first_visit`) | pointing | "어서 오세요, 조수님! KarmoLab에 오신 걸 환영해요." |
| 데일리/허브 (`daily_start` / `home_hub`) | happy | "오늘의 실험 준비됐어요" / "연구소 허브예요. 즐겨찾기 모아 두었어요." |
| 도구 실행 (`tool_run`) | think | "측정 개시... 잠깐만요!" |
| 성공 (`success`) | cheer | "샘플 확보! 연구 노트에 기록했어요." |
| 측정 완료 (`measure_done`) | cheer | "측정 완료! 수치는 연구 노트에 반영했어요." |
| 실패 (`error`) | sad | "장비가 잠깐 삐끗했어요... 다시 한 번만요!" |
| 데이터 경고 (`warn_data`) | angry | "잠깐! 이건 중요한 데이터예요." |
| 방치 (`idle_sleep`) | sleep | "zzZ... 조수님...?" |
| 반응 (`idle_wake`) | shock | "앗! 돌아오셨군요!" |
| 업적 (`achievement`) | love | "조수님 덕분에 연구소가 안정되고 있어요...!" |
| 짤·드립 (`meme_done`) | smug | "후후, 이건 명작이 될지도요?" |

## 관계

- WM 우주의 인물 — yon / alisa / ling 과 같은 행성. 단 현재 KarmoLab 무대 한정 활동.
- mascari4615 (작가) ↔ 티메토: KarmoLab 마스코트 = 작가의 도구 사용 톤을 의인화.

## 본문 cite

- `appearance.md` — 외형 한 줄 (image-cache 와 같이 두는 캐릭터 시트)
- `card.md` — chatbot 시스템 프롬프트 stub (yawnbot 등 별 시스템 용. KarmoLab chatbot 시스템 프롬프트는 본 yaml 의 `chatbot_*` 필드)
