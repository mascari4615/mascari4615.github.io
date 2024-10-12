---
title: "🌔 Unity 메모"
categories: [💫Computer, 🌔Game-Engine]
tags: [Unity, OnParticleCollision, NavMesh]

# 🌔 유니티 _ 인스펙터에서 값을 변경한 Public, [SerializeField] 속성 변수
# date: 2019-12-10. 20:01:00
# last_modified_at: 2023-05-10 14:15

# 🌔 Unity GUID 보는 법
# date: 2022-08-26. 20:12

# 🌔 Unity OnParticleCollision 이 호출되지 않을 때
# date: 2023-01-06. 23:46
# last_modified_at: 2023-08-22. 05:50

# 🌔 Unity NavMesh
# date: 2023-02-15. 08:57
# last_modified_at: 2023-08-26. 10:54

# 🌔 Unity 'Cannot perform upm operation: EBUSY: resource busy or locked, open'
# date: 2023-02-24. 00:59

date: 2023-05-21. 15:03
# last_modified_at: 2023-07-13. 17:48
# last_modified_at: 2023-08-22. 05:50
# last_modified_at: 2024-03-05. 13:13
# last_modified_at: 2024-04-03. 14:15
# last_modified_at: 2024-04-09. 03:03
# last_modified_at: 2024-08-10. 17:39
last_modified_at: 2024-08-29. 21:33
---

2024-04-09. 03:03 : 글 계승.  
`2019-12-10-Unity-Public-SerializeField : 🌔 유니티 _ 인스펙터에서 값을 변경한 Public, [SerializeField] 속성 변수`,  
`2022-08-26-Unity-GUID : 🌔 Unity GUID 보는 법`,  
`2023-01-06-OnParticleCollision-Not-Work : 🌔 Unity OnParticleCollision 이 호출되지 않을 때`,  
`2023-02-15-Unity-NavMesh : 🌔 Unity NavMesh`,  
`2023-02-24-Cannot-Perform-Upm-Operation : 🌔 Unity 'Cannot perform upm operation: EBUSY: resource busy or locked, open'`  

## 💫 키워드

---

- [Rich Text](https://docs.unity3d.com/kr/2022.1/Manual/StyledText.html)
- [UI Toolkit](/posts/Unity-UI-Toolkit/)
- `Collision.contacts`
- `AddForce`에서의 Force -> `force * DT / mass`

## 💫 인스펙터에서 값을 변경한 Public, [SerializeField] 속성 변수

---

![20191203225712.950590](https://media1.tenor.com/m/cNcJNOPOBSQAAAAd/head-nod.gif)  

접근 제어자가 Public 이거나 [SerializeField] 속성을 준 변수를 인스펙터에서 수정한 후,  
해당 변수를 [HideInInSpector] 속성으로 바꾸더라도, 인스펙터에서 설정된 값이 저장되어 남아있을 수 있다.  

분명 오류 없이 게임 시스템을 구현한 것 같다고 생각했는데 수정한 사실을 미처 모르고 넘어가게 된다면,  
에디터가 오류라고 말해주지도 않고, 일일이 찾아보기 전까지는 모르기 때문에 조심해야 한다.  

## 💫 GUID 보는 법

---

[참고](https://makaka.org/unity-tutorials/guid)  

.meta 파일 열면 나온다  

## 💫 Particle

---

### 🫧 OnParticleCollision 이 호출되지 않을 때

---

[참고](https://www.reddit.com/r/unity/comments/n30tkr/onparticlecollision_not_called/)  

- 파티클 시스템에서 Collision 이 켜져있는지 확인
- Collision 에서 Type 이 World 인지 확인 (기본 Plane)
- ⭐ Collision 에서 Send Collision Messages 가 켜져있는지 확인
- Collision 에서 Collision Quality 가 High 인지 확인
- Collision 에서 Collision Quality / Collides With 의 레이어에 닿고자 하는 오브젝트의 레이어가 포함되어 있는지 확인

### 🫧 Particle Option

- Limit Velocity over Lifetime : 말그대로
- Noise : 움직임에 대한 노이즈

- Color Gradation Editor : Mode는 Blend (Classic, Perceptual), Fixed가 있는데, Fixed로 설정하면 그라데이션 없이
  - 시작 색을 여러 가지 고정된 색으로 설정하기, Fixed로 설정하여

## 💫 NavMesh

---

{% include embed/youtube.html id = "n-RXnDGE72M" %}

[참고](https://forum.unity.com/threads/solved-problem-with-unity-navmesh-and-multiple-agent-sizes-with-a-workaround-solution.178628/)  

## 💫 NavMesh, 여러 크기의 Agent에 대한 NavMesh 각각 Bake

---

### 🫧 문제 : 하나의 Agent Type만 Bake 가능

여러 크기의 Agent를 함께 사용하고 싶었는데,  
기본 내장 기능으로는 한 번에 한 Agent Type에 대해서만 NavMesh를 Bake 할 수 있었다.  

때문에 NavMesh를 Bake했던 Agent Type과 다른 Agent Type을 가진 Agent는,  
플랫폼에 제대로 배치했음에도 에러 로그를 뿜어냈다. (Failed to create agent because it is not close enough to the NavMesh)  
플랫폼 어느 곳에도 해당 Agent Type에 대한 NavMesh가 없기 때문이다.  

이에 여러 Agent Type에 대해, NavMesh를 '각각' Bake 하는 방법이 필요했다.  

### 🫧 해결 : NavMeshSurface

NavMesh Building Components 중 NavMeshSurface 컴포넌트를 이용하면, 여러 Agent Type에 대해 NavMesh를 '각각' 구워낼 수 있다 !  

그런데 NavMesh Building Components는 Unity 2021에 내장된 NavMesh에는 포함되어 있지 않다.  
NavMesh Building Components는 AI Navigation 패키지의 Experimental 버전에서만 지원되고 있다. (23-02-15 기준)  
때문에 이 버전으로 업데이트를 시켜줘야 한다.  

패키지 설치는 [Unity NavMesh Building Components](https://docs.unity3d.com/2021.3/Documentation/Manual/NavMesh-BuildingComponents.html) 문서를 참고했다.  
사용 방법은, [Unite Europe 2017 - Finding the path](https://youtu.be/n-RXnDGE72M?t=180) 강연을 참고했다.  

## 💫 Cannot perform upm operation: EBUSY: resource busy or locked, open

---

`Cannot perform upm operation: EBUSY: resource busy or locked, open`  
유니티 패키지 설치 시도 시 위 에러가 뜬다.  

IDE 끄고 다시 시도한다.  

## 💫 [Dropdown, 선택지 위쪽으로 나오게 하려면](https://forum.unity.com/threads/solved-how-to-control-which-direction-the-dropdown-shows-the-selections.371162/)

---

Template 오브젝트, Pivot Y 값을 기존 1에서 0으로 변경, Template 위치 조정  

## 💫 [Scroll Rect, 키보드 (WASD, 방향키) 입력 방지](https://ask.vrchat.com/t/how-to-disable-scrolling-with-keyboard-for-ui-scrollrect/1651/11)

---

Scroll Rect, Scroll Sensitivity 기존 1에서 0으로 변경  

## 💫 [Scroll View, 아래에서 위로 올라가는 목록](https://blog.naver.com/cdw0424/222007263664)

---

Content 오브젝트, Pivot Y 값을 기존 1에서 0으로 변경  

## 💫 [Layout 새로고침](https://forum.unity.com/threads/force-immediate-layout-update.372630/)

---

LayoutRebuilder.ForceRebuildLayoutImmediate(RectTransform)  

## 💫 [Animator Disable 돼도 상태 유지](https://docs.unity3d.com/ScriptReference/Animator-keepAnimatorControllerStateOnDisable.html)

---

Animator.keepAnimatorContrillerStateOnDisable = true;  
직관적인 이름  
애니메이터 기능이기에, 비단 UI 뿐만 아니라 일반 작업시에도 사용 가능  

## 💫 [시네머신 에딧 모드에서 바로바로 업데이트가 안됨](https://discussions.unity.com/t/cinemachine-doesnt-continually-update-in-edit-mode/249321)

---

Cinemachine Brain 에서 Update Method 가 Fixed Update 면 바로바로 안바뀜  

## 💫 오클루더 Occluder, 오클루디 Occludee

---

오클루더 Occluder : 오클루디를 가리는 오브젝트  
오클루디 Occludee : 오클루더에 의해 가려지는 오브젝트  

## 💫 라이트 베이크

---

베이커리 베이크 시 흰색 검은색 빨간색 초록색 파란색 얼룩  

Auto-Atlasing . Texels per unit 40 ~ 80  
글로벌 일루미네이션 . samples  
보통 UV 오버랩 문제 > Texels per unit 값 올려주거나, UV 맵 자체 간격  
Force Power-Of-Two Atlas 체크 > 검은 공간 많은 텍스쳐를 크기 줄여줌, 해 가려지는 오브젝트  

## 💫 Mesh Collider 끼리 충돌 안됨

---

Convex 체크  

## 💫 디버깅

---

- `Debug.Break()`
- Ctrl + Alt + P : 1 프레임 진행
- Ctrl + Shift + P : 일시정지/재생
