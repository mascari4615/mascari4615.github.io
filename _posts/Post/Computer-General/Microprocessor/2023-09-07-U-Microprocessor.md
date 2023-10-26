---
title: "🌑 마이크로프로세서 과목"
date: 2023-09-08. 12:51
# last_modified_at: 2023-09-08. 12:51
# last_modified_at: 2023-09-15. 12:53
last_modified_at: 2023-10-20. 13:50
categories: ⭐Computer 🌑Computer-General
tags: Microprocessor
---

### 💫 2차시

---

7372800  

범용 입출력 포트  

`#include <avr/io.h>`  
에 메모리 맵 대응이 되어잇다  

Like  
-> #define PORTE \#(unsigned char)0x180  

레지스터 3개  
PORTL 이 중심?  

PORTL 출력  
PINL 입력  

DDRL = RORTL을 제어하기 위한 주소?  
데이터를 입력할지 출력할지 여부 결정  
Direction Register  

`DDRL = 0xff // 1 출력`  
`DDRL = 0x00 // 0 입력`  

GPIU?  

@ 25p  

### 💫 3차시

---

#### USART

Universal Synchronous and Asynchronous serial Receiver and Transmitter  
Synchronous 보다 주로 Asynchronous를 씀  

#### UDRn

USART Data register of the nth device  

하나의 8비트 레지스터를 I/O용으로 공유  
`UDR0 = x;`  
`x = UDR0;`  
I/O 동작에 따라 내부적으로 분리하여 인식  
I/O 동작을 위해서는 장치(디바이스) 초기화가 필요  

상대방에서 보내온 데이터가 저장되었다가 읽은 순간 소멸  
보낼 데이터를 쓰는 순간 전송이 시작됨  

#### UBRRnL, UBRRnH

USART Baud Rate Registers of the nth device  
16비트 통신 속도 bps bit per second 조정  

UBRRnL Low바이트  
UBRRnH High바이트  

UCSRnA  
USART Control and Status Register A of the nth device  
Bit 1 : U2Xn(Double the Transmission Speed of the nth device)  
설정된 통신 속도의 2배 송수신 여부  

UCSRnB  
USART Control and Status Register B of the nth device  
Bit 3 : TXENn(Transmitter Enable of the nth device)  
송신 기능 활성화 여부  

#### 비트 연산 매크로 (bit on/off)

sbi(byte b, int n) : Set Bit  
8비트 변수 레지스터 b의 n번 비트를 1로 변경 (on)  
I.E. sbi(UCSR0A, U2X0) : UCSR0A 레지스터의 U2XN(==1)번 비트를 1로 변경  

cbi(byte b, int n) : Clear Bit  
8비트 변수 레지스터 b의 n번 비트를 0으로 변경 (off)  
I.E. cbi(UCSR0B, TXEN0) : UCSR0B 레지스터의 TXEN0(==3)번 비트를 0으로 변경  

@ 비트 번호는 avr/io.h 에 다 정의되어 있음  

```c

#include <avr/io.h>
#include <compat/deprecated.h>

void uart_init()
{
	// 115.2Kbps
	UBRR0H = 0x00;
	UBRR0L = 0x07;

	// 통신 속도 2배
	sbi(UCSR0A, U2X0);

	// TX enable (Transmitter Enable, 송신 기능 활성화)
	sbi(UCSR0B, TXEN0);
}

void uart_putchar(char ch)
{
	if (ch == '\n')
		uart_putchar('\r');

	UDR0 = ch;
}

```

USART, 시리얼통신  

@  제어문자  
