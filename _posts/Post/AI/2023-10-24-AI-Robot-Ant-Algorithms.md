---
title: "🌗 Ant Algorithms - 개미 알고리듬"
date: 2023-10-25. 10:01
last_modified_at: 2023-10-25. 10:01
categories: ⭐Computer 🌗AI
tags: AI Ant-Algorithms
---

7, 8차시  

### 💫 Ant Algorithms - 개미 알고리듬

---

Ant Algorithm - 개미 알고리듬  
개미와 `Stigmergy` 개미들의 소통방법(냄새/페로몬을 이용한)  

{% include embed/youtube.html id='81GQNPJip2Y' %}

{% include embed/youtube.html id='emRXBr5JvoY' %}

{% include embed/youtube.html id='V1GeNm2D2DU' %}

-> 개미는 가는 길마다 페로몬을 뿌림 (Like 헨젤과 그레텔)  
-> 개미는 페로몬이 많은 쪽을 따라감  
-> 정답인지는 모르지만 최적 경로에 가까울수록 (짧을 수록) 더 많이 왔다갔다 할 수 있음  
-> 최종적으로 가장 많은 개미들이 다니는 경로 = 최적 경로  

Nest, Food, Obstacle  

개미는 Network을 따라 이동, 냄새가 강한 쪽으로 이동  
컴퓨터 개미는 냄새를 식으로 맡음  
(강의 자료에 있는 식은 오류가 많음)  

최적의 길을 찾아내는  
변화에도 금방 적응하는  

Traveling Salesman Problem - TSP  
= 해밀턴 패턴, 모든 정점을 중복없이 한 번씩만 방문  

[개미 군집 최적화 ACO - 참고](https://www.mql5.com/ko/articles/11602)  

### 💫 식

---

ρ - 초매개변수, (일단) 무시해도 되는  

α - 페로몬 지수, β - 거리 지수  
-> 어떤 걸 더 중심적으로 생각하느냐에 따라 조정  

타겟 경우의 값 / 현재 위치에서 갈 수 있는 모든 경우의 수 값 합  

τ(r, u) - r, u 사이 페로몬 양  
η(r, u) - r, u 사이 거리  

만약 페로몬 양이 똑같다면, 거리가 더 짧은 쪽으로  
(때문에 거리는 역수 모양)  
