---
title: "🫐 MyWaiting"
date: 2024-04-03. 15:00
# last_modified_at: 2024-04-19. 13:24
last_modified_at: 2024-05-02. 01:08
categories: [🔖Creative, 🫐MyWaiting]
---

## **🎲 MyWaiting**

---

Qr 생성 및 DB저장

QR은 매장정보의 고유한

매장정보 생성 조회 할 때 같이 생성하도록 설정
*생성할때
테스트는 일단 로컬로 로컬DB 쓰기?
돌아가는 서버 연결과 서버DB가 별도로
조회할 때 고유한 페이지로
QR이 해당 페이지로 연결하도록
해당 페이지에서 예약/주문 나눠지도록
로그인 구현하면 자동으로
로그인 구현을 해둬야겠다 먼저 로컬이든
식당주인 입장과 유저 입장의 페이지 다르게 보이게
로컬 로그인/DB가 우선적

카카오 알림 -> 카카오 로그인?  
선주문 -> 토스?  

<https://www.youtube.com/watch?v=TXTZe3klh64&list=PLV9zd3otBRt5ANIjawvd-el3QU594wyx7&index=12>

<스프링부트와 aws로 혼자 구현하는 웹서비스>

<br>

### **👾 QR**

<https://lucas-owner.tistory.com/55>  

<br>

## **🎲 1. 회원 등록 & QR**

### **👾 1일차 메모**

`Cannot resolve symbol 'log'`  
Class에 `@Slf4j` 달아줘서 해결  

`Whitelabel Error Page`  
`index.html` 만들어서 해결,  
Class에 `@RestController`, `@RequiredArgsConstructor` 달아주니까 해결  

인텔리제이 자동완성  
`soutm` : `System.out.println("className.methodName = " + param);`  
`soutp` : `System.out.println("param = " + param);`  
Alt + Enter : 변수 만들어 담기  

`[MySql] SQL Error [1064] [42000]: You have an error in your SQL syntax`  
말그대로 문법에 문제가 있다는 것.  

`@RestController`는 뷰페이지 리턴이 안된다.  
<https://okky.kr/questions/479475>  

타임리프  
<http://www.thymeleaf.org>  
<br>

로그인 : oauth를 쓰거나 보안을 위한 조치  
<br>

## **🎲 2. 식당 등록 & 일부 프론트 연결**

### **👾 2일차 메모**

MariaDB 비밀번호 초기화  
bin 디렉토리에서 `mysql` 말구 `.\mysql`  
<https://jemmaa.tistory.com/26>  

HTML에서 바로 Style 적용  
`<style>` 태그 안에 넣어주면 된다.  

FK 지정  
<https://velog.io/@seulki412/Spring-Boot-JPA%EB%A1%9C-%EC%97%94%ED%8B%B0%ED%8B%B0-%ED%85%8C%EC%9D%B4%EB%B8%94-%EC%83%9D%EC%84%B1%ED%95%98%EA%B8%B0-PK-FK-%EC%97%B0%EA%B2%B0%ED%95%98%EA%B8%B0>  

```java
public class B {
	@Id @GeneratedValue
	@Column(name = "B_ID")
	private Long id;
	
	//	@Column(name = "A_ID")
	//	private Long aId;
	
	@ManyToOne
	@JoinColumn(name = "A_ID")
	private A a;
}

public class A {
	@Id @GeneratedValue
	@Column(name = "A_ID")
	private Long id;
}
```

`TransientPropertyValueException~`  
FK로 사용되는 객체가 저장되지 않아서.  
오류를 해결해주기 위해서는 영속성 전이를 위해 cascade type을 지정.  
`@ManyToOne(cascade = CascadeType.ALL)`  
<https://velog.io/@jummi10/resolve-TransientPropertyValueException>  

Session을 이용한 로그인 구현  
<https://chb2005.tistory.com/175>  
<https://github.com/Changbum97/Springboot-Login-Study>  

TODO:  
`form`에서 `type = "tel"` 받아오는 법  
<br>

패키지 구조 (계층형 구조, 도메인형 구조)  
<https://youngsuk-dev.tistory.com/21>  
<br>
