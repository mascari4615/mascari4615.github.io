---
title: "Boolean 크기가 1바이트인 이유"
# description: ""
categories: [💫Computer, 🌑Computer-OS]
tags: [Computer, OS, Boolean, Bit, Byte]
image: "/assets/img/background/kururu-lab.jpg"

date: 2023-03-16. 10:51
# last_modified_at: 2023-11-08. 14:55
last_modified_at: 2024-08-29. 21:27
---

## 💫 Boolean 크기가 1바이트인 이유

---

0과1, 두 가지 상태만을 가지는 Boolean이 1-Bit가 아니라 1-Byte 용량을 차지하는 이유는,  
현대 컴퓨터 구조 상 최소 Byte 단위로 데이터나 주소에 접근하기 때문이다.  

일반적으로 (CPU 구현에 따른 최소 단위) Word로 크기가 설정된다.  

[같이 읽으면 좋은 글 - Bit, Byte, Word](/posts/Bit-Byte-Word/)  

[참고 - 스택오버플로우](https://stackoverflow.com/questions/2064550/)  
[참고 - 1바이트는 왜 8 비트인가](https://zepeh.tistory.com/313)  
