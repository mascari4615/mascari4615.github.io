---
title: "C# Stopwatch"
# description: ""
categories: [💫Computer, 🌒Programming]
tags: [Computer, Programming, C#]
image: "/assets/img/background/kururu-lab.jpg"

date: 2025-02-06. 18:24 # Init
# last_modified_at: 2025-02-06. 18:24 # Init
---

## 💫 머리말

---

타이무 스또뿌  

## 💫 구현

---

```cs
System.Diagnostics.Stopwatch stopwatch = new();
stopwatch.Start();

// ...

stopwatch.Stop();
Debug.Log($"InitDic 시간: {stopwatch.ElapsedMilliseconds}ms");
```
