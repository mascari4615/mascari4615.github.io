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
tag: Mobile, React-Native
---

React VS ReactNative  

프레임워크 - 렌더러 패키지  
React,- React-DOM (DOM 렌더러)  
ReactNative - React-Native 렌더러 (네이티브 렌더러)

React 패키지 (App 컴포넌트)  
React, ReactNative 프레임워크 둘 다 사용하는  
App.tsx -> Virtual DOM 구조  

React-Native 패키지 (네이티브 렌더러)  
리액트 요소 (Virtual DOM 구조?) -> Android/iOS(UIKit)프레임워크 화면 UI 객체

React, 모든 것이 JS로 동작  
React.render (DOM 렌더러)의 동작을 확인 가능  

반면 ReactNative,  
네이티브 렌더러 모습 확인 불가능  

왜 Why, ReactNative 프로젝트의 Android/iOS 디렉터리에 있는 Java/Objective-C NativeModule에서 렌더링 진행  

@ 뭔소리지  

NativeModule 에서는 JavaScriptCore 라는 이름의 JS 엔진이 동작  
C++로 구현된 이 엔진은 Android-JNI Java Native Interface/iOS-FFI Foreign Function Interface 방식으로 연결되어 동작  

Library == Engine  
(일반적으로, 코드 많은 Library == Engine)  

ReactNative App을 Mobile 기기에 설치 후 실행하면,  
ReactNative의 NativeModule이 실행되면서,  
2개의 스레드가 동시에 동작  

UI Thread : 네이티브 담당 (Android Framework/iOS UIKit Framework 쪽 렌더링)  
JS Engine Thread : App.tsx와 같은 JS 코드를 실행  

Bridge Framework  

두 스레드는,  
Message Queue 방식으로 서로 렌더링가 관련된 데이터를 주고 받음  

I.E. 사용자가 화면을 터치하면,  
UI Thread -> JS Engine Thread (Event - 화면 터치)  
= Bridge Framework  

@ TODO : Thread  

Single Thread 단일 : JS  
Multi Thread 다중 : Java, Objective-C, React Native  

ReactNative 전영 패키지  
항상 UI(Native 쪽) Thread와 JS Thread가 따로 있음  
둘 다 설치되어 있어야 함  

npx react-native link  
npx pod-install  
-> UI(Native 쪽) Thread 부분 설치  

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
