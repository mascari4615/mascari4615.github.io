---
title: "🫐 MyWaiting DevLog 02"
date: 2024-05-02. 01:08
# last_modified_at: 2024-05-02. 01:08
categories: [🔖Creative, 🫐MyWaiting]
---

## **🎲 _**

웨이팅 기능을 만드는 것이 목표.  
하지만 찾아봐도 적절한 예시가 찾아지지 않는다.  
스스로 깨부해보기.  
<br>

## **🎲 티켓**

먼저 `Entity`를 만들어보자.  
간단하게 티켓으로 생각해봤다.  

```java
@Entity
@Setter
@Getter
@Table(name = "ticket_table")
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder
public class TicketEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY) // AutoIncrement
	private Long id;

	@ManyToOne(cascade = CascadeType.ALL)
	@JoinColumn(name = "RESTAURANT_ID")
	private RestaurantEntity restaurantEntity;

	@ManyToOne(cascade = CascadeType.ALL)
	@JoinColumn(name = "MEMBER_ID")
	private MemberEntity memberEntity;

	@Column
	private Long ticketNumber;
}
```

### **👾 redirect**

`Controller`에서 return 값을 `redirect:/`로 하면  
`/`로 리다이렉트 된다.  
<br>

### **👾 Thymeleaf 조건문**

```html
<div th:if="${#lists.isEmpty(ticketList)}">
	<p>대기중인 티켓이 없습니다.</p>
</div>
```

[참고 : '[Springboot] Thymeleaf each문, if문(else if문, 조건이 여러 개인 if문)'](https://velog.io/@seratpfk/Springboot-Thymeleaf-if문-each문)  
<br>

### **👾 Enum**

[참고 : '[Spring] Enum 타입을 DB에 저장하기'](https://velog.io/@zioo/Spring-Enum-타입을-DB에-저장하기)  
<br>
