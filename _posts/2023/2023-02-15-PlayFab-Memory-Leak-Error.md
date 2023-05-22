---
title: "⛏️ PlayFab, A Native Collection... 에러"
date: 2023-02-15. 10:40
categories: ⛏️Memo
---

### 💎 Problem, Solve

---

문제 :  

A Native Collection has not been disposed, resulting in a memory leak. Enable Full StackTraces to get more details.  

이 에러 로그가 자꾸만 뜬다.  
Play Mode 가 멈춘다거나, 게임 플레이에 이상이 생긴다거나 하는 건 아니지만, 신경쓰인다.  

---

해결 :  

[참고](https://community.playfab.com/questions/65805/a-native-collection-has-not-been-disposed-resultin-1.html)  

Assets\PlayFabEditorExtensions\Editor\Scripts\PlayFabEditorSDK\PlayFabEditorHttp.cs  
파일 내용 일부분에, 참고 링크에 Rick Chen이 남긴 코드를 추가한다.  

이것만의 문제는 아닌지, 가끔 똑같은 에러 로그가 발생하고 있긴 하지만,  
그 빈도가 확연하게 줄어들었다.  
