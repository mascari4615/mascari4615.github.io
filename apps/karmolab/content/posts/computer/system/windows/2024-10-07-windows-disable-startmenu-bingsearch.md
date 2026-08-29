---
title: Windows 시작메뉴 Bing 검색 비활성화
date: "2024-10-07T21:17:00+09:00"
last_modified_at: "2025-05-07T22:50:00+09:00"
categories: [컴퓨터, 시스템]
tags: []
image: /assets/img/background/kururu-lab.jpg
board: info
---

## Windows 시작메뉴 Bing 검색 비활성화

---

### 방법

```shell
Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER/Software/Microsoft/Windows/CurrentVersion/Search]
"BingSearchEnabled"=dword:0
```

1. 위 내용을 메모장에 복사
   - 이때, `/`를 `\`로 바꿔줘야 함.
   - `.reg` 파일에서 경로 지정시 역슬래시 `\`를 써야하는데, 블로그 특성 상 코드 블럭안에 역슬래시를 쓸 수 없었음.

2. 다른 이름으로 저장
   - 이름: 원하는 파일 이름.reg
   - 파일 형식: **모든 파일**

3. 저장된 파일을 열고, 팝업 확인
