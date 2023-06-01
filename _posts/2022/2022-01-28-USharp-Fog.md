---
title:  "🌔 VRChat 안개 (Fog)"
date: 2022-01-28. 09:48
categories: ⭐Computer 🌔Unity-CSharp
---

## 💎 Fog (유니티 기본 기능)

---

Lighting > OtherSettings > Fog  
켜두면 카메라로부터 멀어지는 오브젝트들을 흐리게 보이게 만들 수 있음 (점점 Fog Color로 보이는)  
이때 SkyBox는 흐리게 보이지 않기 때문에, 하늘도 흐리게 만들고 싶다면 Fog Color와 같은 색의 Material을 적용하는 식으로 사용.  

## 💎 Udon 으로 접근하기

---

RenderSettings.fog 로 키고 끌 수 있음  
RenderSettings에 fog 관련 변수들에 접근하고 수정할 수 있음.  

## 💎 주의

---

Fog 안켜둔 채로 빌드하면, 게임 내에서 Udon으로 RenderSettings.fog 켜도 적용이 안됌  
이유는 나도 몰?루. VRC로 빌드할 때 지혼자 설정되는 게 많은 것 같음.  
아무튼 해결방법으로는 켜둔 채로 빌드하고, Udon으로 월드 들어오자마자 Fog 꺼주는 식으로 사용  
