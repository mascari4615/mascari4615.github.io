---
title: "🌑 Windows11 글꼴 변경"
date: 2023-06-07. 07:46
last_modified_at: 2023-06-25. 06:35
categories:  ⭐Computer 🌑Computer-General
---

### 💫 No!! Meiryo UI로 폰트 변경

---

[No!! Meiryo UI](http://tatsu.life.coocan.jp/MySoft/WinCust/index.html)

![적용 예시](/assets/img/2023/230625_0000.png)

[예시 폰트 : 갈무리 9](https://galmuri.quiple.dev/)

### 💫 레지스트리 편집기로 폰트 변경

---

```Text
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts]
"Segoe UI (TrueType)"=""
"Segoe UI Bold (TrueType)"=""
"Segoe UI Bold Italic (TrueType)"=""
"Segoe UI Italic (TrueType)"=""
"Segoe UI Light (TrueType)"=""
"Segoe UI Semibold (TrueType)"=""
"Segoe UI Symbol (TrueType)"=""

[HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\FontSubstitutes]

"Segoe UI"="FONT_NAME"
```

1. 위 내용을 메모장에 복사 후, **FONT_NAME** 을 원하는 글꼴 이름으로 변경
   - 글꼴 이름은 **Windows 설정 - 개인 설정 - 글꼴**에서 확인할 수 있음
   - 글꼴가 Windows에 설치되어 있어야 함

2. 다른 이름으로 저장
   - 이름 : 원하는 파일 이름.reg
   - 파일 형식 : **모든 파일**

3. 저장된 파일을 열고, 팝업 확인, 재부팅

### 💫 기본 글꼴 설정 복원

---

제어판에서 **글꼴 - 글꼴 설정** 메뉴를 찾고, **기본 글꼴 설정 복원** 버튼 선택
