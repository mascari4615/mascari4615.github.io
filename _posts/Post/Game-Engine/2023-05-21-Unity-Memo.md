---
title: "🌔 Unity 메모"
date: 2023-05-21. 15:03

# last_modified_at: 2023-07-13. 17:48
# last_modified_at: 2023-08-22. 05:50
# last_modified_at: 2024-03-05. 13:13
last_modified_at: 2024-04-03. 14:15

categories: [⭐Computer, 🌔Game-Engine]
tags: [Unity]
---

## **💫 키워드**

---

- [Rich Text](https://docs.unity3d.com/kr/2022.1/Manual/StyledText.html)
- [UI Toolkit](https://mascari4615.github.io/posts/Unity-UI-Toolkit/)
- `Collision.contacts`
- `AddForce`에서의 Force -> `force * DT / mass`

<br>
<!-- ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ---- -->

## **💫 [Dropdown, 선택지 위쪽으로 나오게 하려면](https://forum.unity.com/threads/solved-how-to-control-which-direction-the-dropdown-shows-the-selections.371162/)**

---

Template 오브젝트, Pivot Y 값을 기존 1에서 0으로 변경, Template 위치 조정  

<br>
<!-- ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ---- -->

## **💫 [Scroll Rect, 키보드 (WASD, 방향키) 입력 방지](https://ask.vrchat.com/t/how-to-disable-scrolling-with-keyboard-for-ui-scrollrect/1651/11)**

---

Scroll Rect, Scroll Sensitivity 기존 1에서 0으로 변경  

<br>
<!-- ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ---- -->

## **💫 [Scroll View, 아래에서 위로 올라가는 목록](https://blog.naver.com/cdw0424/222007263664)**

---

Content 오브젝트, Pivot Y 값을 기존 1에서 0으로 변경  

<br>
<!-- ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ---- -->

## **💫 [Layout 새로고침](https://forum.unity.com/threads/force-immediate-layout-update.372630/)**

---

LayoutRebuilder.ForceRebuildLayoutImmediate(RectTransform)  

<br>
<!-- ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ---- -->

## **💫 [Animator Disable 돼도 상태 유지](https://docs.unity3d.com/ScriptReference/Animator-keepAnimatorControllerStateOnDisable.html)**

---

Animator.keepAnimatorContrillerStateOnDisable = true;  
직관적인 이름  
애니메이터 기능이기에, 비단 UI 뿐만 아니라 일반 작업시에도 사용 가능  

<br>
<!-- ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ---- -->

## **💫 [시네머신 에딧 모드에서 바로바로 업데이트가 안됨](https://discussions.unity.com/t/cinemachine-doesnt-continually-update-in-edit-mode/249321)**

---

Cinemachine Brain 에서 Update Method 가 Fixed Update 면 바로바로 안바뀜  

<br>
<!-- ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ---- -->

## **💫 오클루더 Occluder, 오클루디 Occludee**

---

오클루더 Occluder : 오클루디를 가리는 오브젝트  
오클루디 Occludee : 오클루더에 의해 가려지는 오브젝트  

<br>
<!-- ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ---- -->

## **💫 라이트 베이크**

---

베이커리 베이크 시 흰색 검은색 빨간색 초록색 파란색 얼룩  

Auto-Atlasing . Texels per unit 40 ~ 80  
글로벌 일루미네이션 . samples  
보통 UV 오버랩 문제 > Texels per unit 값 올려주거나, UV 맵 자체 간격  
Force Power-Of-Two Atlas 체크 > 검은 공간 많은 텍스쳐를 크기 줄여줌, 해 가려지는 오브젝트  

<br>
<!-- ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ---- -->

## **💫 Mesh Collider 끼리 충돌 안됨**

---

Convex 체크  

<br>
<!-- ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ---- -->

## **💫 디버깅**

---

- `Debug.Break()`
- Ctrl + Alt + P : 1 프레임 진행
- Ctrl + Shift + P : 일시정지/재생

<br>
<!-- ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ----  ---- ---- ---- ---- -->
