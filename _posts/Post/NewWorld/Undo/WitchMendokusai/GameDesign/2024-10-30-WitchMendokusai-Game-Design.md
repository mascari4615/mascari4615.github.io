---
title: "WitchMendokusai | Game-Design"
# description: ""
categories: [📀Post, 🫐Project, 🫐WitchMendokusai]
hidden: true
tags: [Project, Game-Dev, WitchMendokusai]
image: "/assets/img/background/20230112_151539.jpg"

# 2024-04-10. 12:24 : 글 병합.
# `2023-03-14-Slime : 🍐 슬라임`

# 2024-06-11. 13:53 : 글 병합.
#`2024-04-27-WitchMendokusai-Story : 🫐 WitchMendokusai Story`,
#`2024-04-03-WitchMendokusai-Doll : 🫐 WitchMendokusai Doll`

# WitchMendokusai Concept
# date: 2024-04-03. 14:41
# last_modified_at: 2024-04-10. 11:15
# last_modified_at: 2024-05-06. 07:51
# last_modified_at: 2024-05-13. 01:46
# last_modified_at: 2024-06-05. 14:07
# last_modified_at: 2024-06-11. 13:53
# last_modified_at: 2024-06-12. 13:21
# last_modified_at: 2024-08-29. 22:14
# last_modified_at: 2024-10-20. 23:27 # Undo, Story, Doll 분리
# last_modified_at: 2024-10-29. 21:22 # Slime 분리

# 2024-10-30. 01:52 : 글 병합.
# `2024-04-03-WitchMendokusai-Concept : WitchMendokusai Concept`

# WitchMendokusai Memo
# date: 2024-05-22. 20:50
# last_modified_at: 2024-05-29. 14:56
# last_modified_at: 2024-06-03. 21:47
# last_modified_at: 2024-06-05. 14:11
# last_modified_at: 2024-06-19. 10:43
# last_modified_at: 2024-10-16. 06:17 # 메모 정리
# last_modified_at: 2024-10-19. 12:00 # 메모 정리
# last_modified_at: 2024-10-30. 01:53 # 메모 정리, WitchMendokusai Concept 계승

date: 2024-10-30. 15:24
last_modified_at: 2024-10-30. 15:24 # Init (WitchMendokusai Memo 계승)
last_modified_at: 2024-10-30. 21:05 # WitchMendokusai-Ref 분리
---

2024-10-30. 15:24 : 글 계승.  
`2024-05-22-WitchMendokusai-Memo : WitchMendokusai Memo`  

## 📀 마일스톤

---

## 📀 TODO

---

- 다듬어야 할 것들 (후추)
  - 아트/사운
  - 메인 화면
  - NPC 마커
  - NPC 대화
  - 전투 결과 화면
  - 전환/트랜지션 시 코루틴
    - 전투 진입 시 아이캐쳐
    - 블루 아카이브 스킬 같은
    - 로그라이크 죽음을 맵 별로 다른 엔딩이나 컷신 등으로?
      - 템플런
    - 포켓몬 게임 인트로
  - 지역 입장 UI (201번 도로)
  - 이펙트

- WIP
  - 행동트리 (에디터, ViewGraph)
  - 에디터
    - SO 정렬 기능
    - 에셋 선택창도 커스텀 할 수 있으려나?
    - 몬스터 스폰, 드롭 테이블?
    - 에셋 버퍼 관리
    - 그러면 에셋 생성할때 고유한 ID 테이블을 미리 정해둬야 편하겠네
    - 저장 데이터 관리 -시각화 수정, 세이브/로드
    - 맵 관리? 지도?
  - 상호작용
    - NPC
      - 떠상
        - 던전 떠상 (런 능력치?)
        - 떠상 (설계도?)
    - 제단
    - 채집 식물 : 나무, 열매, 꽃 (그 포켓몬 열매 같은)
    - 상자, 미믹
    - 동전
    - 유적 버튼
    - 해골
    - 제단
    - 폭발하는 오브젝트
    - 돌탑

- 고민해봐야 하는 것들
  - 아이템 드롭 , 자동 획득이 아니라 z 눌러서 먹게
  - 몬스터 마다 성격이 있다 Like 팩맨
  - 플라스크

- 던전
  - 로그라이크 (던그리드 형식? or 슬더슬 라이크나 위치 그거 처럼)
  - 보스 연출
  - 보스 행동패턴
  - 전투 시스템
  - 전체적인 던전 구조 (절차적?)
  - 던전 제약
  - DungeonLoop
  - 던전 보상
  - 몬스터
  - 인게임 재화로 리롤 (제한, 최대 등급 - 1 천장)

- Must
  - 어드레서블 서버로 해야겠는데, 플레이 가능하게 하려면
  - 데미지 연산
  - 아이템 강화 (강화 재화)
  - 마을 의뢰, 메인 퀘스트 (마법 책)
  - 대화 스크립트

- 명령어 (테스트/디버깅)
- NPC Waypoint 이동 경로
- 크래프팅 시스템
- 정신집중
- 게임 시작할 때 동숲처럼 집에서 나오는 걸로 시작할까?
- 우체통 있으면 재밌겠다
- 시간 개념을 둘까?
- 식량 신앙 청결 이런거 대신 태엽 감아줘야 하는, 마나 같은거
- 조작키 방향키에 Ctrl Alt , Z?
- 대량 발생
- 전투 끝났을 때 데미지 받지 않도록
- 타임라인 이용한 연출?
- 길찾기? a*?
- 마을 건물 강화 / 그리드?
- Json, Playfab, Addressable
- LogViewer
- 의식체
- 데이터 저장 불러오기, 변수 이름 Replace
- 상태 변수 저장 관리
- 유니티 설계 경험 기록
- 싱크로니시티
- 지도, 지도 여러종류
- 집까지 길 없게
- 타입 상성
- 전투 전에 씨앗을 심는
- 태엽
- 인형 강화
- 메인 인형은 전직? 스타레일 개척자, 아닌 애들은 그냥 생 캐릭터
- 언령
- 자폭병
- 백팩
- Spine
- 웨이브 UI (팔라독 같은?)
- 카메라와 인형 사이, 디더링?
- 카드 등장 확률 (희귀 카드)
- 메인 화면
- 행렬 공부
  - 아이템 드롭 애니메이션에 빙글빙글 돌도록
- 마도서
- 의뢰
- 낚시
  - 자동 효율 낮게

## 📀 기획

---

스타듀밸리/컬트오브렘 - 기지건설 + 리오레 - 로그라이크/뱀서류  
(대충 내가 좋아하는 거 다 짬뽕)  

- 카드
  - 강화/변화/충전/리필
  - 덱에 카드 추가하는 Effect

최종 스탯을 계산하는 스크립터블 오브젝트를 만들고 (MaxHp 라던지)  
접근할때 계산하는 식으로  

최종 스탯을 변경하는 게 아니라, Mastery증감수치 스탯을 변경  

SkillObject에서는 최종 스탯을 가지고 계산  

단순 스탯은 그렇게  
그렇다면 버프형은? 가동율 50%의 깜빡깜빡 버프?  

시너지?  

포탈 있는 맵 (푸키먼, 메이플 같은)  
던전 or 필드 몹 (원신, 스타레일, 푸키먼 소드실드 같은)  

- 사실과 변수
  - 개념적
  - 골드, 마나 계속 변동하고

[Playables0](https://youtu.be/12bfRIvqLW4)  
[Playables1](https://youtu.be/nn3SnfNNEmk)  

카메라 회전  
공격 조이스틱  
카메라 시점 변경 스크롤 (롤, 이리 휠 스크롤)  

조합 - 제작 - 아이템/위상 - 상점  
골드 수요 - 세금, 타이쿤류 Like 쿠키런 킹덤  
