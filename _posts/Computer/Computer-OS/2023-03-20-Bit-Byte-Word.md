---
title: "🌑 Bit Byte Word"
categories: [💫Computer, 🌑Computer-OS]
tags: [Computer, OS, Bit, Byte, Word]

date: 2023-03-20. 16:53
# last_modified_at: 2023-04-06. 11:16
# last_modified_at: 2023-11-08. 15:03
# last_modified_at: 2023-11-26. 01:52
last_modified_at: 2024-08-29. 22:10
---

글 계승.
`2020-10-12 03:33:00 : 32-Bit, 64-Bit 관련 글 스크랩 (네이버 블로그)`  

## 💫 왜 2진수?

---

### 🫧 Digit, Decimal - 십진법

고대 라틴어로 Digita는 '손가락'을 뜻했고,  
여러 언어에서 Digit은 '손가락'과 '발가락'을 뜻한다.  

손가락과 발가락의 수 10개 = 10  

그리스어로 Deci, Deca는 10을 뜻하는 접두어다.  
Decimal은 '십진법의', '소수의' 라는 뜻을 가진다.  

### 🫧 왜 2진수?

10진수는 전자적 구현에 한계가 있었다.  

1. 저장/전송의 어려움
   - 최초의 컴퓨터 ENIAC은 10진수를 썼는데, 한 단위의 정보를 표현하기 위해 10개의 배관이 필요했다. (0 ~ 9)
2. 디지털 논리 함수 구현의 어려움
   - Addition, Multipplication, ...

최초의 컴퓨터 ENIAC은 10진수를 사용했지만, 폰 노이만에 의해 2진수가 고안됐다.  

1. 저장/전송의 간편화
   - 2진수를 이용하면, 한 단위의 정보를 표현하기 위해 1개의 배관만 있으면 된다. (0과 1, 배관이 끼워져있냐 마느냐)
   - 잡음과 부정확한 와이어에도 문제없이 안정적으로 전송이 가능하다.
2. 간단한 구현
   - 간단한 산술함수
   - 여러 방식으로 인코딩/번역 가능

## 💫 Byte = 8 Bit ?

---

Byte는 중요하다.  
Byte는 CPU가 한번에 처리하는 데이터 크기 = Word(TDU)의 기준이 되고,  
이는 컴퓨터가 데이터를 다루는 기본 단위, 메모리 주소의 크기의 기준이 된다.  

Byte의 크기 역시 중요하다.  
현대 컴퓨터 아키텍쳐에서, Byte = 8 Bit 가 표준.  

본래 Byte는 컴퓨터에서 문자 Character 하나를 표현하기 위한 Bit 수였는데,  
이가 확장되어, '디지털 정보의 가장 작은 단위'가 되었다.  

과거 Byte의 크기는 HW에 종속되었고, 명확한 표준이 없어, 곳에 따라 1 ~ 48 Bit 등의 다양한 크기로 사용되었다고 한다.  

그 중에서도, 6-Bit를 사용하는 문자 표현 방식이 주로 사용되었고, 1960년대에는 6-Bit, 9-Bit 를 사용하는 컴퓨터가 일반적이었다고 함.  
이런 컴퓨터들은 2, 3, 4, 5, 6, 8, 10 6-Bit Byte에 상응하는, 12, 18, 24, 30, 36, 48, 60 Bit의 Memory Word를 주로 사용했음.  
이 시대엔 이런 Bit Groupings를 Syllables, Slab 등으로 불렀음. (Byte가 일반화되기 전까지)  

ASCII Code는 7-Bit만으로도 필요로 하는 문자를 모두 표현 할 수 있었는데,  
2-진수 Binary를 사용하는 컴퓨터 아키텍쳐 특성상, 편리하게 2-배수로 만들기 위해,  
7-Bit에 1-Bit를 더하여 8-Bit로 만들어 사용  

IBM의 System/360 컴퓨터가 이런 8-Bit Byte의 시초.  
ISO/IEC 2382-1:1933 에 문서화 되었으며,  
8-Bit Byte 마이크로프로세서가 득세한 70년대부터 표준으로 굳어지기 시작함 (사실상 표준 De Facto Standard)  

이런 8-Biy Byte에 기반하여 8의 배수인, 8-Bit, 16-Bit, 32-Bit, 64-Bit Words를 사용하게 됨.  

ISO International Organization for Standardization  
IEC International Electrotechnical Organization  

[참고-0](https://softwareengineering.stackexchange.com/questions/120126/what-is-the-history-of-why-bytes-are-eight-bits)  
[참고-1](https://en.wikipedia.org/wiki/Byte)  

## 💫 32-Bit, 64-Bit ?

---

Program Counter  
32-Bit = 2^32 = 4,294,967,296  
64-Bit = 2^64 = 18,446,744,073,709,551,616  
32-Bit = 약 4-GB 메모리  
64-Bit = 약 256-TB 메모리 (48-Bit만 사용)  

왜 48-Bit만 사용하냐면, '일반적으로', 256-TB 이상의 주소 공간을 사용하지 않기 때문이다.  

운영체제도 32-Bit, 64-Bit 로 나뉜다.  
32-Bit CPU 에는 64-Bit 운영체제가 동작하지 않는다.  
64-Bit CPU 에는 32-Bit 운영체제가 동작하기는 하지만, 하위 호환 Backward Compatibility 된다.  

앱 역시 32-Bit, 64-Bit 로 나뉜다.  
32-Bit 운영체제에는 64-Bit 앱 (Programs File)이 동작하지 않는다.  
64-Bit 운영체제에는 32-Bit 앱 (Programs File (x86))이 동작하기는 하지만, 하위 호환 Backward Compatibility 된다.  

[참고-0](https://blog.naver.com/sharpsoul/221777128846)  
[참고-1](https://eine.tistory.com/entry/64%EB%B9%84%ED%8A%B8-32%EB%B9%84%ED%8A%B8-CPU%EC%99%80-%EC%9A%B4%EC%98%81%EC%B2%B4%EC%A0%9C-%EC%97%90-%EB%8C%80%ED%95%98%EC%97%AC)  

## 💫 x86, x64 (x86-64) ?

---

x85 = 8-bit  
x86 = 32-Bit (일반적으로)  
x64 = 64-Bit (x86-64)  

x86 (80x86) =  
1978년 인텔이 개발한 인텔 8086에 적용된 아키텍쳐,  
그 호환 프로세서와 후속작 (8086의 명령어 세트를 기반하여 확장한, 386, 486, ...  )  

IA-16, IA-32, IA-64 를 모두 포함하는 단어이지만,  
일반적으로 x86이라 하면 IA-32을 지칭  

IA = Intel Architecture  

[참고-0](https://ko.wikipedia.org/wiki/X86)  

## 💫 워드 WORD ?

---

기계어 명령어나 연산을 통해 저장된 장치로부터 레지스터에 옮겨 놓을 수 있는 데이터 단위  
= CPU가 처리할 수 있는, 버스에 한 번에 지나갈 수 있는 크기의 단위  
= DTU Data Transport Unit (DTU를 사용하는 용어가 많았기에 WORD를 사용하기 시작)  

컴퓨터 아키텍쳐에서,  
32-Bit = WORD : 32-Bit  
64-Bit = WORD : 64-Bit  

반먄 프로그래밍에서,  
Win32 API의 WORD는 16-Bit다.  

왜 Why  

IA = Intel Architecture  
IA-16의 기본 처리 단위 DTU = WORD = 16-Bit  
추후 32-Bit, 64-Bit 등의 프로세서 (IA-32, IA-64 등) 등장  

호환성의 문제으로 인해, 기존 단위 크기를 바꿀 수는 없고,  
때문에 기존 16-Bit Word를 기반으로 한 새로운 단위를 만들어 썼다.  

DWORD = Double Word = 32-Bit  
QWORD = Quad/Quotable Word = 64-Bit  

[참고-0](https://bebesoft.tistory.com/12?category=887595)  

## 💫 컴퓨터에서의 1K = 1024 ?

---

I.E. 1 KB = 1024 Byte  
왜 Why  

k, Kilo, 10^3, SI 접두어  
1 KM, 1 KG 등 여러 단위에 쓰이는 킬로  

컴퓨터에서도 큰 단위를 다룰 때 킬로를 사용하는데,  
2진수를 사용하는 컴퓨터 시스템에서 1000은 다루기 복잡한 숫자  
1000 = b1111101000  

때문에 2진수 컴퓨터 시스템에서 다루기 쉽도록 2의 배수이면서,  
가장 원래 1K = 1000 에 가까운, 2^10 = 1024를 컴퓨터 시스템에서의 1K로 사용  
1024 = b10000000000  

기억장치를 팔 때에는,  
기존 1K = 1000 단위로 광고하여 팔기 때문에,  
500GB 부품을 사도 컴퓨터는 466GB로 인식  

인터넷 속도도 비슷한 이유로,  
MB가 아닌 Mb로 팔기 때문에,  
100Mb 서비스를 사도 12.5MB로 인식  

[참고-0](https://velog.io/@victor/1kb-1024-bytes-1000-bytes-%EB%AD%90%EA%B0%80-%EB%A7%9E%EC%9D%84%EA%B9%8C-mojurs3pb2)  

## 💫 @여치

---

CPU를 직접 제어하는 어셈블리 프로그래밍의 경우 프로그래머가 여러 개의 레지스터를 사용해서 더 큰 숫자를 사용할 수 있도록 짤 수 있다. 고급 언어의 경우는 컴파일러가 이러한 코드를 생성해준다. 당연히 코드가 느리고 복잡해진다.  

‘아 버스선이 32개면 32비트 CPU겠군!’  
아주 틀린 소린 아니지만 또 정답은 아니다.  
인텔 펜티엄의 경우 32비트 CPU지만 외부 데이터 버스는 64비트다. 과거 인텔 8086 CPU또한 16비트 CPU였지만 외부 데이터버스는 8비트짜리였다.  

- N-Bit CPU
  - N-Bit = CPU 내부에서 처리하는 단위
  - = 연산, (제어 = 메모리를 억세스 = 주소 = 어드레스 버스)

HEX  

32비트 CPU라면 그 안에 가지고 있는 범용 레지스터는 모두 32비트짜리이다.  
각 레지스터들은 한번에 32비트짜리 데이터만을 저장할 수 있다.  
물론 메모리 어드레싱을 위한 특수한 레지스터나 SIMD(Single Instrunction Multiple Data)용 레지스터들은 사이즈가 제각각이다)  
