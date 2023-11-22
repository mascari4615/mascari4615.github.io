---
title: "🌗 Artificial Life - 인공생명"
date: 2023-11-07. 10:07
# last_modified_at: 2023-11-08 16:23
# last_modified_at: 2023-11-14 10:08
last_modified_at: 2023-11-21 10:43
categories: ⭐Computer 🌗AI
tags: AI Artificial-Life A-Life Boids Game-of-Life
---

@ [책 - The Nature of Code](https://natureofcode.com/)  
@ Java로 만든 언어 Processing (아두이노 등에 쓰이는)  

@ 푸앵카레 정리  
@ 우주가 구형이냐 도넛(토러스)모양이냐  
@ 네모난 2차원 공간이 위아래, 좌우 Wrapping 되어 있으면 구형인가, 도넛(토러스)모양인가  

@ Tierra - Assembly 프로그램 진화  

@ Bosstown Dynamics  

@ Coined 고안하다  
@ Investigate 파다 조사하다  
@ Discipline 학문 분야  
@ Concerns

## 💫 Boids

---

- Boids 요소가 움직이는 규칙
  - Separation : 주변 무리로부터 멀어지려고 함
  - Alignment : 방향을 주변 무리와 맞춤
  - Cohesion : 무리 사이에 있어야 함

횡단보도 앞 기둥의 역할은, 많은 사람들이 서로 충돌하지 않고 빠르게 지나갈 수 있도록 도와주는 것.
이를 Boids를 통한 연구를 통해서  

## 💫 Game of Life

---

[사이트](https://playgameoflife.com/)  

1. 살아있는 세포 : 주위 2~3개 살아있으면 유지
2. 죽은 세포 : 주위 3개 살아있으면 반전

## 💫 Artificial Life - 인공 생명

---

담금질/유전 알고리듬 처럼 특정 알고리듬이 아니라 하나의 분야  
인공지능 조차도 포함된 개념  

새, 물고기, 곤충 무리  

Boids, Game of Life,  

Simple Rule :  
Local Rule :  
이머전시 : 복잡한 행태를 관찰할 수 있다  

- (인공) 생명
  - (일반적으로) 성장 Grow
  - 자기 재생산 Reproduce
  - 신진대사 Nutrients/Energy
  - 반응
  - 내부 구성 성분 상호작용
  - 작은 변화에 둔감
  - 자기유지 Self-Maintaining, 자기조절 Self-Regulating
  - Self-Organization 무질서하던것 질서있게, Like 냄비 물 끓일때 물방울 패턴
  - 진화
  - 특정한 물질적 객체라기보다는, 시공간상의 한 패턴
  - 생명체를 표현하는 정보의 저장소

적어도 부분적으로, 생명체처럼 보이는, 만든 시스템에 대한 연구  

Artificial Life - ALife는 Chris Langton이 고안한 용어로, 자연 시스템을 흉내내는 큰 범위의 계산적 매커니즘을 묘사하는 개념이다. (Describe)  

ALife는 다음과 같이 이용된다 (used to model)  

- Agents trading resources in artificial economies
- Ecologies of insects
- The behavior of animals
- Entities negotiating with one another to study models in gam theory

수업에서는 ALife를 배워보고 (Investigate), 인공 환경에서의 먹이사슬 Agents 시뮬레이션을 구현해본다  

Synthetic ethology - 행동 합성  
approach to the study of animal behavior  

## 💫 Simulating Food Chain

---

세 계의 엔티티로 이루어진 아주 간단한 먹이사슬을 고려해보자.  

바닥에는 식물이 있을 것이다.  
식물은 자연으로부터 에너지를 얻는다. (비, Soil, 그리고 태양)  

중간에는 Herbivores이 있을 것이다.  
Herbivore는 식물을 소비함으로써 생존한다.  

천장에는 Carnivores가 있을 것이다.  
Carnivore는 Herbivore를 소비함으로써 생존한다.  

환경에 죽은 Herbivore와 Carnivore를 무시한다면, 먹이 사슬은 아래과 같이 묘사된다.  
Carnivore -(consumes)→ Herbivore -(consumes)→ Plant  

엔티티들 사이에는 Delicate Balance 미묘한 균형이 있는 것이 분명하다.  

Plants의 수가 줄어든다면 어떤 일이 일어날까?  
~하면 어떤 일이 일어날까?  

이를 시뮬레이션 해본다.  

@ PPT, 여기서는 어떻게 구현했는지 (꼭 이렇게 구현하라는 게 아님)  
@ 별표, 지역성, 나는 강의실 안에 있고, 강의실 밖에는 무슨 일이 일어나고 있는지 모른다  

@ i.e. 스타크래프트 유닛 돌아다닐때 어떤 상황에서 어떤 행동을 취하냐 - 오토마타  

@ 수식에서 b - bias 입력 - 모든 요소에게 공통되게 들리는 목소리, 마음의 소리  
@ 구현할 때 몰라도 되는 값 - 실제 입력이 아니니까  

@ 개미 알고리듬과 다른 것, 에너지가 유지되냐  
@ 에너지가 0이되면 죽음  

@ Free Lunch  

@ 가중치 계산 기말고사  
@ 선이 갖는 의미 (점선, 실선)  

@ 시뮬이 가지는 의미, 100만번 시행한 그래프 (시간, 최고령자 나이)  
