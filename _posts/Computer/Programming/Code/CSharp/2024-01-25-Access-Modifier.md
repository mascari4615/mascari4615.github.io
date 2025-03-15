---
title: "C# Access Modifier"
# description: ""
categories: [💫Computer, 🌒Programming]
tags: [Computer, Programming, C#, AccessModifier]
image: "/assets/img/background/kururu-lab.jpg"

date: 2024-01-25. 05:22
last_modified_at: 2024-09-26. 20:50
---

접근제한자, 접근한정자  
`public`, `protected`, `private`, `internal`, `protected internal`, `private protected` (C# 7.2)  

## 💫 internal

---

동일한 `Assembly` 내에서 `Public`  
다른 `Assembly` 에서 `Private`  

`Helper Class` 만들 때  

@ `.NET`에서 하나의 실행파일 영역을 `Assembly`로 부름.  
@ 단순히 말하면, 하나의 프로젝트나 `.DLL`, `.EXE` 파일을 `Assembly` 라고 부를 수 있음  
