---
title: "🌗 Adaptive Resonance Theory - ART1"
date: 2023-10-25. 09:59
last_modified_at: 2023-10-25. 09:59
categories: ⭐Computer 🌗AI
tag: AI, Adaptive-Resonance-Theory, ART1
---

5, 6차시  
@ 50분 정도 집중력  

### 💫 Adaptive Resonance Theory - ART1

---

Adaptive 적응형  
(LOL 적응형 능력치 Adaptive Force)  

Resonance 공명  

모든 물체는 고유한 진동수를 가진다  
진동수 : 1초에 진동하는 수, Hz  

공명 : 같이 운다  
같은 진동수의 물체가 주변에서 진동하면, 함께 진동한다  
진동수가 다르면 공명하지 않는다  

적응형 공명  
-> 기준과 공명하는 것들을 찾아 그룹화 (반복)  
Recommender System  

Adaptive Resonance Theory, ART1 클러스터링  
ART 시리즈의 첫 작  
Unsupervised Learning Algorithm (With Biological Motivations)  
비지도 학습 알고리즘  

Supervise 지도  
(Supervised User)  

지도 학습 - 답이 이미 존재하는, 누가 지도해주는 (Supervised)  
비지도 학습 - 답이 없는 (비정량적인? Like 취향 - 나누는 기준이 정해진 게 없음)  
강화 학습 - 말 그대로  

Clustering Algorithm  
클러스터(덩어리), 군집화 -> 분류, 클래스화(레이블)  
-> Like 하얀건 종이요, 검은건 글씨다  
유사성에 의해 덩어리를 나눈다  

덩어리를 만드는 것 - 비지도 학습  
누가 비슷하다  

분류 - 지도학습  
누가 누구다  

사람이 뭔가 배울 떄 이미 알고 있는 것과 비슷한 것을 찾아 연관시키고(덩어리), 만약 그게 없다면 이해를 위한 새로운 생각(덩어리)을 만든다  
에서 모티브를 얻은  

ART1  
뭐가 어떻다 하는 특징 데이터 (테이블)  
1, 0의 개수가 비슷해야 비슷한 데이터  

베타 - 그냥 1.0 몰라도 된다  
d - 전체 물건의 개수  
E - 산 물건  

Create Initial Prototype Vector  
모르기 때문에 임의의 요소 선택 (첫 번째든 랜덤이든)  
P<sub>0</sub> = E<sub>0</sub>  

Proximity 유사  

for each Example Vector  

close to Prototype?  
Proximity Test  
P와E 교집합 (1에 대해서만)/P전체물건 > E산물건(E 1의수)/E전체물건  

@ PDF 8p Eq1 3/4 > 4/8 (오타)  

Vigilance Test? (덩어리로 묶을 지, 한 번 더 평가)  
P와E 교집합/E산개수 \< p (Vigilance Parameter)  

Place Example in Current Prototype Vector (마킹? 라벨링? 덩어리?)  
남은 것들에 대해 새로운 프로토타입을 만들어 반복  
P = P와E 교집합  
1110110  
1110010  
-> 1110010  
덩어리에 크게 의미 없는 데이터를 제거  
(3.4 밑에 Finally 부터 나오는 내용)  

K-means Algorithm  
K를 먼저 정하고, (이 데이터에는 K개의 덩어리가 있다고 가정)  
(K를 어떻게 정하냐는 다른 논제)  
(비지도학습 알고리듬이지만, 답이 정해져 있는 것처럼 - K)  

Loop  
K개의 임의의 점들을 기준으로, 가까운 것들을 모아 K개의 덩어리로 만듦  
이후 각 덩어리의 중심으로 K개의 임의의 점들을 재위치  
만약, 이전과 달라진 점이 없다면 End  

실제로는 점이 아니라 테이블  
3차원 이상으로 넘어가면 이해하기 힘듦  

못 찾을 수도 있음  

Using ART1 for Personalization(Recommend System)  
Sum Vector를 이용하여  
