---
title: "🌑 Ant Algorithms - 개미 알고리듬"
date: 2023-10-25. 10:01
last_modified_at: 2023-10-25. 10:01
categories: ⭐Computer 🌑Computer-General
---

7, 8차시  

### 💫 Ant Algorithms - 개미 알고리듬

---

Ant Algorithm 개미 알고리듬  
개미와 Stigmergy 개미들의 소통방법(냄새/페로몬을 이용한)  

Nest, Food, Obstacle  

개미는 Network을 따라 이동, 냄새가 강한 쪽으로 이동  
컴퓨터 개미는 냄새를 식으로 맡음  
(강의 자료에 있는 식은 오류가 많음)  

타겟 경우의 값 / 현재 위치에서 갈 수 있는 모든 경우의 수 값 합  

타워 t(r, u)  
r, u 사이 페로몬 양  

이타 n(r, u)  
r, u 사이 거리  

만약 페로몬 양이 똑같다면, 거리가 더 짧은 쪽으로  
(때문에 거리는 역수 모양)  

초매개변수, 없어도 되는  

alpha, beta  
alpha, 페로몬 지수  
beta, 거리 지수  
어떤 걸 더 중심적으로 생각하느냐에 따라  

최적의 길을 찾아내는  
변화에도 금방 적응하는  

TSP Traveling Salesman Problem  
= 해밀턴 패턴, 모든 정점을 중복없이 한 번씩만 방문  
