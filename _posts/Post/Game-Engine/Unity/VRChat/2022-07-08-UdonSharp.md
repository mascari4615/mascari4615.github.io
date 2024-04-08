---
title: "🌔 VRChat USharp"
date: 2022-07-08. 14:31

# 🌔 VRChat 안개 (Fog)
# date: 2022-01-28. 09:48

# 🌔 VRChat 월드 에디터 테스트 시, ContextMenu Attribute
# date: 2022-06-28. 02:41

# last_modified_at: 2023-10-10. 10:00
last_modified_at: 2024-04-09. 13:44
categories: [⭐Computer,🌔Game-Engine]
tags: [Unity, VRChat, USharp]
---

2024-04-09. 02:28  
'2022-01-28-USharp-Fog : 🌔 VRChat 안개 (Fog)',  
'2022-06-28-USharp-ContextMenu : 🌔 VRChat 월드 에디터 테스트 시, ContextMenu Attribute',  
글 계승  

## **💫 [VRC_MUdons](https://github.com/Mascari4615/VRC_MUdons)**

---

<https://github.com/Mascari4615/VRC_MUdons>  
왁타버스 컨텐츠에 사용한 VRChat U# 스크립트 모음  
<br>

## **💫 팁**

---
<br>

### **🫧 오류 로그는 안뜨는데, 원하는 대로로 작동안할 때**

---

코드 잘못짜서 생긴 논리 오류를 제외하고,  

1. 호출하고자하는 CustomEvent가 Public 접근 제한자인지 확인한다
2. 똑같은 UdonBehaiviour 여러 개 들어가있는 지 확인한다 (프리팹에 Udon 추가하는 과정에서 주로 발생)
<br>

### **🫧 Udon 싱크 크기**

---

- <https://doc.photonengine.com/en-us/pun/current/reference/serialization-in-photon>
- 싱크 변수가 정말 많으면 싱크가 동작하지 않음.
<br>

### **🫧 UI 인터렉션 가능하게 하는 조건 3가지**

---

1. 오브젝트 Layer Default
2. VRC UI Sharp 컴포넌트
3. Box Collider
<br>

### **🫧 VRChat World에서 VideoPlayer로 데이터 불러오기**

---

- [링크1](https://feralresearch.org/lab/api-calls-from-inside-vrc/)
- [링크2](https://ask.vrchat.com/t/http-requests/1803)
- [링크3](https://github.com/Roliga/udon-video-decoder)
- [링크4](https://gitlab.com/anfaux/pixel-proxy/-/blob/main/server-node/modules/encode.js)
- [링크5](https://vrchat.com/home/launch?worldId=wrld_7508e408-ba6a-4478-b772-6af430c89286&instanceId=51500~private(usr_74fd4823-008f-4434-969c-c892e7c143e2)~region(eu)~nonce(031b2879-124f-4943-b075-2700f61ee200))
<br>

### **🫧 Fog**

---

`Fog` 안켜둔 채로 빌드하면, 런타임에서 Fog를 켜도 적용이 안됌.  
켜둔 채로 빌드하고, 월드 들어오자마자 꺼주기.  

220128 기준.  
<br>

### **🫧 ContextMenu**

---

`ContextMenu` 사용 시,  
오브젝트를 껐다키는 등의 단순 명령들은 잘 실행되지만,  
변수 값을 변경하는 등의 명령은 제대로 실행되지 않음.  

```cs
int temp = 0;

void Update() { Debug.Log(temp); }

[ContextMenu("Add")]
void Add() { temp++; Debug.Log(temp); }
```

예를 들어, 위 같은 코드에서 `Add`를  
`SendCustomEvent`로 호출하면 `Add`에서 `1`, `Update`에서 `1`이 찍히는데,  
`ContextMenu`로 호출하면 `Add`에서 `1`, `Update`에서 `0`이 찍힌다.  

테스트 시 주의  

220628 기준.  
<br>

### **🫧 ?**

---

`SyncMode(None)`인 `오브젝트 토글 우동 A`로  
`우동 B가 포함된 오브젝트`를 자식으로 가지는 부모 오브젝트 C를 활성화 시킬 때,  

`우동 B`가 `SyncMode(Continue or Manual)`이면 `우동 B` 동작안함  
`우동 B`가 `SyncMode(None)`이면 `우동 B` 동작함  

다시말해,  
`A`가 `SyncMode(Continue or Manual)`이면 `B`의 `SyncMode`가 뭐든간에 `B`가 정상적으로 동작  
`A`가 `SyncMode(None)`일 때, `B`의 `SyncMove(Continue or Manual)`라면 `B`가 동작안함  
<br>

### **🫧 컨텐츠 전 점검**

---

- 아바타
- 채팅창 위치
- 로고
- VR 테스트
- 카메라 아바타 잘 잡히는지
<br>

### **🫧 메모**

---

- [VRC, 영화 자막](https://twitter.com/vr_hai/status/1495774702521958407?s=20)
<br>
