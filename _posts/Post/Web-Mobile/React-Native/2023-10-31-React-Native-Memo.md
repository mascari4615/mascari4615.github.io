---
title: "🌘 React Native 리액트 네이티브 - 이것저것 메모"
date: 2023-10-31. 15:18
# last_modified_at: 2023-11-14. 15:54
last_modified_at: 2023-11-22. 14:57
categories: ⭐Computer 🌘Web-Mobile
tags: Mobile React-Native
---

## 💫 중첩된 ScrollView 방향의 제약

---

@ TODO : 212p  

## 💫 Javascript, Typescript

---

함수 구현 코드 `Func(): A` 에서 `: A`는 함수가 A를 반환한다는 의미.  

Pick 타입  
→ 제네릭 타입, 대상 타입의 전체 속성 중 필요한 속성만 선택하여 반환  

```js
type NewType = Pick<SomeType, 'SomePropertyA' | 'SomePropertyB'>
```

객체가 제공하는 속성을 알기위해서, console.log(Objects.keys(개체)) 코드를 이용할 수 있다.  

## 💫 Fetch

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

## 💫 키워드

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
