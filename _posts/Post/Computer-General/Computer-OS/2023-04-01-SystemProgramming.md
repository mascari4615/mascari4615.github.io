---
title: "🌖 시스템 프로그래밍"
date: 2023-04-01. 00:00 # ?
# last_modified_at: 2023-11-17. 09:33
last_modified_at: 2023-11-26. 01:03
categories: ⭐Computer 🌖Computer-OS
---

### 🫧 ㅇ

- 1.2 컴파일 시스템
  - 목적 프로그램
    - 재배치 가능 목적 프로그램 → 목적 파일
    - 실행 가능 목적 파일 → 실행 파일
  - Unix 컴파일
    - gcc -o hello hello.c
    - @ GNU Project
      - @ Free SW : "free" as in "free speech", not "free beer"

- 1.3 컴파일 시스템의 이해
  - 프로그램 성능 최적화
    - 기계어 수준 코드 이해
    - switch vs if-else, while vs for
  - 링킹 에러의 이해r
    - Link-Time Error, Compile-Time Error
  - 보안 약점 회피
    - 버퍼 오버플로 버그 Buffer Overflow Bugs
    - 인터넷과 네트워크 상의 보안 약점 - security holes

- 1.4 컴퓨터 시스템 - 하드웨어 구성
  - CPU
    - CPU operations
    - 적재Load - 작업Operate - 저장Store - 점프Jump
  - The process of Loading "hello" Code from KeyBoard... @
  - The process of Loading Executable File from Disk to MainMemory... @
  - The process of Printing Output Stream from Memory to Monitor

- 1.8 Computer System & Network

- 1.9 Hot Topics
  - Amdahl's law
    - 컴퓨터 시스템의 일부를 개선할 때 전체적으로 얼마 만큼의 최대 성능 향상이 있는지 계산하는 데 사용
    - 어떤 시스템을 개선하여 전체 작업 중 a%의 부분에서 k배의 성능이 향상되었을 때 전체 시스템에서 최대 성능 향상
    - → 뭘 최적화 시켜야 더 효율적인가?
  - 동시성 프로세스 : 하나의 프로세서에서 다수의 프로세스 실행
  - 하이퍼 스레딩
    - 하나의 프로세서가 두 개의 논리적 프로세스처럼 작동하도록 함
    - 컴퓨터 처리속도 향상
    - i7에 적용
  - Abstraction of Computer System
    - Virtual Machine - OS
      - Processes
        - Instruction Set Architecture - Processor
        - Virtual Memory - Main Memory
          - Files - I/O Devices

### 💫 2

---

- Two's complement representation (Covered Later)
- Solaris/SUN, Linux/x86-86, Linux/Alpha, IA32
- Different Machines Follow Different Conventions
  - Word Size
  - Byte Ordering
  - Representations (Integer, Floating-point)
- String
  - C
    - 문자들을 배열로 표시
    - 아스키 형식으로 인코드
      - 문자 집합을 표준 7-bit 인코딩
      - 문자 "0" = 코드 0x30
        - 10진수 숫자 n = 코드 0x30 + n
      - 문자열 String 은 null 값으로 종료
        - Final Character = 0x00
  - 호환성 문제
    - Byte Ordering 은 문제가 안됨
      - 데이터는 1 Byte 크기
- ASCII
- Be Aware Of...
  - Type Casting & Mixed Signed/Unsigned Expressions
  - Overflow
  - Error Propagation
  - Byte Ordering

정보의 표현과 처리  

Bits and Bytes  

### 2.1.5 코드의 표현

프로그램은 명령들을 그 순서에 맞게 부호화한 것이다.  

명령은 산술연산, 메모리 읽기/쓰기, 조건 분기등의 개별적 단순 연산으로 구성된다.  

명령은 바이트들로 부호화된다.  
→ Alpha, Sun, Mac은 4-Byte 명령들을 사용 : RISC, Reduced Instruction Set Computer  
→ PC는 가별 길이 명령들 사용 : CISC, Complex Instruction Set Compute  

서로 다른 컴퓨터들 → 서로 다른 부호화 방식
→ 이진코드는 대부분 호환성 없음

근본 개념 → 프로그램 역시 바이트의 연속 Byte Sequences

- C 함수 → 컴파일 → 기계어
  - Machine Code (Byte Representations)
    - Linux 32, Windows, Sun, Linux 64, ...
    - 서로 다른 컴퓨터들은 완전히 서로 다른 명령과 인코딩 방식 사용

- 명령의 표현
  - Sun은 2, 4-Byte Instructions 사용
  - PC는 길이가 1, 2, 3-Byte들을 갖는 명령들 사용
    - Windows / Linux는 완전한 바이너리 호환성 Binary Compatibility 을 제공 못함

### 2.1.6 불 대수 - Boolean Algebra

- 논리의 대수적 표현
  - True = 1, False = 0 으로 부호화
  - 집합 { 0, 1 } 에 대해서 정의

[Bit Wise Operate](https://mascari4615.github.io/posts/Bitwise-Operator/)  

---

@ 221015  

show_bytes 실행 예제  

```c
int a = 15213;
printf("int a = 15213;\n");
show_bytes((pointer) &a, sizeof(int));
```

```Assembly
int a = 15213;
0x11ffffcb8 0x6d → 0110 1101
0x11ffffcb9 0x3b → 0011 1011
0x11ffffcba 0x00
0x11ffffcbb 0x00
```

@ 221021  

2.2 정수의 표현  

### 2.2.1 C 정수 표현

- 여러 정수형 데이터 타입 지원
- 부호 없는 정수, unsigned 수식어
- 부호 있는 정우, Signed number representations
  - 비 대칭 범위를 가짐
  - 음수 범위가 양수범위보다 1 큼
  - 2의 보수(부호형) 인코딩
    - 부호 비트, 0 양수, 1 음수
  - 부호 여부에 따른 인코딩
    - 양수는 부호 여부 관계없이 똑같음
    - 음수는 부호 여부에 따라 다름

### 2.2.2 C 정수 변환, 캐스팅

- 비부호형과 부호형 간의 변환 Castings
  - T2B → B2U, B2U → T2B
  - 비트 패턴은 유지됨
  - 양수는 불변 (부호 여부 관계없이 똑같으니까)
  - 음수는 큰 양수 값으로 변화, (비부호형의 최대값 + 1 = 2^비트수)만큼의 변화
  - (int) or (unsigned)
- 상수 값 뒤에 U 접미사 붙이면 Unsigned
- 단일 수식(비교 연산 포함)에 부호형 비부호형 혼합시, 묵시적으로 부호형 비부호형으로 변환

### 2.2.3 C 확장, 절삭

- Zero Extension, 비부호 정수에 0 복제하여 확장하기
- Sign Extension, 부호 정수에 부호비트(MSB) 복제하여 확장하기
- 작은 정수 데이터 형에서 큰 데이터 형으로 변활할 때 수행

- 숫자 절삭으로 값이 변경될 수 있음 → 오버플로의 형태
- 비부호 숫자 x에 대하여, x를 k 비트 만큼 절삭 = x mod 2^k
- 부호 숫자, mod와 유사하게

### 2.3 정수산술연산

- 실제 합 w+1 bits 요구됨

- 비부호형 덧셈
  - Carry 출력 무시 → Modular

- 부호형 덧셈
  - MSB 버림, 나머지 비트들은 2의보수로서 정수를 다룸
  - 양수 음수 오버플로 시 +- 2^(w-1)

- 2의 보수 반전 (보수 & 증가)
  - ~x + 1 == -x (덧셈의 역원 additive inverse = 0)
  - ~x + x == 1... == -1
  - 0
  - ~0 = 1... == -1
  - ~0 + 1 = 0... == 0

- 곱셈
  - 비부호형 : 2w까지 필요
    - i.e. 111 * 111 = 110001
  - 부호형
    - 최솟값(음수) : 2w-1
      - i.e. 100 * 011 = 001100
    - 최댓값(양수) : 2w (최솟값)^2 인 경우에만
      - i.e. 100 * 100 = 010000
  - 비부호, 실제곱 2*w, 상위 w 비트 무시, 모듈러 연산 적용됨
  - 부호, 실제곱 2*w, 상위 w 비트 무시, 비부호 결과와 하위 비트들은 동일
  - 상수를 사용한 곱셈
    - u << k = u * 2^k
    - u << 3 = u * 8
    - u << 5 - u << 3 = u * 24
    - 대부분 쉬프트와 덧셈이 곱셈보다 빠름
      - 컴파일러가 곱셈을 쉬프트 연산 코드로 자동 생성

```c
int mul12(int x)
{
	return x * 12;

	// 아래와 같이 컴파일 된다
	__asm
	{
		leal (&eax, %eax, 2), %eax
		sall $2, %eax
	}

	// 아래와 같은 의미
	// t ← x + x * 2
	// return t << 2
}
```

- 2의 거듭제곱 나눗셈
  - 결과 내림
    - i.e. 3.14 = 3, -3.14 = -4

- Modular 산술 연산 형태로 수행
  - 워드의 길이가 유한
  - 가능한 값의 범위가 제한
  - 연산 결과과 Overflow일수도 잇음
- 비부호형과 부호형(2의보수 방식)
  - 동일한 비트패턴을 가짐

---

gcc -o temp.c 실행 가능 목적 파일 (실행파일, object, 링크까지 끝난)  
gcc -c temp.c 재배치 가능 목적 파일 (목적파일, 링크는 없는 그냥 목적 파일)  

Concurrent Process 병렬 프로세스  

어셈블리 특성 : 연산

레지스터나 메모리 데이터로 산술함수 수행  
ALU에서 연산을 하려면 데이터 필요  
레지스터에 있으면 레지스터에서
메모리 데이터에 있으면 메모리 데이터에서 데이터를 읽어 산술함수 수행

메모리와 레지스터 사이에 데이터 전송 (버스를 통해)

- Memory to CPU, 메모리에서 레지스터로 데이터 전송 (Load)
- CPU to Memory, 레지스터 데이터를 메모리에 저장 (Store)

전송 제어 (Transfer control)

- 프로시저까지 또는 프로시저에서 무조건 점프, 무조건 분기 like goto (to/from procedures)
- 조건 분기 if else (conditional branch)

요즘 프로그래밍 언어
스트럭쳐드 프로그래밍  
goto가 없음

근데 어셈블리는 있다

---

목적 코드 생성

Linux, gcc -Og -c sum.c

-c 옵션  

as에 의한 어셈블까지만 수행  
링크는 미수행  

sum.o 파일 산출  

14바이트 안에 sum의 목적코드 내장 (해보니까 14바이트라는 뜻)  

-Og
최적화 명령어

---

목적코드

슬라이드 참고 - Code for sumstore, 이전에 봤던 어셈블리 코드를 머신코드로 바꾼 것  
시작 어드레스부터 1++ 바이트만큼 떨어진 위치에 각각 코드가 위치한다  

어셈블러 (Assembler)  
.s를 .o로 번역  
명령어 각각을 이진 인코딩  
거의 완벽한 실행 코드  
다른 파일들과의 코드 연결 (linkages)은 빠짐  

링커 (Linker)  
파일들 사이의 참조를 해결  
정적 런타임 라이브러리와 조합 (i.e. code for malloc, printf)  
일부 라이브러리들은 동적으로 연결 (Dynamically Linked), 프로그램 실행 시 링킹 발생  

---

sso
인증 관련한
바디 페이로드 차이??
메시지 타입을 정의할 ㄸ ㅐ바이트 혹은 비트 단위로 필드를 다눠서 할 수도 잇고
HTTP는 요처아이낳고 헤더부분하고 가 다르게 들어가잖아요?
문자열 스페이스두고 URL 들어가고 버전 메소드 URL ㅣㅇ런식으로
무튼 2가지 방법이 있다
비트/바이트 방법
텍스트 방법 (http)
대부분은 http처럼 텍스트 기반으로 만들고 있따
경랑 디렉터리 접근 프로토롤
LDAP
전화번호부 책
LDAP은 전화번호부라고 보면된다
네트워크에 자원이 많이 있을텐데 이를 효율적으로 관리하기 위한
표준으로도 나옴
전기 통신 (전화와 관련된) 글너 표준을 만든 단체 ITU에서 만든 표준잉 X.500
X.500 을 기바느올 만들어진프포토콜인 LDAP
FIND PRINT 여러가지 하드웨어 리소스들이 있을 텐데 어떻게 관리할것인지
개별적인 자원 식별자 들 (이름 부여)하고 그담에 그런 개별 자원에 접근할 때 어떤 권한을 가지고 접그낳ㄹ ㅜㅅ있는지
그런 자우너을 관리하는 관리자가 있다면 그러ㅁㄴ 관리자 ~ 까지 할 수 ㅣㅇ씩 헺는
MS에서도 OpenLDAP 마늠
윈도우에도 잇으ㅁ
무튼 파일 식별하려면 이름이 잇어야하잖아요
DNS처ㄻ 계층적으로 이름 공간을 구성해서 사용
엔트리가 개별 자원 = 고유 식별 이름
노드 별로 
노드에 할당된
ㄴ드를 연결해서
고유한 이름을 만들게 되는데
보게 되ㅣ면
dc = 도메인 컴포넌트
ou = 조직 단위
dn =
LDAP URL 다음시간에 설명할텐데
일반적으로 사용할 일은 없다
구체적인 내용은 기억하지 않아도되지만
LDAP이 마치 자원을 전화번호부처럼 써서 효율적으로 쓰기위한 프로토콜이다
라고 생각
원격 제어
팀 뷰어 같은
원격이 떨어져있는 사람의 컴을 제어하기 위한
원격 제어 그냥 이런 기능이 있따 정도로 기억

---

*dest = t;  
movq %rax, (%rbs)  
0x40059e: 48 89 03  

C Code  
dest가 지정한 곳에 값 t를 저장  

Assembly Code  
> 8 바이트 값을 메모리로 이동  
>> x86-64 용어로 Quad words  
> Operands
>> t: 레지스터 %rax
>> dest: 레지스터 %rbx
>> *dest: 메모리 M[%rbx]

r = register  

Object Code  
> 3 바이트 명령
> 주소 0x40059e에 저장됨

(범용 레지스터)  
64bit 16개  
32bit 8개  

실행 가능 파일 생성  
실행파일 생성하려면 링커 필요  
One object file must contain main  
Combines with static run-time livraries (e.g., printf)  
Some libraries are dynamically linked (i.e. at execution)  

Obtain with command C code  
gcc -Og -o prog main.c sum.c  

목적코드의 역 어셈블  
Disassembled  

Disassembler  
objdump -d sum.o  
목적코드 조사에 유용한 도구  
일련의 명령들 비트 패턴을 분석  
어셈블리 코드와 유사한 해석 산출  
a.out(complete executable) 이나 .o파일을 실행할 수 있음  

역어셈블의 다른 방법  
Within gdb Debugger  
gdb sumstore  
disassemble sumstore  
Disassemble procedure  
x/14xb sumstore  
Examine the 14 bytes starting at sumstore  

역어셈블 할 수 있는 것은?  
실행코드로 번역될 수 있는 것  
역어셈블리는 바이트를 조사하고 어셈블리 소스를 재구성  

Reverse  engineeering forbidden by MS End User License Agrement  

데이터 형식  

GAS (GNU 어셈블러)에서 "/"을 붙이는 데 문제 없음  
FP도 "/"을 붙임  
왜냐하면, FP(부동소수점)는 정수와 다른 연산과 레지스터를 가짐  
