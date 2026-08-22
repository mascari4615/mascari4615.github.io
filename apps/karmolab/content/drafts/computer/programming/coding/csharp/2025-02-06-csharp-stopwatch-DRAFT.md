---
title: "C# Stopwatch"
description: 타이무 스토푸
date: "2025-02-06T18:24:00+09:00"
last_modified_at: "2025-04-16T22:04:00+09:00"
categories: [컴퓨터, 프로그래밍]
tags: [CSharp]
image: /assets/img/background/kururu-lab.jpg
hidden: true
---

## 머리말

---

타이무 스토푸  

## 구현

---

```cs
System.Diagnostics.Stopwatch stopwatch = new();
stopwatch.Start();
// or `StopWatch.StartNew();`

// ...

stopwatch.Stop();
Debug.Log($"걸린 시간: {stopwatch.ElapsedMilliseconds}ms");

stopwatch.Restart()
```
