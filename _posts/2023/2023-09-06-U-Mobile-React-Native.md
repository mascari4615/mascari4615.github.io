---
title: "🌑 모바일 프로그래밍 과목"
date: 2023-09-06. 13:21
# last_modified_at: 2023-09-06. 13:21
# last_modified_at: 2023-09-12. 15:09
# last_modified_at: 2023-09-13. 13:11
# last_modified_at: 2023-09-20. 13:02
last_modified_at: 2023-09-27. 12:59
categories: ⭐Computer 🌑Computer-General
---

### 💫 2차시

---

- DOM Document Object Model / CSSOM CSS Object Model
  - HTML Tag, CSS 클래스? 를 개체로서 보고,
  - 요소 라벨링, 요소 간의 관계를 트리로

왜 Why, 단순 텍스트는 특정 요소를 검색하기 어려움  
-> DOM으로 만들면 특정 요소를 쉽게 접근/변경할 수 있음  
-> JavaScript, TypeScript  

DOM + CSSOM => Render Tree  

Windows에서 돌아가는 모든 프로그램은 WinAPI 사용  
-> Java가 느린 이유, WinAPI에 직접 접근하지 못함, JVM 한 단계 거쳐서  
-> @ Minecraft Java에서 C++로 바뀐  

React  
Virtual DOM, JSX (JavaScript XML)  
Frontend Web Framework  
By META  

Native (in Mobile App Dev)  
OS와 같은 언어로 만든  
I.E. Android = Java, iOS = Objective C  

Cross Platform  
한 가지 언어로 여러 플랫폼을  

속도 : Native \> Cross Platform  
개발 속도 : Native \< Cross Platform  

React Native  
React로 Web 만들던 것 처럼, 모바일 앱 개발  
-> @ Unity UI Element 처럼  
-> Bridge 방식?

Native Part + JS Part  
Native Part : 기본 제공 모듈 그대로 사용  
JS Part만 작성하여 개발  
-> Web 개발자가 Native 언어 없이 모바일 앱 개발 가능  

JavaScript : 느슨한 타입  
TypeScript : 강한 타입 (JavaScript + 강한 타입)  

Node.js  
서버 사이드 환경에서 실행되는 JS  

React Native와 Node.js 개발 환경 같음  

빌드, 애뮬레이터  
Android Studio : Windows, Mac, Linux  
Xcode : Only Mac에서만 동작  

@ 결국엔 윈도우에서는 iOS 못하는건가?  

### 💫 8차시

---

Scoop  
NVM  
환경변수  
lint : 코드 작성 패턴  

React Native가 지원하는 Android API 버전 확인  
Like VRChat-Unity  

SHTML Static HTML : User에게 보일 HTML을 생성하여 보냄  
DHTML Dynamic HTML : JS를 통해 동적으로 HTML 문서 생성  
-> React, DHTML  

SHTML  
Browser가 Parsing 하여 JS 객체 구조 만듦  

DHTML  
상속 관계로 설계한 DOM 타입 JS 객체를 생성하는 방식  

div, h1 같은 HTML 형태  
JS 코드 관점에서는 클래스(DOM) 인스턴스  

div : HTMLDivElement  
h1 : HTMLHeadingElement  

DOM (Tree) Structure, DOM 구조  
DOM 인스턴스가 이루는 부모/자식 형태의 Tree Structure  

Rendering  
Web Browser가 HTML -> Parsing -> JS DOM 구조  

React Native  
: React  
: Physical DOM, Virtual DOM (React Framework 한정)  

Physical DOM  
Web Browser에서 JS가 생성하는 실제 DOM 구조

Virtual DOM  
React 코드가 생성한 JS 객체 구조  
DOM Node Tree를 복제한 JS 객체  

특정 시점에 Virtual DOM 구조를 Physical DOM 구조로 변환  
Renderer 패키지를 통해 React가 Rendering한다  

프레임워크, 렌더러 패키지  
React, React-DOM (DOM 렌더러)  
ReactNative, React-Native 렌더러 (네이티브 렌더러)

React 패키지 (App 컴포넌트)  
React, ReactNative 프레임워크 둘 다 사용하는  
App.tsx -> Virtual DOM 구조  

React-Native 패키지 (네이티브 렌더러)  
리액트 요소 (Virtual DOM 구조?) -> Android/iOS(UIKit)프레임워크 화면 UI 객체

React, React.render (DOM 렌더러)의 동작을 확인 가능  
ReactNative, 네이티브 렌더러 모습 확인 불가능  

왜 Why, ReactNative 프로젝트의 Android/iOS 디렉터리에 있는 Java/Objective-C NativeModule에서 렌더링 진행  

NativeModule 에서는 JavaScriptCore 라는 이름의 JS 엔진이 동작  
C++로 구현된 이 엔진은 Android-JNI Java Native Interface/iOS-FFI Foreign Function Interface 방식으로 연결되어 동작  

Library == Engine  
(일반적으로, 코드 많은 Library == Engine)  

@ TODO : 52p

React.createElement  

JS.map = C#.ForEach  

React (Native) Component 기본 속성  
key, children, ref  

Each child in a list should have a unique "key"  
-> key = (React 에서) Component 렌더링 속도 최적화를 위해 필요한 속성  

UUID Universally Unique Identifier 범용 고유 식별자  
-> 네트워크 카드의 MAC, 호출 시각 등으로 조합 = 중복 X  

