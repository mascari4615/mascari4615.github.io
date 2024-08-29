---
title: "🌒 Boxing, Unboxing"
date: 2024-04-23. 05:25
# last_modified_at: 2024-04-27. 20:02
last_modified_at: 2024-08-29. 21:56
categories: [⭐Computer, 🌒Programming]
tags: [Boxing, Unboxing]
---

- 먼저
  - 힙과 스택에 대해 알아야 한다.
  - 값과 참조에 대해 알아야 한다.
  - 값 형식은 스택에 저장되며, 참조 형식은 힙에 저장됩니다.
  - 값 형식을 힙에 저장되도록 하려면 박싱이 필요하다.

## 💫 Q

---

- `Object` 타입에 `Value` 타입을 대입하면
  - `Value`를 레퍼런스 타입으로 `Boxing`
  - `Stack`에 있던 `Value`를 `Heap`으로 복사 후 주소값을 할당
- `박싱과 언박싱`에 대해 설명해 주세요.
- 가비지에 대하여

## 💫 Boxing, Unboxing

---

### 🫧 박싱(Boxing)

값 형식의 인스턴스 -> 참조 형식으로 변환.  

```cs
int n = 4615; // 값
object someObject = n; //값 -> 참조
```

Stack에 있던 값 타입의 객체를 Heap으로 이동할 때, 복사가 한번 일어난다.  
Heap에 복사된 이 영역을 참조 타입이 가리키게 되는 일을 수행한다.  

이렇게 박싱 된 값 형식은 메모리 공간을 더 많이 사용하고 성능에 영향을 미칠 수 있으므로 불필요한 박싱은 피해야된다.  

### 🫧 언박싱(Unboxing)

박싱된 값 -> 원래의 값 형식으로 변환.

```cs
int n = (int)someObject; //참조 -> 값
```

Heap에 있던 데이터를 Stack으로 복사.  

C# 2.0부터는 제네릭(Generic)을 사용하여 박싱과 언박싱을 피할 수 있는 방법을 제공하므로 제네릭을 활용하는 것이 좋다.  
