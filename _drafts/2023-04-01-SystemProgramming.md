---
title: "🌑 시스템 프로그래밍"
date: 1999-01-01. 00:00
categories: ⭐Computer 🌑Computer-General
---

### 💫 1

---

- 배우는 것
  - 컴퓨터 작동 방식과 기본적 구성
  - 좋은 프로그래밍을 위한 성능 분석 방법
  - 최신 프로세서 (캐시, 파이프라인)에 영향을 미치는 문제

- 배우는 이유
  - 컴퓨터 과학자
  - 성능 좋은 SW
  - HW 구매 결정, 전문자로서 조언 제공

- 교과 내용
  - 컴퓨터 시스템의 전반적 개념
  - 프로그램 구조와 실행
  - 시스템에서 프로그램 실행 원리
  - 프로그램의 상호작용 및 통신

- 1.1 Info = Bit + Context

- 1.2 Compile System
  - 목적 프로그램
    - 재배치 가능 목적 프로그램 -> 목적 파일
    - 실행 가능 목적 파일 -> 실행 파일
  - Unix 컴파일
    - gcc -o hello hello.c
    - @ GNU
      - @ Free SW : "free" as in "free speech", not "free beer"

- 1.3 Understanding of Compile System
  - Program Performance Optimization
    - Understanding of LLL
    - switch vs if-else, while vs for
  - Understanding of Linking Error
    - Link-Time Error, Compile-Time Error
  - Avoiding Security Holes
    - Buffer Overflow Bugs
    - Security Holes on the Internet and Networks

- 1.4 ComputerSystem-HW Configuration @
  - CPU
    - CPU operations
    - Load - Operate - Store - Jump
  - The process of Loading "hello" Code from KeyBoard... @
  - The process of Loading Executable File from Disk to MainMemory... @
  - The process of Printing Output Stream from Memory to Monitor

- 1.5 Cache Memory @

- 1.6 Memory Hierarchy @
  - L0 Regs : CPU Registers hold words retrieved from cache memory
  - L1 Cache (SRAM) : " Cache Lines "
  - L2 Cache (SRAM) : " Cache Lines "
  - L3 Cache (SRAM) : " Cache Lines "
  - L4 Main Memory (DRAM) : " Disk Blocks "
  - L5 Local Secondary Storage (Local Disks) : " Files " Disks on remote network servers
  - L6 Remote Secondary Storage (Distributed File Systems, Web Servers)

- 1.7 OS
  - OS
    - Computer System Hierarchy @
      - SW : App Programs
      - SW : **Operating System**
      - HW : Processor, Main Memory, I/O Devices
    - Abstraction of OS
      - { Processes
        - Processor
        - { Virtual Memory
          - Main Memory
          - { Files
          - I/O Devices
  - OS - Process
    - Context Switching @
  - OS - Thread
    - [Multi Thread](https://en.wikipedia.org/wiki/Multithreading_(computer_architecture)) : ability of a processor to provide multiple threads of execution concurrently
    - [Thread](https://en.wikipedia.org/wiki/Thread_(computing)) : smallest sequence of programmed instructions
  - OS - Virtual Memory @
  - OS - File @

- 1.8 Computer System & Network

- 1.9 Hot Topics : Amdahl's law
  - 컴퓨터 시스템의 일부를 개선할 때 전체적으로 얼마 만큼의 최대 성능 향상이 있는지 계산하는 데 사용
  - 어떤 시스템을 개선하여 전체 작업 중 a%의 부분에서 k배의 성능이 향상되었을 때 전체 시스템에서 최대 성능 향상
  - 동시성 프로세스 : 하나의 프로세서에서 다수의 프로세스 실행
  - 하이퍼 스레딩
    - 하나의 프로세서가 두 개의 논리적 프로세스처럼 작동하도록 함
    - 컴퓨터 처리속도 향상
    - i7에 적용
  - Abstraction of Computer System
    - { Virtual Machine
      - OS
      - { Processes
        - { Instruction Set Architecture
          - Processor
        - { Virtual Memory
          - Main Memory
          - { Files
            - I/O Devices

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

- 2.1.5 코드의 표현
  - 코드 (기계수준)의 표현
    - 프로그램은 명령 Instruction 들의 순서로 부호화 Encode
      - 명령의 구성 : 개별적 단순 연산 Operation 으로 구성
        - 산술연산 Arithmetic Operation
        - 메모리 읽기 또는 쓰기 Read or Write Memory
        - 조건 분기 Conditional Branch
      - Instructions는 Bytes로 Encode
        - Alpha, Sun, Mac은 4-Byte Instructions를 사용 : RISC, Reduced Instruction Set Computer
        - PC는 가별 길이 명령들 사용 : CISC, Complex Instruction Set Computer
      - 서로 다른 컴퓨터들 -> 서로 다른 부호화 방식
        - 이진코드는 대부분 호환성 없음
    - 근본 개념
      - 프로그램 역시 바이트의 연속 Byte Sequences
  - C Func -> Compile -> ML
    - Machine Code (Byte Representations)
      - Linux 32, Windows, Sun, Linux 64, ...
      - 서로 다른 컴퓨터들은 완전히 서로 다른 명령과 인코딩 방식 사용
  - 명령의 표현
    - Sun은 2, 4-Byte Instructions 사용
    - PC는 길이가 1, 2, 3-Byte들을 갖는 명령들 사용
      - Windows / Linux는 완전한 바이너리 호환성 Binary Compatibility 을 제공 못함

- 2.1.6 불 대수
  - Boolean Algebra @
    - 19세기에 조지 부울 George Boole 이 개발
    - 논리의 대수적 표현
      - True = 1, False = 0 으로 부호화
      - 집합 { 0, 1 } 에 대해서 정의
    - And, Or, Not, Exclusive-Or/XOR
  - 

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

드라이브보면 Programs File, Programs File (x86) 두 개  
64bit 운영체제에서 32bit도 돌아감  호환성  

C 대부분 32bit 컴파일러  

32bit 에서는 %r-- 가 아니라 %e--  

Reverse  engineeering forbidden by MS End User License Agrement  

데이터 형식  

"word" :  
인텔에서 16비트 데이터 형식 ("word" 의 기원)  
32bit : double word  
64bit : quad words  

GAS (GNU 어셈블러)에서 "/"을 붙이는 데 문제 없음  
FP도 "/"을 붙임  
왜냐하면, FP(부동소수점)는 정수와 다른 연산과 레지스터를 가짐  *dest = t;  
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

드라이브보면 Programs File, Programs File (x86) 두 개  
64bit 운영체제에서 32bit도 돌아감  호환성  

C 대부분 32bit 컴파일러  

32bit 에서는 %r-- 가 아니라 %e--  

Reverse  engineeering forbidden by MS End User License Agrement  

데이터 형식  

"word" :  
인텔에서 16비트 데이터 형식 ("word" 의 기원)  
32bit : double word  
64bit : quad words  

GAS (GNU 어셈블러)에서 "/"을 붙이는 데 문제 없음  
FP도 "/"을 붙임  
왜냐하면, FP(부동소수점)는 정수와 다른 연산과 레지스터를 가짐  

---

간단한 메모리 주소 모드

1. 참고
   - Reg[R] : 레지스터 R 안의 값
   - Mem[M] : 메모리 M 안의 값값

2. 표준모드 (R)
   - Mem[Reg[R]]
   - 레지스터 R은 메모리의 주소를 나타냄
   - C의 포인터 역참조 (Dereferencing)
   - movq (%rcx), %rax

3. 변위모드 D(R)
   - Mem[Reg[R]+D]
   - 레지스터 R은 메모리 구역의 시작 주소를 나타냄
   - 상수 변위 D는 오프셋을 나타냄
   - movq 8(%rbp), %rdx

오퍼랜드 형태
