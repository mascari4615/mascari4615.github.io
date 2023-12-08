---
title: "🌑 Subset Sum Problem"
date: 2023-12-07. 11:38
# last_modified_at: 2023-12-07. 11:38
categories: ⭐Computer 🌑Computer-General
tags: Subset-Sum-Problem Sum-Of-Subsets-Problem Algorithm
---

## 💫 Subset Sum Problem

---

부분집합의 합 문제  
Sum of Subsets Problem  

유한개의 정수를 원소로 하는 집합이 있을 때 원소의 합이 0이 되는 부분집합이 존재하는지 알아내는 문제(단 공집합은 제외)  
i.e. 집합{-4, -2, 1, 3}의 경우 부분집합 {-4, 1, 3}의 원소 합이 0  
원소 합에 관한 조건을 임의의 정수로 일반화 가능  

물건의 단위 무게당 이익이 동일한 0-1 배낭 문제  
최대 이익은 배낭 용량 M을 꽉 채울 경우: 원소를 양수로 한정하는 부분집합의 합 문제와 동일  

@ 자료 Subset0000  
@ 주의 : w<sub>i</sub> < w<sub>i+1</sub>  

각 물건의 이익에 대한 정보는 더 이상 필요 없음  
주의 : 물건을 무게에 따라 오름차순으로 정렬  

@ 무게 M이 꼭 0이 아니여도 됨  

## 💫 Solve By BackTracking

---

### 🫧 상태 공간 트리

N-Queen, K-Graph Coloring과 다르게, 노드에 위치 정보가 저장되는 것이 아니고, 각 노드 기준 무게가 저장됨  

### 🫧 알고리듬

### 🫧 구현

### 🫧 분석

### 🫧 응용
