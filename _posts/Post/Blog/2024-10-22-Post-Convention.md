---
title: "Post Convention | 글 컨벤션"
description: "이 블로그에서 사용하는 글 컨벤션, 작성 규칙"
categories: [📀Post, 🍇Blog]
tags: [Blog]
image: "/assets/img/background/20230112_151539.jpg"
hidden: true

date: 2024-10-22. 11:27
last_modified_at: 2024-10-22. 11:27 # Init (Blog로 부터 분리)
---

## 📀 포스트 컨벤션

---

### 💿 last_modified_at

#### 기준

_240929. 20:07
글의 수정을 **마친** 시간을 적는다.  

만약 해당 글을 금방 다시 수정하게 된다면, 수정 시간을 새로 적지 않고, 기존의 수정 시간을 갱신한다.  
**금방**의 기준은 그때그때 상황마다 판단할 것.  

글의 내용이 바뀌지 않는 수정이라면, 수정 시간을 새로 적거나 갱신하지 않는다.  
오타 수정, 의도와 다르게 쓴 문장 수정, 문장의 순서 변경, 모양 변경 등.  

#### 모양

_241012. 08:30  
_240929. 19:54  

```plaintext
---
title: "A"
# description: ""
categories: []
tags: []

date: 1999-01-01. 00:01
#last_modified_at: 1999-01-01. 00:02
last_modified_at: 1999-01-01. 00:03
---
```

### 💿 계승-병합

_241012. 08:30  
_240929. 19:43  

```plaintext
---
title: "A"
# description: ""
categories: []
tags: []

# 🌑 B
# date: 1998-12-31. 23:59
# last_modified_at: 1999-01-01. 00:00

# 🌘 C
# date: 1999-01-01. 00:00
# last_modified_at: 1999-01-01. 00:01

date: 1999-01-01. 00:01
# last_modified_at: 1999-01-01. 00:02
last_modified_at: 1999-01-01. 00:03
---

2000-01-01. 01:01 : 글 계승.  
`1998-12-31-B-File-Name : 🌑 B`,  
`1999-01-01-C-File-Name : 🌘 C`  

---
```

### 💿 말머리

_240929. 20:05
말머리를 적자.  
말머리를 따르자.  

말머리에는 글을 쓰게 된 이유와, 글의 방향, 글의 규칙을 적을 것.  

글을 쓰는 중간중간 말머리를 보면서 지금 쓰고 있는 글의 방향이 틀어지고 있지는 않은지, 혹은 글의 방향 자체를 조정해야 하는지 (말머리를 수정해야 하는지) 판단할 것.  

## 📀 고려해볼 것

---

- `last_modified_at` 정보가 너무 길어지면, 수정 기록 등의 섹션으로 포스트에 포함할 것

<details>
	<summary>수정 기록</summary>

</details>
