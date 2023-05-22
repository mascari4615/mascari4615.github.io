---
title: "🌱 유니티 _ 인스펙터에서 값을 변경한 Public, [SerializeField] 속성 변수"
date: 2019-12-10. 20:01:00
last_modified_at: 2023-05-10 14:15
categories: 🗿Stone 🌱DayStone
---
{% include old-post.html %}

20191203225712.950590 (대충 끄덕끄덕 짤)  

접근 제어자가 Public 이거나 [SerializeField] 속성을 준 변수를 인스펙터에서 수정한 후,  
해당 변수를 [HideInInSpector] 속성으로 바꾸더라도, 인스펙터에서 설정된 값이 저장되어 남아있을 수 있다.  

분명 오류 없이 게임 시스템을 구현한 것 같다고 생각했는데 수정한 사실을 미처 모르고 넘어가게 된다면,  
에디터가 오류라고 말해주지도 않고, 일일이 찾아보기 전까지는 모르기 때문에 조심해야 한다.  
