---
title: React Native 리액트 네이티브 - 이것저것 메모
date: "2023-10-31T15:18:00+09:00"
last_modified_at: "2023-12-05T14:57:00+09:00"
categories: [컴퓨터, 프로그래밍]
tags: [Mobile, React-Native]
image: /assets/img/background/kururu-lab.jpg
---

2023-12-05. 14:57: 글 계승.  
`Mobile Programming Test`  

## 중첩된 ScrollView 방향의 제약

---

@ TODO: 212p  

## Javascript, Typescript

---

함수 구현 코드 `Func(): A` 에서 `: A`는 함수가 A를 반환한다는 의미.  

Pick 타입  
→ 제네릭 타입, 대상 타입의 전체 속성 중 필요한 속성만 선택하여 반환  

```js
type NewType = Pick<SomeType, 'SomePropertyA' | 'SomePropertyB'>
```

객체가 제공하는 속성을 알기위해서, console.log(Objects.keys(개체)) 코드를 이용할 수 있다.  

## Fetch

---

GET/POST/PUT/DELETE를 쉽게 사용할 수 있도록, Javascript 엔진에서 기본 제공하는 API이다.  

blob, json, text 같은 메서드가 있는 Response 타입 객체를 Promise 방식으로 얻을 수 있게 해준다.  

Promise 객체는 then 메서드를 통해 실제 데이터를 얻어야 한다.  
then 메서드는 또 다른 Promise 객체나 어떤 값을 반환할 수 있다.  

then을 연달아 호출하여 사용할 수 있는데, 이를 then-체인이라 한다.  

```js
// 정의
function fetch(input: RequestInfo, init?:RequestInit): Promise<Response>
interface Response
{
    blob(): Promise<Blob>;
    json(): Promise<any>;
    text(): Promise<string>;
}

// 사용
fetch('RequestInfo Like URL')

fetch('RequestInfo Like URL')
    .then((res) => res.json())
    .then((blabla) => someMethod(blabla))
    .catch((error: Error) => console.log(error.message))
```

## 키워드

---

ActivityIndicator 코어 컴포넌트  
→ 회전하는 아이콘, react-native 패키지  

```js
export default function Timer()
{
    const [loading, setLoading] = useState(false)
    return ( { loading && (<ActivityIndicator>) } )
}
```

## JSX에서 if문을 처리하는 방법

---

@ U 중간고사 출제:  

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
        { /* A && B: undefined */ }
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

## 함수컴포넌트 속성 정의 및 전달 방법

---

@ U 중간고사 출제:  

```js
{ /* XML(Markup Language): Attribute, TS(Programming Language): Property */ }
<Person name = "Jack" age = {22}/>

{ /* 안쪽 중괄호: 객체 생성, 바깥쪽 중괄호: JSX 구문 */ }
<Person person ={{name: 'Jack', age: 32}}/>

{ /* @ */ }
{ /* 가상 DOM 객체 = createElement(컴포넌트 이름 or 문자열, `속성 객체`, 자식 컴포넌트) */ }

{ /* or */ }

{ /* ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- */ }

export type IPerson
{
    id: string
    createdDate: Date
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
{ /* import type: TS→JS 컴파일 때만 필요한 '타입', 반면 클래스는 남음 */ }
{ /* FC: Function Component */ }
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

## 잔여연산자

---

@ U 중간고사 출제:  

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

## 얕은 복사 & 깊은 복사

---

@ U 기말고사 출제: TODO, 전개 연산자  

## React.Fragment 컴포넌트

---

@ U 중간고사 출제:  

```js
import React, {Fragment} from 'react'

{ /* JSX = XML, 다음같이 부모 컴포넌트 없이는 여러 컴포넌트가 올 수 없음 */ }
<SafeAreaView />
<View />

{ /* Fragment: 실체가 있는 건 아니지만, XML 문법이 요구하는 부모 컴포넌트 역할로 동작하도록 */ }
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

## 타입스크립트의 교집합 타입 구문

---

@ U 중간고사 출제:  

TS, Algebraic Data Type - ADT - 대수 데이터 타입 지원  

합집합 타입  
→ type A_OR_B = A | B  

교집합 타입  
→ type A_AND_B = A & B  

## useStyle 커스텀 훅 만들기

---

@ U 기말고사 출제: TODO, useStyle 커스텀 훅 만들기 (6장), 400p
