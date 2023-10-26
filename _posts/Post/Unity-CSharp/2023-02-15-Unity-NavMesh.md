---
title: "🌔 Unity NavMesh"
date: 2023-02-15. 08:57
last_modified_at: 2023-08-26. 10:54
categories: ⭐Computer 🌔Unity-CSharp
tags: Unity NavMesh
---

### 💎 Unity NavMesh

---

{% include embed/youtube.html id = "n-RXnDGE72M" %}

[참고](https://forum.unity.com/threads/solved-problem-with-unity-navmesh-and-multiple-agent-sizes-with-a-workaround-solution.178628/)  

### 💎 Problem, Solve

---

문제 :  

여러 크기의 Agent를 함께 사용하고 싶었는데,  
기본 내장 기능으로는 한 번에 한 Agent Type에 대해서만 NavMesh를 Bake 할 수 있었다.  

때문에 NavMesh를 Bake했던 Agent Type과 다른 Agent Type을 가진 Agent는,  
플랫폼에 제대로 배치했음에도 에러 로그를 뿜어냈다. (Failed to create agent because it is not close enough to the NavMesh)  
플랫폼 어느 곳에도 해당 Agent Type에 대한 NavMesh가 없기 때문이다.  

이에 여러 Agent Type에 대해, NavMesh를 '각각' Bake 하는 방법이 필요했다.  

---

해결 :  

NavMesh Building Components 중 NavMeshSurface 컴포넌트를 이용하면, 여러 Agent Type에 대해 NavMesh를 '각각' 구워낼 수 있다 !  

그런데 NavMesh Building Components는 Unity 2021에 내장된 NavMesh에는 포함되어 있지 않다.  
NavMesh Building Components는 AI Navigation 패키지의 Experimental 버전에서만 지원되고 있다. (23-02-15 기준)  
때문에 이 버전으로 업데이트를 시켜줘야 한다.  

패키지 설치는 [Unity NavMesh Building Components](https://docs.unity3d.com/2021.3/Documentation/Manual/NavMesh-BuildingComponents.html) 문서를 참고했다.  

사용 방법은, 이 글 맨 위에 링크한 [Unite Europe 2017 - Finding the path](https://youtu.be/n-RXnDGE72M?t=180) 강연을 참고했다.  
3분 부터 해당 기능을 소개한다.  
