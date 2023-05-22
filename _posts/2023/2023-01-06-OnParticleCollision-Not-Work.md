---
title: "🕯️ OnParticleCollision 이 호출되지 않을 때"
date: 2023-01-06. 23:46
categories: ⛏️Memo 🕯️Computer
---

### 💎 OnParticleCollision 이 호출되지 않을 때

---

- 파티클 시스템에서 Collision 이 켜져있는 지확인  
- Collision 에서 Type 이 World 인지 확인 (기본 Plane)  
- ⭐ Collision 에서 Send Collision Messages 가 켜져있는지 확인  
- Collision 에서 Collision Quality 가 High 인지 확인  
- Collision 에서 Collision Quality / Collides With 의 레이어에 닿고자 하는 오브젝트의 레이어가 포함되어 있는지 확인  

[참고](https://www.reddit.com/r/unity/comments/n30tkr/onparticlecollision_not_called/)
