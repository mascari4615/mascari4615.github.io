---
title: "C# Stopwatch"
description: "타이무 스토푸"
categories: [💫Computer, 🌒Programming]
tags: [Computer, Programming, C#]
image: "/assets/img/background/kururu-lab.jpg"

date: 2025-02-06. 18:24 # Init
last_modified_at: 2025-04-16. 22:04 # StartNew, Restart
---

## 💫 머리말

---

타이무 스토푸  

## 💫 구현

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
