---
title: "Ini, Registry"
categories: [💫Computer, 🌚Computer-General]

date: 2023-06-07. 11:50
last_modified_at: 2023-06-07. 11:50
---

## 💫 INI, *.ini

---

```ini
[section]
; comment
key = value
```

- `Ini, Initialization`
  - 설정 파일의 사실상 표준 - De Facto Standard

- 특징 : 단순한 아스키 텍스트 파일
  - 일반 텍스트 편집기(Like 메모장)로 조회/수정 가능
  - .ini 확장자 형식 뿐만 아니라 .CFG, .conf, .txt 등을 쓰기도
  - Windows에서 주로 쓰지만, 다른 운영체제에서도 사용 가능
  - 보다 복잡한 구조로 사용하기에는 분명한 한계가 존재

- WIN 32 API 제공 함수
  - 대상 : win.ini
    - GetProfileString
    - GetProfileInt
  - 대상 : 사용자 정의 *.ini
    - GetPrivateProfileString
    - GetPrivateProfileInt

## 💫 Registry, 레지스트리

---

```reg

```

- `Reg, Registry`

## 💫 참고

--

[위키백과 - INI](https://ko.wikipedia.org/wiki/INI_%ED%8C%8C%EC%9D%BC)  
[나무위키 - 레지스트리](https://namu.wiki/w/%EB%A0%88%EC%A7%80%EC%8A%A4%ED%8A%B8%EB%A6%AC)  
[위키백과 - Window Registry](https://ko.wikipedia.org/wiki/%EC%9C%88%EB%8F%84%EC%9A%B0_%EB%A0%88%EC%A7%80%EC%8A%A4%ED%8A%B8%EB%A6%AC)  
[설정 파일은 어떤 포맷을 사용할까?](https://www.morenice.kr/222)  
[생계형 프로그래머 - 레지스트리와 INI 파일](https://blog.naver.com/ljc8808/220404118290?viewType=pc)  
