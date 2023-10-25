---
title: "🌑 React Native 리액트 네이티브"
date: 2023-10-22. 15:39
last_modified_at: 2023-10-22. 15:39
categories: ⭐Computer 🌘Web-Mobile
tag: Mobile, React-Native
---

목표 : 리액트 네이티브는 무엇인가?  

React Native = React + Native  

### 💫 React 리액트

---

Frontend Web Framework 프론트엔드 웹 프레임워크  
By META (Facebook)  

특징 : Virtual DOM, JSX (JavaScript XML)  

### 💫 Native 네이티브, Cross Platform 크로스 플랫폼

---

Native 네이티브 (in Mobile App Dev)  
OS와 같은 언어로 만들어진 ~  

I.E.  
Android - Java, iOS - Objective C  

Cross Platform 크로스 플랫폼  
한 언어/코드로 여러 플랫폼을 한 번에  

I.E.  
React-Native - Android, iOS  

실행 속도 : Native \> Cross Platform  
개발 속도 (생산성) : Native \< Cross Platform  

### 💫 React Native 리액트 네이티브

---

React + Native  
React로 Web을 만들던 방식으로, 모바일 앱 개발  
-> Web 개발자가 Native 언어 없이, 모바일 앱 개발  

@ Like Unity UI Element  
@ Web 방식으로 Unity UI 다루기  

@ Android, iOS와 더불어, Web도 개발하고자 한다면 가능  

React Native =  
Native Part + JS Part  

Native Part : 기본 제공 모듈 그대로 사용  
JS Part : 주로 이를 작성하여 개발  

Bridge 방식으로 동작  

[DHTML](https://mascari4615.github.io/posts/DOM/)  

### 💫 Bridge 방식

---

Web Browser의 JS 엔진 부분만 떼어내어,  
JS 코드로 구현된 'View' Class를,  

Connect  

Android의 'VIew' Class (Java),  
iOS의 UIKit Framework의 'View' Class (Objective-C)  

-> JS 코드가 네이티브 API를 호출하도록 연결  

### 💫 개발 환경

---

JavaScript : 느슨한 타입  
TypeScript : 강한 타입 (JavaScript + 강한 타입) (권장)  

Node.js  
서버 사이드 환경에서 실행되는 JS  

React Native와 Node.js 개발 환경 같음  

빌드, 애뮬레이터  
Android Studio : Windows, Mac, Linux  
Xcode : Only Mac  

@ Windows 만으로는 iOS 개발 못함  
@ -> Cross Platform 맞아?  
