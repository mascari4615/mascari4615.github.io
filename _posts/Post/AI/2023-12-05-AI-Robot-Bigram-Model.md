---
title: "🌗 Bigram Model"
date: 2023-12-05. 10:05
# last_modified_at: 2023-12-05. 10:05
categories: ⭐Computer 🌗AI
tags: AI Bigram-Model
---

## 💫 Bigram Model

---

Markov Chain (Adjancency List)  

내 이전의 상태는 사용하지 않는다  
지금 상태만을 가지고 다음 상태를 예측한다 (지금 이전 상태는 모두 무시)  

@ PPT 10.4 그래프 시험  
~  
표로 만들어 본다면?  
나올 수 있는 단어는 7단어  
행, 열 7개  
이전 단어 다음에 나오는 단어 빈도 표  
이를 바탕으로 문장 생성 (랜덤한 시드/단어를 가지고 다음에 나올 단어 예측)  

확률을 바탕으로 하기 때문에, 같은 질문을 해도 다른 답이 나온다  

### 🫧 예시 - 배터리 온도 조절
