---
title: "Stack 스택"
# description: ""
categories: [💫Computer, 🌓PS-Algorithm]
tags: [Data-Stucture, Stack]
image: "/assets/img/background/kururu-lab.jpg"

date: 2024-02-19. 16:33
# last_modified_at: 2024-02-19. 17:59
# last_modified_at: 2024-02-19. 20:03
# last_modified_at: 2024-02-21. 20:50
last_modified_at: 2024-08-29. 22:05
---

## 💫 정의

---

한 쪽 끝에서만 원소를 넣거나(PUSH) 뺄 수 있는(POP) 자료구조  
Like 프링글스 통, 엘리베이터, 서류더미  

`LIFO`  
Last in First out  

`Restricted Structure`  
특정 위치에서만 원소를 넣거나 뺄 수 있는 제한된 자료구조 (스택, 큐, 덱)  

## 💫 성질

---

- 원소의 추가 : O(1)
- 원소 제거 : O(1)
- 제일 상단의 원소 확인 : O(1)
- 제일 상단이 아닌 나머지 원소들의 확인/변경이 **원칙적으로** 불가능

## 💫 구현 및 사용

---

### 🫧 배열을 이용한 구현

```cpp
const int MAX = 100005;
int dat[MAX];
int pos = 0; // 다음 원소가 추가될 곳, size : 원소의 수

void push(int x)
{
	dat[pos++] = x;
}

// 굳이 dat[pos]를 변경할 필요가 없음
// 다시 접근할 일도 없고, 나중에 새 값으로 덮어씌워짐
void pop()
{
	pos--;
}

int top()
{
	return dat[pos - 1];
}
```

### 🫧 연결리스트를 이용한 구현

@ TODO  

### 🫧 C++ STL stack

```cpp
// Declaration & Definition & Init
#include <stack>

stack<int> s;
```

```cpp
// Use
s.push(10);
s.pop();
s.size();
s.empty();
s.top();
```

## 💫 메모

---

- 스택을 이용한 문제
  - 수식의 괄호 쌍
  - 전위/중위/후위 표기법 (코테 잘 안나옴)
  - DFS
  - Flood Fill

- Call`Stack` 호출`스택`
- `Stack`overflow
