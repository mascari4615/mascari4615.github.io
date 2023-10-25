---
title: "🌑 프로그래밍 언어 - 이름과 변수"
date: 2023-10-20. 10:32
last_modified_at: 2023-10-20. 10:32
categories: ⭐Computer 🌑Computer-General
---

### 💫 이름, 바인딩, 영역

---

#### 서론

- 명령형 언어
  - (현대 컴퓨터) = 폰 노이만 컴퓨터에 대한 추상화
  - 메모리에 데이터/Instruction을 넣고, 하나씩 커내고 Decode하고 실행시키는
  - 데이터의 저장과 데이터 가공을 위한 연산으로 구성
  - 메모리 셀에 대한 언어적 추상황 -> 변수, 배열 등

- 변수의 특성
  - 타입, 주소, 값
  - Scope 영역과 Lifetime 존속기간

- `순수` 함수형 언어에서의 변수
  - 값이 한 번 변수에 배정되면 값의 변경을 허용하지 않음
  - 하지만 많은 함수형 언어에서는 명령형 언어처럼 값의 변경을 허용

#### Name(Identifier) 이름(식별자)

Name 이름은 변수의 속성 중 하나 -> Variable Name 변수명  
이름은 Subprogram 부프로그램, Formal Parameters 형식 인자, 다른 프로그램 구성 요소와도 관련이 있음  

이름 Name = 식별자 Identifier  

설계 주요 이슈
-> 이름은 Case Sensitive 한가?
-> 언어의 Special Words 특별한 용어는 Reserved Word 예약어인가 Keyword 키워드인가?  

- 이름
  - 프로그램에서 개체를 식별하기 위해 사용되는 문자열
  - 프로그래밍 언어마다 식별에 참여하는 길이는 다름
    - Fortran 95+ : 31자
    - C99 : Linker가 External Name의 31자까지만 허용 <- 31자 이후는 비교 안함
    - Java, C#, Ada : 제한 X
    - C++ : 구현자에 따라 다름

@ 왜 변수명을 숫자로 시작하면 안되나?  
@ Lexical Analysis 단계에서, 숫자로 시작하는 토큰을 만나면, 숫자인지 변수인지 알기 위해, 숫자 뒤에 있는 문자 존재 여부를 확인하는 Backtracking 과정이 필요  
@ -> 컴파일러 구현의 편의성, 퍼포먼스 향상을 위해  

@ TODO : IDE 문법 검사, 인텔리센스 원리?  

- 일반적인 프로그래밍 언어에서의 이름 작성 규칙
  - 구성 : Alphabet, Number, Underbar(Underscore) _
    - 첫글자 숫자 X
    - 다른 예 : PHP, Ruby
  - 일반적으로 대소문자 구분 Case Sensitive
  - 다양한 표기법
    - Camel Notation, Pascal Notation, Snake Notation, ...

@ 현학적인  

Special Word 특수어  
-> 프로그래밍 언어에서 수행할 행동들을 명칭화  
-> I.E. if, else, for, while, ...  

Reserved Word 예약어  
-> 프로그래밍 언어에서 특별한 의미로 해석하도록 선정 됨  
-> Identifier 식별자로 사용될 수 없는 단어  
-> 특수어는 예약어로 분류 (대부분 언어)  

Keyword 키워드  
-> 어떤 문맥에서만 특별하게 사용되는 단어  
-> Fortran에서 키워드는 예약어가 아님 <-- 가독성이 떨어짐  

키워드 = 예약어 (대부분 언어)  
-> 일부 키워드 != 예약어  
-> Kotlin : Hard Keyword(Reserved Word), Soft Keyword, Modifiable Keyword  

일정정의 예약어 정의함 (대부분 언어)  
-> C : 44, Java : 46, Python : 35, ...  
-> Python 키워드 확인 : import keyword, len(keyword,kwlist)  

예약어 비례 작성력 나빠짐  
-> Cobol : 300 여개의 예약어  

### 변수

프로그램 변수는 컴퓨터 메모릴 셀이나 셀들의 모임에 대한 추상화  
-> 컴파일러는 번역시에 변수를 주소로 변환  

변수의 특성  
-> Name, Type, Address, Value, Scope & Lifetime  

변수 이름  
-> `대부분` 의 변수는 이름을 가진다  

변수의 주소  
-> 변수와 연관된 기계 메모리 주소  
-> 동일한 변수가 다른 시점에 다른 주소와 연관되는 것이 가능, I.E. 스택 변수 -> 저장된 호출 시기에 따라 주소 다름  
-> L-Value라 불림 : 배정문의 좌측의 위치  
-> 여러 개의 변수가 동일한 주소를 가지는 것이 가능 -> 별칭  
-> 공용체, 포인터, 참조 변수  
-> 별칭은 가독성을 떨어뜨리는 요소가 되기도  

타입  
-> 변수가 저장할 수 있는 값들의 범위와 연산들의 집합을 결정  
-> Java의 Int 타입 -21억~ 21억, 산술연산 가능 ~  

값  
-> 값은 그 변수에 연관된 메모리 셀이나 셀들의 내용 -> 추상적인 메모리 셀  
-> R-Value라고 불림 : 변수가 배정문의 우측의 위치  

영역  
-> 변수가 사용될(접근될) 수 있는 범위  

존속 기간  
-> 변수가 할당되어서 삭제될 때까지의 시간  
