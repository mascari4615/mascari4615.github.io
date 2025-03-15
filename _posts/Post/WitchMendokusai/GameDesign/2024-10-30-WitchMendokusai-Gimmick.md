---
title: "WitchMendokusai | Gimmick"
# description: ""
categories: [📀Post, 🥥WitchMendokusai]
tags: [WitchMendokusai, "마녀: 귀찮아"]
image: "/assets/project/WitchMendokusai/ScreenShot/240514_104350.png"
hidden: true

date: 2024-10-30. 21:08
last_modified_at: 2024-10-30. 21:08 # Init
---

## 📀 머리말

---

핵심 기획은 아니지만,  
재미 요소가 될 수 있는 기획, 아이디어 모음.  

## 📀 기획 기믹

---

- 닉네임에 따른 변화
  - [플레이어 닉네임에 따른 테마 변화](https://twitter.com/METALBUTTER/status/1175020978960658432?ref_src=twsrc%5Etfw)
  - 갓오곡 닉네임 능력치 변화

- 시련

- 모바일 연동
- 클리커
- 머지
- 디펜스
- 주사위

- 랜덤, 가챠, 등급

## 📀 월드 기믹

---

### 💿 필드

- 크아 동전맵
  - 피버타임처럼
  - 클리어하면 몇 분 동안 제한 시간 주어지고

### 💿 필드 퍼즐

- 필드 퍼즐 Like 헬테이커?
- 사진 돌리기, 태엽 돌리기 Like 스타레일
- 박스 밀기, 소코반 Like 스타레일

- 점프맵
  - 점프가 가능하다면
  - 부딪히면 점프 가능한, 다시 재생되는 아이템 사과 (부딪히면 반투명 해짐) Like 셀레스텔, 아이워너비더보시

### 💿 연출

- VA-11 Hall-A
  - 같은 포션 만들어서 주는 씬

- 뱀서 몹은 맵 밖으로 나가면 디스폰이 아니라 반대쪽에서 나온다?
- Animator, Anitation Cull Mode를 Cull Completely로 바꾸면 화면 밖에서 애니메이션이 멈춘다.
- Physics2D 설정에 Use Multithreading
- 군중스폰
- 군중스폰의 최적화 -> 위치를 클러스터로 묶어서 단계저긍로 거리측정?
- 일정 수 넘어가면 화면 밖에 빨간 보석이 생기고, 그 보석에 넘치는 경험치 다 쌓여두게
- <https://docs.unity3d.com/2019.3/Documentation/Manual/BestPracticeGuides.html>
- <https://learn.unity.com/tutorial/flocking>
- <https://www.youtube.com/watch?v=lS_qeBy3aQI>
  - 원형충돌체 물리 구현?
    - 제약 : 충돌체끼리 반지름 차이가 매우 크지 않게.
    - 충돌체 제곱만큼 계산되는 것을 방지하려고 (?)
    - 맵을 청크로 나누는데 필요한 제약
