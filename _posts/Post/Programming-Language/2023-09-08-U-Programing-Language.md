---
title: "🌑 프로그래밍 언어 과목"
date: 2023-09-08. 08:59
# last_modified_at: 2023-09-08. 08:59
# last_modified_at: 2023-09-15. 09:01
# last_modified_at: 2023-09-22. 09:37
# last_modified_at: 2023-10-13. 09:15
last_modified_at: 2023-10-20. 09:13
categories: ⭐Computer 🌑Computer-General
---

@ 2차시  

왜 Why 프로그래밍  
-> 문제 해결  

왜 Why 프로그래밍 언어 개념  
-> 컴퓨터 공학 이해 향상하려고  
-> 프로그램을 잘 만드려고  
-> 언어 잘 고르려고
-> 내 언어 더 잘 쓰려고
-> 다른 언어도 잘 쓰려고

### 💫 언어 평가 기준

---

(SW 개발 및 유지보수에 대햐여)  

- 가독성 Readability
- 작성력 Writability
- 신뢰성 Realiability
- 비용 Cost

---

#### 가독성 Readability

- (언어 자체에 대하여) 프로그램 이해 난이도 척도
- 언어 특징
  - 단순성
  - 직교성
  - 제어문
  - 데이터 타입과 구조
  - 구문 고려사항

##### 단순성 (전반적인 단순성 Overall Simplicity)

- 언어 기본 구조가 복잡할수록, 배움이 어려워지고, 가독성을 해친다
- 특징 다중성 Feature Multiplicity, 연산자 중복 Operator Overloading
- 단순성 = 가독성
- But 극단적인 단순성 != 가독성, I.E. Assembly

##### 직교성 Orthogonality

- 기본 요소들을 조합하여, 새로운 제어나 데이터 구조를 생성할 수 있는 능력
- 기본 데이터 타입과 타입 연산자 (배열, 포인터)로

- 직교성은 단순성에 영향을 준다
  - 많은 기본 구조 \< 적은 기본 구조 x 조합 규칙(=직교성)

##### 제어문

- 충분한 제어문이 제공되어야
- I.E. for가 적합한 상황에서, while만 제공된다면

##### 데이터 타입과 구조

- 충분한 데이터 타입과 구조가 제공되어야
- I.E. C, 0과 1로 Boolean 표현 (가독성 낮음)

##### 구문 설계 Syntax Design

- 특수어 Special Word
  - 특수어는 가독성에 영향을 준다
    - I.E. C/C++, ;, 단순성
    - I.E. Ada, end if, end loop, 가독성
  - 특수어를 Identifier로 사용이 가능한가?
    - I.E. Fortran, 가능 (가독성 낮음)

- 형식과 의미
  - 문장의 형태 == 문장의 목적, 가독성
  - 같은 형식, 다른 의미는 가독성 낮춤
    - I.E. C/C++, 문맥에 따른 static

---

#### 작성력 Writability

- 프로그램 목적에 대해, 언어 작성 난이도
  - I.E. Visual Basic, GUI 작성에 적합
  - I.E. C, System SW 작성에 적합
- 가독성과 비례

극단적 직교성 != 작성력  
컴파일러가 탐지할 수 없는 오류 가능성  

- 추상화의 지원
  - 프로세스 추상화 - 부프로그램 지원?
  - 데이터 추상화
    - 요구되는 자료구조를 쉽게 구현할 수 있는 요소 제공

- 표현력
  - 문제 표현에 있어 편리한 방법 제공 여부
  - I.E. i = i + 1, i++
  - I.E. Ada, Short-Circuit, and then Boolean Operator

---

#### 신뢰성 Reliability

- 모든 조건/상황에 대해, 주어진 명세 수행 여부
- 언어 특징
  - 타입 검사
  - 예외 처리
  - 별칭
  - 가독성과 작성력

##### 타입 검사

- CompileTime 타입 검사
  - Runtime 타입 검사에 비해 Cost 적음
- Runtime 타입 검사
- I.E. 1978 C, 매개변수 타입 검사 lint

##### 예외 처리

- Runtime 오류를 수정하고, 실행을 계속할 수 있는 능력
- 논리 오류 말고도, 외부적인 요인 (I.E. 네트워크 이슈)

##### 별칭

@ ????  

- 동일한 기억 장소에 대해, 여러 참조 방법을 갖는 것
- 신뢰성을 저해하나, 대부분 언어에서 제공
- 부족한 데이터 추상화 기능 보완
- I.E. type def

---

#### 비용

- 언어 구현 (컴파일러)
- 교육
- 작성, 컴파일, 실행
- 신뢰성 부족, 유지보수

#### ETC

- 이식성 : 언어의 표준화, 다른 언어와의 호환성
- 일반성 : 응용 분야에 대한 적용성
- 분명성 : Docu 수준

---

### 💫 언어 설계에 영향을 주는 요소들

---

- 컴퓨터 구조
- 프로그래밍 방법론

#### 컴퓨터 구조

- 폰 노이만 구조 Von Neumann Architecture
  - 프로그램 내장 방식 (메모리에 명령어/데이터 저장)
    - VS 프로그램 외장 방식 (기계 자체에)
  - 명령어의 순차적 실행, CPU Cycle (인출, 해석, 실행)

- 명령형 언어 Imperative Language
  - 기계 구조 관점에서 모델링된 폰 노이만 구조 기반 언어
  - 변수, 배정문 Assignment, 반복문
  - (효율 측면에서) 명령형 언어 > 함수형 언어, 논리형 언어

#### 프로그래밍 방법론

- SW 개발 방법론 -> 언어 설계에 영향

- 60말, 구조화 프로그래밍 운동
  - HW 비용 감소, 인건비 증가
  - 하향식 설계, 기능 단위 단계적 세분화 (서브 프로그램, 함수, 프로시저, 메소드)
  - !GOTO
- 70말, 프로세스 -> 데이터-지향 방법론 (데이터 추상화)
- 80초, 개체지향 방법론

@ 3차시  

### 💫 추상화

---

실젝적, 구체적 개념을 요약/숨겨 보다 높은 수준의 개념을 유도하는 과정  

- 추상화 Abstraction (명령형 언어에서)
  - 데이터 추상화
  - 제어 추상화

#### 데이터 추상화 Data Abstraction

- 기본 추상화
  - 변수 (데이터 메모리 주소), 자료형
- 구조적 추상화
  - 연관된 데이터 모음
  - 배열, 레코드 (구조체)

#### 흐름 제어 추상화 Flow Control Abstraction

- 기본 추상화
  - 기계 명령어 여러 줄 요약
  - 대입문 x = x + 3 \<- (Load, Add, Store), Goto \<- Jump
- 구조적 제어 추상화
  - 중첩된? 기계 명령어 요약
  - if, switch, for, while 등
  - 중첩되어 사용될 수 있음
    - I.E. 중첩 for문, While 안에 For, ...
- 함수, 프로시저, 메소드
  - 기능을 하나의 이름으로 요약

기계에 대한 추상화/요약 관점 제공  

#### 추상 자료형

- (데이터 + 관련 연산) 캡슐화 정의한 자료형
- I.E. C++ 클래스; Stack, Queue, Deck, ...

@ TODO : border-color 색  

### 💫 구문론과 의미론

---

#### Syntax, Semantics

Syntax 구문론 (형태, 모양, 문법)  
-> The `form` of expressions, statements, and program units  

Semantic 의미론  
-> The `meaning` of expressions, statements, and program units  

I.E.  
-> while (bool) statement  
-> 위 명령어의 문법, 의미  

#### 언어 Description 기술의 문제점

프로그래밍 언어를 간명하게/이해하기 쉽게 기술하는 것은 어렵지만 필수적  

- 언어 기술 독자의 다양성
  - 초기 평가자 : 기술의 명료성 중요
  - 구현자 : 기술의 완전성과 정확성 중요
  - 사용자 : 참고 메뉴얼의 제공

Syntax와 Semantics는 서로 밀접한 관련

언어 설계가 잘되었다면 해당 언어로 작성된 문장의 의미(Semantics)를 구문(Syntax)으로 부터 직접 파악되어야 함  
-> 문법에서 의미를 바로 알 수 있어야  

Syntax를 기술하는 것이 Semantics를 기술하는 것보다 쉽다.

언어의 Syntax를 명확하고 공통적으로 받아들여지는 기술 양식(방법)이 존재하지만 언어의 Semantics의 경우 아직까지 이를 명확하고 공통적으로 받아들여지는 기술 양식(방법)이 존재하지 않음

#### Syntax 정의의 문제점 (해결 과제)

Lexeme(어휘 항목)
코드 최소 구분 단위 (Syntax 기준)  

@ 컴파일러 만들 때, Lex (Lexeme 구분해주는) & Yacc (Parser)  

프로그래밍 언어의 형식적(Formal) 기술(Description)에서 Lexeme은 포함되지 않음  

프로그래밍 언어의 Syntax (혹은 Grammar)의 기술에 포함되지 않음
어휘 항목은 여러 개의 그룹으로 나뉘며, 이렇게 나뉘어진 그룹은 토큰으로 대표(분류) 됨  

Token(토큰)  
의미적으로 구분되는 최소 단위  

어휘 항목에 대한 한 부류  
I.E. C, 6개의 토큰 (Identifier, Keyword, Constant, String literal, Operator, Separator)  

@ Parse 트리를 만드는데, 안 만들어지면 문법 오류  

프로그래밍 언어 정의 방법
-> 언어 인식기, 언어 생성기

언어 인식기
-> 정의된 문법으로부터 언어 L을 정의하고 주어진 문자열이 L에 포함되는지 판단, 컴파일러의 어휘 분석기(Lexical Analyzer)와 구문 분석기(parser)에서 사용  

언어 생성기  
-> 정의된 문법으로부터 언어 L을 생성하는 장치  

#### Syntax Description 구문 기술의 Formal 형식적 방법

(Programming Language의)  
Syntax Description 구문 기술의 Formal 형식적 언어 생성 매커니즘  

Chomsky Hierarchy  
Type-0, Unristricted Grammer  
Type-1, Context Sesitive Grammer  
Type-2, Context Free Grammer  
Type-3, Regular Grammer  

Programming Language와 Context-Free 문맥 자유 문법  
-> Token들의 형태는 Ragular Grammer로 기술 가능, Lex(Lexeme Analyzer Program)  
-> Syntax는 몇 가지 사항만 제외하면 Context-Free 문법으로 기술 가능  

Meta Language - 다른 언어를 기술하는 언어  
BNF, Backus-Nour Form 형식  
-> 프로그래밍 언어를 위한 메타 언어, 구문 구조에 추상화를 사용
-> Bakus - John Bakus, ALGOL 58 기술  
-> Nour - Peter Naur, ALGOL 60 기술 위해 수정  
-> Context-Free 문법과 거의 동일  

Rule 규칙, Production 생성  
(LHS, Left-Hand Side)에서 (RHS, Right-")로 연결(유도) 하는 것  
LHS -> RHS  
(정의하려는 추상화) -> (정의 - Token, 어휘항목, 다른 추상화)  
I.E. \<assign> -> \<var> = \<expression>  

@ Terminal 끝난, 변하지 않는  

Nonterminal Symbol  
-> 추상화된 대상  
-> 두 개 이상의 다른 정의를 가질 수 있음  

Terminal Symbol  
-> 규칙에 포함된 어휘 항목과 토큰  

가변 길이의 리스트를 표현할 때 (BNF에서는) Recursive 재귀 사용  
I.E. \<ident_list> -> identifier | identifier, <idnet_list>  

문법과 유도  

문법, 언어를 정의하기 위한 생성 장치  

Start Symbol  
-> 언어의 문장들 생성을 위한 최초의 시작점을 나타내는 특정 논터미널
-> 프로그램 전체를 나타내며 흔히 \<program> 으로 명칭

Derivation 유도  
-> 문장을 생성하기 위해 일련의 규칙을 적용하는 것  

시작 기호 \<program>으로부터 정의된 문법을 이용하여 문장들을 유도하며 유도는 문장형태가 어떠한 논터미널도 포함하지 않을 때까지 수행  

I.E.  

begin A = B + C; B = C end  

```BNF
<program> -> begin <stmt_list> end
<stmt_list> -> <stmt> | <stmt> ; <stmt_list>
<stmt> -> <var> = <expression>
<var> -> A | B | C
<expression> -> <var> + <var>, <var> | <var> | <var>
```

begin A = B * A + C end  

```BNF
<assign> -> <id> = <expr>
<id> -> A | B | C
<expr> -> <id> + <expr> | <id> * <expr> | (<expr>) | <id>
```

Leftmost Derivation 최좌단 유도  
-> 이전 문장 형태에서 왼쪽 논터미널부터 유도(대체)  
-> 최종적으로 모든 논터미널이 없도록  

Parse Tree  
-> Subtree는 문장에 포함된 추상화의 사례  

문법의 모호성  
Parse Tree != 1개 (어떤 유도든 간에)  

컴파일러는 구문 구조로 의미를 파악하기 때문에, 주어진 문장이 두 개 이상의 파스 트리가 구축될 경우 의미를 결정할 수 없음  

-> 파서 설계자가 비문법적 올바른 파스 트리를 구성  
-> 재작성  

연산자 우선 순위  
낮은 곳에 위치한 항목들이 먼저 계산  

연산의 결합 규칙  
동일 우선 순위 연산자들 중 어떤 연산자가 먼저 계산되는지  

좌결합 규칙  
좌순환적 표현  
RHS 시작위치에 LHS가나타나는 경우  
중요한 구문분석 알고리듬을 허용하지 않음
좌순환 제거하던지, 비문법적 요소로 컴파일러에서 지원

우결합 규칙
좌순환적 표현  
LHS가 RHS의 오른쪽 끝으로 나타나는 경우  

\<factor>-> \<exp> ** \<factor> | \<exp>  
\<exp> -> (\<expr>) | id  

@ TODO : 저번에 노트북 배터리 없어서 기록 못함  

컴파일

1. C Source File (Temp.c)
2. 전처리된 C Source File (Temp.l)
   - By C Preprocessor
3. Assembly Code File (Temp.S)
   - By C Compiler
4. Object Code File (Temp.o)
   - By Assembler
5. Executable Code File (Temp)
   - By Linker

컴파일러 과정

1. Source Program
2. Lexical Analyzer
   - 코드 해석, Token 분해
   - Scanner, Tokenizer
   - Source Code -> Tokens, By Lex
3. Syntax Analyzer
   - Tokens -> Syntax Tree, By Yacc
   - Rule 항목(Like BNF)으로 부터 Parser 생성
   - Parser
     - 구문 분석
     - 구문 구성 성분의 위계 관계 분석 -> 문장 구조 결정
4. Semantic Analyzer
5. Intermediate Code Generator
6. Code Optimizer
7. Code Generator
   - Syntax Tree -> Generated Code

모든 과정에 Symbol-Table Manager가 컴파일러를 도움  
Error 발생 시 Error Handler가 처리  

Lexical Analyzer  
유한 오토마타로 작성할 수 있지만, 어렵고 복잡하기 때문에 Lex 이용  

실습  
Linux (VM), Lex, Yacc, Lex File Format, Python Tokenize Module ~  

### 💫 Parse

---

Parsing  
Syntax Analysis 주어진 구문을 분석 하는 과정  

Parser  
주어진 프로그램의 구문 분석을 담당  
주어진 프로그램의 Parse Tree를 구성  

Parse Tree  
번역을 위한 기반으로 사용  

#### 구문 분석의 목적 (Parser 역할)

- 입력 프로그램을 검사하여 구문적으로 올바른지를 판단
  - 오류가 발견되면 진단 메시지를 생성 및 복구
  - 최대한 많은 Error 발견
- 구문적 오류가 없는 프로그램에 대해서는 완전한 파스 트리를 구축

#### Parser 분류

Top-Down, Bottom-Up Parse

- Top-Down 하향식
  - Root Node로부터 Leaf Node로 Parse Tree 생성
  - Leftmost Derivation 최좌단 유도 같은 순서
    - 재귀-하향파싱, LL 파서

- 재귀-하향 파싱
  - 재귀적인 Subprogram 부프로그램으로 구성
  - 하샹식 순서로 Parse Tree 구축
  - EBNF 구축에 적합
  - 문법의 각 NonTerminal에 대해 한 개의 부프로그램을 갖는다
    - 입력 문자열이 주어질 때, 부프로그램에서 해당 논터미널을 루트 노드로 가지며, LeafNode들이 그 입력 문자열과 매칭되는 ParseTree를 추적
  - 전역 변수 nextToken : 다음 번 토큰을 의미
    - 파싱할 때 항상 다음 토큰을 미리 본다

- LL 파서
  - L 왼쪽에서 시작하며, L 좌측 유도 방식으로 파싱
  - 약점
    - Left Recursion 좌순환
      - 직접 좌순환 : A -> A + B
        - A가 자기 자신 호출, Stack Overflow
      - 간접 좌순환 : A -> BaA, B -> Ab
        - 결국 A가 자기 자신을 호출하는 부분 발생
      - 상향식 파싱 알고리듬은 이런 일 없음
  - 하향식 파서는 최좌측 논터미널에 의해 생성되는 첫번째 토큰만을 사용, 파서가 입력의 다음번째 토큰에 기반하여 항상 올바른 RHS를 선택할 수 있는가가 하향식 파서의 구축에서 중요
    - Pairwise Disjoint Test 집합쌍 공통 테스트로 검증 가능

- Pairwise Disjoint Test 집합쌍 공통 테스트
  - 주어진 문법으로 Top-Down Parsing이 가능한지 판단하는 테스트
  - Top-down parsing의 절차는 lookahead 값을 이용하여 올바른 RHS를 결정하는데 이때 집합쌍 불일치 테스트를 만족하지 못하면 올바른 RHS를 선택할 수 없다.

- Bottom-Up 상향식
  - Leaf Node로부터 Root Node로 Parse Tree 생성
  - Rightmost Derivation 최우단 유도의 역순
    - 이동-감축 알고리듬, LR 파서

- 상향식 파서의 파싱 문제
  - 식 id+id*id 에 대한 최우단 유도
  - 상향식 파싱은 최우단 유도의 역순으로 수행
    - 이전 단계 문장을 얻기 위해 상응하는 LHS로 재작성되는 RHS
  - 상향식 파서의 역할
    - 이전 문장 형태를 만들기위한 특정 규칙(handle)을 발견하는 것

- 이동-감축(Shift-Reduce) 알고리즘
  - 모든 상향식 파서를 구축하는데 활용되며 스택을 이용하여 구축
  - 상향식 파서의 입력은 토큰 스트림이며 출력은 발견된 문법 규칙
  - 동작
    - 이동(Shift) - 다음번째 입력 토큰을 스택으로 이동
    - 감축(Reduce) - 스택의 꼭대기에 위치한 RHS를 상응하는 LHS로 변경

@ ~ 푸시다운 (아래에서 확인)  

- LR 파서
  - 좌측(L)에서 시작하여 우측(R)유도 방식으로 파싱
  - 장점
    - 상대적으로 작은 파서코드와 파싱 테이블로 구성
    - 모든 프로그래밍 언어에 대한 파서를 생성할 수 있다.
    - 왼쪽에서 오른쪽 순서로 검사가 가능하므로 조기에 구문 오류를 감지할 수 있다.
    - LL 파서로 처리 가능하면, LR 파서도 처리 가능
      - @ LL 단점 (Left Recursion, Stack Overflow) 없음
      - @ LL 상위 호환인데 코드도 작음
  - 단점
    - 파싱 테이블을 수작업으로 구축하기가 어렵다.
      - Yacc, 문법을 입력받아서 파싱테이블을 자동으로 생성
      - @ LL 상위 호환인데 단점도 극복 가능

- LR 파싱 테이블
  - Action과 Goto로 구성
  - Action
    - 파서의 행동을 기술하고 있음
    - 행은 상태기호를 열을 터미널 기호를 가짐
    - 파서의 꼭대기에 현재 상태를 저장하고 다음번 입력 터미널을 보고서 무엇을 해야 하는지를 판단
      - 이동(Shift): 다음번째 입력을 스택으로 이동
      - 감축(Reduce): 스택 꼭대기의 상태를 LHS로 감축
      - Accept: 파싱을 성공적으로 완료
      - 오류: 오류 처리루틴을 호출
  - Goto
    - 행은 상태기호를 열은 논터미널 기호를 가짐
    - 감축이 되고난 후 (핸들이 스택에서 제거되고 새로운 논터미널이 스택에 저장 됨을 의미) 어떤 상태 기호가 저장되어야 하는지를 나타냄

- 푸시다운(Pushdown) 오토마타 (Context-Free 문법에 대한 인식기)
  - 프로그래밍 언어에 대한 모든 파서는 푸시다운 오토마타
  - 재귀-하강, 이동-감축 파서도 푸시다운 오토마타에 해당

#### Parse Algorithm 복잡도

임의의 모호하지 않는 문법에 대한 파싱은 O(n^3)  
다양한 기법을 활용하여 상업적 파서의 복잡도 O(n)으로 줄임  

---

Program과 Process  

Program : Code(Text), Data  
Process : Code(Text), Data + Stack, Heap  

메모리에 프로그램 그대로 올라가고,  
메모리에 동적으로 Stack과 Heap 할당  

Code(Text) : 컴파일된 코드  
Data : External, Static, 전역변수  
Stack : 매개변수, 함수 호출 위치 (돌아갈 곳), 지역변수  
Heap : 메모리 할당, new 등  

4기가 가상공간 (32bit Linux 기준)  
1기가 OS/커널 영역 + 3기가 유저 영역(프로세스가 들어가는 곳)  

모든 프로세스는 자기가 3기가 유저 영역에 혼자 존재하는 줄 앎  
멀티 프로세스는 OS/커널 영역에서 유저 영역에 있는 프로세스를 스위칭 하는 것  

Data  
Symbol Table에서 구분한 전역변수, Static 변수가 들어감  
변수 선언 -> Symbol Table에서 구분 -> Data 영역에 저장  
이 때 변수 이름 I.E. x 는 사라지고, 이는 메모리 주소가 대신함  

Stack  
-> 스택(시스템) 위-아래, 스택(자료구조) 아래-위  
-> Main 함수부터 쌓기 시작  

Stack에 데이터 쌓다가

BRK 넘어가면  
Segmentation Fault Error  

---

#### 컴파일과 실행 단계  

@ 언어 디자인 단계  
@ 컴파일러 구현 단계  

- Editor or IDE (Edit Time) : 1. Write Source Codes
  - Source codes (.c), Headers (.h)
- Preprocessor (Build)  : 2. Preprocess
  - Included files, replaced symbols
- Compiler (Compile Time)(Build) : 3. Compile
  - Object codes (.obj, .o)
- Linker (Link Time)(Build) : 4. Link Edit
  - By Static Libraries (.lib, .a) -> Excutable Code (.exe)
- Loader (Load Time)(Run) : 5. Load
  - By Shared Libraries (.dll, .so)
- CPU (Run Time)(Run) : Execute
  - By Input -> Output

Linker 전 : Static 정적, 프로그램  
Linker 후 : !정적, 프로세서  

Preprocess  
gcc -E -P main.c  

Compile  
gcc -S main.c  
gcc -c main.c  

Link  
gcc main.o -o main  
