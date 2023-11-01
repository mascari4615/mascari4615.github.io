---
title: "🌘 React Native 리액트 네이티브 - Hook"
date: 2023-10-31. 15:31
last_modified_at: 2023-10-31. 15:31
categories: ⭐Computer 🌘Web-Mobile
tags: Mobile React-Native
---

### 💫 React Hooks

---

React 프레임워크,  

컴포넌트 기법으로 가상 DOM 객체를 만들고 나서  
가상 DOM 객체에 어떤 변화가 감지되면  
해당 변화만 화면에 재렌더링하여 전체 렌더링 속도를 빠르게  

Old  
객체 지향 언어의 상속 개념에 맞춘, 클래스 형태로 제작되었음  
-> 클래스 컴포넌트 기술 \<-- 코드 작성 복잡  
-> 60/1s 같은 빠른 재렌더링 시 정상적인 렌더링이 안되는 버그  

New  
구현 복잡함을 덜어내고자 컴포넌트를 함수 형태로 만들 수 있도록  
함수 컴포넌트가 어떤 값을 Persistence - 유지 할 수 있도록, New 데이터 Cache 시스템  
Cache 시스템 쉽게 사용할 수 있도록 use~ 로 시작하는 여러 `API` 제공  
-> React Hooks - `리액트 훅`  

즉, 함수 내 로컬변수를 클래스의 전역변수처럼 사용하기 위해  

로컬변수가 실제 데이터를 가지지 않고,  
실제 데이터는 어디인가 캐시하고서  
로컬변수는 필요할 때 캐시한 데이터를 찾을 수 있는 일종의 키를 저장하는 방법을 고안 -\> Reference  

@ 포인터, 참조타입 유사한 개념인듯?  

원래 사용자가 직접 구현해 사용했지만,  
리액트에서 제공한 useMemo 훅을 통해 사용  

↓ 아래는 기존 구현 방법

```TypeScript
const cache: Record<string, any> = {}

export const createOrUse = <T>(key: string, callback: () => T) =>
{
	if (!cache[key])
		cache[key] = callback()
	return cache[key]
}

const temp = createOrUse('Temp', () => createTemp)

/*
	Record<Key, Type>
	TypeScript에서 제공하는 객체 타입
	Type은 아무 타입이나 올 수 있음

	있으면 꺼내서 반환  
	없으면 callback으로 초기화 후 반환  
*/
```

### 💫 의존성 - Dependency

---

캐시를 갱신해야하는 특정 조건/상황들  

`의존성 목록` 중 하나라도 충족되면,  
자동으로 캐시 갱신 (콜백) -\> 재렌더링  

### 💫 useMemo

---

```JSX
const 캐시데이터 = useMemo(초기데이터, [의존성1, 의존성2, ...])
```

값(, 함수)을 [메모이제이션](https://mascari4615.github.io/posts/Algorithm-Memoization/)  
-\> 함수 : () => 콜백  

useCallback이 있는데, useMemo로 함수를 메모이제이션 하는 경우?  
-\> useMemo를 쓰면 함수와 그 `결과 값`을 함께 메모이제이션  

### 💫 useCallback

---

```JSX
const 캐시콜백 = useCallback(초기콜백, [의존성1, 의존성2, ...])
```

함수를 [메모이제이션](https://mascari4615.github.io/posts/Algorithm-Memoization/)  

### 💫 useState

---

```JSX
const [값, Setter] = useState(초깃값)

{ /* 타입 정의 */ }
function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>]
```

지역변수를 전역변수처럼,  
상태를 저장하는 용도  

Setter 호출 시 값 변경 이후 재렌더링  
때문에 값과 Setter를 Tuple 형태의 배열로 반환  

@ 배열에 적용하는 비구조화 할당 구문  
@ 객체에 적용하는 비구조화 할당 구문  
