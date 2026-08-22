---
title: Unity 메모
date: "2023-05-21T15:03:00+09:00"
last_modified_at: "2025-05-28T21:06:00+09:00"
categories: [컴퓨터, 소프트웨어]
tags: [유니티]
image: /assets/img/background/20240827-140647.jpg
---

2024-04-09. 03:03: 글 계승.  
`2019-12-10-Unity-Public-SerializeField: 🌔 유니티 _ 인스펙터에서 값을 변경한 Public, [SerializeField] 속성 변수`,  
`2022-08-26-Unity-GUID: 🌔 Unity GUID 보는 법`,  
`2023-01-06-OnParticleCollision-Not-Work: 🌔 Unity OnParticleCollision 이 호출되지 않을 때`,  
`2023-02-15-Unity-NavMesh: 🌔 Unity NavMesh`,  
`2023-02-24-Cannot-Perform-Upm-Operation: 🌔 Unity 'Cannot perform upm operation: EBUSY: resource busy or locked, open'`  

## Q

---

- 에셋번들
  - 무엇인지
  - 어떻게 사용하는지
  - 왜 사용하는지
- 에디터 프로그래밍
  - 무엇인지
  - 사용해보셨는지
- shader 기술
- 최적화 기술
- ScriptableObject
  - SOHelper, SOManager
- 코루틴의 과정

## 인스펙터에서 값을 변경한 Public, [SerializeField] 속성 변수

---

![20191203225712.950590](https://media1.tenor.com/m/cNcJNOPOBSQAAAAd/head-nod.gif)  

접근 제어자가 Public 이거나 [SerializeField] 속성을 준 변수를 인스펙터에서 수정한 후,  
해당 변수를 [HideInInSpector] 속성으로 바꾸더라도, 인스펙터에서 설정된 값이 저장되어 남아있을 수 있다.  

분명 오류 없이 게임 시스템을 구현한 것 같다고 생각했는데 수정한 사실을 미처 모르고 넘어가게 된다면,  
에디터가 오류라고 말해주지도 않고, 일일이 찾아보기 전까지는 모르기 때문에 조심해야 한다.  

## GUID 보는 법

---

[참고](https://makaka.org/unity-tutorials/guid)  

.meta 파일 열면 나온다  

## Particle

---

### OnParticleCollision 이 호출되지 않을 때

---

[참고](https://www.reddit.com/r/unity/comments/n30tkr/onparticlecollision_not_called/)  

- 파티클 시스템에서 Collision 이 켜져있는지 확인
- Collision 에서 Type 이 World 인지 확인 (기본 Plane)
- ⭐ Collision 에서 Send Collision Messages 가 켜져있는지 확인
- Collision 에서 Collision Quality 가 High 인지 확인
- Collision 에서 Collision Quality / Collides With 의 레이어에 닿고자 하는 오브젝트의 레이어가 포함되어 있는지 확인

### Particle Option

- Limit Velocity over Lifetime: 말그대로
- Noise: 움직임에 대한 노이즈

- Color Gradation Editor: Mode는 Blend (Classic, Perceptual), Fixed가 있는데, Fixed로 설정하면 그라데이션 없이
  - 시작 색을 여러 가지 고정된 색으로 설정하기, Fixed로 설정하여

## NavMesh

---

https://youtu.be/n-RXnDGE72M

[참고](https://forum.unity.com/threads/solved-problem-with-unity-navmesh-and-multiple-agent-sizes-with-a-workaround-solution.178628/)  

## NavMesh, 여러 크기의 Agent에 대한 NavMesh 각각 Bake

---

### 문제: 하나의 Agent Type만 Bake 가능

여러 크기의 Agent를 함께 사용하고 싶었는데,  
기본 내장 기능으로는 한 번에 한 Agent Type에 대해서만 NavMesh를 Bake 할 수 있었다.  

때문에 NavMesh를 Bake했던 Agent Type과 다른 Agent Type을 가진 Agent는,  
플랫폼에 제대로 배치했음에도 에러 로그를 뿜어냈다. (Failed to create agent because it is not close enough to the NavMesh)  
플랫폼 어느 곳에도 해당 Agent Type에 대한 NavMesh가 없기 때문이다.  

이에 여러 Agent Type에 대해, NavMesh를 '각각' Bake 하는 방법이 필요했다.  

### 해결: NavMeshSurface

NavMesh Building Components 중 NavMeshSurface 컴포넌트를 이용하면, 여러 Agent Type에 대해 NavMesh를 '각각' 구워낼 수 있다 !  

그런데 NavMesh Building Components는 Unity 2021에 내장된 NavMesh에는 포함되어 있지 않다.  
NavMesh Building Components는 AI Navigation 패키지의 Experimental 버전에서만 지원되고 있다. (23-02-15 기준)  
때문에 이 버전으로 업데이트를 시켜줘야 한다.  

패키지 설치는 [Unity NavMesh Building Components](https://docs.unity3d.com/2021.3/Documentation/Manual/NavMesh-BuildingComponents.html) 문서를 참고했다.  
사용 방법은, [Unite Europe 2017 - Finding the path](https://youtu.be/n-RXnDGE72M?t=180) 강연을 참고했다.  

## Cannot perform upm operation: EBUSY: resource busy or locked, open

---

`Cannot perform upm operation: EBUSY: resource busy or locked, open`  
유니티 패키지 설치 시도 시 위 에러가 뜬다.  

IDE 끄고 다시 시도한다.  

## [Dropdown, 선택지 위쪽으로 나오게 하려면](https://forum.unity.com/threads/solved-how-to-control-which-direction-the-dropdown-shows-the-selections.371162/)

---

Template 오브젝트, Pivot Y 값을 기존 1에서 0으로 변경, Template 위치 조정  

## [Scroll Rect, 키보드 (WASD, 방향키) 입력 방지](https://ask.vrchat.com/t/how-to-disable-scrolling-with-keyboard-for-ui-scrollrect/1651/11)

---

Scroll Rect, Scroll Sensitivity 기존 1에서 0으로 변경  

## [Scroll View, 아래에서 위로 올라가는 목록](https://blog.naver.com/cdw0424/222007263664)

---

Content 오브젝트, Pivot Y 값을 기존 1에서 0으로 변경  

## [Layout 새로고침](https://forum.unity.com/threads/force-immediate-layout-update.372630/)

---

LayoutRebuilder.ForceRebuildLayoutImmediate(RectTransform)  

## [Animator Disable 돼도 상태 유지](https://docs.unity3d.com/ScriptReference/Animator-keepAnimatorControllerStateOnDisable.html)

---

Animator.keepAnimatorContrillerStateOnDisable = true;  
직관적인 이름  
애니메이터 기능이기에, 비단 UI 뿐만 아니라 일반 작업시에도 사용 가능  

## [시네머신 에딧 모드에서 바로바로 업데이트가 안됨](https://discussions.unity.com/t/cinemachine-doesnt-continually-update-in-edit-mode/249321)

---

Cinemachine Brain 에서 Update Method 가 Fixed Update 면 바로바로 안바뀜  

## 오클루더 Occluder, 오클루디 Occludee

---

오클루더 Occluder: 오클루디를 가리는 오브젝트  
오클루디 Occludee: 오클루더에 의해 가려지는 오브젝트  

## 라이트 베이크

---

베이커리 베이크 시 흰색 검은색 빨간색 초록색 파란색 얼룩  

Auto-Atlasing . Texels per unit 40 ~ 80  
글로벌 일루미네이션 . samples  
보통 UV 오버랩 문제 > Texels per unit 값 올려주거나, UV 맵 자체 간격  
Force Power-Of-Two Atlas 체크 > 검은 공간 많은 텍스쳐를 크기 줄여줌, 해 가려지는 오브젝트  

## Mesh Collider 끼리 충돌 안됨

---

Convex 체크  

## 디버깅

---

- `Debug.Break()`
- Ctrl + Alt + P: 1 프레임 진행
- Ctrl + Shift + P: 일시정지/재생

## Unity6

---

### 변경점

`Object.FindObjectOfType<T>(bool includeInactive)`  
=>  
`Object.FindFirstObjectByType<T>(FindObjectsInactive findObjectsInactive)`  

`Object.FindObjectsOfType<T>()`  
`Object.FindObjectsOfType<T>(bool includeInactive)`
=>  
`Object.FindObjectsByType<T>(FindObjectsSortMode sortMode)`  
`Object.FindObjectsByType<T>(FindObjectsInactive findObjectsInactive, FindObjectsSortMode sortMode)`  

`CinemachineVirtualCamera` => `CinemachineCamera`  
`CinemachineFramingTransposer` => `CinemachinePositionComposer`  

`CinemachineFramingTransposer.m_ScreenX` 는 범위가 0 ~ 1 이였는데, (0.5가 중심)  
`CinemachinePositionComposer.Composition.ScreenPosition.x` 는 0이 중심  

`The project currently uses the compatibility mode where the Render Graph API is disabled. Support for this mode will be removed in future Unity versions. Migrate existing ScriptableRenderPasses to the new RenderGraph API. After the migration, disable the compatibility mode in Edit > Projects Settings > Graphics > Render Graph.`  
`UnityEditor.EditorAssemblies:ProcessInitializeOnLoadMethodAttributes ()`  

- InstantiateAsync
- WebView 정식 지원 (?)

## Button Navigation & Animation

---

Navigation None하면 Button Transition Animation 동작안할 수 있음. (특히 Selected)  
대신 `EventSystem.current.SetSelectedGameObject(button.gameObject);` 같이 선택해 줄 수도 있음.  

## Project 창 검색

---

't:Prefab' (type)  

## 단축키

---

- `Ctrl + P`: Play Mode
- `Ctrl + Shift + P`: Pause
- `Ctrl + Alt + P`: Step
- GameObject 선택 후 `Ctrl + Shift + F`: Focus
  - GameObject Menu에도 있음.

## 메모

---

- Button.onClick에는 return있는 함수를 못쓴다.
- ScreenSpace - Camera, Plane Distance
  - UI - worldSpace - UI 이런식으로 작업하고자 할 때
- DefineSymbol
- Unity.MobileNotifications
- PlayerPrefs
- 버전 별 Data Converter
- Screen.SafeArea
  - 펀치홀, 노치 디자인
- WorldSpace UI에 Particle System
- `UnityEditor.SceneManagement.EditorSceneManager.playModeStartScene`
- UI -> Pause하고 움직여보면 안따옴, 각 프레임 Rebuild 필요
- Profiler
  - StandAlone
  - DevelopMonet 켜야 모바일 BuildTest시 Profile 가능
- 지오메트리
- Segment
- Spline
- DrawCall 줄이기
  - 같은 리소스 최대한 한 번에 그리기?
  - `리소스 전환`?
  - 동일한 텍스쳐/메쉬/셰이더 한 번에 그리는 것: `Batching`?\
- BaseMeshEffect
  - UIBehaviour
  - IMeshModifier
- VertexHelper UI
  - OnPopulateMesh
  - Text도 가능
    - i.e. Text Gradient를 Vertex 수정해서
- `object.ReferenceEqual`를 `==` 연산 비싸서 대신?
- Animator 움직이지 않아도, 보이지 않아도, 내부적으로 Dirty 처리
- SelectionGroup
- Time.frameCount
- ['산적대왕': 'Unity 테스트 자동화'](https://blog.naver.com/raveneer/221040790678)
- ['_': '\[Unity\] 커스텀 디버그 클래스 사용할 때 더블 클릭 시 외부 파일 연결 올바르게 하기'](https://upbo.tistory.com/164)
- debug
  - debug 호출할 때 문자열 만드는 것이 더 오래 걸리는 것 같음
  - definition 설정하면 호출 코드 자체가 없는 듯
  - conditional attribute
  - diagnostics
- project auditor
- build automation
- multiplayer
- ['원소랑': Unity lossyScale](https://m.blog.naver.com/sorang226/223802482530)
- Unity Log Format: Color, size, bold, italic -> 확장 메서드
- PlayerPrefs: 간단한 저장
- OnApplicationPause
- GeometryUtillity
- SpriteAtlas <- 생각보다 간단함
- UNITY_6000_0_OR_NEWER
- Adaptive Performance
- 6.1
  - LightMapping
  - GetLightingDataAssetForScene

### Asset

- ['Unity AssetStore': 'Odin Inspector and Serializer'](https://assetstore.unity.com/packages/tools/utilities/odin-inspector-and-serializer-89041)

### 키워드

- ['Unity Document': 'Rich Text'](https://docs.unity3d.com/kr/2022.1/Manual/StyledText.html)
- [UI Toolkit](/posts/unity-ui-toolkit/)
- `Collision.contacts`
- `AddForce`에서의 Force -> `force * DT / mass`
