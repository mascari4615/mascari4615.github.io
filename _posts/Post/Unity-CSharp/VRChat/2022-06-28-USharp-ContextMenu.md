---
title: "🌔 VRChat 월드 에디터 테스트 시, ContextMenu Attribute"
date: 2022-06-28. 02:41
categories: ⭐Computer 🌔Unity-CSharp
tags: Unity VRChat USharp
---

## 💎

---

VRC World 맵 제작 시, 유니티에서 테스트를 진행할 때에는

ContextMenu Attribute를 사용하면 안될 것 같다

ContextMenu Attribute 사용 시, 오브젝트를 껐다키는 등의 단순 명령들은 잘 실행되지만, 변수 값을 변경하는 등의 명령은 제대로 실행되지 않는다.

예를 들어, 변수 temp 와 temp를 Debug Log로 찍고있는 Update, temp 값을 1씩 더하는 함수 Add 가 있을 때

런 타임에서 SendCustomEvent 등으로 Add를 호출하면 Update 에서는 변경된 값이 로그로 찍혀나오지만,

ContextMenu로 Add 를 호출하면 Update에서 값이 변하지 않은 초기값 그대로가 찍혀나온다.

Add 함수 내에서 로그를 찍어보면, ContextMenu로 호출했을 때 값이 변하는 것을 확인할 수 있지만 Update 에서는 여전히 기본값을 찍어낸다.

U# 스크립트가 Udon Behavior 에 감싸져 있어서 그런 지, 아니면 내가 아직 ContextMenu Attribute를 제대로 이해하지 못한 상태라 그런 건지, 원인은 제대로 모르겠다
