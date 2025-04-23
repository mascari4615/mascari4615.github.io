---
title: "WitchMendokusai | Game-Design"
# description: ""
categories: [📀Post, 🥥WitchMendokusai]
tags: [WitchMendokusai]
image: "/assets/project/_WitchMendokusai/ScreenShot/240618_000000.png"
hidden: true

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

# WitchMendokusai | Gimmick
# date: 2024-10-30. 21:08

date: 2024-10-30. 15:24
# last_modified_at: 2024-10-30. 15:24 # Init (WitchMendokusai Memo 계승)
# last_modified_at: 2024-10-30. 21:05 # WitchMendokusai-Ref 분리
# last_modified_at: 2024-10-30. 21:05 # Log, 241111 Log
# last_modified_at: 2024-11-13. 08:48 # FirstFantasy 병합
# last_modified_at: 2025-02-02. 16:05 # 메모
# last_modified_at: 2025-02-05. 00:39 # 메모
# last_modified_at: 2025-03-03. 13:52 # 모험가 길드 메모 -> Github Issues
last_modified_at: 2025-04-20. 23:17 # 메모 정리
---

2024-10-30. 15:24 : 글 계승.  
`2024-05-22-WitchMendokusai-Memo : WitchMendokusai Memo`  

2025-04-19. 02:10 : 글 병합.  
`2024-10-30-WM-Gimmick : WitchMendokusai | Gimmick`  

## 📀 마일스톤

---

## 📀 Log

---

### ~ 2411

- 241111
  - 카메라 줌
  - MCamera
  - InputManager Event

### ~ 2405

- 애니메이션 텍스트 좀 더 구체화 (여러 곳에서 쓸 수 있게, 레벨업 효과)
- 포션을 섞고 삶을 바꿀 시간이군!
- UI 보여지는 시간, 특히 퀘스트
- Dotween Free
- 라이트맵 저장 문제

### ~ 2403

- 피격 시 카메라 확대, 흔들림
- 사망 시 짧은 슬로우 모션
- [사망 연출](https://twitter.com/wombatstuff/status/1659144219976511488?s=20)
- 화면 전환 연출/기능
- 스킬에 마우스 올리면 설명
- 인게임 성장 시스템 변경
  - 새로운 시스템 & UI 템플릿
- 난이도, 난이도 UI
- 피격 이펙트 (카메라 쉐이킹, 이미지)
- [TimeScale 분리](https://x.com/saewooh/status/1686563906268069888?s=20)
- 상점
- 도전과제
- 던전 진입, 던전 결과

### ~ 2401

- SOManager를 만들어 ScriptableObjects들을 관리
- 확률 새로운 기능 추가
  - List에 저장된 확률의 총량이 100보다 작을 경우, default 값을 나머지로 100을 채우는 기능
- 몬스터가 더 이상 아이템을 직접 인벤토리에 넣지 않고, EXP 오브젝트 같이 아이템 오브젝트로 드롭함
- 배경음/효과음 수정
- 슬라임
- 카메라 회전
- 카메라 기준, 특정 오브젝트가 플레이어 왼쪽에 있는지 오른쪽에 있는지 판별
- 그 외 이것저것

### ~ 2311

- 일시정지
  - 단순 ESC 메뉴
  - 어빌리티 선택 시 시간 정지
- 던전
  - 여러 몬스터 / 웨이브
  - 클리어 개념
- 데미지 텍스트 폰트 및 크기 및 위치
- 아이템 획득 팝업 크기
- 카메라
- 몬스터 스폰 범위
- 스킬 슬롯
- 던전 입장/퇴장 시 레벨, 경험치, 체력 초기화
- 던전 퇴장 시 드롭 오브젝트 비활성화
- 무적 시간
- ? 경험치 오브젝트 획득 애니메이션
- 몬스터 스폰 소환진
- ? 스테이지 가장자리에서 나오도록
- 던전 퇴장 시 스킬 오브젝트 비활성화
- 몬스터 행동트리
- 경험치 바 애니메이션

### ~ 2504

- VFX Graph
- UnitStatCalculator 기반

## 📀 TODO

---

- 다듬어야 할 것들 (후추)
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
- 게임 시작할 때 동숲처럼 집에서 나오는 걸로 시작할까?
- 우체통 있으면 재밌겠다
- 시간 개념을 둘까?
- 조작키 방향키에 Ctrl Alt , Z?
- 전투 끝났을 때 데미지 받지 않도록
- 타임라인 이용한 연출?
- 길찾기? a*?
- Json, Playfab, Addressable
- LogViewer
- 데이터 저장 불러오기, 변수 이름 Replace
- 상태 변수 저장 관리
- 유니티 설계 경험 기록
- 지도, 지도 여러종류
- 집까지 길 없게
- 타입 상성
- 메인 인형은 전직? 스타레일 개척자, 아닌 애들은 그냥 생 캐릭터

## 📀 도구

---

이걸로 어떤 걸 할 수 있을까?  

- Spine

## 📀 기획

---

시너지?  

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

### 💿 Task

- Sprite -> 3D 모델
- AI
  - 전투 AI 몬스터, 동료 AI (멀티에도)

## 📀 메모

---

## 📀 기술

---

### 💿 UI

Knob  
Bar대신 Knob  
업적창에 Knob Grid  

### 💿 VFX Graph

- Portal
- 각종 Skill
- Dust
- _
  - 빨, 흰, 주, 보
  - 세모, 네모, 동그라미, 십자

### 💿 Event

GameEventManager
i.e. OnLocalizeEvent

### 💿 서버

게임에 서버 넣어볼까  
서버비 내더라도  
구독제 몇개줄이면  
Addressable서버  
나스  

### 💿 DOC

Layer, SortingLayer 정책  
Tag  
기술스택 정리  
Engine  
언어 .Net Version .Net Support  
지원 플랫폼  
버전 관리  
버전 관리 툴  
Source Code Tool  
UI 해상도 (기준)  
UI Tool (UGUI or UI Toolkit)  
Features  
Assets 목록  

## 📀 기믹

---

### 💿 소리

- [사이렌 4개가 겹치는 소리](https://youtu.be/wNrXUeq6Sug?si=zbJn9f51q6CtEW8e)

### 💿 진행도

- 진행도에 따른 차이 (등장인물 실루엣 이라던지)
- 진행도에 따른 테마 차이
- [포켓몬스터 블랙/화이트 BGM 레파토리](https://m.blog.naver.com/PostView.naver?isHttpsRedirect=true&blogId=riomedevon&logNo=110106228406)
- [포켓몬스터 블랙/화이트 빌리지 브리지](https://pokemon.fandom.com/ko/wiki/%EB%B9%8C%EB%A6%AC%EC%A7%80_%EB%B8%8C%EB%A6%AC%EC%A7%80)
- [포켓몬스터 블랙/화이트 빌리지 브리지](https://namu.wiki/w/%EB%B9%8C%EB%A6%AC%EC%A7%80%EB%B8%8C%EB%A6%AC%EC%A7%80)
- [포켓몬스터 BGM 변화 기믹](https://youtu.be/dqBe7vLYp-U?si=p1JW1tmqJv5BVROf)
- [포켓몬스터 BGM 만들기](https://youtu.be/3DWslI_n4RM?si=UGXUnwEbjHPqQRfP)

### 💿 ETC

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
- 카메라와 인형 사이, 디더링?
- 아이템 드롭 애니메이션에 빙글빙글 돌도록
  - 행렬 공부
  - Vertex Shader?
- 인형 등장인물 위상 조사해서 뭘로 이루어져있는지
- 마우스 포인터
- Quest Skill Unit 등 게임 내 기능에 필요한 클래스 구조 설계 및 개발
- 여러 맥락에서 쓰일 수 있는 Criteria 조건 Effect 효과 구조 설계 및 개발
- 재사용 / 확장 가능성
- Scriptable Object와 UI Toolkit으로 제작한 커스텀 툴을 이용한 에디터 타임 게임 데이터 관리
  - ID 충돌
  - 정렬
  - ID 중복/충돌 관리
  - 데이터 자동 생성
  - 파일 이름 자동 수정
- 선택지 (긍정, 중립, 부정) (얼굴 이모티콘)
- 상자 집 안에는 있어야 소중한 물건이니까
- 거리비례 탈진 Like 스타듀밸리
- 한울, 가마 로고
- 시간의 개념, 밤/낮 개념이 없는 세계에서 어떻게?
  - 시계의 원리?
  - 위성?
  - 인공적인 위성?
- Pc게임 다마고치처럼 폰에서 키우는? 포켓몬 하트골드그거처럼
- 아트 캐릭터 파츠 나눠서 둠칫둠칫
- Va11a 같은 포션 만들어서 주는 씬
- 천사
  - 무서운 모습
  - 악마를 `멸`하기 위치해있다
    - 파괴
  - 그 시대가 추구하는 바를 형상화
- 악마
  - 이와 반대되는 악마
  - 선한 모습
  - 7대악
  - 무서운것
    - 나쁜마음? 이기심?
    - 창조
    - 새로운 것
    - 성공을 위한 도전, 노력, 이내
- _
  - 신, 영원, 유전 x
  - 생명체, 필멸, 유전 o
- 진격거
  - 야구공, 깃털
- 시체에서 태어나는 파리
- 신의 전차
- 건물 생명
- 배드 애플
- 게으름
  - 아무것이 아니라 해야할 일을 하지 않는
  - 망각, Like 에르디아
