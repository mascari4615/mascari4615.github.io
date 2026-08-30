---
title: "C++ 매크로 #, ## 연산자"
date: "2023-01-10T23:01:00+09:00"
categories: [컴퓨터, 프로그래밍]
tags: []
image: /assets/img/background/kururu-lab.jpg
board: info
---

## # 연산자

---

```cpp
#define DEFINE_STRING(token) string #token;

// Define String Variable Temp
DEFINE_STRING(Temp);

#define PRINT_TOKEN(token) printf(#token " is %d", token)

// Print "intVariable is 4444"
int intVariable = 4444;
PRINT_TOKEN(intVariable);
```

매개변수를 문자열로  

## ## 연산자

---

```cpp
#define DEFINE_INT_X(token) int x##token = token;

// Define Int Variable x1
DEFINE_INT_X(3);

#define CALL_FUNC(token) SomeObj->SomeFunc##token()

// Call SomeObj->SomeFuncA()
CALL_FUNC(A);

// Call SomeObj->SomeFuncTemp()
CALL_FUNC(TEMP);
```

매개변수를 문자열로 만들고 다른 토큰과 합침
