---
title: "🌔 VRChat USharp"
date: 2022-07-08. 14:31
last_modified_at: 2023-10-10. 10:00
categories: ⭐Computer 🌔Unity-CSharp
tags: Unity VRChat USharp
---

## 💎

---

### 💫 오류 로그는 안뜨는데, 원하는 대로로 작동안할 때  

---

코드 잘못짜서 생긴 논리 오류를 제외하고,  

1. 호출하고자하는 CustomEvent가 Public 접근 제한자인지 확인한다
2. 똑같은 UdonBehaiviour 여러 개 들어가있는 지 확인한다 (프리팹에 Udon 추가하는 과정에서 주로 발생)

### 💫 Udon 싱크 크기  

---

<https://doc.photonengine.com/en-us/pun/current/reference/serialization-in-photon>

### 💫 UI 인터렉션 가능하게 하는 조건 3가지  

---

1. 오브젝트 Layer Default
2. VRC UI Sharp 컴포넌트
3. Box Collider

### 💫 VRChat World에서 VideoPlayer로 데이터 불러오기

---

- [링크1](https://feralresearch.org/lab/api-calls-from-inside-vrc/)
- [링크2](https://ask.vrchat.com/t/http-requests/1803)
- [링크3](https://github.com/Roliga/udon-video-decoder)
- [링크4](https://gitlab.com/anfaux/pixel-proxy/-/blob/main/server-node/modules/encode.js)
- [링크5](https://vrchat.com/home/launch?worldId=wrld_7508e408-ba6a-4478-b772-6af430c89286&instanceId=51500~private(usr_74fd4823-008f-4434-969c-c892e7c143e2)~region(eu)~nonce(031b2879-124f-4943-b075-2700f61ee200))

### 💫 메모

---

- [VRC, 영화 자막](https://twitter.com/vr_hai/status/1495774702521958407?s=20)
