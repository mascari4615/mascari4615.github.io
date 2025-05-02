---
title: "Cg"
# description: ""
categories: [컴퓨터, 그래픽]
tags: []
image: "/assets/img/background/kururu-lab.jpg"
hidden: true

date: 2024-11-13. 06:42
last_modified_at: 2024-11-13. 06:42 # Init
---

## 머리말

---

쉐이더 프로그래밍 언어.  
C for Graphics.  

## 종류

---

프로그래밍 언어처럼 하나만 잘 배워두면 나머지는 쉽게 터득할 수 있다.  

### Cg

CG (C for Graphics) 엔비디아가 마이크로소프트와 협력하여 만든 언어.

### HLSL

HLSL (High Level Shading Language) 가장 유명하고 보편적으로 넓게 쓰임.  

### GLSL

GLSL (OpenGL Shading Language) OpenGL에서 사용하는 언어.  

## Unity

---

Unity는 CG 언어를 사용, URP부터는 HLSL 사용. (언리얼도 HLSL).  
Unity는 추가적으로 ShaderLab 언어를 제작하고 이를 지원.  

### Shader Lab

(고정 파이프라인 쉐이더 : fixed function shader)

- 매우 가볍고, 하드웨어 호환성이 좋지만, 기능이 상당히 부족 > 고급효과 X
- 자체 문법 > 다른 쉐이더 문법과 거의 호환 X + 거의 지원 중단
- ㄴ ☆ 다양한 환경에 맞는 쉐이더로 자동으로 분기되어 만들어줌
- ㄴ 모바일, PC, 기타 콘솔 기기, 라이트 맵 유무, 조명이 픽셀 라이팅일 때, 버텍스 라이팅일 때 등 모든 경우의 수마다 다른 쉐이더를 만들어야 하지만, 서피스 쉐이더는 이런 경우의 수를 자동으로 제작
- ㄴ 때문에 편리 > 불필요한 쉐이더 양은 늘어남 > 최적화 X

호환성은 가장 높지만, 그만큼 할 수 있는 게 제한적

### Surface Shader

Shader Lab 스크립트 + Cg 쉐이더 코드.  

(서피스 쉐이더)

- ShaderLab 스크립트와 함께 일부분은 CG 쉐이더 코드를 사용
- 기본적인 조명 코드와 버텍스 쉐이더의 복잡한 부분은 스크립트를 이용하여 자동으로 처리
- 픽셀 쉐이더 부분만 간편하게 작성할 수도 있음 > 편함
- 비주얼 쉐이더 에디터와도 상당히 비슷한 개념 > 쉽게 공부하고 응용하기에도 좋음
- 단, 최적화에는 다소 무리, 일정 수준 이상의 고급 기법 X

가장 쉽고 멀티 플랫폼에서 잘 대응되는 셰이더, 프로그래머가 아니더라도 배우기 쉬운 개념, 아티스트 레벨에서 배우는

- 이걸 배워두면 Vertax & Fragment Shader 도 이해할 수 있고, 랜더 몽키로도 갈 수 있고, 노드로도 갈 수 있다

스탠다스 서피스 쉐이더는 유니티 5부터 기본으로 적용된 쉐이더 형태  
하지만 물리 기반 쉐이더 라이트이기 때문에 모바일과 같은 저사양 기기에서 구동하기에는 다소 무거운 것이 사실

### Vertax & Fragment Shader

- ShaderLab 스크립트와 함께 CG 쉐이더 코드를 사용, 좀 더 본격적인 쉐이더 작성 방법
- 자동적으로 처리되는 부분이 별로 없어서 제대로 된 CG 쉐이더 방식으로 버텍스의 좌표변환부터 제대로 처리해야 작동
- 배우기는 조금 어렵지만, 완전히 수동으로 제어 가능 > 최적화 + 고급 기법 O

Surface Shader의 상위 버전, CG를 더 디테일하게 다룸, Surface Shader가 오토 모드라면. Vertax & Fragment Shader는 수동이라는 느낌.  

## 메모

---

### Link
