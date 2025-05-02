---
title: "Windows 시작메뉴 Bing 검색 비활성화"
# description: ""
categories: [컴퓨터, 시스템]
tags: []
image: "/assets/img/background/kururu-lab.jpg"

date: 2024-10-07. 21:17
last_modified_at: 2024-10-07. 21:30
---

## Windows 시작메뉴 Bing 검색 비활성화

---

### 방법

```PlainText
Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Search]
"BingSearchEnabled"=dword:0
```

1. 위 내용을 메모장에 복사 후, 다른 이름으로 저장
   - 이름 : 원하는 파일 이름.reg
   - 파일 형식 : **모든 파일**

2. 저장된 파일을 열고, 팝업 확인
