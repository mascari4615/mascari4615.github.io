---
title: "🌘 모바일 프로그래밍 과목"
date: 2023-09-06. 13:21
# last_modified_at: 2023-09-06. 13:21
# last_modified_at: 2023-09-12. 15:09
# last_modified_at: 2023-09-13. 13:11
# last_modified_at: 2023-09-20. 13:02
# last_modified_at: 2023-09-27. 12:59
# last_modified_at: 2023-10-10. 12:59
# last_modified_at: 2023-10-11. 14:15
last_modified_at: 2023-10-17. 14:51
categories: ⭐Computer 🌘Web-Mobile
tags: Mobile React-Native
---

React.createElement  

`Hello World!` 출력하기  

in HTML  

```html
<!-- Web Browser가 Rendering -->
<p>Hello World!<p>
```

in JS  

```js
// 1. Physical DOM 객체 생성
const pElement = document.createElement('p')
pElement.innerText = 'Hello JavaScript world!'

// 2. Rendering
document.body.appendChild(pElement)
```

in React  

```js
// 1. Virtual DOM 객체 생성
const pElement = React.createElement('p', null, 'Hello React world!')

// 2. Physical DOM 객체로 변환, Rendering
import ReactDOM from 'react-dom'
ReactDOM.render(pElement, document.body)
```

in ReactNative  

```js

// 2. Native로 Virtual DOM 객체 전달
// ReactNative Renderer는 Native에서 동작하므로
export default function App()
{
	// 1. Virtual DOM 객체 생성
	const textElement = React.createElement(Text, null, 'Hello world!')
	return textElement
}
```

// 3.

react-native-cli  
NativeModule에서 동작하는 JS Engine이 Virtual DOM 객체를 넘겨주는 App의 존재를 알 수 있도록 index.js 파일 생성  

```js
import {AppRegistry} from 'react-native'
import App from './App'
import {name as appName} from './app.json'

AppRegistry.registerComponent(appName, () => App)
```

NativeModule에서 동작하는 JS Engine이 index.js 파일의 존재를 알 수 있도록 MainApplication.java 파일 생성

```java
// ...
@Override
protected String getJSMainModuleName()
{
	return "index"
};
// ...
```

ReactNative App이 Modile 기기에서 실행되면  

1. MainApplication.java 실행 -> index.js 파일 존재 확인
2. App 존재 확인
3. App을 호출하여 Virtual DOM 객체 Get
4. Bridge를 통해 'Hello World' 출력

iOS도 언어와 코드 구조만 다를 뿐 Android와 같은 방식으로 동작  

@ TODO 56p  

JS.map = C#.ForEach  

React (Native) Component 기본 속성  
key, children, ref  

Each child in a list should have a unique "key"  
-> key = (React 에서) Component 렌더링 속도 최적화를 위해 필요한 속성  

UUID Universally Unique Identifier 범용 고유 식별자  
-> 네트워크 카드의 MAC, 호출 시각 등으로 조합 = 중복 X  

@ 기말고사 -\> useMemo  
@ 기말고사 -\> 216p 리액트훅의 구현 원리  

@ TS 함수 괄호 없이 부를 수 있는건가?  

@ High-Order Function - 고차함수 : 다른 함수를 인자로 받거나, 반환하는 함수  
