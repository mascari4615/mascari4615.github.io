---
title: "⛏️ PlayFab, Google Play 연동 중 PlayGamesPlatform 를 찾지못하는 경우"
date: 2022-11-18. 10:32
categories: ⛏️Unity 🕯️Unity-Normal
---

## 💎 문제

---

PlayFab과 Google Play 로그인 연동을 위한 코드 작성 중,

PlayGamesPlatform.Instance.Authenticate(); 에서 에러 발생  
PlayGamesPlatform 을 찾지못함.

Assembly 'Assets/ExternalDependencyManager/Editor/1.2.167/Google.IOSResolver.dll' will not be loaded due to errors:

[참고 링크](https://github.com/googlesamples/unity-jar-resolver/issues/441)

## 💎 해결방법

---

빌드 세팅이 Window 플랫폼으로 설정되어 있었음  
Android로 바꿔주니 에러 사라짐  
