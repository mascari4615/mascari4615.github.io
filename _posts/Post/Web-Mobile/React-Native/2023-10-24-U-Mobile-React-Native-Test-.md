---
title: "🌘 Mobile Programming Test"
date: 2023-10-24. 06:23
last_modified_at: 2023-11-22. 14:57
categories: ⭐Computer 🌘Web-Mobile
tags: Mobile React-Native
---

### 2장 - 물리DOM과 가상DOM

---

- DOM Document Object Model
  - HTML Tag를 개체로서 보고,
  - 요소 라벨링, 요소 간의 관계를 트리로

왜 Why, 단순 텍스트는 특정 요소를 검색하기 어려움  
→ DOM으로 만들면 JS/TS로 특정 요소를 쉽게 접근/변경할 수 있음  

물리 DOM : Web Browser에서 JS 코드가 생성하는 실제 DOM 구조  
가상 DOM : 리액트 코드가 생성한 JS 객체 구조  

특정 시점, 리앹그는 가상 DOM 구조를 물리 DOM 구조를 만듦 → 리액터가 렌더링한다 By 렌더러 (패키지)  

### 2장 - JSX에서 if문을 처리하는 방법

---

```js
export default function App()
{
	const isLoading = true
	if (isLoading)
	{
		return
		{
			<SafeAreaView>
				<Text>Loading...</Text>
			</SafeAreaView>
		}
	}

	return
	{
		<SafeAreaView>
			<Text>Hello JSX World !</Text>
		</SafeAreaView>
	}
}
```

```js
{ /* 단축평가 Short Circuit Evaluation */ }
export default function App()
{
	const isLoading = true
	<SafeAreaView>
		{ /* A && B : undefined */ }
		{ /* JSX Parser, undefined or null 무시 */ }
		{isLoading && <Text>Loading...</Text>}
		{!isLoading && <Text>Hello JSX World !</Text>}
	</SafeAreaView>
}
```

```js
{ /* 단축평가 Short Circuit Evaluation */ }
export default function App()
{
	const isLoading = true
	const children = isLoading ?
		(<Text>Hello JSX World !</Text>) :
		(<Text>Loading...</Text>)
	return <SafeAreaView>{children}</SafeAreaView>
}
```

### 2장 - 함수컴포넌트 속성 정의 및 전달 방법

---

```js
{ /* XML(Markup Language) : Attribute, TS(Programming Language) : Property */ }
<Person name = "Jack" age = {22}/>

{ /* 안쪽 중괄호 : 객체 생성, 바깥쪽 중괄호 : JSX 구문 */ }
<Person person ={% raw %}{{name: 'Jack', age: 32}}{% endraw %}/>

{ /* @ */ }
{ /* 가상 DOM 객체 = createElement(컴포넌트 이름 or 문자열, `속성 객체`, 자식 컴포넌트) */ }

{ /* or */ }

{ /* ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- */ }

export type IPerson
{
	id: string
	createdDate : Date
	counts:
	{
		comment: number
		retweet: number
	}
}

export const createRandomPerson = (): IPerson =>
{
	return
	{
		id: ~,
		...
	}
}

{ /* ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- */ }

import React from 'react'
{ /* import type : TS→JS 컴파일 때만 필요한 '타입', 반면 클래스는 남음 */ }
{ /* FC : Function Component */ }
import type {FC} from 'react'
import * as D from './~'

export type PersonProps =
{
	person: D.IPerson
}

const Person: FC<PersonProps> = ({person}) =>
{
	{ /* 객체 그대로 출력할 수 없어서, 공백 2개 붙은 문자열로, Like .ToString */ }
	return <Text>{JSON.stringify(person, null, 2)}</Text>
}

export default Person

{ /* ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- */ }

import Person from './~'
import * as D from './~'

const person = D.createRandomPerson()

export default function App()
{
	return <ArrowComponent person = {person} />
}

```

### 3장 - React.Fragment 컴포넌트

---

```js
import React, {Fragment} from 'react'

{ /* JSX = XML, 다음같이 부모 컴포넌트 없이는 여러 컴포넌트가 올 수 없음 */ }
<SafeAreaView />
<View />

{ /* Fragment : 실체가 있는 건 아니지만, XML 문법이 요구하는 부모 컴포넌트 역할로 동작하도록 */ }
<Fragment>
	<SafeAreaView />
	<View />
</Fragment>

{ /* 단축 구문 */ }
<>
	<SafeAreaView />
	<View />
</>
```

### 3장 - 타입스크립트의 교집합 타입 구문

---

TS, Algebraic Data Type - ADT - 대수 데이터 타입 지원  

합집합 타입  
→ type A_OR_B = A | B  

교집합 타입  
→ type A_AND_B = A & B  

### 3장 - 잔여연산자

---

ESNext JS와 TS, Rest Operator - 잔여 연산자 지원  

```js
let address: any
{
	country: 'Korea',
	city: 'Seoul',
	address1: 'Gangnam-gu',
	address2: '~',
	address3: '~'
}
const {country, city, ...detail} = address

{ /* detail = { address1, address2, address3 } */ }

```

### 4장 - 상태의 개념과 리액트 훅 개념

---

React 프레임워크,  
컴포넌트 기법으로 가상 DOM 객체를 만들고 나서  
가상 DOM 객체에 어떤 변화가 감지되면  
해당 변화만 화면에 재렌더링하여 전체 렌더링 속도를 빠르게  

Old  
객체 지향 언어의 상속 개념에 맞춘, 클래스 형태로 제작되었음  
→ 클래스 컴포넌트 기술 ← 코드 작성 복잡  
→ 60/1s 빠른 재렌더링 시 정상적인 렌더링이 안되는 버그  

New  
구현 복잡함을 덜어내고자 컴포넌트를 함수 형태로 만들 수 있도록  
함수 컴포넌트가 어떤 값을 Persistence - 유지 할 수 있도록, New 데이터 Cache 시스템  
Cache 시스템 쉽게 사용할 수 있도록 use~ 로 시작하는 여러 `API` 제공  
→ React Hooks - `리액트 훅`  

I.E.  
컴포넌트 데이터 관리 - useMemo, useCallback, useState, useReducer  
컴포넌트 생명주기 대응 - useEffect, useLayoutEffect  
컴포넌트 간의 정보 공유 - useContext  
컴포넌트 메소드 호출 - useRef, useImperativeHandle  

상태 : 시간이 지나도 값이 유지되며, 필요에 따라서는 값을 바꿀 수 있는 어떤 것  
클래스의 멤버 속성이나 전역 변수 형태로 만들게 되며, 보통 함수 몸통의 지역 변수 형태로는 상태를 만들지 못함  

useState 훅  
함수 컴포넌트 내부에 클래스의 멤버 속성처럼 값을 유지하고 변경할 수 있는 상태를 만들 수 있게 한다  

```js
import React, {useState} from 'react'

const [값, 값을 변경하는 함수] = useState(초깃값)
{ /* 값을 변경하는 함수 (Setter)를 호출하면 값 부분을 변경하고, 컴포넌트를 재렌더링 */}
{ /* 재렌더링 때문에 useState 훅은 값과 Setter 함수를 Tuple 형태의 배열로 반환 */}

```

### 4장 - useEffect 리액트 훅

---

컴포넌트 마운트, 의존성 목록 조건, 컴포넌트 언마운트  
시 처리 할 작업  

```js
{ /* React Hook, React가 제공 */}
import React, {useEffect} from 'react'

{ /* 의존성 목록에 있는 조건 중 어느 하나라도 충족되면 그때마다 콜백 함수 실행 */}
useEffect(콜백함수, 의존성목록)
콜백함수 = () => {}

{ /* 컴포넌트 생성할 때 한 번만 실행하려면 의존성 목록에 빈 배열 [] */}
useEffect(() => {}, [])

{ /* 함수 반환 가능 */}
useEffect(() => { /* some */ return () => {} }, [])

{ /* setInterval 한 번만 실행되어야 하는데, 재렌더링마다 실행되기에 */}
{ /* useEffect(() => {}, [])를 통해 처음 만들어질 때만 한 번 실행되도록 */}

{ /* 콜백 함수도 함수 반환 가능, 컴포넌트를 언마운트 할 때 단 한 번 실행 됨*/}
콜백함수 = () => { return 반환 함수 }

```
