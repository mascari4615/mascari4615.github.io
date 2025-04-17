---
title: "VRChat - 마왕총회"
# description: ""
categories: [📀Post, 🫐Project]
tags: [Project, VRChat]
image: "/assets/img/background/20230112_151539.jpg"

date: 2025-04-13. 00:00
# last_modified_at: 2025-04-16. 21:48 # Init
last_modified_at: 2025-04-17. 21:59
---

_  
{% include embed/youtube.html id = "" %}

## 📀 머리말

---

이세계아이돌 비챤님의 '마왕 토크쇼' 컨텐츠입니다.  

25년 04월 13일 19시 방송이 진행됐습니다.  

망냥냥, 마왕이노리, 제갈금자, 마왕0216, 마왕루야, 웅터르님께서 참가자로 참여해주셨습니다.  

### 💿 참여 / 담당

본 컨텐츠는 VRChat 게임 내에서 진행되었습니다.  

해당 컨텐츠에 사용된 VRChat World 내 기능 프로그래밍을 담당했습니다.  
또한 방송 진행을 위한 오퍼레이팅, 기능 조작을 담당했습니다.  

- 카메라 시스템
  - 에디터 타임에 카메라 구도를 미리 설정
  - `CinemachineVirtualCamera.Priority`를 조정하여 구도 전환

### 💿 사용한 툴

- Unity 2022.3.22f1
- [U# (C# + VRChat SDK)](https://udonsharp.docs.vrchat.com/)
- [Woodon](https://github.com/wrchat/Woodon)
- TortoiseSVN

Discord를 통해 팀원/클라이언트와 소통했습니다.  

## 📀 시작

---

25년 04월 03일에 프로젝트에 참여했습니다.  

## 📀 과정

---

25년 04월 12일 작업을 진행했습니다.  

## 📀 구현

---

1. 스크린에 주제 띄우기
2. 참가자 간의 인기투표

두 가지 기능이 필요하다는 사실만 전달 받고 작업을 진행했다.  

주제 띄우기는 간단히 문자열만 다르게 띄우면 됐고,  
인기투표의 경우 이미 예전에 만들어둔 `VoteManager` 기능이 있어서 그대로 활용했다.  

기능 구현보다는, UI 배치에 더 많은 시간이 소요됐다.  
UI에 사용된 글꼴은 [전주완판본 각체](https://noonnu.cc/font_page/625)이다.  

## 📀 기록

---

- 주제
  - 개회사, 자기소개 타임
  - 진정한 마왕이란 무엇인가
  - 마왕이라 좋은 점
  - 마왕이라 나쁜 점
  - 마왕 이대로 괜찮은가
  - 마왕 중 서열 1위는?
  - 마왕 인기투표 (자투제외)
