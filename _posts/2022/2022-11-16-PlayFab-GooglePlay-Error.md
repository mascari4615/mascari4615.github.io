---
title: "🌔 Unity PlayFab, Google Play 연동 에러"
date: 2022-11-16. 11:38
categories: ⭐Computer 🌔Unity-CSharp
---

## 💎 문제

---

PlayGameServices 0.11.01 버전 기준,  
예전 버전 자료들을 바탕으로 PlayFab과 Google Play 로그인 연동을 위한 코드 작성 중,

PlayGamesClientConfiguration 과,  
PlayGamesPlatform.Instance.Authenticate(); 등을 찾지 못하는 에러 발생  

PlayGameServices 0.11.01 버전에 구글 플레이 V2 를 사용하게 되면서, 위 내용들이 더이상 지원하지 않는 코드가 됨.  
PlayGameServices ReadMe와 [업그레이딩 문서](https://github.com/playgameservices/play-games-plugin-for-unity/blob/master/UPGRADING.txt)를 참고해 새 버전의 코드를 작성할 수는 있음.  

다만,  
구글 플레이를 통해 Playfab에 로그인 하고자 하는 경우,  
구글 플레이 서버 인증 토큰을 포함하여 로그인 리퀘스트를 보내야 하는데  

기존 버전에서 토큰을 불러오기위해 사용했던 **PlayGamesPlatform.Instance.GetServerAuthCode();** 가,  
V2 에서 **PlayGamesPlatform.Instance.requestServerSideAccess()** 로 바뀌게 되면서 원하는 값을 받아올 수 없는 것 같음  

때문에 로그인에 계속해서 실패  

[참고 링크 1](https://github.com/playgameservices/play-games-plugin-for-unity/issues/3141)  
[참고 링크 2](https://community.playfab.com/questions/61120/googleoauthnoidtokenincludedinresponse-when-loggin.html)  

## 💎 해결방법

---

23/06/01 기준, 아직 해결 방법을 찾지 못함  
0.11.1 버전이라면, 어쩔 수 없이 0.10.14 버전으로 다운그레이드하여 사용 (참고 링크 2, PlayFab 답변 참고)  
