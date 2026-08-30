---
title: "드모르간 법칙, De Morgan's Law"
date: "2023-01-09T22:02:00+09:00"
categories: [컴퓨터, 프로그래밍, Convention]
tags: []
image: /assets/img/background/kururu-lab.jpg
board: info
---

## 드모르간 법칙, De Morgan's Law

---

> not (A or B) = (not A) and (not B)  
> not (A and B) = (not A) or (not B)  

## 이를 이용해, 읽기 좋은 코드 만들기

---

```cs
// 1
if (!(file_exists && !is_protected))

// 2 (With De Morgan's Law)
if (!file_exists || is_protected)
```

2번 조건문이 더 읽기 쉽다 !
