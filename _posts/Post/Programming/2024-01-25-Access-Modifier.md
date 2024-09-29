---
title: "🌒 C# Access Modifier"
date: 2024-01-25. 05:22

last_modified_at: 2024-09-26. 20:50

categories: [⭐Computer, 🌒Programming]
tags: [CSharp, AccessModifier]
---

접근제한자, 접근한정자  
`public`, `protected`, `private`, `internal`, `protected internal`, `private protected` (C# 7.2)  

## 💫 internal

---

동일한 `Assembly` 내에서 `Public`  
다른 `Assembly` 에서 `Priavte`  

`Helper Class` 만들 때  

@ `.NET`에서 하나의 실행파일 영역을 `Assembly`로 부름.  
@ 단순히 말하면, 하나의 프로젝트나 `.DLL`, `.EXE` 파일을 `Assembly` 라고 부를 수 있음  
