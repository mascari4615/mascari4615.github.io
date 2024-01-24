---
title: "🌔 C# Thread/Task"
date: 2024-01-25. 05:42
# last_modified_at: 2024-01-25. 05:42
categories: ⭐Computer 🌔Unity-CSharp
tags: CSharp Thread Task Lock
---

### 💫 [lock](https://learn.microsoft.com/ko-kr/dotnet/csharp/language-reference/statements/lock)

---

```cs
private readonly object thisLock = new object();
lock (thisLock)
{
	// Bla Bla
}
```

임계 영역 (`Critical Section`)을 만들어주는 키워드  
`Thread`는 `lock`을 얻어야 `Critical Secion`을 생성할 수 있다.  

외부 코드에서도 접근할 수 있는 `this`, `Type` 형식 (`typeof`, `GetType()`), `string` 형식은 매개변수로 절대 사용하지 말 것.  

@ Key, 전용 개체 인스턴스  
@ `Critical Section`, 한 번에 한 스레드만 접근할 수 있는 코드 영역  
