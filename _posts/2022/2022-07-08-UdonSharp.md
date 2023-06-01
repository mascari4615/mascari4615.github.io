---
title: "🌔 VRChat U# 자주 하는 질문 (자문자답)"
date: 2022-07-08. 14:31
categories: ⭐Computer 🌔Unity-CSharp
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
